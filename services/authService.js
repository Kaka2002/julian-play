const crypto = require('crypto');
const db = require('../database/sqlite');
const { obterConfiguracoesAcesso, salvarConfiguracao } = require('./configuracoesPainel');
const { criarHashSenha, verificarSenha, hashEhLegado, hashLegado } = require('./passwordService');

const COOKIE_NAME = 'julian_play_session';
const SESSION_HOURS = Number(process.env.PANEL_SESSION_HOURS || 8);
const SESSION_MS = Math.max(1, SESSION_HOURS) * 60 * 60 * 1000;

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function concluido(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, alteracoes: this.changes });
        });
    }));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    }));
}

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

function hashSenha(senha) {
    return hashLegado(senha);
}

async function obterCredenciaisConfiguradas() {
    const config = await obterConfiguracoesAcesso();
    if (config.painelUsuario && config.painelSenhaHash) {
        return { usuario: config.painelUsuario, senhaHash: config.painelSenhaHash, origem: 'banco' };
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
    return (await obterCredenciaisConfiguradas()).usuario;
}

function compararSeguro(a, b) {
    const bufferA = Buffer.from(String(a || ''));
    const bufferB = Buffer.from(String(b || ''));
    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
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
    const sessao = await obterSessao(req);
    if (!sessao || !senha) return false;
    return validarLogin(sessao.usuario, senha);
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function criarSessao(usuario, req = null) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiraEm = Date.now() + SESSION_MS;
    const agora = new Date().toISOString();
    await executar(
        `INSERT INTO sessoes_painel
        (tokenHash, usuario, criadoEm, expiraEm, ultimoAcessoEm, ip, userAgent)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            hashToken(token), usuario, agora, expiraEm, agora,
            req?.ip || req?.socket?.remoteAddress || '',
            String(req?.headers?.['user-agent'] || '').slice(0, 500)
        ]
    );
    return { token, expiraEm };
}

function lerCookies(req) {
    return String(req.headers.cookie || '').split(';').map(item => item.trim()).filter(Boolean)
        .reduce((cookies, item) => {
            const separador = item.indexOf('=');
            if (separador < 0) return cookies;
            cookies[decodeURIComponent(item.slice(0, separador))] = decodeURIComponent(item.slice(separador + 1));
            return cookies;
        }, {});
}

async function obterSessao(req) {
    const token = lerCookies(req)[COOKIE_NAME];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const sessao = await buscarUm(
        `SELECT usuario, criadoEm, expiraEm, ultimoAcessoEm, ip, userAgent
         FROM sessoes_painel WHERE tokenHash = ? AND revogadaEm IS NULL`,
        [tokenHash]
    );
    if (!sessao) return null;
    if (Number(sessao.expiraEm) < Date.now()) {
        await executar('UPDATE sessoes_painel SET revogadaEm = ? WHERE tokenHash = ?', [new Date().toISOString(), tokenHash]);
        return null;
    }
    const agora = new Date().toISOString();
    await executar('UPDATE sessoes_painel SET ultimoAcessoEm = ? WHERE tokenHash = ?', [agora, tokenHash]);
    return { token, tokenHash, ...sessao, ultimoAcessoEm: agora };
}

function cookieSessao(token, req = null) {
    const partes = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/',
        `Max-Age=${Math.floor(SESSION_MS / 1000)}`
    ];
    const protocolo = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    if (process.env.PANEL_COOKIE_SECURE === '1' || req?.secure || protocolo === 'https') partes.push('Secure');
    return partes.join('; ');
}

function cookieLogout() {
    return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

async function encerrarSessao(req) {
    const token = lerCookies(req)[COOKIE_NAME];
    if (!token) return;
    await executar(
        'UPDATE sessoes_painel SET revogadaEm = ? WHERE tokenHash = ? AND revogadaEm IS NULL',
        [new Date().toISOString(), hashToken(token)]
    );
}

async function listarSessoesAtivas() {
    return buscarTodos(
        `SELECT tokenHash, usuario, criadoEm, expiraEm, ultimoAcessoEm, ip, userAgent
         FROM sessoes_painel WHERE revogadaEm IS NULL AND expiraEm >= ?
         ORDER BY ultimoAcessoEm DESC`,
        [Date.now()]
    );
}

async function revogarTodasSessoes() {
    return executar('UPDATE sessoes_painel SET revogadaEm = ? WHERE revogadaEm IS NULL', [new Date().toISOString()]);
}

async function protegerPainel(req, res, next) {
    try {
        const sessao = await obterSessao(req);
        if (sessao) {
            req.usuarioPainel = sessao.usuario;
            return next();
        }
        const aceitaHtml = String(req.headers.accept || '').includes('text/html');
        if (aceitaHtml || req.method === 'GET') {
            return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || '/clientes')}`);
        }
        return res.status(401).json({ erro: 'Acesso nao autorizado' });
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    COOKIE_NAME, SESSION_HOURS, hashSenha, validarLogin, confirmarSenhaAtual, acessoConfigurado,
    obterUsuarioConfigurado, criarSessao, obterSessao, cookieSessao, cookieLogout, encerrarSessao,
    listarSessoesAtivas, revogarTodasSessoes, protegerPainel
};
