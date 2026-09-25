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

async function registrarIndicacao(dados = {}) {
    const indicadorId = idValido(dados.indicadorClienteId, 'quem indicou');
    const indicadoId = idValido(dados.indicadoClienteId, 'o cliente indicado');
    const clientes = await validarClientesDistintos(indicadorId, indicadoId);
    const existente = await buscarUm('SELECT id, status FROM programa_indicacoes WHERE indicadorClienteId = ? AND indicadoClienteId = ?', [indicadorId, indicadoId]);
    if (existente?.status === 'ativa') throw new Error('Esta indicação já está registrada e ativa.');
    if (existente) {
        await executar(`UPDATE programa_indicacoes SET status = 'ativa', motivoCancelamento = '', beneficioLiberadoEm = '', atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`, [existente.id]);
        return { id: existente.id, ...clientes, reativada: true };
    }
    const resultado = await executar('INSERT INTO programa_indicacoes (indicadorClienteId, indicadoClienteId) VALUES (?, ?)', [indicadorId, indicadoId]);
    return { id: resultado.id, ...clientes, reativada: false };
}

const pagamentosValidosSql = `(SELECT COUNT(*) FROM cliente_pagamentos pagamento
    WHERE pagamento.clienteId = indicado.id
        AND (pagamento.excluidoEm IS NULL OR pagamento.excluidoEm = '')
        AND lower(COALESCE(pagamento.formaPagamento, '')) <> 'bônus mensal'
        AND lower(COALESCE(pagamento.formaPagamento, '')) <> 'bonus mensal')`;

async function listarIndicacoes() {
    const itens = await buscarTodos(`SELECT indicacao.*, indicador.nome AS indicadorNome, indicador.telefone AS indicadorTelefone,
            indicado.nome AS indicadoNome, indicado.telefone AS indicadoTelefone,
            ${pagamentosValidosSql} AS pagamentosValidos
        FROM programa_indicacoes indicacao
        INNER JOIN clientes indicador ON indicador.id = indicacao.indicadorClienteId
        INNER JOIN clientes indicado ON indicado.id = indicacao.indicadoClienteId
        ORDER BY CASE indicacao.status WHEN 'ativa' THEN 0 WHEN 'beneficio_liberado' THEN 1 ELSE 2 END,
            datetime(indicacao.atualizadoEm) DESC, indicacao.id DESC`);
    const porIndicador = new Map();
    for (const item of itens) {
        if (item.status !== 'ativa') continue;
        const chave = Number(item.indicadorClienteId);
        const atual = porIndicador.get(chave) || { clienteId: chave, nome: item.indicadorNome, telefone: item.indicadorTelefone, indicacoes: 0, qualificadas: 0, prontoParaRevisao: false };
        atual.indicacoes += 1;
        if (Number(item.pagamentosValidos || 0) >= 3) atual.qualificadas += 1;
        porIndicador.set(chave, atual);
    }
    for (const resumo of porIndicador.values()) resumo.prontoParaRevisao = resumo.qualificadas >= 2;
    return { itens, resumos: [...porIndicador.values()].sort((a, b) => Number(b.prontoParaRevisao) - Number(a.prontoParaRevisao) || b.qualificadas - a.qualificadas || a.nome.localeCompare(b.nome, 'pt-BR')) };
}

async function liberarBeneficioIndicacao(indicadorClienteId) {
    const id = idValido(indicadorClienteId, 'o cliente indicador');
    const { itens, resumos } = await listarIndicacoes();
    const resumo = resumos.find(item => item.clienteId === id);
    if (!resumo || !resumo.prontoParaRevisao) throw new Error('Este cliente ainda não possui duas indicações com três pagamentos válidos cada.');
    const cliente = await buscarUm('SELECT id, nome FROM clientes WHERE id = ?', [id]);
    if (!cliente) throw new Error('Cliente indicador não encontrado.');
    const qualificadas = itens.filter(item => Number(item.indicadorClienteId) === id
        && item.status === 'ativa' && Number(item.pagamentosValidos || 0) >= 3).slice(0, 2);
    if (qualificadas.length < 2) throw new Error('As indicações mudaram durante a revisão. Atualize a página e tente novamente.');
    const resultado = await executar(`UPDATE programa_indicacoes SET status = 'beneficio_liberado', beneficioLiberadoEm = CURRENT_TIMESTAMP, atualizadoEm = CURRENT_TIMESTAMP
        WHERE id IN (?, ?) AND status = 'ativa'`, qualificadas.map(item => item.id));
    if (resultado.changes < 2) throw new Error('As indicações mudaram durante a revisão. Atualize a página e tente novamente.');
    await executar('UPDATE clientes SET bonusMeses = COALESCE(bonusMeses, 0) + 3, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    await executar('INSERT INTO cliente_notas (clienteId, texto) VALUES (?, ?)', [id, 'Programa de indicação: 3 meses de bônus liberados após revisão manual de 2 indicados com 3 pagamentos válidos cada.']);
    return { cliente, meses: 3 };
}

async function cancelarIndicacao(indicacaoId, motivo = '') {
    const id = idValido(indicacaoId, 'a indicação');
    const resultado = await executar(`UPDATE programa_indicacoes SET status = 'cancelada', motivoCancelamento = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ativa'`, [String(motivo || '').trim().slice(0, 300), id]);
    if (!resultado.changes) throw new Error('A indicação não está ativa ou não foi encontrada.');
}

module.exports = { registrarIndicacao, listarIndicacoes, liberarBeneficioIndicacao, cancelarIndicacao };
