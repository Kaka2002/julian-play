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
  assert.match(monitoramento, /salvarConfiguracao\('versaoSincronismoRendimentosMP', 'relatorio-do-dia-v2'\)/);
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
  const config = { mercadoPagoAccessToken: 'token-ficticio', ultimoSincronismoRendimentosMP: '2026-10-05', versaoSincronismoRendimentosMP: 'relatorio-do-dia-v2' };
  const agora = { data: '2026-10-05', hora: '09:00' };
  assert.equal(verificar(config, agora), false);
  assert.equal(verificar(config, agora, true), true);
  assert.equal(verificar({ ...config, relatorioManualRendimentosMPPendente: '{"dia":"2026-10-04"}' }, agora), true);
  assert.equal(verificar({ ...config, mercadoPagoAccessToken: '' }, agora, true), false);
  assert.equal(verificar({ ...config, ultimoSincronismoRendimentosMP: '2026-10-04' }, { ...agora, hora: '10:00' }), true);
  assert.equal(verificar(config, { ...agora, hora: '10:00' }), false);
});
