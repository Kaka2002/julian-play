const crypto = require('crypto');
const db = require('../database/sqlite');
const { proteger, revelar, estaProtegido } = require('./cofreSegredosService');

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

let fila = Promise.resolve();
let ultimoEnvioEm = 0;
let pendentes = 0;
let ultimoErro = '';
let executorPersistente = null;
let processandoPersistentes = false;
let agendadorPersistente = null;
let statusPersistente = { pendentes: 0, processando: 0, incertos: 0, falhas: 0 };

function run(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => db.run(sql, params, function concluido(err) {
        err ? reject(err) : resolve({ id: this.lastID, alteracoes: this.changes });
    })));
}

function get(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null))));
}

async function atualizarResumoPersistente() {
    const resumo = await get(`SELECT
        SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) AS pendentes,
        SUM(CASE WHEN status = 'processando' THEN 1 ELSE 0 END) AS processando,
        SUM(CASE WHEN status = 'incerto' THEN 1 ELSE 0 END) AS incertos,
        SUM(CASE WHEN status = 'falhou' THEN 1 ELSE 0 END) AS falhas
        FROM mensagens_saida_fila`);
    statusPersistente = {
        pendentes: Number(resumo?.pendentes || 0),
        processando: Number(resumo?.processando || 0),
        incertos: Number(resumo?.incertos || 0),
        falhas: Number(resumo?.falhas || 0)
    };
}

function numeroInteiro(valor, padrao, minimo, maximo) {
    const numero = Number.parseInt(valor, 10);
    const normalizado = Number.isFinite(numero) ? numero : padrao;
    return Math.max(minimo, Math.min(maximo, normalizado));
}

async function obterPerfilFila(opcoes = {}) {
    if (opcoes.ignorarFila) return { ativa: false, minimoMs: 0, maximoMs: 0 };
    try {
        const { obterConfiguracoes } = require('./configuracoesPainel');
        const config = await obterConfiguracoes();
        const ativa = String(config.roboFilaMensagensAtiva ?? '1') === '1';
        const minimo = numeroInteiro(opcoes.intervaloMinimoSegundos ?? config.roboFilaIntervaloMinimoSegundos, 2, 0, 600);
        const maximo = numeroInteiro(opcoes.intervaloMaximoSegundos ?? config.roboFilaIntervaloMaximoSegundos, 5, minimo, 900);
        return { ativa, minimoMs: minimo * 1000, maximoMs: Math.max(minimo, maximo) * 1000 };
    } catch (_) {
        return { ativa: true, minimoMs: 2000, maximoMs: 5000 };
    }
}

function tempoAleatorio(minimoMs, maximoMs) {
    if (!minimoMs || maximoMs <= 0) return 0;
    if (maximoMs <= minimoMs) return minimoMs;
    return Math.round(minimoMs + Math.random() * (maximoMs - minimoMs));
}

async function executarComControle(tarefa, descricao, opcoes) {
    if (opcoes.proativo) {
        const { exigirEnvioPainelPermitido } = require('./controleOperacaoRoboService');
        const { exigirEnvioProativoPermitido } = require('./protecaoWhatsappService');
        await exigirEnvioPainelPermitido(descricao);
        await exigirEnvioProativoPermitido(descricao);
    }
    const perfil = await obterPerfilFila(opcoes);
    if (perfil.ativa) {
        const intervalo = tempoAleatorio(perfil.minimoMs, perfil.maximoMs);
        const faltaIntervalo = Math.max(0, (ultimoEnvioEm + intervalo) - Date.now());
        if (faltaIntervalo > 0) {
            console.log(`[fila-whatsapp] Aguardando ${Math.ceil(faltaIntervalo / 1000)}s para ${descricao}.`);
            await esperar(faltaIntervalo);
        }
    }
    const resultado = await tarefa();
    ultimoEnvioEm = Date.now();
    ultimoErro = '';
    return resultado;
}

