const crypto = require('crypto');
const { obterConfiguracoes, salvarConfiguracao } = require('./configuracoesPainel');
const { criarHashSenha, verificarSenha, hashEhLegado, hashLegado } = require('./passwordService');

const sessoes = new Map();
const COOKIE_NAME = 'julian_play_session';
const SESSION_HOURS = Number(process.env.PANEL_SESSION_HOURS || 8);
const SESSION_MS = Math.max(1, SESSION_HOURS) * 60 * 60 * 1000;

function hashSenha(senha) {
    return hashLegado(senha);
}

async function obterCredenciaisConfiguradas() {
    const config = await obterConfiguracoes();

    if (config.painelUsuario && config.painelSenhaHash) {
        return {
            usuario: config.painelUsuario,
            senhaHash: config.painelSenhaHash,
            origem: 'banco'
        };
    }

    const senhaEnv = process.env.PANEL_PASSWORD_HASH
        || (process.env.PANEL_PASSWORD ? hashSenha(process.env.PANEL_PASSWORD) : '');
    const usuarioEnv = process.env.PANEL_USER || (senhaEnv ? 'admin' : '');

    return { usuario: usuarioEnv, senhaHash: senhaEnv, origem: 'ambiente' };
}

async function acessoConfigurado() {
    const credenciais = await obterCredenciaisConfiguradas();
    return Boolean(credenciais.usuario && credenciais.senhaHash);
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
    if (!credenciais.usuario || !credenciais.senhaHash) return false;

    const usuarioOk = compararSeguro(String(usuario || '').trim(), credenciais.usuario);
    const senhaOk = verificarSenha(senha, credenciais.senhaHash);

    if (usuarioOk && senhaOk && credenciais.origem === 'banco' && hashEhLegado(credenciais.senhaHash)) {
        await salvarConfiguracao('painelSenhaHash', criarHashSenha(senha));
    }

    return usuarioOk && senhaOk;
}

async function confirmarSenhaAtual(req, senha) {
    const sessao = obterSessao(req);
    if (!sessao || !senha) return false;
    return validarLogin(sessao.usuario, senha);
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

function cookieSessao(token, req = null) {
    const partes = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        `Max-Age=${Math.floor(SESSION_MS / 1000)}`
    ];

    const protocoloEncaminhado = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    if (process.env.PANEL_COOKIE_SECURE === '1' || req?.secure || protocoloEncaminhado === 'https') {
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
    confirmarSenhaAtual,
    acessoConfigurado,
    obterUsuarioConfigurado,
    criarSessao,
    obterSessao,
    cookieSessao,
    cookieLogout,
    encerrarSessao,
    protegerPainel
};
