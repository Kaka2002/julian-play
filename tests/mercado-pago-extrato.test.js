const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');

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
  assert.match(mercadoPago, /replace\(\/\\\.\\d\{3\}Z\$\/\, 'Z'\)/);
  assert.match(mercadoPago, /pendente: true/);
  assert.match(monitoramento, /if \(!resultadoRendimentos\.pendente\) \{/);
  assert.match(monitoramento, /salvarConfiguracao\('versaoSincronismoRendimentosMP', 'relatorio-do-dia-v2'\)/);
});
