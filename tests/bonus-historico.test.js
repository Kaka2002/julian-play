const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');
const setup = `
const assert=require('node:assert/strict');
const db=require('./database/sqlite');
const clientes=require('./services/clientes');
const bonus=require('./services/bonusService');
const planos=await require('./services/tiposPlanos').listarTiposPlanos();
const mensal=planos.find(p=>p.nome==='Mensal');
const trimestral=planos.find(p=>p.nome==='Bônus Trimestral');
const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok(this)}));
const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));
async function criar(saldo=3){return clientes.salvarCliente({nome:'Cliente de teste',telefone:'5511999998888',status:'ativo',tipoPlanoId:String(mensal.id),plano:'Mensal',diasContrato:30,valorPlano:'35,00',assinaturaApp:'15,00',dataInicio:'2026-09-01T23:59',dataVencimento:'2026-10-01T23:59',bonusMeses:saldo});}
const chave=()=>require('crypto').randomUUID();
`;
function isolated(codigo) {
    const r = executarIsolado(`(async()=>{${setup}\n${codigo}\nawait db.encerrar(); console.log('ok');})().catch(e=>{console.error(e);process.exit(1)})`);
    try { assert.equal(r.stdout, 'ok'); } finally { removerAmbiente(r.ambiente); }
}

test('identificar bônus antigo preserva saldo e datas, com proteção contra repetição e outro cliente', () => isolated(`
 const c=await criar(1);
 const h=await bonus.listarHistoricoBonus(c.id);
 const dados={creditoId:h.creditos[0].id,meses:1,campanhaChave:'campanha_amizade_presente',indicado:'Indicado antigo',chave:chave()};
 await assert.rejects(bonus.identificarOrigemBonus(c.id+1,dados,'operador'), /insuficiente/);
 await bonus.identificarOrigemBonus(c.id,dados,'operador');
 await bonus.identificarOrigemBonus(c.id,dados,'operador');
 await assert.rejects(bonus.identificarOrigemBonus(c.id,{...dados,chave:chave()},'operador'),/insuficiente/);
 const depois=await clientes.buscarClientePorId(c.id);
 assert.equal(depois.bonusMeses,1); assert.equal(depois.dataVencimento,c.dataVencimento);
 assert.equal((await get('SELECT COUNT(*) n FROM cliente_pagamentos')).n,0);
 const hist=await bonus.listarHistoricoBonus(c.id);
 assert.equal(hist.creditos.length,1); assert.equal(hist.creditos[0].campanhaChave,'campanha_amizade_presente');
 assert.equal(hist.creditos[0].indicado,'Indicado antigo');
`));

test('bônus trimestral consome três meses de origens registradas, preserva preço e não duplica uso', () => isolated(`
 const c=await criar(3);
 const credito=(await bonus.listarHistoricoBonus(c.id)).creditos[0];
 await bonus.identificarOrigemBonus(c.id,{creditoId:credito.id,meses:3,campanhaChave:'campanha_indique_ganhe_tres_meses',chave:chave()},'operador');
 const salvo=await clientes.salvarCliente({...c,tipoPlanoId:trimestral.id,dataInicio:'2026-10-01T23:59',dataVencimento:'2027-01-01T23:59'});
 assert.equal(salvo.bonusMeses,0); assert.equal(salvo.valorPlano,'35,00'); assert.equal(salvo.assinaturaApp,'15,00');
 assert.equal(salvo.diasContrato,90);
 await clientes.salvarCliente({...salvo,tipoPlanoId:trimestral.id});
 const h=await bonus.listarHistoricoBonus(c.id);
 assert.equal(h.baixas.length,1); assert.equal(h.baixas[0].meses,3); assert.equal(h.baixas[0].tipo,'uso');
 assert.equal(h.creditos[0].saldo,0); assert.ok(h.baixas[0].pagamentoId);
 const p=await get('SELECT * FROM cliente_pagamentos');
 assert.equal(p.valorTotal,'0,00'); assert.equal(p.diasContrato,90); assert.equal(p.mensagemEnviada,0);
 await assert.rejects(clientes.salvarCliente({...salvo,tipoPlanoId:trimestral.id,dataVencimento:'2027-04-01T23:59'}),/suficiente/);
 assert.equal((await get('SELECT COUNT(*) n FROM cliente_pagamentos')).n,1);
`));

