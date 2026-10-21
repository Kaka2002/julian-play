const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');

test('saldo do relatório usa total explícito, aceita zero e não soma rendimentos novamente', () => {
  const vm = require('node:vm');
  const fonte = fs.readFileSync(path.join(raiz, 'services', 'mercadoPagoService.js'), 'utf8');
  const funcao = fonte.slice(fonte.indexOf('function saldoDoRelatorio('), fonte.indexOf('async function obterSaldoRelatorioMercadoPago('));
  const contexto = {};
  vm.runInNewContext(funcao, contexto);
  const relatorio = { begin_date: '2026-10-06T03:00:00Z', end_date: '2026-10-07T02:59:59Z', file_name: 'teste.csv' };
  const total = { RECORD_TYPE: 'total', NET_CREDIT_AMOUNT: '436.40', NET_DEBIT_AMOUNT: '0.00' };
  const resultado = contexto.saldoDoRelatorio([{ RECORD_TYPE: 'initial_available_balance', NET_CREDIT_AMOUNT: '436.24' }, { RECORD_TYPE: 'release', NET_CREDIT_AMOUNT: '0.16' }, total], relatorio);
  assert.equal(resultado.valor, 436.40);
  assert.equal(resultado.fim, relatorio.end_date);
  assert.equal(contexto.saldoDoRelatorio([{ ...total, NET_CREDIT_AMOUNT: '0.00' }], relatorio).valor, 0);
  assert.equal(contexto.saldoDoRelatorio([{ ...total, NET_CREDIT_AMOUNT: 'inválido' }], relatorio), null);
  assert.equal(contexto.saldoDoRelatorio([], relatorio), null);
  assert.equal(contexto.saldoDoRelatorio([total, total], relatorio), null);
  assert.equal(contexto.saldoDoRelatorio([total], { ...relatorio, end_date: '' }), null);
});

test('sincronização Mercado Pago configura relatório diário e guarda extrato com deduplicação', () => {
  const fonte = fs.readFileSync(path.join(raiz, 'services', 'mercadoPagoService.js'), 'utf8');
  assert.match(fonte, /release_report\/config/);
  assert.match(fonte, /release_report\/schedule/);
  assert.match(fonte, /configuration not found for user/i);
  assert.match(fonte, /frequency: \{ hour: 3, type: 'daily' \}/);
  assert.doesNotMatch(fonte, /frequency: \{ hour: 3, type: 'daily', value: 1 \}/);
  assert.match(fonte, /movimentos_mercado_pago/);
  assert.match(fonte, /asset\[_\\s-\]\*management/);
});

test('migração cria histórico local de créditos e débitos do Mercado Pago', () => {
  const migracao = fs.readFileSync(path.join(raiz, 'database', 'migrations', '017-movimentos-mercado-pago.js'), 'utf8');
  assert.match(migracao, /identificadorExterno TEXT NOT NULL UNIQUE/);
  assert.match(migracao, /credito TEXT NOT NULL/);
  assert.match(migracao, /debito TEXT NOT NULL/);
});

test('sincronismo automático de rendimentos roda às 10h e não repete no mesmo dia', () => {
  const fonte = fs.readFileSync(path.join(raiz, 'services', 'monitoramentoComercial.js'), 'utf8');
  assert.match(fonte, /HORA_SINCRONISMO_RENDIMENTOS_MP = '10:00'/);
  assert.match(fonte, /agora\.hora \|\| ''\) >= HORA_SINCRONISMO_RENDIMENTOS_MP/);
  assert.match(fonte, /ultimoSincronismoRendimentosMP.*!==.*agora\.data/);
  assert.match(fonte, /versaoSincronismoRendimentosMP/);
});

