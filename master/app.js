const express = require('express');
const crypto = require('crypto');
const { verificarSenha } = require('../services/passwordService');
const {
    baseDomain,
    listarInstalacoes,
    criarInstalacao,
    suspenderInstalacao,
    tornarVitalicia,
    ativarLicencaComercial,
    prorrogarAvaliacao,
    reiniciarInstalacao,
    resetarSenhaPainel,
    obterDiagnosticoInstalacao,
    obterLogsInstalacao,
    arquivarInstalacao,
    excluirDefinitivamente
} = require('./provisionador');

const app = express();
const PORT = Number(process.env.MASTER_PORT || 9000);
const HOST = process.env.MASTER_HOST || '127.0.0.1';
const COOKIE_SESSAO = 'julian_master_session';
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;
const sessoes = new Map();

app.use(express.urlencoded({ extended: false }));
app.disable('x-powered-by');

function escapar(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function lerCookies(req) {
    return String(req.headers.cookie || '')
        .split(';')
        .map(parte => parte.trim())
        .filter(Boolean)
        .reduce((cookies, parte) => {
            const indice = parte.indexOf('=');
            if (indice > -1) cookies[parte.slice(0, indice)] = decodeURIComponent(parte.slice(indice + 1));
            return cookies;
        }, {});
}

function cookieSeguro(req) {
    return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function montarCookieSessao(token, req) {
    const partes = [
        `${COOKIE_SESSAO}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        `Max-Age=${Math.floor(DURACAO_SESSAO_MS / 1000)}`
    ];
    if (cookieSeguro(req)) partes.push('Secure');
    return partes.join('; ');
}

function montarCookieLogout() {
    return `${COOKIE_SESSAO}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function criarSessao(usuario) {
    const token = crypto.randomBytes(32).toString('hex');
    sessoes.set(token, { usuario, expiraEm: Date.now() + DURACAO_SESSAO_MS });
    return token;
}

function sessaoValida(req) {
    const token = lerCookies(req)[COOKIE_SESSAO];
    if (!token) return false;
    const sessao = sessoes.get(token);
    if (!sessao) return false;
    if (sessao.expiraEm < Date.now()) {
        sessoes.delete(token);
        return false;
    }
    sessao.expiraEm = Date.now() + DURACAO_SESSAO_MS;
    return true;
}

function destinoSeguro(destino) {
    const texto = String(destino || '/');
    if (!texto.startsWith('/') || texto.startsWith('//')) return '/';
    if (texto.startsWith('/login') || texto.startsWith('/logout')) return '/';
    return texto;
}

function paginaLogin(opcoes = {}) {
    const destino = destinoSeguro(opcoes.destino || '/');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login - Painel Mestre</title><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif;display:grid;place-items:center}.login{width:min(460px,calc(100% - 30px));background:#fff;border:1px solid #e2e6ed;border-radius:10px;box-shadow:0 20px 50px rgba(15,23,42,.12);padding:30px}.brand{font-weight:900;font-size:20px;margin-bottom:28px}h1{font-size:38px;margin:0 0 8px}.sub{color:#697386;font-size:18px;line-height:1.35;margin-bottom:24px}.erro{padding:13px;border-radius:8px;background:#ffe5e7;color:#c52e35;font-weight:800;margin-bottom:16px}label{display:grid;gap:7px;font-weight:800;margin-top:16px}input{border:1px solid #dfe3ea;border-radius:8px;padding:13px;font:inherit;font-weight:700}button{width:100%;border:0;border-radius:8px;padding:14px;margin-top:24px;background:#4368e8;color:#fff;font:inherit;font-weight:900;cursor:pointer}.small{margin-top:18px;color:#697386;font-size:14px}
    </style></head><body><form class="login" method="post" action="/login">
      <div class="brand">Painel Mestre - Julian Play</div>
      <h1>Entrar</h1>
      <div class="sub">Informe o usu&aacute;rio e a senha para acessar o painel.</div>
      ${opcoes.erro ?`<div class="erro">${escapar(opcoes.erro)}</div>` : ''}
      <input type="hidden" name="destino" value="${escapar(destino)}">
      <label>Usu&aacute;rio<input name="usuario" autocomplete="username" autofocus required></label>
      <label>Senha<input type="password" name="senha" autocomplete="current-password" required></label>
      <button type="submit">Acessar painel</button>
      <div class="small">Depois do login, sua sess&atilde;o fica ativa neste navegador.</div>
    </form></body></html>`;
}

function autenticar(req, res, next) {
    const usuarioEsperado = process.env.MASTER_USER || '';
    const hashEsperado = process.env.MASTER_PASSWORD_HASH || '';
    const cabecalho = String(req.headers.authorization || '');

    if (!usuarioEsperado || !hashEsperado) {
        return res.status(503).send('Painel Mestre sem credenciais. Execute install-master-windows.ps1.');
    }

    if (cabecalho.startsWith('Basic ')) {
        try {
            const [usuario, ...senhaPartes] = Buffer.from(cabecalho.slice(6), 'base64').toString('utf8').split(':');
            const senha = senhaPartes.join(':');
            if (usuario === usuarioEsperado && verificarSenha(senha, hashEsperado)) return next();
        } catch (_) { /* Solicita autenticação novamente. */ }
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Painel Mestre Julian Play", charset="UTF-8"');
    return res.status(401).send('Autenticação necessária.');
}

function autenticarSessao(req, res, next) {
    const usuarioEsperado = process.env.MASTER_USER || '';
    const hashEsperado = process.env.MASTER_PASSWORD_HASH || '';

    if (!usuarioEsperado || !hashEsperado) {
        return res.status(503).send('Painel Mestre sem credenciais. Execute install-master-windows.ps1.');
    }

    if (sessaoValida(req)) return next();

    return res.redirect(`/login?destino=${encodeURIComponent(req.originalUrl || '/')}`);
}

function statusClasse(status) {
    if (status === 'ativo') return 'ok';
    if (status === 'suspenso' || status === 'erro') return 'error';
    return 'warn';
}

function formatarTempoOnline(segundos) {
    const total = Math.max(0, Math.floor(Number(segundos || 0)));
    if (!total) return 'não informado';
    const dias = Math.floor(total / 86400);
    const horas = Math.floor((total % 86400) / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    if (dias) return `${dias}d ${horas}h`;
    if (horas) return `${horas}h ${minutos}min`;
    return `${Math.max(1, minutos)}min`;
}

function resumoDiagnostico(item) {
    const saude = item.saude || {};
    const numeroEsperado = String(item.whatsappEsperado || '').replace(/\D/g, '');
    const numeroConectado = String(saude.numero || '').replace(/\D/g, '');
    const processoOnline = Boolean(saude.online);
    const whatsappOnline = Boolean(saude.whatsapp);
    const numeroDivergente = whatsappOnline && numeroEsperado && numeroConectado && numeroEsperado !== numeroConectado;
    const classe = processoOnline ? (whatsappOnline ? (numeroDivergente ? 'error' : 'ok') : 'warn') : 'error';
    const rotulo = processoOnline ? (whatsappOnline ? (numeroDivergente ? 'WhatsApp divergente' : 'WhatsApp conectado') : 'Aguardando WhatsApp') : 'Processo indisponível';
    const detalhes = [
        `porta ${item.porta}`,
        item.processoPm2,
        numeroEsperado ? `esperado ${numeroEsperado}` : 'WhatsApp esperado não informado',
        numeroConectado ? `conectado ${numeroConectado}` : 'sem número conectado',
        processoOnline ? `online ${formatarTempoOnline(saude.uptime)}` : (saude.erro || 'sem resposta')
    ];

    return `
        <span class="badge ${classe}">${escapar(rotulo)}</span>
        <div class="diagnostic">
            ${detalhes.map(detalhe => `<span>${escapar(detalhe)}</span>`).join('')}
        </div>
        ${numeroDivergente ? '<div class="small dangertext">O número conectado não é o WhatsApp cadastrado para esta instalação.</div>' : ''}
    `;
}

function paginaSaude(instalacao, saude) {
    const classe = saude.online ? (saude.whatsapp ? 'ok' : 'warn') : 'error';
    const rotulo = saude.online ? (saude.whatsapp ? 'WhatsApp conectado' : 'Aguardando WhatsApp') : 'Processo indisponível';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saúde - ${escapar(instalacao.nome)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(960px,calc(100% - 30px));margin:34px auto}.button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none}h1{margin:18px 0 6px}.sub{color:#697386;margin-bottom:18px}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);padding:22px}.badge{display:inline-flex;padding:6px 11px;border-radius:999px;font-weight:800}.ok{background:#dff8ee;color:#047446}.warn{background:#fff2dc;color:#a76100}.error{background:#ffe5e7;color:#c52e35}.row{display:grid;grid-template-columns:220px 1fr;border-top:1px solid #e8ebf0;padding:12px 0}.row:first-of-type{border-top:0}.label{font-weight:800;color:#697386}
    </style></head><body><main><a class="button" href="/">Voltar</a><h1>Saúde de ${escapar(instalacao.nome)}</h1><div class="sub">${escapar(instalacao.processoPm2)} · porta ${escapar(instalacao.porta)}</div><section class="panel">
        <p><span class="badge ${classe}">${escapar(rotulo)}</span></p>
        <div class="row"><div class="label">WhatsApp esperado</div><div>${escapar(instalacao.whatsappEsperado || 'Não informado')}</div></div>
        <div class="row"><div class="label">WhatsApp conectado</div><div>${escapar(saude.numero || 'Não conectado')}</div></div>
        <div class="row"><div class="label">Status interno</div><div>${escapar(saude.whatsappStatus || saude.estado || 'Não informado')}</div></div>
        <div class="row"><div class="label">Tempo online</div><div>${escapar(formatarTempoOnline(saude.uptime))}</div></div>
        <div class="row"><div class="label">Última checagem</div><div>${escapar(saude.timestamp || new Date().toISOString())}</div></div>
        ${saude.erro ?`<div class="row"><div class="label">Detalhe</div><div>${escapar(saude.erro)}</div></div>` : ''}
    </section></main></body></html>`;
}

function pagina(instalacoes, opcoes = {}) {
    const criado = opcoes.criado;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel Mestre - Julian Play</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1480px,calc(100% - 30px));margin:34px auto}h1,h2{margin:0 0 8px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.topbar form{margin:0}.sub{color:#697386}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);margin-top:22px;padding:22px}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:700}input,select{border:1px solid #dfe3ea;border-radius:8px;padding:11px;font:inherit}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.button.smallbtn,button.smallbtn{padding:7px 10px;font-size:13px}.secondary{background:#eef1f5;color:#263247}.danger{background:#dc3545}.warning{background:#e98a13}.actions{display:flex;gap:7px;flex-wrap:wrap}.support-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.full{grid-column:1/-1}.notice{padding:14px;border-radius:8px;margin-top:18px;background:#dff8ee;color:#047446;font-weight:700}.errorbox{background:#ffe5e7;color:#c52e35}.credentials{background:#fff8dd;border:1px solid #f2d56b;padding:16px;border-radius:8px;margin-top:18px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:12px 9px;border-bottom:1px solid #e8ebf0;text-align:left;vertical-align:top}th{font-size:12px;color:#697386;text-transform:uppercase}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.badge.ok{background:#dff8ee;color:#047446}.badge.warn{background:#fff2dc;color:#a76100}.badge.error{background:#ffe5e7;color:#c52e35}.small{font-size:12px;color:#697386;margin-top:4px}.dangertext{color:#c52e35;font-weight:700}.diagnostic{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;max-width:390px}.diagnostic span{background:#f4f6f9;border:1px solid #e8ebf0;border-radius:999px;color:#4b5565;font-size:12px;padding:4px 8px}.inline{display:inline}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:900px){.topbar{display:block}.fields{grid-template-columns:1fr}.table-wrap{overflow:auto}table{min-width:1200px}}
    </style></head><body><main>
    <h1>Painel Mestre</h1><div class="sub">Instalações comerciais isoladas em ${escapar(baseDomain)}</div>
    <form method="post" action="/logout" style="margin-top:12px"><button class="secondary" type="submit">Sair</button></form>
    ${opcoes.mensagem ?`<div class="notice">${escapar(opcoes.mensagem)}</div>` : ''}
    ${opcoes.erro ?`<div class="notice errorbox">${escapar(opcoes.erro)}</div>` : ''}
    ${criado ?`<div class="credentials"><strong>Instalação criada.</strong><br>URL: <a href="https://${escapar(criado.dominio)}" target="_blank">https://${escapar(criado.dominio)}</a><br>Usuário: ${escapar(criado.usuarioPainel)}<br>Senha inicial: <strong>${escapar(criado.senhaInicial)}</strong><div class="small">Anote agora. A senha não fica armazenada no Painel Mestre.</div></div>` : ''}
    <section class="panel"><h2>Nova instalação</h2><div class="sub">Crie um painel, banco e robô independentes</div>
      <form class="fields" method="post" action="/instalacoes">
        <label>Cliente / Empresa<input name="nome" required></label>
        <label>Identificador da URL<input name="slug" placeholder="ex: cliente-teste"></label>
        <label>Licença<select name="tipoLicenca"><option value="avaliacao_15">Avaliação de 15 dias</option><option value="avaliacao_30">Avaliação de 30 dias</option><option value="vitalicia">Definitiva / vitalícia</option></select></label>
        <label>Perfil da instalação<select name="perfilLicenca"><option value="cliente">Cliente normal</option><option value="admin">Administrador / fornecedor</option></select></label>
        <label>WhatsApp do robô<input name="whatsappEsperado" inputmode="numeric" placeholder="Ex.: 5512999999999" required></label>
        <label>Hora dos avisos<input type="number" name="horaEnvio" value="9" min="0" max="23" required></label>
        <label>Minuto dos avisos<input type="number" name="minutoEnvio" value="0" min="0" max="59" required></label>
        <label>Usuário do painel<input name="usuarioPainel" value="admin" required></label>
        <label>Senha inicial<input type="password" name="senhaPainel" minlength="8" required></label>
        <div style="align-self:end"><button type="submit">Criar instalação</button></div>
      </form>
    </section>
    <section class="panel"><h2>Instalações</h2><div class="sub">${instalacoes.length} instalação(ões) cadastrada(s)</div><div class="table-wrap">
      ${instalacoes.length ?`<table><thead><tr><th>Cliente</th><th>URL</th><th>Robô</th><th>Licença</th><th>Status</th><th>Ações</th></tr></thead><tbody>${instalacoes.map(item => `<tr>
        <td><strong>${escapar(item.nome)}</strong><div class="small">${escapar(item.whatsappEsperado || 'WhatsApp não informado')} · avisos ${String(item.horaEnvio ?? 9).padStart(2, '0')}:${String(item.minutoEnvio ?? 0).padStart(2, '0')}</div></td>
        <td><a href="https://${escapar(item.dominio)}" target="_blank">${escapar(item.dominio)}</a><div class="small">${escapar(item.pastaDados)}</div></td>
        <td>${resumoDiagnostico(item)}</td><td>${escapar(item.estadoLicenca?.rotulo || item.tipoLicenca)}${item.estadoLicenca?.vencimento ?`<div class="small">até ${escapar(item.estadoLicenca.vencimento.split('-').reverse().join('/'))}</div>` : item.diasAvaliacao ?` (${item.diasAvaliacao} dias)` : ''}</td>
        <td><span class="badge ${item.estadoLicenca && !item.estadoLicenca.permitida ?'error' : statusClasse(item.status)}">${escapar(item.estadoLicenca && !item.estadoLicenca.permitida ?item.estadoLicenca.rotulo : item.status)}</span>${item.detalheStatus ?`<div class="small">${escapar(item.detalheStatus)}</div>` : ''}</td>
        <td><div class="support-actions">
          <a class="button smallbtn secondary" href="https://${escapar(item.dominio)}/qr" target="_blank">QR Code</a>
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/saude">Saúde</a>
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/logs">Logs</a>
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/reiniciar" onsubmit="return confirm('Reiniciar o robô desta instalação?');"><button class="smallbtn" type="submit">Reiniciar robô</button></form>` : ''}
        </div><div class="actions">
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/resetar-senha" onsubmit="return confirm('Redefinir a senha do painel deste cliente?');"><input name="senhaPainel" type="password" minlength="8" placeholder="Nova senha" required style="width:150px;padding:9px"><button class="secondary" type="submit">Resetar senha</button></form>` : ''}
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/licenca" onsubmit="return confirm('Ativar esta licença comercial para o cliente?');"><select name="tipoLicenca" aria-label="Tipo de licença comercial"><option value="mensal">Mensal</option><option value="semestral">Semestral</option><option value="anual">Anual</option><option value="vitalicia">Vitalícia</option></select><button type="submit">Ativar licença</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/prorrogar"><select name="dias" aria-label="Dias de prorrogação"><option value="15">15 dias</option><option value="30">30 dias</option></select><button class="secondary" type="submit">Prorrogar teste</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/suspender"><button class="warning" type="submit">Suspender</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/arquivar" onsubmit="return confirm('Arquivar esta instalação e parar o robô?');"><button class="secondary" type="submit">Arquivar</button></form>` : `<form class="inline" method="post" action="/instalacoes/${item.id}/excluir" onsubmit="return confirm('EXCLUSÒO DEFINITIVA: apagar banco, sessão e todos os clientes desta instalação?');"><button class="danger" type="submit">Excluir definitivamente</button></form>`}
        </div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma instalação criada.</div>'}
    </div></section></main></body></html>`;
}

function paginaLogs(instalacao, logs) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logs - ${escapar(instalacao.nome)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1200px,calc(100% - 30px));margin:34px auto}.button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none}h1{margin:18px 0 6px}.sub{color:#697386;margin-bottom:18px}pre{white-space:pre-wrap;background:#081225;color:#dfe7ff;border-radius:8px;padding:16px;line-height:1.45;max-height:76vh;overflow:auto}
    </style></head><body><main><a class="button" href="/">Voltar</a><h1>Logs de ${escapar(instalacao.nome)}</h1><div class="sub">${escapar(instalacao.processoPm2)} · porta ${escapar(instalacao.porta)}</div><pre>${escapar(logs || 'Nenhum log encontrado.')}</pre></main></body></html>`;
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'julian-master' }));

app.get('/login', (req, res) => {
    if (sessaoValida(req)) return res.redirect(destinoSeguro(req.query.destino || '/'));
    return res.send(paginaLogin({ destino: req.query.destino, erro: req.query.erro }));
});

app.post('/login', (req, res) => {
    const usuarioEsperado = process.env.MASTER_USER || '';
    const hashEsperado = process.env.MASTER_PASSWORD_HASH || '';
    const usuario = String(req.body.usuario || '').trim();
    const senha = String(req.body.senha || '');

    if (!usuarioEsperado || !hashEsperado) {
        return res.status(503).send('Painel Mestre sem credenciais. Execute install-master-windows.ps1.');
    }

    if (usuario === usuarioEsperado && verificarSenha(senha, hashEsperado)) {
        const token = criarSessao(usuario);
        res.setHeader('Set-Cookie', montarCookieSessao(token, req));
        return res.redirect(destinoSeguro(req.body.destino || '/'));
    }

    return res.status(401).send(paginaLogin({
        destino: req.body.destino,
        erro: 'Usuario ou senha invalidos.'
    }));
});

app.post('/logout', (req, res) => {
    const token = lerCookies(req)[COOKIE_SESSAO];
    if (token) sessoes.delete(token);
    res.setHeader('Set-Cookie', montarCookieLogout());
    res.redirect('/login');
});

app.use(autenticarSessao);

app.get('/', async (req, res) => {
    res.send(pagina(await listarInstalacoes(), { mensagem: req.query.mensagem, erro: req.query.erro }));
});

app.post('/instalacoes', async (req, res) => {
    try {
        const criado = await criarInstalacao(req.body);
        res.send(pagina(await listarInstalacoes(), { criado }));
    } catch (err) {
        res.status(400).send(pagina(await listarInstalacoes(), { erro: err.detalhes || err.message }));
    }
});

function acao(servico, mensagem) {
    return async (req, res) => {
        try {
            await servico(req.params.id);
            res.redirect(`/?mensagem=${encodeURIComponent(mensagem)}`);
        } catch (err) {
            res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
        }
    };
}

app.post('/instalacoes/:id/suspender', acao(suspenderInstalacao, 'Instalação suspensa.'));
app.post('/instalacoes/:id/vitalicia', acao(tornarVitalicia, 'Instalação convertida em definitiva.'));
app.post('/instalacoes/:id/licenca', async (req, res) => {
    try {
        const licenca = await ativarLicencaComercial(req.params.id, req.body.tipoLicenca);
        const detalhe = licenca.vencimento
            ?`${licenca.rotulo} ativada até ${licenca.vencimento.split('-').reverse().join('/')}.`
            : `${licenca.rotulo} ativada.`;
        res.redirect(`/?mensagem=${encodeURIComponent(detalhe)}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
app.post('/instalacoes/:id/reiniciar', acao(reiniciarInstalacao, 'Robô reiniciado.'));
app.post('/instalacoes/:id/resetar-senha', async (req, res) => {
    try {
        await resetarSenhaPainel(req.params.id, req.body.senhaPainel);
        res.redirect(`/?mensagem=${encodeURIComponent('Senha do painel redefinida.')}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
app.get('/instalacoes/:id/logs', async (req, res) => {
    try {
        const resultado = await obterLogsInstalacao(req.params.id, req.query.linhas);
        res.send(paginaLogs(resultado.instalacao, resultado.logs));
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
app.get('/instalacoes/:id/saude', async (req, res) => {
    try {
        const resultado = await obterDiagnosticoInstalacao(req.params.id);
        res.send(paginaSaude(resultado.instalacao, resultado.saude));
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
app.post('/instalacoes/:id/prorrogar', async (req, res) => {
    try {
        const vencimento = await prorrogarAvaliacao(req.params.id, req.body.dias);
        res.redirect(`/?mensagem=${encodeURIComponent(`Avaliação prorrogada até ${vencimento.split('-').reverse().join('/')}.`)}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
app.post('/instalacoes/:id/arquivar', acao(arquivarInstalacao, 'Instalação arquivada.'));
app.post('/instalacoes/:id/excluir', acao(excluirDefinitivamente, 'Instalação excluída definitivamente.'));

app.listen(PORT, HOST, () => console.log(`Painel Mestre em http://${HOST}:${PORT}`));
