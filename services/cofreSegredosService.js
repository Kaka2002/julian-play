const crypto = require('crypto');

const PREFIXO = 'jplay:v1:';
const CHAVES_SENSIVEIS = new Set([
    'mercadoPagoAccessToken',
    'mercadoPagoWebhookSecret',
    'paypalClientId',
    'paypalClientSecret',
    'paypalWebhookId',
    'alertaWebhookUrl',
    'painel.apiUsuario',
    'painel.apiToken',
    'cliente.senha',
    'cliente.senhaApp',
    'cliente.acessosApp'
]);

function derivarChave(material) {
    return material ? crypto.createHash('sha256').update(`julian-play:${material}`).digest() : null;
}

function chavesMestre() {
    const atual = String(process.env.JULIAN_SECRET_KEY || process.env.LICENSE_ADMIN_TOKEN || '').trim();
    const anteriores = String(process.env.JULIAN_SECRET_KEY_PREVIOUS || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    return [atual, ...anteriores].filter(Boolean).map(derivarChave);
}

function deveProteger(chave) {
    return CHAVES_SENSIVEIS.has(String(chave || ''));
}

function estaProtegido(valor) {
    return String(valor || '').startsWith(PREFIXO);
}

function proteger(chave, valor) {
    const texto = String(valor ?? '');
    const mestre = chavesMestre()[0];
    if (!texto || !deveProteger(chave) || !mestre || estaProtegido(texto)) return texto;
    const iv = crypto.randomBytes(12);
    const cifra = crypto.createCipheriv('aes-256-gcm', mestre, iv);
    cifra.setAAD(Buffer.from(String(chave)));
    const conteudo = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
    return `${PREFIXO}${iv.toString('base64url')}:${cifra.getAuthTag().toString('base64url')}:${conteudo.toString('base64url')}`;
}

function revelar(chave, valor) {
    const texto = String(valor ?? '');
    if (!estaProtegido(texto)) return texto;
    const mestres = chavesMestre();
    if (!mestres.length) throw new Error(`A chave de criptografia da instalação não está disponível para ${chave}.`);
    const [iv, tag, conteudo] = texto.slice(PREFIXO.length).split(':');
    for (const mestre of mestres) {
        try {
            const decifra = crypto.createDecipheriv('aes-256-gcm', mestre, Buffer.from(iv, 'base64url'));
            decifra.setAAD(Buffer.from(String(chave)));
            decifra.setAuthTag(Buffer.from(tag, 'base64url'));
            return Buffer.concat([decifra.update(Buffer.from(conteudo, 'base64url')), decifra.final()]).toString('utf8');
        } catch (_) { /* Tenta chave anterior durante rotação controlada. */ }
    }
    throw new Error(`Não foi possível descriptografar ${chave}; restaure a chave original da instalação.`);
}

module.exports = { CHAVES_SENSIVEIS, deveProteger, estaProtegido, proteger, revelar };
