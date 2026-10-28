const sqlite3 = require('sqlite3');
const db = require('../database/sqlite');
const { normalizarTelefone } = require('./clientes');

const telefoneValido = valor => {
    const texto = String(valor || '');
    if (/@lid$/i.test(texto) || texto.replace(/\D/g, '').length < 10) return '';
    return normalizarTelefone(texto.replace(/@c\.us$/i, ''));
};
async function listarAssinaturasTelefone(telefone) {
    const numero = telefoneValido(telefone);
    if (!numero) return [];
    await db.ready;
    const clientes = await new Promise((ok, erro) => db.all(
        "SELECT id,nome,telefone,plano,vencimento FROM clientes WHERE anonimizadoEm IS NULL OR anonimizadoEm='' ORDER BY id",
        (e, rows) => e ? erro(e) : ok(rows)));
    return clientes.filter(c => telefoneValido(c.telefone) === numero);
}
async function listarVinculos() {
    await db.ready;
    return new Promise((ok, erro) => db.all(`SELECT v.*, a.nome AS nomeA, b.nome AS nomeB,
        a.telefone AS telefoneA, b.telefone AS telefoneB FROM cliente_assinaturas_vinculos v
        JOIN clientes a ON a.id=v.clienteA JOIN clientes b ON b.id=v.clienteB
        WHERE COALESCE(a.anonimizadoEm,'')='' AND COALESCE(b.anonimizadoEm,'')=''`,
    (e, rows) => e ? erro(e) : ok(rows.filter(v => telefoneValido(v.telefoneA) === v.telefone && telefoneValido(v.telefoneB) === v.telefone))));
}
async function alterarVinculo(a, b, vincular, responsavel = 'operador') {
    const ids = [Number(a), Number(b)].sort((x,y) => x-y);
    if (!ids.every(id => Number.isSafeInteger(id) && id > 0) || ids[0] === ids[1]) throw new Error('Selecione duas assinaturas diferentes.');
    await db.ready;
    const conexao = await new Promise((ok, erro) => { const c = new sqlite3.Database(db.dbPath, e => e ? erro(e) : ok(c)); });
    conexao.configure('busyTimeout', 5000);
    const run = (sql, p=[]) => new Promise((ok, erro) => conexao.run(sql,p,function(e){ e ? erro(e) : ok(this.changes); }));
    const all = (sql,p=[]) => new Promise((ok,erro) => conexao.all(sql,p,(e,r)=>e?erro(e):ok(r)));
    try {
        await run('BEGIN IMMEDIATE');
        const clientes = await all("SELECT id,telefone FROM clientes WHERE id IN (?,?) AND COALESCE(anonimizadoEm,'')=''", ids);
        if (clientes.length !== 2) throw new Error('Assinatura não encontrada.');
        const numero = telefoneValido(clientes[0].telefone);
        if (vincular && (!numero || numero !== telefoneValido(clientes[1].telefone))) throw new Error('As assinaturas precisam ter o mesmo WhatsApp válido.');
        const changes = vincular
            ? await run('INSERT INTO cliente_assinaturas_vinculos(clienteA,clienteB,telefone) VALUES(?,?,?) ON CONFLICT(clienteA,clienteB) DO UPDATE SET telefone=excluded.telefone, criadoEm=CURRENT_TIMESTAMP WHERE cliente_assinaturas_vinculos.telefone != excluded.telefone', [...ids,numero])
            : await run('DELETE FROM cliente_assinaturas_vinculos WHERE clienteA=? AND clienteB=?', ids);
        if (changes) for (const id of ids) await run(`INSERT INTO cliente_auditoria(clienteId,tipo,responsavel,origem,motivo)
            VALUES(?,'assinaturas_responsavel',?,'painel',?)`, [id,String(responsavel).slice(0,120),vincular ? `Mesmo responsável: assinaturas ${ids.join(' e ')}. Contratos mantidos separados.` : `Vínculo removido: assinaturas ${ids.join(' e ')}.`]);
        await run('COMMIT');
    } catch (e) { await run('ROLLBACK').catch(()=>{}); throw e; }
    finally { await new Promise(ok=>conexao.close(ok)); }
}
module.exports = { listarAssinaturasTelefone, listarVinculos, alterarVinculo, telefoneValido };
