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
    obterUsuarioConfigurado
} = require('../services/authService');
const {
    obterConfiguracoes,
    salvarConfiguracoesAcesso,
    salvarConfiguracoesPainel
} = require('../services/configuracoesPainel');
const { criarCaptcha, validarCaptcha, mascararSegredos } = require('../services/securityService');
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
                <input type="password" name="painelSenha" autocomplete="new-password" minlength="8" required>
            </label>
            <label>Confirmar senha
                <input type="password" name="painelConfirmarSenha" autocomplete="new-password" minlength="8" required>
            </label>
            <button type="submit">Concluir configuração</button>
        </form>
        <div class="helper">Use uma senha exclusiva com pelo menos 8 caracteres.</div>` : `<form method="post" action="/login">
            <input type="hidden" name="next" value="${escapar(next)}">
            <label>Usuário
                <input name="usuario" autocomplete="username" required autofocus value="${escapar(usuarioPainel)}">
            </label>
            <label>Senha
                <input type="password" name="senha" autocomplete="current-password" required>
            </label>
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

    if (obterSessao(req)) {
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

    limparFalhasLogin(req, req.body.usuario);
    await loginPersistente.limpar(chaveLogin);
    const sessao = criarSessao(String(req.body.usuario || '').trim());
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

router.get('/logout', (req, res) => {
    desativarCache(res);
    encerrarSessao(req);
    res.setHeader('Set-Cookie', cookieLogout());
    res.redirect('/login?erro=' + encodeURIComponent('Sessão encerrada.'));
});

module.exports = router;
