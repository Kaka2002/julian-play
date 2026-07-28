const express = require('express');
const crypto = require('crypto');
const {
    validarLogin,
    acessoConfigurado,
    criarSessao,
    obterSessao,
    cookieSessao,
    cookieLogout,
    encerrarSessao,
    listarSessoesAtivas,
    revogarTodasSessoes,
    obterUsuarioConfigurado
} = require('../services/authService');
const {
    obterConfiguracoes,
    salvarConfiguracoesAcesso,
    salvarConfiguracoesPainel
} = require('../services/configuracoesPainel');
const { criarCaptcha, validarCaptcha, validarTotp, mascararSegredos } = require('../services/securityService');
const { registrarEventoSistema } = require('../services/eventosSistema');
const loginPersistente = require('../services/loginSecurityService');

const router = express.Router();
const tentativasLogin = new Map();
const MAX_TENTATIVAS_LOGIN = Number(process.env.PANEL_LOGIN_MAX_ATTEMPTS || 5);
const BLOQUEIO_LOGIN_MS = Number(process.env.PANEL_LOGIN_LOCK_MINUTES || 15) * 60 * 1000;
const CODIGO_CONFIGURACAO = process.env.PANEL_SETUP_TOKEN
    || process.env.LICENSE_ADMIN_TOKEN
    || crypto.randomBytes(6).toString('hex').toUpperCase();

acessoConfigurado()
    .then((configurado) => {
        if (!configurado) {
            console.log(`[seguranca] Codigo da configuracao inicial: ${CODIGO_CONFIGURACAO}`);
        }
    })
    .catch((err) => console.log('[seguranca] Nao foi possivel verificar a configuracao inicial:', err.message));

function chaveTentativa(req, usuario = '') {
    const origem = process.env.TRUST_PROXY === '1'
        ? req.ip
        : req.socket?.remoteAddress;
    return `${origem || 'desconhecido'}:${String(usuario).trim().toLowerCase()}`;
}

function bloqueioAtual(req, usuario) {
    const chave = chaveTentativa(req, usuario);
    const registro = tentativasLogin.get(chave);
    if (!registro) return null;

    if (registro.bloqueadoAte && registro.bloqueadoAte > Date.now()) return registro;
    if (registro.bloqueadoAte || Date.now() - registro.inicio > BLOQUEIO_LOGIN_MS) {
        tentativasLogin.delete(chave);
    }

    return null;
}

function registrarFalhaLogin(req, usuario) {
    const chave = chaveTentativa(req, usuario);
    const atual = tentativasLogin.get(chave);
    const registro = atual && Date.now() - atual.inicio <= BLOQUEIO_LOGIN_MS
        ? atual
        : { tentativas: 0, inicio: Date.now(), bloqueadoAte: 0 };

    registro.tentativas += 1;
    if (registro.tentativas >= MAX_TENTATIVAS_LOGIN) {
        registro.bloqueadoAte = Date.now() + BLOQUEIO_LOGIN_MS;
    }
    tentativasLogin.set(chave, registro);
}

function limparFalhasLogin(req, usuario) {
    tentativasLogin.delete(chaveTentativa(req, usuario));
}

function codigoConfiguracaoValido(valor) {
    const informado = Buffer.from(String(valor || '').trim());
    const esperado = Buffer.from(CODIGO_CONFIGURACAO);
    return informado.length === esperado.length && crypto.timingSafeEqual(informado, esperado);
}

