const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');

test('sincronização Mercado Pago configura relatório diário e guarda extrato com deduplicação', () => {
  const fonte = fs.readFileSync(path.join(raiz, 'services', 'mercadoPagoService.js'), 'utf8');
  assert.match(fonte, /release_report\/config/);
  assert.match(fonte, /release_report\/schedule/);
  assert.match(fonte, /movimentos_mercado_pago/);
  assert.match(fonte, /asset_management_gain/);
});

test('migração cria histórico local de créditos e débitos do Mercado Pago', () => {
  const migracao = fs.readFileSync(path.join(raiz, 'database', 'migrations', '017-movimentos-mercado-pago.js'), 'utf8');
  assert.match(migracao, /identificadorExterno TEXT NOT NULL UNIQUE/);
  assert.match(migracao, /credito TEXT NOT NULL/);
  assert.match(migracao, /debito TEXT NOT NULL/);
});
