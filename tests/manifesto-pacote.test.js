const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const test = require('node:test');

const raiz = path.resolve(__dirname, '..');
const gerador = path.join(raiz, 'scripts', 'gerar-manifesto-pacote.js');
const verificador = path.join(raiz, 'scripts', 'verificar-manifesto-pacote.js');

test('assina e verifica o manifesto usando caminho protegido para a chave privada', () => {
    const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'julian-manifesto-'));
    try {
        const pacote = path.join(temporario, 'pacote.zip');
        const chavePrivada = path.join(temporario, 'license-private-key.pem');
        const chavePublica = path.join(temporario, 'license-public-key.pem');
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
        fs.writeFileSync(pacote, 'conteudo de teste', 'utf8');
        fs.writeFileSync(chavePrivada, privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8');
        fs.writeFileSync(chavePublica, publicKey.export({ type: 'spki', format: 'pem' }), 'utf8');

        execFileSync(process.execPath, [gerador, pacote], {
            cwd: raiz,
            env: { ...process.env, LICENSE_PRIVATE_KEY_PATH: chavePrivada },
            stdio: 'pipe'
        });

        const manifesto = `${pacote}.manifest.json`;
        assert.equal(fs.existsSync(manifesto), true);
        execFileSync(process.execPath, [verificador, pacote, manifesto, chavePublica], { stdio: 'pipe' });
    } finally {
        fs.rmSync(temporario, { recursive: true, force: true });
    }
});
