const crypto = require('crypto');
const { obterConfiguracoes } = require('./configuracoesPainel');

const sessoes = new Map();
const COOKIE_NAME = 'julian_play_session';
const SESSION_HOURS = Number(process.env.PANEL_SESSION_HOURS || 8);
const SESSION_MS = Math.max(1, SESSION_HOURS) * 60 * 60 * 1000;

function hashSenha(senha) {
    return crypto.createHash('sha256').update(String(senha || '')).digest('hex');
}

function usuarioConfigurado() {
    return process.env.PANEL_USER || 'admin';
}

function senhaHashConfigurada() {
    return process.env.PANEL_PASSWORD_HASH || hashSenha(process.env.PANEL_PASSWORD || 'admin123');
}

async function obterCredenciaisConfiguradas() {
    const config = await obterConfiguracoes();
    const usuario = config.painelUsuario || process.env.PANEL_USER || 'admin';
    const senhaHash = config.painelSenhaHash
        || process.env.PANEL_PASSWORD_HASH
        || (process.env.PANEL_PASSWORD ? hashSenha(process.env.PANEL_PASSWORD) : '')
        || hashSenha('admin123');

    return { usuario, senhaHash };
}

async function obterUsuarioConfigurado() {
    const credenciais = await obterCredenciaisConfiguradas();
    return credenciais.usuario;
}

function compararSeguro(a, b) {
    const bufferA = Buffer.from(String(a || ''));
    const bufferB = Buffer.from(String(b || ''));

    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
}

async function validarLogin(usuario, senha) {
    const credenciais = await obterCredenciaisConfiguradas();
    const usuarioOk = compararSeguro(String(usuario || '').trim(), credenciais.usuario);
    const senhaOk = compararSeguro(hashSenha(senha), credenciais.senhaHash);

    return usuarioOk && senhaOk;
}

function criarSessao(usuario) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiraEm = Date.now() + SESSION_MS;

    sessoes.set(token, {
        usuario,
        expiraEm,
        criadoEm: new Date().toISOString()
    });

    return { token, expiraEm };
}

function lerCookies(req) {
    return String(req.headers.cookie || '')
        .split(';')
        .map(item => item.trim())
        .filter(Boolean)
        .reduce((cookies, item) => {
            const separador = item.indexOf('=');
            if (separador < 0) return cookies;

            const chave = decodeURIComponent(item.slice(0, separador));
            const valor = decodeURIComponent(item.slice(separador + 1));
            cookies[chave] = valor;
            return cookies;
        }, {});
}

function obterSessao(req) {
    const token = lerCookies(req)[COOKIE_NAME];
    if (!token) return null;

    const sessao = sessoes.get(token);
    if (!sessao) return null;

    if (sessao.expiraEm < Date.now()) {
        sessoes.delete(token);
        return null;
    }

    return { token, ...sessao };
}

function cookieSessao(token) {
    const partes = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        `Max-Age=${Math.floor(SESSION_MS / 1000)}`
    ];

    if (process.env.PANEL_COOKIE_SECURE === '1') {
        partes.push('Secure');
    }

    return partes.join('; ');
}

function cookieLogout() {
    return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function encerrarSessao(req) {
    const sessao = obterSessao(req);
    if (sessao?.token) sessoes.delete(sessao.token);
}

function protegerPainel(req, res, next) {
    try {
        const sessao = obterSessao(req);
        if (sessao) {
            req.usuarioPainel = sessao.usuario;
            return next();
        }

        const aceitaHtml = String(req.headers.accept || '').includes('text/html');
        if (aceitaHtml || req.method === 'GET') {
            const destino = encodeURIComponent(req.originalUrl || '/clientes');
            return res.redirect(`/login?next=${destino}`);
        }

        return res.status(401).json({ erro: 'Acesso nao autorizado' });
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    COOKIE_NAME,
    SESSION_HOURS,
    hashSenha,
    validarLogin,
    obterUsuarioConfigurado,
    criarSessao,
    obterSessao,
    cookieSessao,
    cookieLogout,
    encerrarSessao,
    protegerPainel,
    usuarioConfigurado
};
