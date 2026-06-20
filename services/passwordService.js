const crypto = require('crypto');

const PREFIXO = 'scrypt';
const TAMANHO_CHAVE = 64;

function hashLegado(senha) {
    return crypto.createHash('sha256').update(String(senha || '')).digest('hex');
}

function criarHashSenha(senha) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(senha || ''), salt, TAMANHO_CHAVE);

    return `${PREFIXO}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function compararBuffersSeguro(a, b) {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function verificarSenha(senha, hashSalvo) {
    const hash = String(hashSalvo || '');

    if (hash.startsWith(`${PREFIXO}$`)) {
        const [, saltHex, hashHex] = hash.split('$');
        if (!saltHex || !hashHex) return false;

        try {
            const esperado = Buffer.from(hashHex, 'hex');
            const calculado = crypto.scryptSync(String(senha || ''), Buffer.from(saltHex, 'hex'), esperado.length);
            return compararBuffersSeguro(calculado, esperado);
        } catch {
            return false;
        }
    }

    return compararBuffersSeguro(hashLegado(senha), hash);
}

function hashEhLegado(hash) {
    return /^[a-f0-9]{64}$/i.test(String(hash || ''));
}

module.exports = {
    criarHashSenha,
    verificarSenha,
    hashEhLegado,
    hashLegado
};