function normalizarPersistencia(persistencia = {}) {
    const tipo = String(persistencia.tipo || 'texto');
    const destino = String(persistencia.destino || '').trim();
    if (!destino || !['texto', 'midia'].includes(tipo)) throw new Error('Persistencia de mensagem invalida.');
    const payload = {
        tipo,
        destino,
        texto: String(persistencia.texto || ''),
        midia: persistencia.midia || null,
        opcoesMensagem: persistencia.opcoesMensagem || {}
    };
    if (tipo === 'texto' && !payload.texto) throw new Error('Mensagem persistente sem texto.');
    if (tipo === 'midia' && !payload.midia?.data) throw new Error('Mensagem persistente sem midia.');
    return payload;
}

async function registrarPersistente(persistencia, descricao, opcoes) {
    const payload = normalizarPersistencia(persistencia);
    const payloadProtegido = proteger('fila.mensagem', JSON.stringify(payload));
    if (!estaProtegido(payloadProtegido)) {
        console.warn('[fila-whatsapp] Cofre indisponivel; o envio seguira sem persistir o conteudo sensivel.');
        return null;
    }
    const protocolo = crypto.randomUUID();
    const maxTentativas = numeroInteiro(opcoes.maxTentativas, 5, 1, 20);
    await run(`INSERT INTO mensagens_saida_fila
        (protocolo, tipo, destino, payloadProtegido, descricao, opcoes, status, maxTentativas)
        VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)`, [
        protocolo, payload.tipo, payload.destino, payloadProtegido,
        String(descricao || 'Envio WhatsApp'), JSON.stringify({ proativo: Boolean(opcoes.proativo) }), maxTentativas
    ]);
    await atualizarResumoPersistente();
    return protocolo;
}

async function marcarPersistenteEnviado(protocolo, resultado) {
    if (!protocolo) return;
    await run(`UPDATE mensagens_saida_fila SET status = 'enviado', concluidoEm = CURRENT_TIMESTAMP,
        mensagemId = ?, erro = NULL, atualizadoEm = CURRENT_TIMESTAMP WHERE protocolo = ?`, [
        String(resultado?.id?._serialized || ''), protocolo
    ]);
    await atualizarResumoPersistente();
}

async function marcarPersistenteFalhou(protocolo, erro, reagendar = false) {
    if (!protocolo) return;
    const registro = await get('SELECT tentativas, maxTentativas FROM mensagens_saida_fila WHERE protocolo = ?', [protocolo]);
    const tentativas = Number(registro?.tentativas || 0) + 1;
    const final = !reagendar || tentativas >= Number(registro?.maxTentativas || 5);
    const atrasoMinutos = Math.min(60, Math.max(1, 2 ** Math.min(tentativas - 1, 6)));
    await run(`UPDATE mensagens_saida_fila SET status = ?, tentativas = ?, erro = ?,
        proximaTentativaEm = datetime('now', ?), atualizadoEm = CURRENT_TIMESTAMP WHERE protocolo = ?`, [
        final ? 'falhou' : 'pendente', tentativas, String(erro?.message || erro || '').slice(0, 1000),
        `+${atrasoMinutos} minutes`, protocolo
    ]);
    await atualizarResumoPersistente();
}

function encadear(tarefa, descricao, opcoes, protocolo = null, reagendarFalha = false, jaReservado = false) {
    pendentes += 1;
    const execucao = fila
        .catch(() => null)
        .then(async () => {
            if (protocolo && !jaReservado) {
                const reservado = await run(`UPDATE mensagens_saida_fila SET status = 'processando',
                    iniciadoEm = CURRENT_TIMESTAMP, atualizadoEm = CURRENT_TIMESTAMP
                    WHERE protocolo = ? AND status = 'pendente'`, [protocolo]);
                if (reservado.alteracoes !== 1) throw new Error('A mensagem persistente nao pode ser reservada para envio.');
            }
        })
        .then(() => executarComControle(tarefa, descricao, opcoes))
        .then(async resultado => {
            await marcarPersistenteEnviado(protocolo, resultado);
            return resultado;
        })
        .catch(async err => {
            ultimoErro = err?.message || String(err);
            await marcarPersistenteFalhou(protocolo, err, reagendarFalha);
            throw err;
        })
        .finally(() => { pendentes = Math.max(0, pendentes - 1); });
    fila = execucao.catch(() => null);
    return execucao;
}

