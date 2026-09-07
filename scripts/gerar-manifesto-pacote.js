const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pacote = path.resolve(process.argv[2]);
const destino = `${pacote}.manifest.json`;
const configPath = path.resolve('.julian-master-install.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (_) {}
const chave = String(process.env.LICENSE_PRIVATE_KEY || config.licenseSigningPrivateKey || '').replace(/\\n/g, '\n').trim();
if (!chave) throw new Error('Chave privada Ed25519 ausente para assinar o manifesto.');
const dados = fs.readFileSync(pacote);
const hash = crypto.createHash('sha256').update(dados).digest('hex');
const payload = { versao: 1, arquivo: path.basename(pacote), tamanho: dados.length, sha256: hash, publicadoEm: new Date().toISOString() };
const base = Buffer.from(JSON.stringify(payload)).toString('base64url');
const assinatura = crypto.sign(null, Buffer.from(base), chave).toString('base64url');
const manifesto = { ...payload, algoritmo: 'ed25519', assinatura };
fs.writeFileSync(destino, `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');
console.log(`Manifesto assinado: ${destino}`);
