const fs = require('fs'); const crypto = require('crypto');
const [pacote, manifestoPath, chavePath] = process.argv.slice(2);
if (!pacote || !manifestoPath || !chavePath) process.exit(2);
try {
  const manifesto = JSON.parse(fs.readFileSync(manifestoPath, 'utf8'));
  const pacoteBytes = fs.readFileSync(pacote);
  const chave = fs.readFileSync(chavePath, 'utf8').replace(/\\n/g, '\n').trim();
  const payload = { versao: manifesto.versao, arquivo: manifesto.arquivo, tamanho: manifesto.tamanho, sha256: manifesto.sha256, publicadoEm: manifesto.publicadoEm };
  const base = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hash = crypto.createHash('sha256').update(pacoteBytes).digest('hex');
  const valido = manifesto.algoritmo === 'ed25519' && hash === String(manifesto.sha256).toLowerCase() && crypto.verify(null, Buffer.from(base), chave, Buffer.from(manifesto.assinatura, 'base64url'));
  if (!valido) process.exit(1);
  console.log('Manifesto Ed25519 válido.');
} catch (_) { process.exit(1); }
