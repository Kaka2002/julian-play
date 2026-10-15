const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

test('parabéns às 10h: retomada no dia, reserva anual, falha incerta e bônus independente', () => {
    const r = executarIsolado(`(async () => {
        const assert = require('node:assert/strict');
        const db = require('./database/sqlite'); await db.ready;
        const run = (sql,p=[]) => new Promise((ok,no)=>db.run(sql,p,e=>e?no(e):ok()));
        const all = sql => new Promise((ok,no)=>db.all(sql,(e,r)=>e?no(e):ok(r)));
        await run("INSERT INTO clientes(id,nome,telefone,nascimento,bonusMeses,statusAvisoBonus) VALUES(1,'Pessoa teste','5511999990001','10-15',2,'nao_programado')");
        await run("INSERT INTO clientes(id,nome,telefone,nascimento,whatsappOptOutEm) VALUES(2,'Optout','5511999990002','10-15','2026-01-01')");
        const svc = require('./services/aniversarioAutomaticoService');
        let hora = '2026-10-15T12:59:00Z', conectado = true, envios = 0, digitacao = 0;
        const client = {getNumberId:async t=>({_serialized:t+'@c.us'}),sendMessage:async (to,msg)=>{envios++;assert.match(msg,/FELIZ ANIVERSÁRIO/);assert.doesNotMatch(msg,/bônus/i);return {id:{_serialized:'teste'}};}};
        const options = {getClient:()=>client,getStatusWhatsApp:()=>({conectado}),agora:()=>new Date(hora),enfileirar:async fn=>fn(),humanizar:async()=>{digitacao++;}};
        await svc.verificarAniversarios(options);assert.equal(envios,0);
        hora = '2026-10-15T13:00:00Z';conectado=false;
        await svc.verificarAniversarios(options);assert.equal((await all('SELECT * FROM cliente_notas')).length,0);
        conectado=true;hora='2026-10-15T18:00:00Z';
        await Promise.all([svc.verificarAniversarios(options),svc.verificarAniversarios(options)]);
        await svc.verificarAniversarios(options);assert.equal(envios,1);
        assert.deepEqual((await all('SELECT bonusMeses,statusAvisoBonus FROM clientes WHERE id=1'))[0],{bonusMeses:2,statusAvisoBonus:'nao_programado'});
        assert.equal((await all('SELECT * FROM cliente_pagamentos')).length,0);
        hora='2027-10-15T13:00:00Z';await svc.verificarAniversarios(options);assert.equal(envios,2);
        hora='2028-10-15T13:00:00Z';client.sendMessage=async()=>{envios++;throw Error('resultado desconhecido');};
        await svc.verificarAniversarios(options);await svc.verificarAniversarios(options);assert.equal(envios,3);
        assert.match((await all('SELECT texto FROM cliente_notas ORDER BY id DESC LIMIT 1'))[0].texto,/incerto/);
        hora='2029-10-15T13:00:00Z';options.humanizar=async()=>{hora='2029-10-16T03:00:00Z';};
        await svc.verificarAniversarios(options);assert.equal(envios,3);
        assert.equal(digitacao,3);
        assert.equal(svc.relogio(new Date('2026-10-16T02:59:00Z')).dia,'2026-10-15');
        await db.encerrar(); console.log('ok');
    })().catch(e=>{console.error(e);process.exit(1)});`);
    try { assert.equal(r.stdout, 'ok'); } finally { removerAmbiente(r.ambiente); }
});
