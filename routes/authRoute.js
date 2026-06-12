const express = require('express');
const {
    validarLogin,
    criarSessao,
    obterSessao,
    cookieSessao,
    cookieLogout,
    encerrarSessao,
    obterUsuarioConfigurado
} = require('../services/authService');
const { obterConfiguracoes } = require('../services/configuracoesPainel');

const router = express.Router();

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

function telaLogin({ mensagem = '', next = '/clientes', config = {}, usuarioPainel = 'admin' }) {
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
    <title>Login - ${escapar(nomeSistema)}</title>
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
        <h1>Entrar</h1>
        <p class="subtitle">Informe o usuário e senha para acessar o painel.</p>
        ${mensagem ? `<div class="notice">${escapar(mensagem)}</div>` : ''}
        <form method="post" action="/login">
            <input type="hidden" name="next" value="${escapar(next)}">
            <label>Usuário
                <input name="usuario" autocomplete="username" required autofocus value="${escapar(usuarioPainel)}">
            </label>
            <label>Senha
                <input type="password" name="senha" autocomplete="current-password" required>
            </label>
            <button type="submit">Acessar painel</button>
        </form>
        <div class="helper">Depois do login, sua sessão fica ativa neste navegador.</div>
    </main>
</body>
</html>`;
}

router.get('/login', async (req, res) => {
    desativarCache(res);

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

    if (!(await validarLogin(req.body.usuario, req.body.senha))) {
        return res.redirect(`/login?erro=${encodeURIComponent('Usuário ou senha inválidos.')}&next=${encodeURIComponent(next)}`);
    }

    const sessao = criarSessao(String(req.body.usuario || '').trim());
    res.setHeader('Set-Cookie', cookieSessao(sessao.token));
    return res.redirect(next);
});

router.get('/logout', (req, res) => {
    desativarCache(res);
    encerrarSessao(req);
    res.setHeader('Set-Cookie', cookieLogout());
    res.redirect('/login?erro=' + encodeURIComponent('Sessão encerrada.'));
});

module.exports = router;
