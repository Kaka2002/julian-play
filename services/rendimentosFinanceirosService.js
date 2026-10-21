const db = require('../database/sqlite');
const { registrarEventoSistema } = require('./eventosSistema');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
    })));
}
function buscarUm(sql, params = []) { return db.ready.then(() => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ?reject(err) :resolve(row || null)))); }
function buscarTodos(sql, params = []) { return db.ready.then(() => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ?reject(err) :resolve(rows || [])))); }
function limparTexto(valor, limite = 500) { return String(valor || '').trim().slice(0, limite); }
function normalizarValor(valor) {
    const texto = limparTexto(valor, 32).replace(/R\$\s*/gi, '').replace(/\s/g, '');
    const numero = Number(texto.includes(',') ?texto.replace(/\./g, '').replace(',', '.') :texto);
    if (!Number.isFinite(numero) || numero <= 0 || numero > 100000000) throw new Error('Informe um valor de rendimento válido e maior que zero.');
    return numero.toFixed(2).replace('.', ',');
}
function validarDados(dados = {}) {
    const descricao = limparTexto(dados.descricao, 160);
    const dataRecebimento = limparTexto(dados.dataRecebimento, 10);
    const partes = dataRecebimento.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const data = partes ?new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))) : null;
    if (!descricao) throw new Error('Informe a descrição do rendimento.');
    if (!data || data.getUTCFullYear() !== Number(partes[1]) || data.getUTCMonth() !== Number(partes[2]) - 1 || data.getUTCDate() !== Number(partes[3])) throw new Error('Informe uma data de recebimento válida.');
    return { descricao, valor: normalizarValor(dados.valor), dataRecebimento, instituicao: limparTexto(dados.instituicao, 120), observacoes: limparTexto(dados.observacoes, 1000) };
}
function listarRendimentosFinanceiros(filtros = {}) {
    const mes = limparTexto(filtros.mes, 7); const status = limparTexto(filtros.status, 16) || 'validos'; const busca = limparTexto(filtros.busca, 160);
    const where = []; const params = [];
    if (status === 'removidos') where.push("excluidoEm IS NOT NULL AND excluidoEm != ''"); else if (status !== 'todos') where.push("(excluidoEm IS NULL OR excluidoEm = '')");
    if (/^\d{4}-\d{2}$/.test(mes)) { where.push('substr(dataRecebimento, 1, 7) = ?'); params.push(mes); }
    if (busca) { where.push('(descricao LIKE ? OR instituicao LIKE ? OR observacoes LIKE ?)'); const termo = `%${busca}%`; params.push(termo, termo, termo); }
    return buscarTodos(`SELECT * FROM rendimentos_financeiros ${where.length ?`WHERE ${where.join(' AND ')}` :''} ORDER BY dataRecebimento DESC, id DESC`, params);
}
function buscarRendimentoFinanceiroPorId(id, incluirRemovido = true) { return buscarUm(`SELECT * FROM rendimentos_financeiros WHERE id = ?${incluirRemovido ?'' :" AND (excluidoEm IS NULL OR excluidoEm = '')"}`, [Number(id)]); }
async function criarRendimentoFinanceiro(dados = {}, responsavel = '') {
    const rendimento = validarDados(dados); const resultado = await executar('INSERT INTO rendimentos_financeiros (descricao, valor, dataRecebimento, instituicao, observacoes) VALUES (?, ?, ?, ?, ?)', [rendimento.descricao, rendimento.valor, rendimento.dataRecebimento, rendimento.instituicao, rendimento.observacoes]);
    await registrarEventoSistema('rendimento_financeiro', 'info', 'Rendimento financeiro registrado.', { rendimentoId: resultado.id, descricao: rendimento.descricao, valor: rendimento.valor, responsavel: limparTexto(responsavel, 120) });
    return buscarRendimentoFinanceiroPorId(resultado.id);
}
async function criarRendimentoMercadoPagoSeAusente(dados, identificador, arquivo, anteriores = []) {
    const rendimento = validarDados(dados);
    const ids = [...new Set([String(identificador), ...anteriores.map(String)])];
    if (!ids[0] || !arquivo) throw new Error('Importacao sem identificador ou relatorio.');
    if (await buscarUm('SELECT id FROM rendimentos_mercado_pago_importados WHERE identificadorExterno=?', [ids[0]])) return null;
    const sqlite3 = require('sqlite3');
    const conexao = await new Promise((ok, no) => {
        const c = new sqlite3.Database(db.dbPath, sqlite3.OPEN_READWRITE, e => e ? no(e) : ok(c));
    });
    conexao.configure('busyTimeout', 5000);
    const run = (sql, params=[]) => new Promise((ok,no) => conexao.run(sql,params,function(e){ e ? no(e) : ok({id:this.lastID,changes:this.changes}); }));
    const get = (sql, params=[]) => new Promise((ok,no) => conexao.get(sql,params,(e,row)=>e?no(e):ok(row)));
    let aberta = false;
    try {
        await run('BEGIN IMMEDIATE'); aberta = true;
        const existente = await get(`SELECT rendimentoId FROM rendimentos_mercado_pago_importados WHERE identificadorExterno IN (${ids.map(()=>'?').join(',')}) LIMIT 1`,ids);
        if (existente) {
            // Identifica registros antigos sem SOURCE_ID sem adicionar saldo novamente.
            await run('INSERT OR IGNORE INTO rendimentos_mercado_pago_importados(identificadorExterno,rendimentoId,arquivoRelatorio) VALUES(?,?,?)',[ids[0],existente.rendimentoId,arquivo]);
            await run('COMMIT'); aberta=false; return null;
        }
        const novo = await run('INSERT INTO rendimentos_financeiros(descricao,valor,dataRecebimento,instituicao,observacoes) VALUES(?,?,?,?,?)',[rendimento.descricao,rendimento.valor,rendimento.dataRecebimento,rendimento.instituicao,rendimento.observacoes]);
        await run('INSERT INTO rendimentos_mercado_pago_importados(identificadorExterno,rendimentoId,arquivoRelatorio) VALUES(?,?,?)',[ids[0],novo.id,arquivo]);
        const contexto = require('./observabilidadeService').obterContextoObservabilidade();
        await run('INSERT INTO eventos_sistema(tipo,nivel,mensagem,detalhes) VALUES(?,?,?,?)',['rendimento_financeiro','info','Rendimento financeiro registrado.',JSON.stringify({rendimentoId:novo.id,descricao:rendimento.descricao,valor:rendimento.valor,responsavel:'importação Mercado Pago',correlationId:contexto.correlationId||''})]);
        await run('COMMIT'); aberta=false;
        return {id:novo.id,...rendimento};
    } catch (erro) {
        if(aberta) await run('ROLLBACK');
        throw erro;
    } finally { await new Promise(ok=>conexao.close(ok)); }
}

