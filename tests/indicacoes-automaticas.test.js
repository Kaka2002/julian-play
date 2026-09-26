const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

const setup = `
const assert = require('node:assert/strict');
const db = require('./database/sqlite');
const svc = require('./services/indicacoesService');
const modelos = require('./services/modelosMensagem');
const run = (sql, p=[]) => new Promise((ok,no)=>db.run(sql,p,function(e){e?no(e):ok(this)}));
const get = (sql,p=[]) => new Promise((ok,no)=>db.get(sql,p,(e,r)=>e?no(e):ok(r)));
async function campanha(chave) {
  const lista=await modelos.listarModelos();
  const modelo=lista.find(m=>m.chave===chave);
  await modelos.salvarModelo({...modelo,ativo:'1'});
}
async function pagamento(id, ciclo, forma='PIX', valor='35,00', excluido='') {
  await run('INSERT INTO cliente_pagamentos (clienteId, plano, formaPagamento, valorTotal, vencimentoNovo, excluidoEm) VALUES (?, ?, ?, ?, ?, ?)',[id,'Mensal',forma,valor,ciclo,excluido]);
}
async function saldo() { return (await get('SELECT bonusMeses FROM clientes WHERE id=1')).bonusMeses; }
await db.ready;
for(let id=1;id<=6;id++) await run('INSERT INTO clientes (id,nome,telefone,status,valorPlano,dataVencimento) VALUES (?,?,?, ?,?,?)',[id,'Cliente '+id,'551190000000'+id,'ativo','35,00','2026-10-01T23:59']);
`;
function isolated(code) {
    const result = executarIsolado(`(async()=>{${setup}\n${code}\nawait db.encerrar();console.log('ok')})().catch(e=>{console.error(e);process.exit(1)})`);
    try { assert.equal(result.stdout, 'ok'); } finally { removerAmbiente(result.ambiente); }
}

test('campanha de um credita após pagamento e mantém vencimento, valor e aplicação manuais', () => isolated(`
 await campanha('campanha_amizade_presente');
 await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 await pagamento(2,'2026-11-01');
 await Promise.all([svc.processarCreditosIndicacoes(),svc.processarCreditosIndicacoes()]);
 assert.equal(await saldo(),1);
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),1);
 const c=await get('SELECT valorPlano,dataVencimento FROM clientes WHERE id=1');
 assert.deepEqual(c,{valorPlano:'35,00',dataVencimento:'2026-10-01T23:59'});
 assert.equal((await get('SELECT COUNT(*) n FROM cliente_pagamentos WHERE clienteId=1')).n,0);
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2}), /já participa/);
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:3,indicadoClienteId:2}), /já participa/);
 const item=(await svc.listarIndicacoes()).itens[0];
 await assert.rejects(svc.cancelarIndicacao(item.id), /já gerou/);
`));

test('campanha de dois exige três ciclos pagos para cada indicado sem somar campanhas', () => isolated(`
 await campanha('campanha_indique_ganhe_tres_meses');
 for(const id of [2,3]) await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:id});
 for(const ciclo of ['2026-10-01','2026-11-01','2026-12-01']) await pagamento(2,ciclo);
 for(const ciclo of ['2026-10-01','2026-11-01']) await pagamento(3,ciclo);
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 await pagamento(3,'2026-11-01'); // mesma renovação não é uma terceira mensalidade
 await pagamento(3,'bonus','Bônus mensal');
 await pagamento(3,'zero','PIX','0,00');
 await pagamento(3,'excluido','PIX','35,00','2026-09-26');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 await campanha('campanha_amizade_presente');
 await pagamento(3,'2026-12-01');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 await campanha('campanha_indique_ganhe_tres_meses');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),3);
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),3);
 const itens=(await svc.listarIndicacoes()).itens;
 assert.equal(itens[0].creditoId,itens[1].creditoId);
 assert.equal((await get('SELECT COUNT(*) n FROM indicacao_creditos')).n,1);
`));