function escapar(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function desativarCache(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
}

function destinoSeguro(valor) {
    const destino = String(valor || '/clientes');
    if (!destino.startsWith('/') || destino.startsWith('//')) return '/clientes';
    if (destino.startsWith('/login') || destino.startsWith('/logout')) return '/clientes';
    return destino;
}

function telaLogin({ mensagem = '', next = '/clientes', config = {}, usuarioPainel = '', configuracaoInicial = false, captcha = criarCaptcha() }) {
    const nomeSistema = config.nomeSistema || 'Controle de Cliente IPTV e P2P';
    const logoUrl = config.logoUrl || '';

    return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <title>${configuracaoInicial ? 'Configuração inicial' : 'Login'} - ${escapar(nomeSistema)}</title>
    <style>
        :root {
            --bg: #f5f6f8;
            --panel: #ffffff;
            --ink: #081225;
            --muted: #6c7383;
            --line: #e4e7ec;
            --blue: #4368e8;
            --red: #ef4444;
            --shadow: 0 1px 2px rgba(15, 23, 42, .08), 0 18px 40px rgba(15, 23, 42, .08);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: var(--bg);
            color: var(--ink);
            font-family: "Inter", Arial, sans-serif;
        }

        .login-card {
            width: min(100%, 420px);
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
            box-shadow: var(--shadow);
            padding: 28px;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            font-weight: 800;
            font-size: 18px;
        }

        .brand img {
            width: 42px;
            height: 42px;
            border-radius: 8px;
            object-fit: cover;
        }

        .brand-icon {
            width: 42px;
            height: 42px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            color: #fff;
            background: var(--blue);
            font-weight: 800;
        }

        h1 {
            margin: 0 0 6px;
            font-size: 30px;
            letter-spacing: 0;
        }

        .subtitle {
            margin: 0 0 22px;
            color: var(--muted);
            line-height: 1.4;
        }

        label {
            display: grid;
            gap: 7px;
            margin-bottom: 16px;
            font-weight: 700;
        }

        input {
            width: 100%;
            border: 1px solid var(--line);
            border-radius: 8px;
            min-height: 48px;
            padding: 0 14px;
            color: var(--ink);
            font: inherit;
            font-weight: 600;
            outline: none;
        }

        input:focus {
            border-color: var(--blue);
            box-shadow: 0 0 0 3px rgba(67, 104, 232, .14);
        }

        button {
            width: 100%;
            min-height: 48px;
            border: 0;
            border-radius: 8px;
            background: var(--blue);
            color: #fff;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
            box-shadow: 0 8px 18px rgba(67, 104, 232, .24);
        }

        .notice {
            margin: 0 0 16px;
            padding: 12px 14px;
            border-radius: 8px;
            background: #fff1f1;
            color: var(--red);
            font-weight: 700;
        }

        .helper {
            margin-top: 16px;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.45;
        }
    </style>
</head>
<body>
    <main class="login-card">
        <div class="brand">
            ${logoUrl ? `<img src="${escapar(logoUrl)}" alt="Logo">` : '<span class="brand-icon">JP</span>'}
            <span>${escapar(nomeSistema)}</span>
        </div>
        <h1>${configuracaoInicial ? 'Configuração inicial' : 'Entrar'}</h1>
        <p class="subtitle">${configuracaoInicial ? 'Crie o primeiro acesso administrativo desta instalação.' : 'Informe o usuário e senha para acessar o painel.'}</p>
        ${mensagem ? `<div class="notice">${escapar(mensagem)}</div>` : ''}
        ${configuracaoInicial ? `<form method="post" action="/configuracao-inicial">
            <label>Nome do sistema
                <input name="nomeSistema" required value="${escapar(nomeSistema)}">
            </label>
            <label>Código de instalação
                <input name="codigoInstalacao" autocomplete="one-time-code" required placeholder="Consulte o log do servidor">
            </label>
            <label>Usuário administrador
                <input name="painelUsuario" autocomplete="username" required autofocus>
            </label>
            <label>Senha
                <input type="password" name="painelSenha" autocomplete="new-password" minlength="12" required>
            </label>
            <label>Confirmar senha
                <input type="password" name="painelConfirmarSenha" autocomplete="new-password" minlength="12" required>
            </label>
            <button type="submit">Concluir configuração</button>
        </form>
        <div class="helper">Use uma senha exclusiva com pelo menos 12 caracteres.</div>` : `<form method="post" action="/login">
            <input type="hidden" name="next" value="${escapar(next)}">
            <label>Usuário
                <input name="usuario" autocomplete="username" required autofocus value="${escapar(usuarioPainel)}">
            </label>
            <label>Senha
                <input type="password" name="senha" autocomplete="current-password" required>
            </label>
            ${process.env.PANEL_TOTP_SECRET ? `<label>Código do autenticador
                <input name="totp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
            </label>` : ''}
            <input type="hidden" name="captchaDesafio" value="${escapar(captcha.desafio)}">
            <label>Confirmação humana: ${escapar(captcha.pergunta)}
                <input name="captchaResposta" inputmode="numeric" autocomplete="off" required>
            </label>
            <button type="submit">Acessar painel</button>
        </form>
        <div class="helper">Depois do login, sua sessão fica ativa neste navegador.</div>`}
    </main>
</body>
</html>`;
}

router.get('/login', async (req, res) => {
    desativarCache(res);

    if (!(await acessoConfigurado())) {
        return res.redirect('/configuracao-inicial');
    }

    if (await obterSessao(req)) {
        return res.redirect(destinoSeguro(req.query.next));
    }

    const [config, usuarioPainel] = await Promise.all([
        obterConfiguracoes(),
        obterUsuarioConfigurado()
    ]);
    return res.send(telaLogin({
        mensagem: req.query.erro || '',
        next: destinoSeguro(req.query.next),
        config,
        usuarioPainel
    }));
});

router.post('/login', async (req, res) => {
    desativarCache(res);
    const next = destinoSeguro(req.body.next);
    const chaveLogin = chaveTentativa(req, req.body.usuario);
    const bloqueio = bloqueioAtual(req, req.body.usuario) || await loginPersistente.bloqueioAtual(chaveLogin, BLOQUEIO_LOGIN_MS);

    if (bloqueio) {
        const minutos = Math.max(1, Math.ceil((bloqueio.bloqueadoAte - Date.now()) / 60000));
        return res.redirect(`/login?erro=${encodeURIComponent(`Muitas tentativas. Aguarde ${minutos} minuto(s).`)}&next=${encodeURIComponent(next)}`);
    }

    if (!validarCaptcha(req.body.captchaDesafio, req.body.captchaResposta)) {
        registrarFalhaLogin(req, req.body.usuario);
        await loginPersistente.registrarFalha(chaveLogin, MAX_TENTATIVAS_LOGIN, BLOQUEIO_LOGIN_MS);
        await registrarEventoSistema('seguranca_login', 'alerta', 'CAPTCHA inválido no login.', mascararSegredos({ ip: req.ip || req.socket?.remoteAddress, usuario: req.body.usuario }));
        return res.redirect(`/login?erro=${encodeURIComponent('Confirmação humana inválida ou expirada.')}&next=${encodeURIComponent(next)}`);
    }

    if (!(await validarLogin(req.body.usuario, req.body.senha))) {
        registrarFalhaLogin(req, req.body.usuario);
        await loginPersistente.registrarFalha(chaveLogin, MAX_TENTATIVAS_LOGIN, BLOQUEIO_LOGIN_MS);
        await registrarEventoSistema('seguranca_login', 'alerta', 'Falha de autenticação.', mascararSegredos({ ip: req.ip || req.socket?.remoteAddress, usuario: req.body.usuario }));
        return res.redirect(`/login?erro=${encodeURIComponent('Usuário ou senha inválidos.')}&next=${encodeURIComponent(next)}`);
    }
    if (process.env.PANEL_TOTP_SECRET && !validarTotp(process.env.PANEL_TOTP_SECRET, req.body.totp)) {
        registrarFalhaLogin(req, req.body.usuario);
        await loginPersistente.registrarFalha(chaveLogin, MAX_TENTATIVAS_LOGIN, BLOQUEIO_LOGIN_MS);
        await registrarEventoSistema('seguranca_login', 'alerta', 'Segundo fator inválido no login.', mascararSegredos({ ip: req.ip || req.socket?.remoteAddress, usuario: req.body.usuario }));
        return res.redirect(`/login?erro=${encodeURIComponent('Código do autenticador inválido.')}&next=${encodeURIComponent(next)}`);
    }

    limparFalhasLogin(req, req.body.usuario);
    await loginPersistente.limpar(chaveLogin);
    const sessao = await criarSessao(String(req.body.usuario || '').trim(), req);
    await registrarEventoSistema('seguranca_login', 'info', 'Login administrativo realizado.', { ip: req.ip || req.socket?.remoteAddress, usuario: String(req.body.usuario || '').trim() });
    res.setHeader('Set-Cookie', cookieSessao(sessao.token, req));
    return res.redirect(next);
});

router.get('/configuracao-inicial', async (req, res) => {
    desativarCache(res);
    if (await acessoConfigurado()) return res.redirect('/login');

    const config = await obterConfiguracoes();
    return res.send(telaLogin({
        mensagem: req.query.erro || '',
        config,
        configuracaoInicial: true
    }));
});

router.post('/configuracao-inicial', async (req, res) => {
    desativarCache(res);
    if (await acessoConfigurado()) return res.redirect('/login');

    try {
        if (!codigoConfiguracaoValido(req.body.codigoInstalacao)) {
            throw new Error('Código de instalação inválido. Consulte o log do servidor.');
        }

        await salvarConfiguracoesPainel({
            nomeSistema: req.body.nomeSistema,
            logoUrl: ''
        });
        await salvarConfiguracoesAcesso(req.body);
        return res.redirect(`/login?erro=${encodeURIComponent('Configuração concluída. Entre com o acesso criado.')}`);
    } catch (err) {
        return res.redirect(`/configuracao-inicial?erro=${encodeURIComponent(err.message)}`);
    }
});

router.get('/logout', async (req, res, next) => {
    desativarCache(res);
    try {
        await encerrarSessao(req);
        res.setHeader('Set-Cookie', cookieLogout());
        return res.redirect('/login?erro=' + encodeURIComponent('Sessão encerrada.'));
    } catch (err) {
        return next(err);
    }
});

router.get('/sessoes', async (req, res, next) => {
    try {
        const atual = await obterSessao(req);
        if (!atual) return res.redirect('/login?next=%2Fsessoes');
        const sessoes = await listarSessoesAtivas();
        desativarCache(res);
        return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sessões ativas</title><style>
body{font-family:Arial,sans-serif;background:#f5f6f8;color:#101828;margin:0;padding:32px}.card{max-width:1050px;margin:auto;background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #e4e7ec;font-size:14px}.actions{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:20px}button,a{border:0;border-radius:8px;padding:11px 15px;font-weight:700;text-decoration:none;cursor:pointer}.danger{background:#dc2626;color:#fff}.back{background:#eef2ff;color:#3448a5}.current{color:#15803d;font-weight:700}.scroll{overflow:auto}</style></head><body><main class="card">
<div class="actions"><div><h1>Sessões administrativas</h1><p>Dispositivos autenticados nesta instalação.</p></div><a class="back" href="/manutencao">Voltar</a></div>
<form method="post" action="/sessoes/revogar-todas" onsubmit="return confirm('Encerrar todas as sessões, inclusive esta?')"><button class="danger" type="submit">Encerrar todas as sessões</button></form>
<div class="scroll"><table><thead><tr><th>Usuário</th><th>Criada</th><th>Último acesso</th><th>IP</th><th>Dispositivo</th><th></th></tr></thead><tbody>${sessoes.map(item => `<tr><td>${escapar(item.usuario)}</td><td>${escapar(item.criadoEm)}</td><td>${escapar(item.ultimoAcessoEm)}</td><td>${escapar(item.ip || '-')}</td><td>${escapar(item.userAgent || '-')}</td><td>${item.tokenHash === atual.tokenHash ? '<span class="current">Esta sessão</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
</main></body></html>`);
    } catch (err) {
        next(err);
    }
});

router.post('/sessoes/revogar-todas', async (req, res, next) => {
    try {
        if (!(await obterSessao(req))) return res.status(401).send('Acesso não autorizado');
        await revogarTodasSessoes();
        await registrarEventoSistema('seguranca_sessoes_revogadas', 'alerta', 'Todas as sessões administrativas foram encerradas.', {
            ip: req.ip || req.socket?.remoteAddress
        });
        res.setHeader('Set-Cookie', cookieLogout());
        return res.redirect('/login?erro=' + encodeURIComponent('Todas as sessões foram encerradas.'));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