async function atualizarRendimentoFinanceiro(id, dados = {}, responsavel = '') {
    const rendimento = validarDados(dados); const resultado = await executar('UPDATE rendimentos_financeiros SET descricao = ?, valor = ?, dataRecebimento = ?, instituicao = ?, observacoes = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ? AND (excluidoEm IS NULL OR excluidoEm = \'\')', [rendimento.descricao, rendimento.valor, rendimento.dataRecebimento, rendimento.instituicao, rendimento.observacoes, Number(id)]);
    if (!resultado.changes) throw new Error('Rendimento não encontrado ou já removido.');
    await registrarEventoSistema('rendimento_financeiro', 'info', 'Rendimento financeiro atualizado.', { rendimentoId: Number(id), descricao: rendimento.descricao, responsavel: limparTexto(responsavel, 120) }); return buscarRendimentoFinanceiroPorId(id);
}
async function removerRendimentoFinanceiro(id, responsavel = '') {
    const resultado = await executar("UPDATE rendimentos_financeiros SET excluidoEm = ?, excluidoPor = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ? AND (excluidoEm IS NULL OR excluidoEm = '')", [new Date().toISOString(), limparTexto(responsavel, 120), Number(id)]);
    if (!resultado.changes) throw new Error('Rendimento não encontrado ou já removido.');
    await registrarEventoSistema('rendimento_financeiro', 'alerta', 'Rendimento financeiro removido do resumo.', { rendimentoId: Number(id), responsavel: limparTexto(responsavel, 120) });
}
module.exports = { criarRendimentoMercadoPagoSeAusente, listarRendimentosFinanceiros, buscarRendimentoFinanceiroPorId, criarRendimentoFinanceiro, atualizarRendimentoFinanceiro, removerRendimentoFinanceiro };
