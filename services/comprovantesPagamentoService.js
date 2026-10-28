const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const db = require('../database/sqlite');
const LIMITE_BYTES = 5 * 1024 * 1024;
const LIMITE_ANEXOS = 5;
class ErroComprovante extends Error {
    constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}
function idValido(valor) {
    const id = Number(valor);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ErroComprovante('Pagamento ou comprovante não encontrado.', 404);
    return id;
}
function validarConteudo(conteudo, tipo) {
    const assinaturas = { 'image/jpeg': 'ffd8ff', 'image/png': '89504e470d0a1a0a', 'application/pdf': '255044462d' };
    if (!Buffer.isBuffer(conteudo) || !conteudo.length || conteudo.length > LIMITE_BYTES) throw new ErroComprovante('Envie um arquivo de até 5 MB.');
    if (!assinaturas[tipo] || !conteudo.subarray(0, 16).toString('hex').startsWith(assinaturas[tipo])) throw new ErroComprovante('Envie JPG, PNG ou PDF válido.', 415);
}
async function conexao() {
    await db.ready;
    const c = await new Promise((ok,erro)=>{const atual=new sqlite3.Database(db.dbPath,e=>e?erro(e):ok(atual));});
    c.configure('busyTimeout',5000);
    return {
        run:(sql,p=[])=>new Promise((ok,erro)=>c.run(sql,p,function(e){e?erro(e):ok({id:this.lastID,changes:this.changes});})),
        all:(sql,p=[])=>new Promise((ok,erro)=>c.all(sql,p,(e,r)=>e?erro(e):ok(r))),
        close:()=>new Promise(ok=>c.close(ok))
    };
}
async function exigirPagamento(c, clienteId, pagamentoId) {
    const rows = await c.all(`SELECT p.id FROM cliente_pagamentos p JOIN clientes cl ON cl.id=p.clienteId
        WHERE p.clienteId=? AND p.id=? AND COALESCE(p.excluidoEm,'')='' AND COALESCE(cl.anonimizadoEm,'')=''`, [clienteId,pagamentoId]);
    if (!rows.length) throw new ErroComprovante('Pagamento ou comprovante não encontrado.',404);
}
const colunas = 'id,tipo,tamanho,criadoEm';
async function listar(clienteId,pagamentoId) {
    const ids=[idValido(clienteId),idValido(pagamentoId)];const c=await conexao();
    try {await exigirPagamento(c,...ids);return await c.all(`SELECT ${colunas} FROM cliente_pagamento_comprovantes WHERE clienteId=? AND pagamentoId=? ORDER BY id`,ids);}
    finally {await c.close();}
}
async function anexar(clienteId,pagamentoId,conteudo,tipo,responsavel='operador') {
    const ids=[idValido(clienteId),idValido(pagamentoId)];validarConteudo(conteudo,tipo);
    const sha256=crypto.createHash('sha256').update(conteudo).digest('hex');const c=await conexao();
    try {
        await c.run('BEGIN IMMEDIATE');await exigirPagamento(c,...ids);
        const existentes=await c.all(`SELECT ${colunas},sha256 FROM cliente_pagamento_comprovantes WHERE clienteId=? AND pagamentoId=?`,ids);
        const repetido=existentes.find(x=>x.sha256===sha256);
        if(repetido){await c.run('COMMIT');const {sha256:_,...item}=repetido;return item;}
        if(existentes.length>=LIMITE_ANEXOS) throw new ErroComprovante('Limite de cinco comprovantes por pagamento atingido.');
        const r=await c.run('INSERT INTO cliente_pagamento_comprovantes(clienteId,pagamentoId,tipo,tamanho,sha256,conteudo) VALUES(?,?,?,?,?,?)',[...ids,tipo,conteudo.length,sha256,conteudo]);
        await c.run(`INSERT INTO cliente_auditoria(clienteId,tipo,responsavel,origem,motivo) VALUES(?,'comprovante_anexado',?,'financeiro',?)`,[ids[0],String(responsavel).slice(0,120),`Comprovante ${r.id} anexado ao pagamento ${ids[1]}; sem alterar pagamento ou vencimento.`]);
        const [item]=await c.all(`SELECT ${colunas} FROM cliente_pagamento_comprovantes WHERE id=?`,[r.id]);await c.run('COMMIT');return item;
    }catch(e){await c.run('ROLLBACK').catch(()=>{});throw e;}finally{await c.close();}
}
async function obter(clienteId,pagamentoId,comprovanteId) {
    const ids=[idValido(clienteId),idValido(pagamentoId),idValido(comprovanteId)];const c=await conexao();
    try {await exigirPagamento(c,ids[0],ids[1]);const [item]=await c.all('SELECT * FROM cliente_pagamento_comprovantes WHERE clienteId=? AND pagamentoId=? AND id=?',ids);
        if(!item)throw new ErroComprovante('Pagamento ou comprovante não encontrado.',404);
        validarConteudo(item.conteudo,item.tipo);
        if(crypto.createHash('sha256').update(item.conteudo).digest('hex')!==item.sha256)throw new ErroComprovante('Não foi possível conferir a integridade do comprovante.',409);
        return item;
    }finally{await c.close();}
}
async function remover(clienteId,pagamentoId,comprovanteId,responsavel='operador') {
    const ids=[idValido(clienteId),idValido(pagamentoId),idValido(comprovanteId)];const c=await conexao();
    try {await c.run('BEGIN IMMEDIATE');await exigirPagamento(c,ids[0],ids[1]);
        const r=await c.run('DELETE FROM cliente_pagamento_comprovantes WHERE clienteId=? AND pagamentoId=? AND id=?',ids);
        if(!r.changes)throw new ErroComprovante('Pagamento ou comprovante não encontrado.',404);
        await c.run(`INSERT INTO cliente_auditoria(clienteId,tipo,responsavel,origem,motivo) VALUES(?,'comprovante_removido',?,'financeiro',?)`,[ids[0],String(responsavel).slice(0,120),`Comprovante ${ids[2]} removido do pagamento ${ids[1]}; pagamento e vencimento preservados.`]);await c.run('COMMIT');
    }catch(e){await c.run('ROLLBACK').catch(()=>{});throw e;}finally{await c.close();}
}
module.exports={listar,anexar,obter,remover,ErroComprovante,LIMITE_BYTES};