test('identificação parcial e ajustes mantêm soma do histórico igual ao saldo', () => isolated(`
 const c=await criar(5);
 const credito=(await bonus.listarHistoricoBonus(c.id)).creditos[0];
 await bonus.identificarOrigemBonus(c.id,{creditoId:credito.id,meses:1,campanhaChave:'campanha_amizade_presente',chave:chave()},'operador');
 await bonus.identificarOrigemBonus(c.id,{creditoId:credito.id,meses:3,campanhaChave:'campanha_indique_ganhe_tres_meses',chave:chave()},'operador');
 let h=await bonus.listarHistoricoBonus(c.id);
 assert.equal(h.creditos.reduce((n,c)=>n+c.saldo,0),5);
 await clientes.salvarCliente({...c,bonusMeses:4,bonusMesesOriginal:5});
 h=await bonus.listarHistoricoBonus(c.id);
 assert.equal(h.creditos.reduce((n,c)=>n+c.saldo,0),4);
 assert.equal(h.baixas[0].tipo,'ajuste');
 await clientes.aplicarBonusCliente(c.id,3);
 h=await bonus.listarHistoricoBonus(c.id);
 assert.equal(h.creditos.reduce((n,c)=>n+c.saldo,0),1);
 assert.equal(h.baixas.filter(b=>b.tipo==='uso').reduce((n,b)=>n+b.meses,0),3);
`));

test('falha financeira reverte saldo e consumo das origens na mesma transação', () => isolated(`
 const c=await criar(3);
 await run("CREATE TRIGGER falha_pagamento BEFORE INSERT ON cliente_pagamentos BEGIN SELECT RAISE(ABORT,'falha simulada'); END");
 await assert.rejects(clientes.salvarCliente({...c,tipoPlanoId:trimestral.id,dataVencimento:'2027-01-01T23:59'}),/falha simulada/);
 assert.equal((await clientes.buscarClientePorId(c.id)).bonusMeses,3);
 const h=await bonus.listarHistoricoBonus(c.id);assert.equal(h.baixas.length,0);assert.equal(h.creditos[0].saldo,3);
`));

test('crédito automático cria uma única origem com o indicado e catálogo comercial exclui bônus', () => isolated(`
 const c=await criar(0);
 const indicado=await clientes.salvarCliente({nome:'Indicado',telefone:'5511999997777',status:'ativo'});
 const svc=require('./services/indicacoesService');
 await svc.registrarIndicacao({indicadorClienteId:c.id,indicadoClienteId:indicado.id});
 await run("INSERT INTO cliente_pagamentos (clienteId,plano,formaPagamento,valorTotal) VALUES (?,'Mensal','PIX','35,00')",[indicado.id]);
 await svc.processarCreditosIndicacoes();await svc.processarCreditosIndicacoes();
 const h=await bonus.listarHistoricoBonus(c.id);
 assert.equal(h.creditos.length,1);assert.equal(h.creditos[0].campanhaChave,'campanha_amizade_presente');
 assert.equal(h.creditos[0].indicados,'Indicado');assert.equal(h.creditos[0].saldo,1);
 const menu=require('./menus/planos')(planos);
 assert.doesNotMatch(menu,/Bônus/);
 assert.equal(require('./services/tiposPlanos').mesesPlanoBonus(trimestral),3);
`));

test('migração preserva saldo antigo sem atribuir campanha ou duplicar crédito', async () => {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(':memory:');
    const exec = sql => new Promise((ok,no)=>db.exec(sql,e=>e?no(e):ok()));
    const all = sql => new Promise((ok,no)=>db.all(sql,(e,r)=>e?no(e):ok(r)));
    try {
        await exec(`CREATE TABLE clientes (id INTEGER PRIMARY KEY, bonusMeses INTEGER, ultimoAvisoAniversario TEXT, dataVencimento TEXT);
            CREATE TABLE indicacao_creditos (id INTEGER PRIMARY KEY, indicadorClienteId INTEGER, campanhaChave TEXT, meses INTEGER, criadoEm TEXT);
            INSERT INTO clientes VALUES (1, 1, '', '2026-10-01'), (2, 0, '', '2026-10-01'), (3, NULL, '', '2026-10-01');
            INSERT INTO indicacao_creditos VALUES (1,1,'campanha_indique_ganhe_tres_meses',3,'2026-09-01');`);
        await require('../database/migrations/020-historico-bonus').up({exec});
        const creditos = await all('SELECT * FROM bonus_creditos');
        assert.equal(creditos.length,1);
        assert.equal(creditos[0].saldo,1);
        assert.equal(creditos[0].campanhaChave,'nao_identificada');
        assert.equal((await all('SELECT bonusMeses FROM clientes WHERE id=1'))[0].bonusMeses,1);
        await exec('UPDATE clientes SET bonusMeses=2 WHERE id=3');
        assert.equal((await all('SELECT saldo FROM bonus_creditos WHERE clienteId=3'))[0].saldo,2);
    } finally { await new Promise(resolve=>db.close(resolve)); }
});
