const crypto = require('crypto');
const db = require('../database/sqlite');
const { registrarEventoSistema } = require('./eventosSistema');
const { revelar } = require('./cofreSegredosService');
const { revelarCredenciais } = require('./credenciaisClienteService');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => db.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
    })));
}

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))));
}

function listaJson(valor) {
    try { const lista = JSON.parse(valor || '[]'); return Array.isArray(lista) ? lista : []; } catch (_) { return []; }
}

function acessosCliente(cliente = {}) {
    const acessos = listaJson(cliente.acessosApp);
    if (acessos.length) return acessos;
    return listaJson(cliente.paineisSelecionados).map(painel => ({ painel, usuario: cliente.usuario || '' }));
}

function protocolo(cobrancaId, painelId) {
    return `JPLAY-${cobrancaId}-${painelId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function enfileirarRenovacoesDaCobranca(cobrancaId) {
    const cobranca = await buscarUm(`SELECT c.*, p.id AS pagamentoInternoId, cl.nome AS clienteNome,
        cl.usuario, cl.acessosApp, cl.paineisSelecionados
        FROM cobrancas_pix c
        INNER JOIN cliente_pagamentos p ON p.id = c.pagamentoId
        INNER JOIN clientes cl ON cl.id = c.clienteId
        WHERE c.id = ? AND c.status = 'aprovado'`, [cobrancaId]);
    if (!cobranca) return { criadas: 0, motivo: 'cobranca_nao_aprovada' };

    const acessos = acessosCliente(revelarCredenciais(cobranca));
    let criadas = 0;
    for (const acesso of acessos) {
        const nomePainel = String(acesso.painel || '').trim();
        if (!nomePainel) continue;
        const painel = await buscarUm(`SELECT * FROM paineis WHERE lower(nome) = lower(?) AND ativo = 1
            AND renovacaoAutomatica = 1 AND COALESCE(apiUrl, '') != '' LIMIT 1`, [nomePainel]);
        if (!painel) continue;
        painel.apiUsuario = revelar('painel.apiUsuario', painel.apiUsuario || '');
        painel.apiToken = revelar('painel.apiToken', painel.apiToken || '');
        const requisicao = {
            action: 'renew', protocolo: protocolo(cobranca.id, painel.id),
            clienteId: cobranca.clienteId, cliente: cobranca.clienteNome,
            username: String(acesso.usuario || cobranca.usuario || '').trim(),
            product: painel.produtoPadrao || cobranca.plano,
            plan: cobranca.plano, days: Number(cobranca.diasContrato || 0),
            paymentId: String(cobranca.provedorPagamentoId || ''), amount: cobranca.valorTotal
        };
        const resultado = await executar(`INSERT OR IGNORE INTO renovacoes_painel_fila
            (protocolo, cobrancaId, pagamentoId, clienteId, painelId, requisicao)
            VALUES (?, ?, ?, ?, ?, ?)`, [requisicao.protocolo, cobranca.id, cobranca.pagamentoInternoId, cobranca.clienteId, painel.id, JSON.stringify(requisicao)]);
        criadas += resultado.changes;
    }
    if (criadas) await registrarEventoSistema('renovacao_painel_enfileirada', 'info', `${criadas} renovacao(oes) externa(s) enfileirada(s).`, { cobrancaId, criadas });
    return { criadas };
}

async function reconciliarCobrancasAprovadas(limite = 50) {
    const cobrancas = await buscarTodos(`SELECT id FROM cobrancas_pix WHERE status = 'aprovado' AND pagamentoId IS NOT NULL
        ORDER BY id DESC LIMIT ?`, [Math.max(1, Math.min(200, Number(limite) || 50))]);
    let criadas = 0;
    for (const cobranca of cobrancas) criadas += (await enfileirarRenovacoesDaCobranca(cobranca.id)).criadas;
    return { verificadas: cobrancas.length, criadas };
}

async function chamarPainel(painel, payload) {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), Math.max(3, Number(painel.timeoutSegundos || 15)) * 1000);
    const headers = { 'content-type': 'application/json', 'x-julian-play-protocol': payload.protocolo || 'teste' };
    if (painel.apiToken) headers.authorization = `Bearer ${painel.apiToken}`;
    if (painel.apiUsuario) headers['x-api-user'] = painel.apiUsuario;
    try {
        const resposta = await fetch(painel.apiUrl, { method: 'POST', headers, body: JSON.stringify(payload), signal: controlador.signal });
        const texto = (await resposta.text()).slice(0, 4000);
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}: ${texto || 'sem resposta'}`);
        return { status: resposta.status, corpo: texto };
    } finally { clearTimeout(timer); }
}

