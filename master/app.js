const express = require('express');
const { verificarSenha } = require('../services/passwordService');
const {
    baseDomain,
    listarInstalacoes,
    criarInstalacao,
    suspenderInstalacao,
    tornarVitalicia,
    arquivarInstalacao,
    excluirDefinitivamente
} = require('./provisionador');

const app = express();
const PORT = Number(process.env.MASTER_PORT || 9000);
const HOST = process.env.MASTER_HOST || '127.0.0.1';

app.use(express.urlencoded({ extended: false }));
app.disable('x-powered-by');

function escapar(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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

function statusClasse(status) {
    if (status === 'ativo') return 'ok';
    if (status === 'suspenso' || status === 'erro') return 'error';
    return 'warn';
}

function pagina(instalacoes, opcoes = {}) {
    const criado = opcoes.criado;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel Mestre - Julian Play</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1480px,calc(100% - 30px));margin:34px auto}h1,h2{margin:0 0 8px}.sub{color:#697386}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);margin-top:22px;padding:22px}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:700}input,select{border:1px solid #dfe3ea;border-radius:8px;padding:11px;font:inherit}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.secondary{background:#eef1f5;color:#263247}.danger{background:#dc3545}.warning{background:#e98a13}.actions{display:flex;gap:7px;flex-wrap:wrap}.full{grid-column:1/-1}.notice{padding:14px;border-radius:8px;margin-top:18px;background:#dff8ee;color:#047446;font-weight:700}.errorbox{background:#ffe5e7;color:#c52e35}.credentials{background:#fff8dd;border:1px solid #f2d56b;padding:16px;border-radius:8px;margin-top:18px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:12px 9px;border-bottom:1px solid #e8ebf0;text-align:left;vertical-align:top}th{font-size:12px;color:#697386;text-transform:uppercase}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.badge.ok{background:#dff8ee;color:#047446}.badge.warn{background:#fff2dc;color:#a76100}.badge.error{background:#ffe5e7;color:#c52e35}.small{font-size:12px;color:#697386;margin-top:4px}.inline{display:inline}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:900px){.fields{grid-template-columns:1fr}.table-wrap{overflow:auto}table{min-width:1050px}}
    </style></head><body><main>
    <h1>Painel Mestre</h1><div class="sub">Instalações comerciais isoladas em ${escapar(baseDomain)}</div>
    ${opcoes.mensagem ? `<div class="notice">${escapar(opcoes.mensagem)}</div>` : ''}
    ${opcoes.erro ? `<div class="notice errorbox">${escapar(opcoes.erro)}</div>` : ''}
    ${criado ? `<div class="credentials"><strong>Instalação criada.</strong><br>URL: <a href="https://${escapar(criado.dominio)}" target="_blank">https://${escapar(criado.dominio)}</a><br>Usuário: ${escapar(criado.usuarioPainel)}<br>Senha inicial: <strong>${escapar(criado.senhaInicial)}</strong><div class="small">Anote agora. A senha não fica armazenada no Painel Mestre.</div></div>` : ''}
    <section class="panel"><h2>Nova instalação</h2><div class="sub">Crie um painel, banco e robô independentes</div>
      <form class="fields" method="post" action="/instalacoes">
        <label>Cliente / Empresa<input name="nome" required></label>
        <label>Identificador da URL<input name="slug" placeholder="ex: cliente-teste"></label>
        <label>Licença<select name="tipoLicenca"><option value="avaliacao_15">Avaliação de 15 dias</option><option value="avaliacao_30">Avaliação de 30 dias</option><option value="vitalicia">Definitiva / vitalícia</option></select></label>
        <label>WhatsApp do robô<input name="whatsappEsperado" inputmode="numeric" placeholder="Ex.: 5512999999999" required></label>
        <label>Hora dos avisos<input type="number" name="horaEnvio" value="9" min="0" max="23" required></label>
        <label>Minuto dos avisos<input type="number" name="minutoEnvio" value="0" min="0" max="59" required></label>
        <label>Usuário do painel<input name="usuarioPainel" value="admin" required></label>
        <label>Senha inicial<input type="password" name="senhaPainel" minlength="8" required></label>
        <div style="align-self:end"><button type="submit">Criar instalação</button></div>
      </form>
    </section>
    <section class="panel"><h2>Instalações</h2><div class="sub">${instalacoes.length} instalação(ões) cadastrada(s)</div><div class="table-wrap">
      ${instalacoes.length ? `<table><thead><tr><th>Cliente</th><th>URL</th><th>Robô</th><th>Licença</th><th>Status</th><th>Ações</th></tr></thead><tbody>${instalacoes.map(item => `<tr>
        <td><strong>${escapar(item.nome)}</strong><div class="small">${escapar(item.whatsappEsperado || 'WhatsApp não informado')} · avisos ${String(item.horaEnvio ?? 9).padStart(2, '0')}:${String(item.minutoEnvio ?? 0).padStart(2, '0')}</div></td>
        <td><a href="https://${escapar(item.dominio)}" target="_blank">${escapar(item.dominio)}</a><div class="small">${escapar(item.pastaDados)}</div></td>
        <td><span class="badge ${item.saude?.online ? (item.saude.whatsapp ? (item.saude.numero === item.whatsappEsperado ? 'ok' : 'error') : 'warn') : 'error'}">${item.saude?.online ? (item.saude.whatsapp ? (item.saude.numero === item.whatsappEsperado ? 'WhatsApp conectado' : 'WhatsApp divergente') : 'Aguardando WhatsApp') : 'Processo indisponível'}</span><div class="small">${item.saude?.numero ? `conectado: ${escapar(item.saude.numero)} · ` : ''}porta ${escapar(item.porta)} · ${escapar(item.processoPm2)}</div></td><td>${escapar(item.estadoLicenca?.rotulo || item.tipoLicenca)}${item.estadoLicenca?.vencimento ? `<div class="small">até ${escapar(item.estadoLicenca.vencimento.split('-').reverse().join('/'))}</div>` : item.diasAvaliacao ? ` (${item.diasAvaliacao} dias)` : ''}</td>
        <td><span class="badge ${item.estadoLicenca && !item.estadoLicenca.permitida ? 'error' : statusClasse(item.status)}">${escapar(item.estadoLicenca && !item.estadoLicenca.permitida ? item.estadoLicenca.rotulo : item.status)}</span>${item.detalheStatus ? `<div class="small">${escapar(item.detalheStatus)}</div>` : ''}</td>
        <td><div class="actions">
          ${item.status !== 'arquivado' ? `<form class="inline" method="post" action="/instalacoes/${item.id}/vitalicia"><button type="submit">Tornar definitiva</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/suspender"><button class="warning" type="submit">Suspender</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/arquivar" onsubmit="return confirm('Arquivar esta instalação e parar o robô?');"><button class="secondary" type="submit">Arquivar</button></form>` : `<form class="inline" method="post" action="/instalacoes/${item.id}/excluir" onsubmit="return confirm('EXCLUSÃO DEFINITIVA: apagar banco, sessão e todos os clientes desta instalação?');"><button class="danger" type="submit">Excluir definitivamente</button></form>`}
        </div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma instalação criada.</div>'}
    </div></section></main></body></html>`;
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'julian-master' }));
app.use(autenticar);

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
app.post('/instalacoes/:id/arquivar', acao(arquivarInstalacao, 'Instalação arquivada.'));
app.post('/instalacoes/:id/excluir', acao(excluirDefinitivamente, 'Instalação excluída definitivamente.'));

app.listen(PORT, HOST, () => console.log(`Painel Mestre em http://${HOST}:${PORT}`));
