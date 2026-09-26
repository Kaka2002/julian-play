const db = require('../database/sqlite');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    }));
}

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

function idValido(valor, campo) {
    const id = Number.parseInt(valor, 10);
    if (!Number.isFinite(id) || id <= 0) throw new Error(`Selecione ${campo}.`);
    return id;
}

function normalizarTelefone(valor) { return String(valor || '').replace(/\D/g, ''); }
function normalizarMac(valor) { return String(valor || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }

async function validarClientesDistintos(indicadorId, indicadoId) {
    if (indicadorId === indicadoId) throw new Error('O cliente não pode indicar a si mesmo.');
    const clientes = await buscarTodos('SELECT id, nome, telefone, enderecoMac FROM clientes WHERE id IN (?, ?)', [indicadorId, indicadoId]);
    const indicador = clientes.find(item => Number(item.id) === indicadorId);
    const indicado = clientes.find(item => Number(item.id) === indicadoId);
    if (!indicador || !indicado) throw new Error('Um dos clientes selecionados não foi encontrado.');
    const telefoneIndicador = normalizarTelefone(indicador.telefone);
    const telefoneIndicado = normalizarTelefone(indicado.telefone);
    if (telefoneIndicador && telefoneIndicador === telefoneIndicado) {
        throw new Error('A indicação não pode usar o mesmo telefone do indicador. Revise antes de registrar.');
    }
    const macIndicador = normalizarMac(indicador.enderecoMac);
    const macIndicado = normalizarMac(indicado.enderecoMac);
    if (macIndicador && macIndicador === macIndicado) {
        throw new Error('A indicação não pode usar o mesmo MAC do indicador. Revise antes de registrar.');
    }
    return { indicador, indicado };
}

const REGRAS = {
    campanha_amizade_presente: { titulo: 'Amizade que vale presente', indicados: 1, pagamentos: 1, meses: 1 },
    campanha_indique_ganhe_tres_meses: { titulo: 'Indique e ganhe 3 meses', indicados: 2, pagamentos: 3, meses: 3 }
};

async function obterCampanhaAtiva() {
    await require('./modelosMensagem').listarModelos();
    const ativas = await buscarTodos("SELECT chave FROM modelos_mensagem WHERE plano = 'campanha' AND ativo = 1");
    const chave = ativas.length === 1 ? ativas[0].chave : '';
    return REGRAS[chave] ? { chave, ...REGRAS[chave] } : null;
}

async function registrarIndicacao(dados = {}) {
    const indicadorId = idValido(dados.indicadorClienteId, 'quem indicou');
    const indicadoId = idValido(dados.indicadoClienteId, 'o cliente indicado');
    const clientes = await validarClientesDistintos(indicadorId, indicadoId);
    const campanha = await obterCampanhaAtiva();
    if (!campanha) throw new Error('Ative um dos dois modelos de campanha de indicação em Modelos.');
    // Um indicado não pode ser reaproveitado em outra campanha ou por outro indicador.
    const existente = await buscarUm("SELECT id FROM programa_indicacoes WHERE indicadoClienteId = ? AND status <> 'cancelada'", [indicadoId]);
    if (existente) throw new Error('Este indicado já participa de uma indicação ou já gerou benefício.');
    const anterior = await buscarUm('SELECT id FROM programa_indicacoes WHERE indicadorClienteId = ? AND indicadoClienteId = ?', [indicadorId, indicadoId]);
    let id;
    if (anterior) {
        const resultado = await executar(`UPDATE programa_indicacoes SET status = 'ativa', campanhaChave = ?, beneficioMeses = ?,
            motivoCancelamento = '', atualizadoEm = CURRENT_TIMESTAMP WHERE id = ? AND status = 'cancelada'
            AND NOT EXISTS (SELECT 1 FROM programa_indicacoes WHERE indicadoClienteId = ? AND status <> 'cancelada')`,
        [campanha.chave, campanha.meses, anterior.id, indicadoId]);
        if (!resultado.changes) throw new Error('Este indicado já participa de uma indicação.');
        id = anterior.id;
    } else {
        const resultado = await executar(`INSERT INTO programa_indicacoes
            (indicadorClienteId, indicadoClienteId, campanhaChave, beneficioMeses)
            SELECT ?, ?, ?, ? WHERE NOT EXISTS
                (SELECT 1 FROM programa_indicacoes WHERE indicadoClienteId = ? AND status <> 'cancelada')`,
        [indicadorId, indicadoId, campanha.chave, campanha.meses, indicadoId]);
        if (!resultado.changes) throw new Error('Este indicado já participa de uma indicação.');
        id = resultado.id;
    }
    await processarCreditosIndicacoes();
    return { id, ...clientes, reativada: Boolean(anterior) };
}

const pagamentosValidosSql = `(SELECT COUNT(DISTINCT COALESCE(NULLIF(pagamento.vencimentoNovo, ''), 'pagamento:' || pagamento.id))
    FROM cliente_pagamentos pagamento
    WHERE pagamento.clienteId = indicado.id
        AND (pagamento.excluidoEm IS NULL OR pagamento.excluidoEm = '')
        AND lower(COALESCE(pagamento.formaPagamento, '')) NOT LIKE '%bônus%'
        AND lower(COALESCE(pagamento.formaPagamento, '')) NOT LIKE '%bonus%'
        AND lower(COALESCE(pagamento.plano, '')) NOT LIKE '%teste%'
        AND CAST(CASE WHEN instr(COALESCE(pagamento.valorTotal, '0'), ',') > 0 THEN REPLACE(REPLACE(pagamento.valorTotal, '.', ''), ',', '.') ELSE pagamento.valorTotal END AS REAL) > 0)`;

const consultaIndicacoes = `SELECT indicacao.*, indicador.nome AS indicadorNome, indicador.telefone AS indicadorTelefone,
    indicado.nome AS indicadoNome, indicado.telefone AS indicadoTelefone,
    ${pagamentosValidosSql} AS pagamentosValidos
    FROM programa_indicacoes indicacao
    JOIN clientes indicador ON indicador.id = indicacao.indicadorClienteId
    JOIN clientes indicado ON indicado.id = indicacao.indicadoClienteId
    ORDER BY indicacao.id`;

async function listarIndicacoes() {
    const campanha = await obterCampanhaAtiva();
    const itens = (await buscarTodos(consultaIndicacoes)).map(item => ({
        ...item, regra: REGRAS[item.campanhaChave], campanhaAtiva: item.campanhaChave === campanha?.chave
    }));
    return { itens, campanha, resumos: [] };
}

let processamento = null;
function processarCreditosIndicacoes() {
    if (processamento) return processamento;
    processamento = creditarElegiveis().finally(() => { processamento = null; });
    return processamento;
}

async function creditarElegiveis() {
    await db.ready;
    await require('./modelosMensagem').listarModelos();
    // Conexão exclusiva: nenhuma operação de outra rota entra nesta transação.
    const sqlite3 = require('sqlite3');
    const conexao = await new Promise((resolve, reject) => {
        const banco = new sqlite3.Database(db.dbPath, erro => erro ? reject(erro) : resolve(banco));
    });
    conexao.configure('busyTimeout', 5000);
    const run = (sql, params = []) => new Promise((resolve, reject) => conexao.run(sql, params, function(err) {
        err ? reject(err) : resolve({ id: this.lastID, changes: this.changes });
    }));
    const all = (sql, params = []) => new Promise((resolve, reject) => conexao.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
    let transacao = false;
    try {
        await run('BEGIN IMMEDIATE');
        transacao = true;
        const ativas = await all("SELECT chave FROM modelos_mensagem WHERE plano = 'campanha' AND ativo = 1");
        const chave = ativas.length === 1 ? ativas[0].chave : '';
        const regra = REGRAS[chave];
        const creditos = [];
        if (regra) {
            const itens = await all(consultaIndicacoes);
            const grupos = new Map();
            for (const item of itens) {
                if (item.status !== 'ativa' || item.campanhaChave !== chave || item.pagamentosValidos < regra.pagamentos) continue;
                // Protege também vínculos legados duplicados para o mesmo indicado.
                if (itens.some(outro => outro.indicadoClienteId === item.indicadoClienteId && outro.status === 'beneficio_liberado')) continue;
                const grupo = grupos.get(item.indicadorClienteId) || [];
                if (!grupo.some(outro => outro.indicadoClienteId === item.indicadoClienteId)) grupo.push(item);
                grupos.set(item.indicadorClienteId, grupo);
            }
            const usados = new Set();
            for (const [clienteId, grupo] of grupos) {
                const disponiveis = grupo.filter(item => !usados.has(item.indicadoClienteId));
                while (disponiveis.length >= regra.indicados) {
                    const lote = disponiveis.splice(0, regra.indicados);
                    const credito = await run('INSERT INTO indicacao_creditos (indicadorClienteId, campanhaChave, meses) VALUES (?, ?, ?)', [clienteId, chave, regra.meses]);
                    for (const item of lote) {
                        await run(`UPDATE programa_indicacoes SET status = 'beneficio_liberado', creditoId = ?, beneficioMeses = ?,
                            beneficioLiberadoEm = CURRENT_TIMESTAMP, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`, [credito.id, regra.meses, item.id]);
                        usados.add(item.indicadoClienteId);
                    }
                    await run('UPDATE clientes SET bonusMeses = COALESCE(bonusMeses, 0) + ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?', [regra.meses, clienteId]);
                    await run('INSERT INTO cliente_notas (clienteId, texto) VALUES (?, ?)', [clienteId,
                        `Campanha ${regra.titulo}: ${regra.meses} mês(es) de bônus creditado(s) automaticamente após ${regra.indicados} indicação(ões) com ${regra.pagamentos} mensalidade(s) paga(s). Crédito ${credito.id}. Aplicação e aviso permanecem manuais.`]);
                    creditos.push({ clienteId, meses: regra.meses, creditoId: credito.id });
                }
            }
        }
        await run('COMMIT');
        transacao = false;
        return creditos;
    } catch (erro) {
        if (transacao) await run('ROLLBACK');
        throw erro;
    } finally {
        await new Promise(resolve => conexao.close(resolve));
    }
}

async function cancelarIndicacao(indicacaoId, motivo = '') {
    const id = idValido(indicacaoId, 'a indicação');
    const resultado = await executar(`UPDATE programa_indicacoes SET status = 'cancelada', motivoCancelamento = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ativa'`, [String(motivo || '').trim().slice(0, 300), id]);
    if (!resultado.changes) throw new Error('A indicação não está ativa ou já gerou um crédito.');
}

let agendador = null;
function iniciarCreditosIndicacoes() {
    if (agendador) return;
    const verificar = () => processarCreditosIndicacoes().catch(erro => console.error('Falha no crédito de indicações:', erro.message));
    verificar();
    agendador = setInterval(verificar, 60000);
    agendador.unref();
}

module.exports = { registrarIndicacao, listarIndicacoes, cancelarIndicacao, obterCampanhaAtiva, processarCreditosIndicacoes, iniciarCreditosIndicacoes };
