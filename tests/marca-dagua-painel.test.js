const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');

test('marca do painel permite configurar e enviar imagem de fundo separada da logo', () => {
  const rota = fs.readFileSync(path.join(raiz, 'routes', 'clientesRoute.js'), 'utf8');
  const config = fs.readFileSync(path.join(raiz, 'services', 'configuracoesPainel.js'), 'utf8');
  assert.match(rota, /name="marcaDagua"/);
  assert.match(rota, /\/configuracoes\/marca-dagua/);
  assert.match(rota, /config\.marcaDaguaUrl \|\| '\/assets\/julian-play-fundo-painel\.png'/);
  assert.match(config, /marcaDaguaUrl/);
});