test('sincronismo solicita o relatório do próprio dia e espera o processamento sem duplicar', () => {
  const mercadoPago = fs.readFileSync(path.join(raiz, 'services', 'mercadoPagoService.js'), 'utf8');
  const monitoramento = fs.readFileSync(path.join(raiz, 'services', 'monitoramentoComercial.js'), 'utf8');
  assert.match(mercadoPago, /function intervaloRelatorioDoDia/);
  assert.match(mercadoPago, /function dataUtcSemMilissegundos/);
  assert.match(mercadoPago, /begin_date: dataUtcSemMilissegundos\(`\$\{data\}T00:00:00-03:00`\)/);
  assert.match(mercadoPago, /ultimaSolicitacaoRelatorioRendimentosMP/);
  assert.match(mercadoPago, /requisicaoMercadoPago\('\/v1\/account\/release_report', accessToken/);
  assert.match(mercadoPago, /for \(const relatorio of relatoriosProcessados\)/);
  assert.match(mercadoPago, /ehRendimentoMercadoPago/);
  assert.match(mercadoPago, /relatorioManualRendimentosMPPendente/);
  assert.match(mercadoPago, /relatorioManualFoiProcessado/);
  assert.match(mercadoPago, /function relatorioDisponivel/);
  assert.match(mercadoPago, /\['processed', 'enabled'\]/);
  assert.doesNotMatch(mercadoPago, /if \(pendente\.tarefa\) return/);
  assert.match(mercadoPago, /replace\(\/\\\.\\d\{3\}Z\$\/\, 'Z'\)/);
  assert.match(mercadoPago, /pendente: true/);
  assert.match(monitoramento, /if \(!resultadoRendimentos\.pendente && !somenteDisponiveis\) \{/);
  assert.match(monitoramento, /salvarConfiguracao\('versaoSincronismoRendimentosMP', 'historico-mensal-v3'\)/);
});

test('inicialização consulta arquivos antes das 10h e mantém acompanhamento de tarefas pendentes', () => {
  const vm = require('node:vm');
  const fonte = fs.readFileSync(path.join(raiz, 'services', 'monitoramentoComercial.js'), 'utf8');
  const inicio = fonte.indexOf('function deveSincronizarRendimentosMercadoPago');
  const fim = fonte.indexOf('\nfunction montarPayloadWebhook', inicio);
  const contexto = { HORA_SINCRONISMO_RENDIMENTOS_MP: '10:00' };
  vm.createContext(contexto);
  vm.runInContext(fonte.slice(inicio, fim), contexto);
  const verificar = contexto.deveSincronizarRendimentosMercadoPago;
  const config = { mercadoPagoAccessToken: 'token-ficticio', ultimoSincronismoRendimentosMP: '2026-10-05', versaoSincronismoRendimentosMP: 'historico-mensal-v3' };
  const agora = { data: '2026-10-05', hora: '09:00' };
  assert.equal(verificar(config, agora), false);
  assert.equal(verificar(config, agora, true), true);
  assert.equal(verificar({ ...config, relatorioManualRendimentosMPPendente: '{"dia":"2026-10-04"}' }, agora), true);
  assert.equal(verificar({ ...config, mercadoPagoAccessToken: '' }, agora, true), false);
  assert.equal(verificar({ ...config, ultimoSincronismoRendimentosMP: '2026-10-04' }, { ...agora, hora: '10:00' }), true);
  assert.equal(verificar(config, { ...agora, hora: '10:00' }), false);
});

test('sincronizacao recupera dia faltante, confirma date_created e preserva lancamentos existentes', () => {
  const { executarIsolado, removerAmbiente } = require('./helpers/isolated');
  const r = executarIsolado(String.raw`(async()=>{
    const assert=require('node:assert/strict');const db=require('./database/sqlite');await db.ready;
    const cfg=require('./services/configuracoesPainel'),fin=require('./services/rendimentosFinanceirosService');
    await cfg.salvarConfiguracao('mercadoPagoAccessToken','token-ficticio');
    const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const mes=hoje.slice(0,7),ontem=new Date(Date.parse(hoje+'T12:00:00Z')-86400000).toISOString().slice(0,10);
    await fin.criarRendimentoMercadoPagoSeAusente({descricao:'Rendimento Mercado Pago',valor:'0,24',dataRecebimento:ontem,instituicao:'Mercado Pago'},'antigo','antigo.csv');
    const removido=await fin.criarRendimentoMercadoPagoSeAusente({descricao:'Rendimento Mercado Pago',valor:'0,29',dataRecebimento:hoje,instituicao:'Mercado Pago'},'removido','hoje.csv');
    await fin.removerRendimentoFinanceiro(removido.id,'teste');
    const agora=new Date().toISOString(),inicio=mes+'-01T03:00:00Z';
    await cfg.salvarConfiguracao('relatorioManualRendimentosMPPendente',JSON.stringify({dia:hoje,solicitadoEm:agora,tarefa:'nao-e-o-id-do-arquivo'}));
    const lista=[{status:'enabled',file_name:'hoje.csv',begin_date:hoje+'T03:00:00Z',end_date:hoje+'T23:59:59Z',date_created:agora}];
    const cab='DATE;SOURCE_ID;RECORD_TYPE;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT\n';
    const linha=(dia,id,valor)=>dia+'T02:00:00-03:00;'+id+';release;asset_management_gain;'+valor+';0.00\n';
    const arquivos={'hoje.csv':cab+linha(hoje,'removido','0.29')};let solicitacoes=0,periodo;
    global.fetch=async(url,op={})=>{
      if(url.endsWith('/config'))return {ok:true,json:async()=>({scheduled:true,columns:['DATE','SOURCE_ID','EXTERNAL_REFERENCE','RECORD_TYPE','DESCRIPTION','NET_CREDIT_AMOUNT','NET_DEBIT_AMOUNT','GROSS_AMOUNT','MP_FEE_AMOUNT','PAYMENT_METHOD'].map(key=>({key}))})};
      if(url.includes('/release_report/task/'))return {ok:true,json:async()=>({status:arquivos['historico.csv']?'processed':'data-ready',file_name:arquivos['historico.csv']?'historico.csv':''})};
      if(url.endsWith('/list'))return {ok:true,json:async()=>lista};
      if(url.endsWith('/release_report')&&op.method==='POST'){solicitacoes++;periodo=JSON.parse(op.body);return {ok:true,json:async()=>({id:'tarefa-nova'})}};
      const arquivo=decodeURIComponent(url.split('/').at(-1));if(arquivos[arquivo])return {ok:true,text:async()=>arquivos[arquivo]};
      throw new Error('Requisicao nao simulada');
    };
    const mp=require('./services/mercadoPagoService');
    const primeiro=await mp.importarRendimentosMercadoPago({mes,atualizarHistorico:true});
    assert.equal(solicitacoes,1);assert.equal(periodo.begin_date,inicio);assert.equal(primeiro.pendente,true);assert.equal(primeiro.importados,0);
    const pendente=JSON.parse((await cfg.obterConfiguracoes()).relatorioManualRendimentosMPPendente);assert.equal(pendente.inicio,inicio);
    arquivos['historico.csv']=cab+linha(ontem,'antigo','0.24')+linha(ontem,'faltante','0.28')+linha(hoje,'removido','0.29');
    lista.push({status:'enabled',file_name:'historico.csv',begin_date:periodo.begin_date,end_date:periodo.end_date,date_created:new Date(Date.now()+1000).toISOString()});
    const semId=linha(ontem,'','0.05');arquivos['historico.csv']+=semId;arquivos['copia.csv']=cab+semId;lista.push({...lista.at(-1),file_name:'copia.csv',date_created:new Date(Date.now()+2000).toISOString()});
    const segundo=await mp.importarRendimentosMercadoPago({somenteDisponiveis:true});assert.equal(segundo.importados,2);assert.equal(segundo.pendente,false);assert.equal((await cfg.obterConfiguracoes()).relatorioManualRendimentosMPPendente,'');
    const novamente=await mp.importarRendimentosMercadoPago({somenteDisponiveis:true});assert.equal(novamente.importados,0);
    const itens=await fin.listarRendimentosFinanceiros({status:'todos'});assert.equal(itens.length,4);assert.equal(itens.filter(x=>x.excluidoEm).length,1);assert.equal(itens.find(x=>x.valor==='0,28').dataRecebimento,ontem);
    await db.encerrar();console.log('ok');
  })().catch(e=>{console.error(e);process.exit(1)})`,{timeout:90000});
  try {assert.equal(r.stdout,'ok')}finally{removerAmbiente(r.ambiente)}
});

test('importacao e atomica, concorrente e preserva identificadores antigos sem recriar saldo', () => {
  const { executarIsolado, removerAmbiente } = require('./helpers/isolated');
  const r = executarIsolado(String.raw`(async()=>{
    const assert=require('node:assert/strict'),db=require('./database/sqlite');await db.ready;
    const fin=require('./services/rendimentosFinanceirosService');const dados={descricao:'Rendimento Mercado Pago',valor:'0,28',dataRecebimento:'2026-10-20',instituicao:'Mercado Pago'};
    const resultados=await Promise.all([fin.criarRendimentoMercadoPagoSeAusente(dados,'mesma-operacao','a.csv'),fin.criarRendimentoMercadoPagoSeAusente(dados,'mesma-operacao','b.csv')]);
    assert.equal(resultados.filter(Boolean).length,1);
    assert.equal(await fin.criarRendimentoMercadoPagoSeAusente(dados,'nova-chave-estavel','b.csv',['mesma-operacao']),null);
    const run=(sql)=>new Promise((ok,no)=>db.run(sql,e=>e?no(e):ok()));
    await run("CREATE TRIGGER falha_importacao BEFORE INSERT ON rendimentos_mercado_pago_importados WHEN NEW.identificadorExterno='falha' BEGIN SELECT RAISE(ABORT,'falha simulada'); END");
    await assert.rejects(fin.criarRendimentoMercadoPagoSeAusente(dados,'falha','falha.csv'),/falha simulada/);
    assert.equal((await fin.listarRendimentosFinanceiros({status:'todos'})).length,1);
    await db.encerrar();console.log('ok');
  })().catch(e=>{console.error(e);process.exit(1)})`,{timeout:90000});
  try {assert.equal(r.stdout,'ok')}finally{removerAmbiente(r.ambiente)}
});

test('botao sincronizar envia mes consultado para atualizacao do historico', async () => {
  const express=require('express');let recebido;
  const app=express();app.use(express.urlencoded({extended:false}));
  app.use(require('../routes/financeiroRoute')({importarRendimentosMercadoPago:async(opcoes)=>{recebido=opcoes;return {importados:0,pendente:true}}}));
  const servidor=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s))});
  try {
    const r=await fetch('http://127.0.0.1:'+servidor.address().port+'/financeiro/rendimentos/sincronizar-mercado-pago',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:'mes=2026-10'});
    assert.equal(r.status,302);assert.deepEqual(recebido,{mes:'2026-10',atualizarHistorico:true});assert.match(decodeURIComponent(r.headers.get('location')),/histórico/);
  } finally {await new Promise(ok=>servidor.close(ok))}
});
test('periodo historico fecha mes anterior e datas de credito seguem Sao Paulo', () => {
  const vm=require('node:vm');
  const fonte=fs.readFileSync(path.join(raiz,'services','mercadoPagoService.js'),'utf8');
  const contexto={Date:class extends Date{constructor(...a){super(...(a.length?a:['2026-10-21T15:00:00Z']))}},Intl};
  vm.createContext(contexto);vm.runInContext(fonte.slice(fonte.indexOf('function dataRelatorio('),fonte.indexOf('async function solicitarRelatorioDoDia(')),contexto);
  assert.equal(contexto.dataRelatorio({DATE:'2026-10-21T02:30:00Z'}),'2026-10-20');
  assert.equal(contexto.relatorioIncluiDia({begin_date:'2026-10-20T03:00:00Z',end_date:'2026-10-21T02:59:59Z'},'2026-10-21'),false);
  assert.equal(contexto.periodoSincronizacaoRendimentos({mes:'2026-09'}).begin_date,'2026-09-01T03:00:00Z');
  assert.equal(contexto.periodoSincronizacaoRendimentos({mes:'2026-09'}).end_date,'2026-10-01T02:59:59Z');
  assert.equal(contexto.periodoSincronizacaoRendimentos({mes:'2026-10'}).end_date,'2026-10-21T15:00:00Z');
  assert.throws(()=>contexto.periodoSincronizacaoRendimentos({mes:'2026-13'}),/mes valido/);
  assert.throws(()=>contexto.periodoSincronizacaoRendimentos({mes:'2026-11'}),/futuro/);
});
test('historico de mes anterior concluido nao substitui a sincronizacao automatica atual', async () => {
  const vm=require('node:vm');const fonte=fs.readFileSync(path.join(raiz,'services','mercadoPagoService.js'),'utf8');let periodo;
  const ctx={Date:class extends Date{constructor(...a){super(...(a.length?a:['2026-10-21T15:00:00Z']))}},Intl,salvarConfiguracao:async()=>{},requisicaoMercadoPago:async(c,t,o)=>{periodo=JSON.parse(o.body);return {id:'ficticio'}}};
  vm.createContext(ctx);vm.runInContext(fonte.slice(fonte.indexOf('function dataRelatorio('),fonte.indexOf('async function garantirRelatorioMercadoPago(')),ctx);
  const pendente={dia:'2026-10-21',inicio:'2026-09-01T03:00:00Z',fim:'2026-10-01T02:59:59Z',solicitadoEm:'2026-10-21T14:00:00Z'};
  const resultado=await ctx.solicitarRelatorioDoDia('ficticio',{relatorioManualRendimentosMPPendente:JSON.stringify(pendente)},[{status:'enabled',file_name:'anterior.csv',begin_date:pendente.inicio,end_date:pendente.fim,date_created:'2026-10-21T14:01:00Z'}]);
  assert.equal(resultado.solicitado,true);assert.equal(periodo.begin_date,'2026-10-01T03:00:00Z');
});
test('tarefa exata pendente nao e concluida por relatorio antigo com data aparente futura', () => {
  const vm=require('node:vm'),fonte=fs.readFileSync(path.join(raiz,'services','mercadoPagoService.js'),'utf8'),ctx={};
  vm.createContext(ctx);vm.runInContext(fonte.slice(fonte.indexOf('function relatorioIncluiDia('),fonte.indexOf('async function garantirRelatorioMercadoPago(')),ctx);
  const rel={status:'enabled',file_name:'antigo.csv',begin_date:'2026-10-01T03:00:00Z',end_date:'2026-10-22T02:59:59Z',date_created:'2026-10-21T19:00:00Z'};
  const pend={dia:'2026-10-21',inicio:rel.begin_date,fim:'2026-10-21T15:00:00Z',solicitadoEm:'2026-10-21T15:00:00Z',tarefa:'id-exato',acompanharTarefa:true};
  assert.equal(ctx.relatorioManualFoiProcessado([rel],pend),false);
  assert.equal(ctx.relatorioManualFoiProcessado([rel],{...pend,arquivo:'novo.csv'}),false);
  assert.equal(ctx.relatorioManualFoiProcessado([{...rel,file_name:'novo.csv'}],{...pend,arquivo:'novo.csv'}),true);
});