const crypto = require('crypto');

const CSRF_COOKIE = 'julian_csrf';
const SEGREDO = String(process.env.SECURITY_SIGNING_SECRET || process.env.LICENSE_ADMIN_TOKEN || process.env.MASTER_SESSION_SECRET || crypto.randomBytes(32).toString('hex'));

function cookies(req) {
    return String(req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).reduce((acc, item) => {
        const i = item.indexOf('='); if (i > -1) acc[decodeURIComponent(item.slice(0, i))] = decodeURIComponent(item.slice(i + 1)); return acc;
    }, {});
}

function seguro(req) {
    return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function tokenCsrf(req, res) {
    let token = cookies(req)[CSRF_COOKIE];
    if (!/^[a-f0-9]{64}$/.test(token || '')) {
        token = crypto.randomBytes(32).toString('hex');
        const partes = [`${CSRF_COOKIE}=${token}`, 'SameSite=Strict', 'Path=/', 'Max-Age=28800'];
        if (seguro(req)) partes.push('Secure');
        res.append('Set-Cookie', partes.join('; '));
    }
    return token;
}

function comparar(a, b) {
    const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function csrfMiddleware(opcoes = {}) {
    const isento = opcoes.isento || (() => false);
    return (req, res, next) => {
        const token = tokenCsrf(req, res);
        const envioOriginal = res.send.bind(res);
        res.send = (conteudo) => {
            const tipo = String(res.getHeader('content-type') || '');
            if (typeof conteudo === 'string' && (tipo.includes('text/html') || /<html|<form/i.test(conteudo))) {
                conteudo = conteudo.replace(/<form\b([^>]*\bmethod=["']?post["']?[^>]*)>/gi,
                    `<form$1><input type="hidden" name="_csrf" value="${token}">`);
            }
            return envioOriginal(conteudo);
        };
        if (!['POST','PUT','PATCH','DELETE'].includes(req.method) || isento(req)) return next();
        if (/^multipart\/form-data/i.test(String(req.headers['content-type'] || ''))) return next();
        if (!comparar(token, req.body?._csrf || req.get('x-csrf-token'))) return res.status(403).send('Requisicao expirada ou invalida. Atualize a pagina e tente novamente.');
        next();
    };
}

function cabecalhosSeguranca(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
    if (seguro(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
}

function assinar(valor) { return crypto.createHmac('sha256', SEGREDO).update(valor).digest('hex'); }
function criarCaptcha() {
    const a = crypto.randomInt(2, 10); const b = crypto.randomInt(1, 10); const expira = Date.now() + 5 * 60 * 1000;
    const base = `${a}:${b}:${expira}`;
    return { pergunta: `${a} + ${b} = ?`, desafio: Buffer.from(`${base}:${assinar(base)}`).toString('base64url') };
}
function validarCaptcha(desafio, resposta) {
    try {
        const [a,b,expira,assinatura] = Buffer.from(String(desafio || ''), 'base64url').toString('utf8').split(':');
        const base = `${a}:${b}:${expira}`;
        return Number(expira) >= Date.now() && comparar(assinatura, assinar(base)) && Number(resposta) === Number(a) + Number(b);
    } catch (_) { return false; }
}

function base32Bytes(valor) {
    const alfabeto='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits='';
    for (const c of String(valor||'').toUpperCase().replace(/[^A-Z2-7]/g,'')) bits += alfabeto.indexOf(c).toString(2).padStart(5,'0');
    const bytes=[]; for(let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2)); return Buffer.from(bytes);
}
function codigoTotp(segredo, tempo=Date.now()) {
    const chave=base32Bytes(segredo); if(!chave.length) return '';
    const contador=Buffer.alloc(8); contador.writeBigUInt64BE(BigInt(Math.floor(tempo/30000)));
    const hash=crypto.createHmac('sha1',chave).update(contador).digest(); const offset=hash[19]&15;
    return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
function validarTotp(segredo, informado) {
    const codigo=String(informado||'').replace(/\D/g,'');
    return [-1,0,1].some(janela => comparar(codigoTotp(segredo, Date.now()+janela*30000), codigo));
}

function mascararSegredos(dados = {}) {
    const sensivel = /senha|password|token|secret|segredo|authorization|pixchave|webhook/i;
    return Object.fromEntries(Object.entries(dados).map(([k,v]) => [k, sensivel.test(k) ? '[OCULTO]' : v]));
}

module.exports={ csrfMiddleware, cabecalhosSeguranca, criarCaptcha, validarCaptcha, validarTotp, mascararSegredos };
