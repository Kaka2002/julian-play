const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const arquivo = path.resolve(process.argv[2] || '');
const destino = path.resolve(process.argv[3] || '');
const senha = String(process.env.JPLAY_RECOVERY_PASSWORD || '');

if (!arquivo || !fs.existsSync(arquivo) || !destino || senha.length < 10) {
    console.error('Uso: defina JPLAY_RECOVERY_PASSWORD e execute node scripts/extrair-kit-recuperacao.js <kit.jplaybackup> <pasta-vazia>');
    process.exit(1);
}
if (fs.existsSync(destino) && fs.readdirSync(destino).length) {
    console.error('A pasta de destino precisa estar vazia.');
    process.exit(1);
}

const dados = fs.readFileSync(arquivo);
if (dados.subarray(0, 8).toString() !== 'JPLAYBK2') {
    console.error('Formato incompatível: este extrator aceita somente kits JPLAYBK2.');
    process.exit(1);
}

try {
    const salt = dados.subarray(8, 24);
    const iv = dados.subarray(24, 36);
    const tag = dados.subarray(36, 52);
    const conteudo = dados.subarray(52);
    const chave = crypto.scryptSync(senha, salt, 32);
    const decifra = crypto.createDecipheriv('aes-256-gcm', chave, iv);
    decifra.setAuthTag(tag);
    const pacote = JSON.parse(Buffer.concat([decifra.update(conteudo), decifra.final()]).toString('utf8'));
    if (pacote.formato !== 'JPLAYBK2' || !pacote.bancoBase64) throw new Error('Conteúdo inválido.');
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(path.join(destino, path.basename(pacote.bancoNome || 'clientes.db')), Buffer.from(pacote.bancoBase64, 'base64'));
    fs.writeFileSync(path.join(destino, 'recuperacao-segredos.json'), JSON.stringify(pacote.recuperacao || {}, null, 2), { mode: 0o600 });
    console.log(`Kit extraído em ${destino}. Proteja recuperacao-segredos.json e apague-o depois da restauração.`);
} catch (_) {
    console.error('Não foi possível abrir o kit. Confira a senha e a integridade do arquivo.');
    process.exit(1);
}