test('crédito e consumo das indicações revertem juntos se a atualização falhar', () => isolated(`
 await campanha('campanha_amizade_presente');
 await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 await pagamento(2,'2026-11-01');
 await run("CREATE TRIGGER falha_credito BEFORE UPDATE OF bonusMeses ON clientes BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
 await assert.rejects(svc.processarCreditosIndicacoes(),/falha simulada/);
 assert.equal(await saldo(),0);
 assert.equal((await get('SELECT COUNT(*) n FROM indicacao_creditos')).n,0);
 assert.equal((await svc.listarIndicacoes()).itens[0].status,'ativa');
 await run('DROP TRIGGER falha_credito');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),1);
`));

test('modelos novos preservam personalização e resolvem saldo e vencimento no envio manual', () => isolated(`
 let lista=await modelos.listarModelos();
 assert.ok(lista.some(m=>m.chave==='padrao_vencimento'));
 for(const meses of [1,3]) assert.ok(lista.some(m=>m.chave==='indicacao_bonus_'+meses && m.plano==='bonus'));
 const modelo=lista.find(m=>m.chave==='indicacao_bonus_1');
 await modelos.salvarModelo({...modelo,texto:'Texto personalizado',ativo:'0'});
 lista=await modelos.listarModelos();
 assert.equal(lista.find(m=>m.id===modelo.id).texto,'Texto personalizado');
 assert.equal(lista.find(m=>m.id===modelo.id).ativo,0);
 const aplicado=lista.find(m=>m.chave==='bonus_periodo_aplicado');
 const mensagem=await modelos.montarMensagemModeloManual({nome:'Pessoa Teste',bonusMeses:2,dataVencimento:'2026-10-31T23:59'},aplicado);
 assert.match(mensagem,/31\\/10\\/2026/); assert.match(mensagem,/2 mês/); assert.doesNotMatch(mensagem,/{{/);
`));

test('campanha inativa e vínculos cancelados não creditam; mesmo telefone é rejeitado', () => isolated(`
 await campanha('campanha_amizade_presente');
 const item=await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 await svc.cancelarIndicacao(item.id);
 await pagamento(2,'2026-11-01');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 await run("UPDATE clientes SET telefone='5511900000001' WHERE id=3");
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:3}),/mesmo telefone/);
 await run("UPDATE modelos_mensagem SET ativo=0 WHERE plano='campanha'");
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:4}),/Ative/);
`));

test('migração conserva vínculos antigos e associa a regra original sem liberar créditos', async () => {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(':memory:');
    const exec = sql => new Promise((ok,no)=>db.exec(sql,e=>e?no(e):ok()));
    try {
        await require('../database/migrations/018-programa-indicacoes').up({exec});
        await exec("INSERT INTO programa_indicacoes (indicadorClienteId,indicadoClienteId,status) VALUES (1,2,'beneficio_liberado'),(1,3,'ativa')");
        await require('../database/migrations/019-bonus-campanhas').up({exec});
        const rows = await new Promise((ok,no)=>db.all('SELECT * FROM programa_indicacoes ORDER BY id',(e,r)=>e?no(e):ok(r)));
        assert.deepEqual(rows.map(r=>r.status),['beneficio_liberado','ativa']);
        assert.ok(rows.every(r=>r.campanhaChave==='campanha_indique_ganhe_tres_meses' && r.creditoId===null));
    } finally { await new Promise(resolve=>db.close(resolve)); }
});

test('salvar formulário aberto antes do crédito automático conserva o saldo novo', () => isolated(`
 const clientes=require('./services/clientes');
 const antes=await clientes.buscarClientePorId(1);
 await run('UPDATE clientes SET bonusMeses=3 WHERE id=1');
 const depois=await clientes.salvarCliente({...antes,bonusMeses:0,bonusMesesOriginal:0,nome:'Nome atualizado'});
 assert.equal(depois.bonusMeses,3);
`));
