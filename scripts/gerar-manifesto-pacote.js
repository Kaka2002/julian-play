const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pacote = path.resolve(process.argv[2]);
const destino = `${pacote}.manifest.json`;
const configPath = path.resolve('.julian-master-install.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (_) {}
const chave = String(process.env.LICENSE_PRIVATE_KEY || config.licenseSigningPrivateKey || '').replace(/\\n/g, '\n').trim();
if (!chave) {
    console.warn('Manifesto nao assinado: configure LICENSE_PRIVATE_KEY no Painel Mestre.');
    process.exit(0);
}
const dados = fs.readFileSync(pacote);
const hash = crypto.createHash('sha256').update(dados).digest('hex');
const payload = { versao: 1, arquivo: path.basename(pacote), tamanho: dados.length, sha256: hash, publicadoEm: new Date().toISOString() };
const base = Buffer.from(JSON.stringify(payload)).toString('base64url');
let assinatura;
try {
    assinatura = crypto.sign(null, Buffer.from(base), chave).toString('base64url');
} catch (erro) {
    console.warn(`Manifesto nao assinado: LICENSE_PRIVATE_KEY nao e um PEM Ed25519 valido (${erro.code || 'formato invalido'}).`);
    process.exit(0);
}
const manifesto = { ...payload, algoritmo: 'ed25519', assinatura };
fs.writeFileSync(destino, `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');
console.log(`Manifesto assinado: ${destino}`);