async function processarItem(item) {
    const bloqueio = await executar(`UPDATE renovacoes_painel_fila SET status='processando', iniciadoEm=CURRENT_TIMESTAMP,
        tentativas=tentativas+1, atualizadoEm=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pendente','nova_tentativa')`, [item.id]);
    if (!bloqueio.changes) return { ignorado: true };
    const atual = await buscarUm(`SELECT fila.*, painel.nome AS painelNome, painel.apiUrl, painel.apiUsuario, painel.apiToken,
        painel.timeoutSegundos, painel.maxTentativas FROM renovacoes_painel_fila fila INNER JOIN paineis painel ON painel.id=fila.painelId WHERE fila.id=?`, [item.id]);
    atual.apiUsuario = revelar('painel.apiUsuario', atual.apiUsuario || '');
    atual.apiToken = revelar('painel.apiToken', atual.apiToken || '');
    try {
        const payload = JSON.parse(atual.requisicao || '{}');
        const resposta = await chamarPainel(atual, payload);
        await executar(`UPDATE renovacoes_painel_fila SET status='concluida', resposta=?, erro='', concluidoEm=CURRENT_TIMESTAMP, atualizadoEm=CURRENT_TIMESTAMP WHERE id=?`, [JSON.stringify(resposta), atual.id]);
        await registrarEventoSistema('renovacao_painel_concluida', 'sucesso', `Renovacao no ${atual.painelNome} concluida. Protocolo ${atual.protocolo}.`, { filaId: atual.id, protocolo: atual.protocolo, cobrancaId: atual.cobrancaId });
        return { concluida: true, protocolo: atual.protocolo };
    } catch (err) {
        const esgotada = atual.tentativas >= Math.max(1, Number(atual.maxTentativas || 5));
        const minutos = Math.min(360, 2 ** Math.min(8, atual.tentativas));
        await executar(`UPDATE renovacoes_painel_fila SET status=?, erro=?, proximaTentativaEm=datetime('now', ?), atualizadoEm=CURRENT_TIMESTAMP WHERE id=?`,
            [esgotada ? 'falha' : 'nova_tentativa', String(err.message).slice(0, 1000), `+${minutos} minutes`, atual.id]);
        await registrarEventoSistema('renovacao_painel_falhou', esgotada ? 'erro' : 'alerta', `Falha no ${atual.painelNome}; ${esgotada ? 'tentativas esgotadas' : 'nova tentativa agendada'}. Protocolo ${atual.protocolo}.`, { filaId: atual.id, protocolo: atual.protocolo, erro: err.message });
        return { erro: err.message, novaTentativa: !esgotada };
    }
}

async function processarFilaRenovacoes(limite = 10) {
    await reconciliarCobrancasAprovadas();
    const itens = await buscarTodos(`SELECT id FROM renovacoes_painel_fila WHERE status IN ('pendente','nova_tentativa')
        AND datetime(proximaTentativaEm) <= datetime('now') ORDER BY id LIMIT ?`, [Math.max(1, Math.min(30, Number(limite) || 10))]);
    const resultados = [];
    for (const item of itens) resultados.push(await processarItem(item));
    return { processadas: resultados.length, resultados };
}

async function listarHistoricoRenovacoes(painelId, limite = 30) {
    return buscarTodos(`SELECT fila.*, cliente.nome AS clienteNome, painel.nome AS painelNome
        FROM renovacoes_painel_fila fila INNER JOIN clientes cliente ON cliente.id=fila.clienteId
        INNER JOIN paineis painel ON painel.id=fila.painelId WHERE (? IS NULL OR fila.painelId=?)
        ORDER BY fila.id DESC LIMIT ?`, [painelId || null, painelId || null, Math.max(1, Math.min(100, Number(limite) || 30))]);
}

async function testarIntegracaoPainel(painelId) {
    const painel = await buscarUm('SELECT * FROM paineis WHERE id=?', [painelId]);
    if (!painel || !painel.apiUrl) throw new Error('Configure e salve a URL da API antes do teste.');
    return chamarPainel(painel, { action: 'test', protocolo: `TESTE-${Date.now()}`, source: 'julian-play' });
}

async function reagendarRenovacao(filaId) {
    const resultado = await executar(`UPDATE renovacoes_painel_fila SET status='nova_tentativa',
        proximaTentativaEm=CURRENT_TIMESTAMP, erro='', atualizadoEm=CURRENT_TIMESTAMP
        WHERE id=? AND status IN ('falha','nova_tentativa')`, [filaId]);
    if (!resultado.changes) throw new Error('Solicitacao nao encontrada ou ja concluida.');
    return resultado;
}

module.exports = { enfileirarRenovacoesDaCobranca, reconciliarCobrancasAprovadas, processarFilaRenovacoes, listarHistoricoRenovacoes, testarIntegracaoPainel, reagendarRenovacao };