async function enfileirarEnvio(tarefa, descricao = 'Envio WhatsApp', opcoes = {}) {
    const protocolo = opcoes.persistencia
        ? await registrarPersistente(opcoes.persistencia, descricao, opcoes)
        : null;
    return encadear(tarefa, descricao, opcoes, protocolo);
}

async function executarRegistroPersistente(registro) {
    if (typeof executorPersistente !== 'function') return false;
    const reservado = await run(`UPDATE mensagens_saida_fila SET status = 'processando', iniciadoEm = CURRENT_TIMESTAMP,
        atualizadoEm = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pendente'`, [registro.id]);
    if (reservado.alteracoes !== 1) return false;
    let payload;
    let opcoes;
    try {
        payload = JSON.parse(revelar('fila.mensagem', registro.payloadProtegido));
        opcoes = JSON.parse(registro.opcoes || '{}');
    } catch (err) {
        await marcarPersistenteFalhou(registro.protocolo, err, false);
        throw err;
    }
    await encadear(
        () => executorPersistente(payload),
        registro.descricao || 'Retomada de envio WhatsApp',
        opcoes,
        registro.protocolo,
        true,
        true
    );
    return true;
}

async function processarFilaPersistente(limite = 10) {
    if (processandoPersistentes || typeof executorPersistente !== 'function') return;
    processandoPersistentes = true;
    try {
        for (let indice = 0; indice < limite; indice += 1) {
            const registro = await get(`SELECT * FROM mensagens_saida_fila
                WHERE status = 'pendente' AND datetime(proximaTentativaEm) <= CURRENT_TIMESTAMP
                ORDER BY id LIMIT 1`);
            if (!registro) break;
            try {
                await executarRegistroPersistente(registro);
            } catch (err) {
                console.log(`[fila-whatsapp] Retomada ${registro.protocolo} falhou: ${err.message}`);
                break;
            }
        }
    } finally {
        processandoPersistentes = false;
        await atualizarResumoPersistente().catch(() => {});
    }
}

async function prepararFilaPersistente() {
    await db.ready;
    await run(`UPDATE mensagens_saida_fila SET status = 'incerto',
        erro = CASE WHEN erro IS NULL OR erro = '' THEN 'Processo interrompido durante o envio; revisao manual necessaria para evitar duplicidade.' ELSE erro END,
        atualizadoEm = CURRENT_TIMESTAMP WHERE status = 'processando'`);
    await run("DELETE FROM mensagens_saida_fila WHERE status = 'enviado' AND datetime(concluidoEm) < datetime('now', '-30 days')");
    await run("DELETE FROM mensagens_saida_fila WHERE status = 'falhou' AND datetime(atualizadoEm) < datetime('now', '-90 days')");
    await run("DELETE FROM mensagens_saida_fila WHERE status = 'incerto' AND datetime(atualizadoEm) < datetime('now', '-180 days')");
    await atualizarResumoPersistente();
}

function configurarExecutorFilaPersistente(executor) {
    executorPersistente = executor;
    prepararFilaPersistente()
        .then(() => {
            const primeiraRetomada = setTimeout(() => processarFilaPersistente().catch(() => {}), 15000);
            primeiraRetomada.unref?.();
        })
        .catch(err => { ultimoErro = err.message; console.log(`[fila-whatsapp] Inicializacao persistente falhou: ${err.message}`); });
    if (!agendadorPersistente) {
        agendadorPersistente = setInterval(() => processarFilaPersistente().catch(err => {
            ultimoErro = err.message;
        }), 60000);
        agendadorPersistente.unref?.();
    }
}

function obterStatusFilaMensagens() {
    return {
        pendentes,
        ultimoEnvioEm: ultimoEnvioEm ? new Date(ultimoEnvioEm).toISOString() : '',
        ultimoErro,
        persistente: { ...statusPersistente }
    };
}

module.exports = {
    enfileirarEnvio,
    obterStatusFilaMensagens,
    configurarExecutorFilaPersistente,
    processarFilaPersistente,
    prepararFilaPersistente
};
