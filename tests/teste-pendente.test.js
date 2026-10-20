const test=require('node:test');
const assert=require('node:assert/strict');
const {prepararPeriodoTeste}=require('../services/regrasTesteService');
const {executarIsolado,removerAmbiente}=require('./helpers/isolated');
test('teste so inicia com horas; pendente nao tem periodo; salvar de novo nao reinicia',()=>{
 const ativoSemInicio={status:'ativo',plano:'Teste Grátis'};prepararPeriodoTeste(ativoSemInicio);assert.equal(ativoSemInicio.status,'pendente');
 const c={status:'pendente',plano:'Teste Grátis',dataInicio:'2026-01-01T10:00',dataVencimento:'2026-01-02T10:00'};
 prepararPeriodoTeste(c);assert.equal(c.dataVencimento,'');assert.equal(c.dataInicio,'');
 c.status='teste';assert.throws(()=>prepararPeriodoTeste(c),/horas/);
 c.horasTeste='30 minutos';prepararPeriodoTeste(c,null,new Date('2026-10-19T21:15:00Z'));
 assert.equal(c.dataInicio,'2026-10-19T18:15');assert.equal(c.dataVencimento,'2026-10-19T18:45');
 const anterior={...c};prepararPeriodoTeste(c,anterior,new Date('2026-10-20T21:15:00Z'));assert.equal(c.dataInicio,anterior.dataInicio);
});
test('cadastro pendente e suspenso bloqueiam avisos; indicacao aguarda plano ativo e nao duplica bonus',()=>{
 const r=executarIsolado(`(async()=>{
 const assert=require('node:assert/strict'),db=require('./database/sqlite'),c=require('./services/clientes'),i=require('./services/indicacoesService'),m=require('./services/modelosMensagem');
 const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,e=>e?no(e):ok()));await db.ready;
 const indicador=await c.salvarCliente({nome:'Indicador teste',telefone:'5511900000001',status:'ativo',plano:'Mensal',valorPlano:'35,00'});
 const novo=await c.salvarCliente({nome:'Pendente teste',telefone:'5511900000002',status:'pendente',plano:'Teste Grátis',dataInicio:'2020-01-01T10:00',dataVencimento:'2020-01-02T10:00'});
 assert.equal(novo.dataInicio,'');assert.equal(novo.dataVencimento,'');
 const lista=await m.listarModelos();await m.salvarModelo({...lista.find(x=>x.chave==='campanha_amizade_presente'),ativo:'1'});
 await i.registrarIndicacao({indicadorClienteId:indicador.id,indicadoClienteId:novo.id});
 assert.equal((await i.listarIndicacoes()).itens[0].status,'aguardando_assinatura');
 assert.equal((await i.listarResumoIndicacoesPainel()).length,0);
 // Testa tambem cadastros antigos com datas vencidas e status de espera.
 await run("UPDATE clientes SET dataVencimento='2020-01-01T10:00',vencimento='2020-01-01' WHERE id=?",[novo.id]);
 const pendencias=await require('./services/pendenciasOperacionaisService').listarPendenciasOperacionais({}, {operacional:{whatsapp:{conectado:true},sistema:{backupRecente:true}}});
 const aviso=pendencias.itens.find(x=>x.clienteId===novo.id);
 assert.equal(aviso.tipo,'teste_pendente');assert.equal(aviso.prioridade,'baixa');assert.match(aviso.detalhe,/Sem contagem/);assert.equal(aviso.prazo,'');
 for(const status of ['pendente','suspenso','cancelado']){
 await run('UPDATE clientes SET status=? WHERE id=?',[status,novo.id]);
 assert.equal((await c.listarTestesGratisExpiradosParaAviso('2030-01-01T10:00',-32)).length,0);
 assert.equal((await c.listarTestesGratisParaAvisoPorHorario('2019-12-31T10:00','2030-01-01T10:00',-30)).length,0);
 }
 await assert.rejects(c.salvarCliente({...novo,status:'teste',horasTeste:''}),/horas/);
 const iniciado=await c.salvarCliente({...novo,status:'teste',horasTeste:'02 horas'});
 assert.ok(iniciado.dataInicio);assert.equal(new Date(iniciado.dataVencimento+'Z')-new Date(iniciado.dataInicio+'Z'),7200000);
 await i.processarCreditosIndicacoes();assert.equal((await i.listarIndicacoes()).itens[0].status,'aguardando_assinatura');
 await c.salvarCliente({...iniciado,status:'ativo',plano:'Mensal',valorPlano:'35,00'});
 await i.processarCreditosIndicacoes();assert.equal((await i.listarIndicacoes()).itens[0].status,'ativa');
 for(const venc of ['2030-02-01','2030-03-01']){
 await run("INSERT INTO cliente_pagamentos(clienteId,plano,valorTotal,formaPagamento,vencimentoNovo) VALUES (?,'Mensal','35,00','PIX',?)",[novo.id,venc]);await i.processarCreditosIndicacoes();
 assert.equal((await c.buscarClientePorId(indicador.id)).bonusMeses,venc==='2030-02-01'?0:1);
 }
 await i.processarCreditosIndicacoes();assert.equal((await c.buscarClientePorId(indicador.id)).bonusMeses,1);
 await db.encerrar();console.log('ok');})().catch(e=>{console.error(e);process.exit(1)});`,{timeout:90000});
 try{assert.equal(r.stdout,'ok')}finally{removerAmbiente(r.ambiente)}
});
