const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENCA_CODIGO_PREFIXO = 'JPLAY-LIC-';

function compararSeguro(a, b) {
    const bufferA = Buffer.from(String(a || ''));
    const bufferB = Buffer.from(String(b || ''));
    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function base64UrlEncode(valor) {
    return Buffer.from(String(valor), 'utf8').toString('base64url');
}

function base64UrlDecode(valor) {
    return Buffer.from(String(valor || ''), 'base64url').toString('utf8');
}

function normalizarPem(valor) {
    return String(valor || '').replace(/\\n/g, '\n').trim();
}

function lerConfiguracaoLocal() {
    const caminhos = [
        path.join(process.cwd(), '.julian-master-install.json'),
        path.join(process.cwd(), '.julian-play-install.json')
    ];

    for (const caminho of caminhos) {
        try {
            return JSON.parse(fs.readFileSync(caminho, 'utf8').replace(/^\uFEFF/, ''));
        } catch (_) {
            // Arquivo opcional; segue para a proxima fonte.
        }
    }
    return {};
}

function obterChavePrivada() {
    const config = lerConfiguracaoLocal();
    return normalizarPem(process.env.LICENSE_PRIVATE_KEY || config.licenseSigningPrivateKey || '');
}

function obterChavePublica() {
    const config = lerConfiguracaoLocal();
    return normalizarPem(process.env.LICENSE_PUBLIC_KEY || config.licensePublicKey || '');
}

function obterSegredoLicenca() {
    const config = lerConfiguracaoLocal();
    const segredo = String(
        process.env.LICENSE_SIGNING_SECRET
        || process.env.LICENSE_ADMIN_TOKEN
        || config.licenseSigningSecret
        || config.licenseAdminToken
        || ''
    ).trim();
    if (!segredo) {
        throw new Error('Segredo de licença não configurado. Configure LICENSE_SIGNING_SECRET ou LICENSE_ADMIN_TOKEN.');
    }
    return segredo;
}

function assinarHmac(payloadBase64) {
    return crypto
        .createHmac('sha256', obterSegredoLicenca())
        .update(payloadBase64)
        .digest('base64url');
}

function assinarEd25519(payloadBase64) {
    const chavePrivada = obterChavePrivada();
    if (!chavePrivada) return '';
    return crypto.sign(null, Buffer.from(payloadBase64), chavePrivada).toString('base64url');
}

function gerarCodigoAssinado(payload = {}) {
    const chavePrivada = obterChavePrivada();
    const payloadFinal = chavePrivada ? { ...payload, alg: 'ed25519' } : { ...payload };
    const payloadBase64 = base64UrlEncode(JSON.stringify(payloadFinal));
    const assinatura = chavePrivada ? assinarEd25519(payloadBase64) : assinarHmac(payloadBase64);
    return `${LICENCA_CODIGO_PREFIXO}${payloadBase64}.${assinatura}`;
}

function validarAssinatura(payload, payloadBase64, assinatura) {
    if (payload.alg === 'ed25519') {
        const chavePublica = obterChavePublica();
        if (!chavePublica) {
            throw new Error('Chave pública do fornecedor não configurada nesta instalação.');
        }
        const valido = crypto.verify(null, Buffer.from(payloadBase64), chavePublica, Buffer.from(assinatura, 'base64url'));
        if (!valido) {
            throw new Error('Código de licença não confere com a assinatura do fornecedor.');
        }
        return;
    }

    const assinaturaEsperada = assinarHmac(payloadBase64);
    if (!compararSeguro(assinatura, assinaturaEsperada)) {
        throw new Error('Código de licença não confere com a assinatura do fornecedor.');
    }
}

function lerCodigoAssinado(codigo) {
    const texto = String(codigo || '').trim();
    const normalizado = texto.startsWith(LICENCA_CODIGO_PREFIXO)
        ? texto.slice(LICENCA_CODIGO_PREFIXO.length)
        : texto;
    const [payloadBase64, assinatura] = normalizado.split('.');

    if (!payloadBase64 || !assinatura) {
        throw new Error('Código de licença inválido.');
    }

    const payload = JSON.parse(base64UrlDecode(payloadBase64));
    validarAssinatura(payload, payloadBase64, assinatura);

    if (Number(payload.v || 0) !== 1) {
        throw new Error('Versão do código de licença não suportada.');
    }
    return payload;
}

module.exports = {
    gerarCodigoAssinado,
    lerCodigoAssinado
};
