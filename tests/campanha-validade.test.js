const test=require('node:test');const assert=require('node:assert/strict');
const {executarIsolado,removerAmbiente}=require('./helpers/isolated');
const setup=`const assert=require('node:assert/strict');const db=require('./database/sqlite');await db.ready;const modelos=require('./services/modelosMensagem'),svc=require('./services/indicacoesService'),val=require('./services/campanhaValidadeService');const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok(this)}));const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));const all=(s,p=[])=>new Promise((ok,no)=>db.all(s,p,(e,r)=>e?no(e):ok(r)));async function ativar(chave='campanha_amizade_presente'){const m=(await modelos.listarModelos()).find(x=>x.chave===chave);await modelos.salvarModelo({...m,ativo:'1',campanhaValidadeEm:'2099-12-31T23:59'});return svc.obterCampanhaAtiva();}async function pagar(id,ciclo){await run("INSERT INTO cliente_pagamentos(clienteId,plano,formaPagamento,valorTotal,vencimentoNovo) VALUES(?,'Mensal','PIX','35,00',?)",[id,ciclo]);}for(let id=1;id<=5;id++)await run("INSERT INTO clientes(id,nome,telefone,status,plano,valorPlano) VALUES(?,?,?,'ativo','Mensal','35,00')",[id,'Cliente ficticio '+id,'551199000000'+id]);`;
function isolado(codigo){const r=executarIsolado(`(async()=>{${setup}${codigo};await db.encerrar();console.log('OK')})().catch(e=>{console.error(e);process.exitCode=1})`);try{assert.equal(r.stdout,'OK');}finally{removerAmbiente(r.ambiente);}}
test('campanha exige validade futura, nao usa modelo fallback e encerra automaticamente no prazo',()=>isolado(`
 assert.equal(await svc.obterCampanhaAtiva(),null);
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2}),/Nenhuma campanha vigente/);
 await assert.rejects(modelos.montarMensagemCampanhaAmizade({nome:'Ficticio'}),/Nenhuma campanha/);
 const m=(await modelos.listarModelos()).find(x=>x.chave==='campanha_amizade_presente');
 for(const data of ['','2020-01-01T00:00','invalida'])await assert.rejects(modelos.salvarModelo({...m,ativo:'1',campanhaValidadeEm:data}));
 const c=await ativar();assert.equal(c.validadeEm,'2100-01-01T02:59:00.000Z');
 await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 await run("UPDATE indicacao_campanhas SET validadeEm='2000-01-01T00:00:00.000Z' WHERE id=?",[c.id]);
 assert.equal(await svc.obterCampanhaAtiva(),null);assert.equal((await get('SELECT ativo FROM modelos_mensagem WHERE id=?',[m.id])).ativo,0);
 assert.equal((await get('SELECT status FROM programa_indicacoes')).status,'expirada');
 await assert.rejects(val.enviarUnico(c.id,'5511999990000',async()=>assert.fail('nao enviar')),/encerrada/);
`));
test('nova edicao nao reaproveita indicacoes ou pagamentos antigos e preserva bonus conquistado',()=>isolado(`
 const c=await ativar();await pagar(2,'inicial');await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});await pagar(2,'renovacao');await svc.processarCreditosIndicacoes();
 assert.equal((await get('SELECT bonusMeses FROM clientes WHERE id=1')).bonusMeses,1);
 await pagar(3,'inicial');await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:3});
 await run("UPDATE indicacao_campanhas SET validadeEm='2000-01-01T00:00:00.000Z' WHERE id=?",[c.id]);await svc.obterCampanhaAtiva();
 await pagar(3,'tardia');await svc.processarCreditosIndicacoes();assert.equal((await get('SELECT bonusMeses FROM clientes WHERE id=1')).bonusMeses,1);
 const nova=await ativar();assert.notEqual(c.id,nova.id);await svc.processarCreditosIndicacoes();assert.equal((await all('SELECT * FROM indicacao_creditos')).length,1);
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:3}),/já participa|histórico/);
 await pagar(4,'antigo-1');await pagar(4,'antigo-2');await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:4});assert.equal((await svc.listarIndicacoes()).itens.find(x=>x.indicadoClienteId===4).pagamentosValidos,0);
 await pagar(4,'novo');await svc.processarCreditosIndicacoes();assert.equal((await get('SELECT bonusMeses FROM clientes WHERE id=1')).bonusMeses,2);
 assert.deepEqual((await all('SELECT campanhaEdicaoId FROM indicacao_creditos ORDER BY id')).map(x=>x.campanhaEdicaoId),[c.id,nova.id]);
`));
test('registro congela campanha regra e edicao e salvar invalido nao desativa campanha vigente',()=>isolado(`
 const c=await ativar('campanha_indique_ganhe_tres_meses');const execucao=await require('./services/campanhasService').criarCampanha({nome:'nome incorreto',modeloChave:'campanha_amizade_presente'});
 assert.match(execucao.nome,/3 meses/);assert.equal(execucao.modeloChave,c.chave);assert.equal(execucao.campanhaEdicaoId,c.id);
 const m=(await modelos.listarModelos()).find(x=>x.chave==='campanha_amizade_presente');await assert.rejects(modelos.salvarModelo({...m,ativo:'1',campanhaValidadeEm:''}));assert.equal((await svc.obterCampanhaAtiva()).id,c.id);
 await ativar();assert.equal((await require('./services/campanhasService').buscarCampanha(execucao.id)).nome,execucao.nome);
`));
test('mesmo celular tem envio unico persistente por edicao inclusive concorrencia e falha incerta',()=>isolado(`
 const c=await ativar();let enviados=0;const enviar=async()=>{enviados++;return {mensagemId:'ficticia'};};
 const r=await Promise.allSettled([val.enviarUnico(c.id,'(11) 99999-0000',enviar),val.enviarUnico(c.id,'5511999990000',enviar)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(enviados,1);
 delete require.cache[require.resolve('./services/campanhaValidadeService')];await assert.rejects(require('./services/campanhaValidadeService').enviarUnico(c.id,'5511999990000',enviar),/já recebeu/);
 await assert.rejects(val.enviarUnico(c.id,'5511999990001',async()=>{throw new Error('envio incerto');}),/incerto/);await assert.rejects(val.enviarUnico(c.id,'5511999990001',enviar),/reservado/);assert.equal(enviados,1);
 const m=(await modelos.listarModelos()).find(x=>x.chave===c.chave);await modelos.salvarModelo({...m,ativo:'0'});const nova=await ativar();await val.enviarUnico(nova.id,'5511999990000',enviar);assert.equal(enviados,2);
`));
test('migracao preserva saldos e vinculos legados e remove telefone reservado na anonimizacao',async()=>{
    const sqlite=require('sqlite3');const db=new sqlite.Database(':memory:');const exec=s=>new Promise((ok,no)=>db.exec(s,e=>e?no(e):ok()));const all=s=>new Promise((ok,no)=>db.all(s,(e,r)=>e?no(e):ok(r)));
    try{
        await exec(`CREATE TABLE modelos_mensagem(id INTEGER,chave TEXT,plano TEXT,ativo INTEGER);CREATE TABLE programa_indicacoes(id INTEGER,campanhaChave TEXT,status TEXT,beneficioMeses INTEGER);CREATE TABLE indicacao_creditos(id INTEGER,campanhaChave TEXT,meses INTEGER);CREATE TABLE campanhas(id INTEGER,nome TEXT);CREATE TABLE campanha_itens(campanhaId INTEGER,telefone TEXT,status TEXT);CREATE TABLE clientes(id INTEGER,telefone TEXT,anonimizadoEm TEXT,bonusMeses INTEGER);INSERT INTO modelos_mensagem VALUES(1,'campanha_indique_ganhe_tres_meses','campanha',1);INSERT INTO programa_indicacoes VALUES(1,'campanha_indique_ganhe_tres_meses','ativa',3);INSERT INTO indicacao_creditos VALUES(1,'campanha_indique_ganhe_tres_meses',3);INSERT INTO clientes VALUES(1,'(11) 99999-0000','',3);INSERT INTO campanhas VALUES(1,'Registro original');`);
        await require('../database/migrations/025-validade-campanhas').up({exec});
        assert.deepEqual(await all('SELECT bonusMeses FROM clientes'),[{bonusMeses:3}]);assert.deepEqual(await all('SELECT status,beneficioMeses FROM programa_indicacoes'),[{status:'ativa',beneficioMeses:3}]);assert.equal((await all('SELECT nome FROM campanhas'))[0].nome,'Registro original');
        const [edicao]=await all('SELECT * FROM indicacao_campanhas');assert.equal(edicao.status,'legada');assert.equal(edicao.meses,3);assert.equal((await all('SELECT campanhaEdicaoId FROM programa_indicacoes'))[0].campanhaEdicaoId,edicao.id);
        await exec(`INSERT INTO campanha_destinatarios VALUES(1,'5511999990000','enviado',CURRENT_TIMESTAMP);INSERT INTO campanha_destinatarios VALUES(1,'5511888880000','enviado',CURRENT_TIMESTAMP);UPDATE clientes SET anonimizadoEm=CURRENT_TIMESTAMP WHERE id=1;`);
        assert.deepEqual((await all('SELECT telefone FROM campanha_destinatarios')).map(x=>x.telefone),['5511888880000']);
    }finally{await new Promise(ok=>db.close(ok));}
});
test('envio em fila revalida campanha depois de digitar e nao deixa midia para replay apos reinicio',async()=>{
    const fs=require('fs'),path=require('path'),vm=require('vm');const fonte=fs.readFileSync(path.join(__dirname,'../routes/clientesRoute.js'),'utf8');
    const funcao=fonte.slice(fonte.indexOf('async function enviarImagemWhatsAppComFallback('),fonte.indexOf('\nfunction caminhoConfigInstalacaoLocal('));
    for(const expirar of [false,true]){
        let digitou=false,enviou=0,conferencias=0,persistencia;
        const ctx={require:()=>({exigirCampanhaAtiva:async()=>{conferencias++;if(expirar&&digitou)throw new Error('Campanha encerrada');}}),console:{warn(){}},resolverDestinosWhatsApp:async()=>['ficticio@c.us'],obterEnvioWhatsAppRecente:()=>null,reservarEnvioWhatsApp:()=>{},MessageMedia:{fromFilePath:()=>({mimetype:'image/png',data:'ZmljdGljaW8='})},registrarEnvioDoRobo:()=>{},aguardarComTimeout:p=>p,enfileirarEnvio:async(fn,d,op)=>{persistencia=op.persistencia;return fn();},simularDigitacaoDestino:async()=>{digitou=true;},registrarMensagemDoRobo:()=>{},confirmarEnvioWhatsApp:()=>{},mensagensWhatsAppRecentes:new Map(),CAMPANHA_AMIZADE_INTERVALO_CLIENTES_MIN_MS:1,CAMPANHA_AMIZADE_INTERVALO_CLIENTES_MAX_MS:1};
        vm.createContext(ctx);vm.runInContext(funcao,ctx);
        const p=ctx.enviarImagemWhatsAppComFallback({sendMessage:async()=>{enviou++;return {id:{_serialized:'ficticio'},ack:1};}},'5511999990000','imagem-ficticia','texto','Teste isolado',{campanhaEdicaoId:1,simularDigitacao:true});
        if(expirar)await assert.rejects(p,/encerrada/);else await p;
        assert.equal(digitou,true);assert.equal(conferencias,2);assert.equal(enviou,expirar?0:1);assert.equal(persistencia,null);
    }
});
