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

function lerSegredoDeArquivo() {
    const caminhos = [
        path.join(process.cwd(), '.julian-master-install.json'),
        path.join(process.cwd(), '.julian-play-install.json')
    ];

    for (const caminho of caminhos) {
        try {
            const config = JSON.parse(fs.readFileSync(caminho, 'utf8').replace(/^\uFEFF/, ''));
            const segredo = String(config.licenseSigningSecret || config.licenseAdminToken || '').trim();
            if (segredo) return segredo;
        } catch (_) {
            // Arquivo opcional; segue para a proxima fonte.
        }
    }
    return '';
}

function obterSegredoLicenca() {
    const segredo = String(process.env.LICENSE_SIGNING_SECRET || process.env.LICENSE_ADMIN_TOKEN || '').trim()
        || lerSegredoDeArquivo();
    if (!segredo) {
        throw new Error('Segredo de licença não configurado. Configure LICENSE_SIGNING_SECRET ou LICENSE_ADMIN_TOKEN.');
    }
    return segredo;
}

function assinarPayloadLicenca(payloadBase64) {
    return crypto
        .createHmac('sha256', obterSegredoLicenca())
        .update(payloadBase64)
        .digest('base64url');
}

function gerarCodigoLicencaAssinado(payload = {}) {
    const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
    return `${LICENCA_CODIGO_PREFIXO}${payloadBase64}.${assinarPayloadLicenca(payloadBase64)}`;
}

function lerCodigoLicencaAssinado(codigo) {
    const texto = String(codigo || '').trim();
    const normalizado = texto.startsWith(LICENCA_CODIGO_PREFIXO)
        ? texto.slice(LICENCA_CODIGO_PREFIXO.length)
        : texto;
    const [payloadBase64, assinatura] = normalizado.split('.');

    if (!payloadBase64 || !assinatura) {
        throw new Error('Código de licença inválido.');
    }

    const assinaturaEsperada = assinarPayloadLicenca(payloadBase64);
    if (!compararSeguro(assinatura, assinaturaEsperada)) {
        throw new Error('Código de licença não confere com a assinatura do fornecedor.');
    }

    const payload = JSON.parse(base64UrlDecode(payloadBase64));
    if (Number(payload.v || 0) !== 1) {
        throw new Error('Versão do código de licença não suportada.');
    }
    return payload;
}

module.exports = {
    gerarCodigoLicencaAssinado,
    lerCodigoLicencaAssinado
};
