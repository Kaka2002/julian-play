const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const packageInfo = require('../package.json');
const { verificarSenha } = require('../services/passwordService');
const {
    baseDomain,
    obterSugestaoInstalacaoAdministradoraAtual,
    listarInstalacoes,
    listarEventosInstalacao,
    buscarInstalacao,
    vincularInstalacaoAdministradoraAtual,
    criarInstalacao,
    suspenderInstalacao,
    tornarVitalicia,
    ativarLicencaComercial,
    prorrogarAvaliacao,
    reiniciarInstalacao,
    pararInstalacao,
    iniciarInstalacao,
    trocarWhatsappInstalacao,
    atualizarObservacaoOperacional,
    obterRecursosServidor,
    limparServidorSeguro,
    resetarSenhaPainel,
    gerarBackupInstalacao,
    liberarAtendimentoInstalacao,
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
const LIMITE_RECONEXAO_WHATSAPP_SEGUNDOS = 5 * 60;
const MENSAGEM_RECONEXAO_WHATSAPP = 'O rob\u00f4 n\u00e3o reconectou ao WhatsApp. Fa\u00e7a a reconex\u00e3o para retornar ao funcionamento normal.';
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

function normalizarTelefone(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function formatarBytes(bytes) {
    const total = Math.max(0, Number(bytes || 0));
    if (total >= 1024 ** 3) return `${(total / 1024 ** 3).toFixed(2)} GB`;
    if (total >= 1024 ** 2) return `${(total / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.round(total / 1024)} KB`;
}

function possuiArquivoPm2Instalacao(item = {}) {
    if (!item.pastaDados) return false;
    return fs.existsSync(path.join(item.pastaDados, 'ecosystem.config.cjs'))
        || fs.existsSync(path.join(item.pastaDados, 'ecosystem.config.js'));
}

function formatarDataHoraPainel(valor) {
    if (!valor) return '-';
    const data = new Date(String(valor).replace(' ', 'T'));
    if (Number.isNaN(data.getTime())) return String(valor);

    return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function eventosRecentesHtml(item = {}) {
    const eventos = Array.isArray(item.eventosRecentes) ? item.eventosRecentes : [];
    if (!eventos.length) return '<div class="small">Sem eventos recentes.</div>';

    return `<div class="event-list">
        ${eventos.map(evento => `<div><strong>${escapar(formatarDataHoraPainel(evento.criadoEm))}</strong> ${escapar(evento.mensagem)}</div>`).join('')}
    </div>`;
}

function precisaAvisoReconexaoWhatsapp(item) {
    const saude = item.saude || {};
    return item.status !== 'arquivado'
        && Boolean(saude.online)
        && !saude.whatsapp
        && Number(saude.uptime || 0) >= LIMITE_RECONEXAO_WHATSAPP_SEGUNDOS;
}

function linkAvisoReconexaoWhatsapp(item) {
    const telefone = normalizarTelefone(item.whatsappEsperado);
    if (telefone.length < 10) return '';
    return `https://wa.me/${telefone}?text=${encodeURIComponent(MENSAGEM_RECONEXAO_WHATSAPP)}`;
}

function botaoAvisoReconexaoWhatsapp(item, classe = 'smallbtn secondary') {
    if (!precisaAvisoReconexaoWhatsapp(item)) return '';
    const link = linkAvisoReconexaoWhatsapp(item);
    if (!link) {
        return '<div class="small dangertext">WhatsApp n&atilde;o informado para avisar o cliente.</div>';
    }
    return `<a class="button ${classe}" href="${escapar(link)}" target="_blank" rel="noopener">Avisar cliente</a>`;
}

function resumoDiagnostico(item) {
    const saude = item.saude || {};
    const numeroEsperado = normalizarTelefone(item.whatsappEsperado);
    const numeroConectado = normalizarTelefone(saude.numero);
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
        ${item.observacaoOperacional ?`<div class="small"><strong>Obs. operacional:</strong> ${escapar(item.observacaoOperacional)}</div>` : ''}
        ${precisaAvisoReconexaoWhatsapp(item) ? '<div class="small dangertext">WhatsApp sem reconectar há mais de 5 minutos. Avise o cliente para refazer a conexão.</div>' : ''}
    `;
}

function avaliarProntidaoComercial(item) {
    const pendencias = [];
    const config = item.configuracoesTenant || {};
    const resumo = item.resumoComercial || {};
    const numeroEsperado = normalizarTelefone(item.whatsappEsperado);
    const numeroConectado = normalizarTelefone(item.saude?.numero);

    if (item.status === 'arquivado') pendencias.push('Instalação arquivada');
    else if (item.status === 'suspenso') pendencias.push('Instalação suspensa');
    else if (item.status !== 'ativo') pendencias.push('Status da instalação precisa ser revisado');
    if (!item.bancoEncontrado) pendencias.push('Banco de dados não encontrado');
    if (!item.saude?.online) pendencias.push('Processo do sistema está off-line');
    if (!item.saude?.whatsapp) pendencias.push('WhatsApp não está conectado');
    if (numeroEsperado && numeroConectado && numeroEsperado !== numeroConectado) pendencias.push('WhatsApp conectado é diferente do cadastrado');
    if (!numeroEsperado) pendencias.push('WhatsApp do robô não informado');
    if (item.estadoLicenca && !item.estadoLicenca.permitida) pendencias.push('Licença vencida ou bloqueada');
    if (!String(item.usuarioPainel || '').trim() || !possuiArquivoPm2Instalacao(item)) pendencias.push('Acesso administrativo incompleto');
    if (!String(config.nomeEmpresaRobo || '').trim()) pendencias.push('Nome da empresa do robô não configurado');
    if (!String(config.imagemRoboMenu || '').trim()) pendencias.push('Imagem principal do robô não cadastrada');
    if (!String(config.pixChave || '').trim() || !String(config.pixNome || '').trim() || !String(config.pixCidade || '').trim()) pendencias.push('PIX de recebimento incompleto');
    if (Number(resumo.planosComValor || 0) < 1) pendencias.push('Nenhum plano ativo com valor');
    if (Number(resumo.paineisAtivos || 0) < 1) pendencias.push('Nenhum painel ativo cadastrado');

    return { pronta: pendencias.length === 0, pendencias };
}

function resumoProntidaoComercial(item) {
    const auditoria = avaliarProntidaoComercial(item);
    if (auditoria.pronta) {
        return `<span class="badge ok">Pronta para venda</span><div class="small">Configuração comercial completa</div>
            <a class="readiness-action" href="/?mensagem=${encodeURIComponent(`Prontidão de ${item.nome} revalidada.`)}#instalacao-${item.id}">Revalidar</a>`;
    }
    return `<span class="badge warn">${auditoria.pendencias.length} pendência(s)</span>
        <ul class="readiness-list">${auditoria.pendencias.map(pendencia => `<li><span>${escapar(pendencia)}</span>${acaoCorrecaoPendencia(item, pendencia)}</li>`).join('')}</ul>
        <a class="readiness-action" href="/?mensagem=${encodeURIComponent(`Prontidão de ${item.nome} revalidada.`)}#instalacao-${item.id}">Revalidar prontidão</a>`;
}

function acaoCorrecaoPendencia(item, pendencia) {
    const dominio = `https://${escapar(item.dominio)}`;
    if (pendencia.includes('WhatsApp não está conectado')) return `<a href="${dominio}/qr" target="_blank">Abrir QR Code</a>`;
    if (pendencia.includes('WhatsApp conectado é diferente')) return `<a href="#acoes-${item.id}">Trocar número</a>`;
    if (pendencia.includes('WhatsApp do robô não informado')) return `<a href="#acoes-${item.id}">Informar número</a>`;
    if (pendencia.includes('PIX') || pendencia.includes('Nome da empresa') || pendencia.includes('Imagem principal')) return `<a href="${dominio}/manutencao" target="_blank">Configurar</a>`;
    if (pendencia.includes('plano ativo')) return `<a href="${dominio}/planos" target="_blank">Cadastrar planos</a>`;
    if (pendencia.includes('painel ativo')) return `<a href="${dominio}/paineis" target="_blank">Cadastrar painéis</a>`;
    if (pendencia.includes('Licença')) return `<a href="#acoes-${item.id}">Regularizar licença</a>`;
    if (pendencia.includes('Acesso administrativo')) return `<a href="#resetar-senha-${item.id}">Resetar senha</a>`;
    if (pendencia.includes('Processo') || pendencia.includes('Banco de dados')) return `<a href="/instalacoes/${item.id}/saude">Abrir diagnóstico</a>`;
    if (pendencia.includes('suspensa') || pendencia.includes('Status da instalação')) return `<a href="#acoes-${item.id}">Revisar status</a>`;
    return '';
}

function calcularStatusGeral(instalacoes = []) {
    const ativos = instalacoes.filter(item => item.status !== 'arquivado');
    const whatsappConectado = ativos.filter(item => Boolean(item.saude?.whatsapp));
    const aguardandoWhatsapp = ativos.filter(item => Boolean(item.saude?.online) && !item.saude?.whatsapp);
    const reconexaoPendente = aguardandoWhatsapp.filter(precisaAvisoReconexaoWhatsapp);
    const processosIndisponiveis = ativos.filter(item => !item.saude?.online);
    const emAvaliacao = ativos.filter(item => String(item.tipoLicenca || '').startsWith('avaliacao'));
    const licencasVencidas = ativos.filter(item => item.estadoLicenca && !item.estadoLicenca.permitida);
    const suspensas = ativos.filter(item => item.status === 'suspenso');
    const prontasParaVenda = ativos.filter(item => avaliarProntidaoComercial(item).pronta);
    const comObservacao = instalacoes.filter(item => String(item.observacaoOperacional || '').trim());
    const comAtencao = new Set([
        ...aguardandoWhatsapp.map(item => item.id),
        ...processosIndisponiveis.map(item => item.id),
        ...licencasVencidas.map(item => item.id),
        ...suspensas.map(item => item.id)
    ]);

    return {
        total: instalacoes.length,
        ativas: ativos.length,
        arquivadas: instalacoes.length - ativos.length,
        whatsappConectado: whatsappConectado.length,
        aguardandoWhatsapp: aguardandoWhatsapp.length,
        reconexaoPendente: reconexaoPendente.length,
        processosIndisponiveis: processosIndisponiveis.length,
        emAvaliacao: emAvaliacao.length,
        licencasVencidas: licencasVencidas.length,
        suspensas: suspensas.length,
        prontasParaVenda: prontasParaVenda.length,
        comObservacao: comObservacao.length,
        comAtencao: comAtencao.size
    };
}

function instalacaoCombinaFiltro(item, filtro = 'todas') {
    const auditoria = avaliarProntidaoComercial(item);
    const ativo = String(item.status || '').toLowerCase() !== 'arquivado';

    if (filtro === 'ativas') return ativo;
    if (filtro === 'whatsapp_pendente') return ativo && Boolean(item.saude?.online) && !item.saude?.whatsapp;
    if (filtro === 'reconexao') return ativo && precisaAvisoReconexaoWhatsapp(item);
    if (filtro === 'avaliacao') return ativo && String(item.tipoLicenca || '').startsWith('avaliacao');
    if (filtro === 'licenca_vencida') return ativo && Boolean(item.estadoLicenca && !item.estadoLicenca.permitida);
    if (filtro === 'prontas') return ativo && auditoria.pronta;
    if (filtro === 'pendencias') return ativo && !auditoria.pronta;
    if (filtro === 'observacao') return Boolean(String(item.observacaoOperacional || '').trim());
    if (filtro === 'arquivadas') return !ativo;

    return true;
}

function instalacaoCombinaBusca(item, busca = '') {
    const termo = String(busca || '').trim().toLowerCase();
    if (!termo) return true;

    return [
        item.nome,
        item.slug,
        item.dominio,
        item.whatsappEsperado,
        item.processoPm2,
        item.status,
        item.detalheStatus,
        item.observacaoOperacional
    ].some(valor => String(valor || '').toLowerCase().includes(termo));
}

function filtrarInstalacoesPainel(instalacoes = [], filtros = {}) {
    const filtro = String(filtros.filtro || 'todas');
    const busca = String(filtros.busca || '');

    return instalacoes.filter(item => instalacaoCombinaFiltro(item, filtro) && instalacaoCombinaBusca(item, busca));
}

function urlFiltroPainel(filtro, busca = '') {
    const query = new URLSearchParams();
    if (filtro && filtro !== 'todas') query.set('filtro', filtro);
    if (String(busca || '').trim()) query.set('busca', String(busca || '').trim());
    const texto = query.toString();
    return texto ? `/?${texto}#instalacoes` : '/#instalacoes';
}

function opcoesFiltroInstalacoes(statusGeral = {}) {
    return [
        ['todas', 'Todas', statusGeral.total],
        ['ativas', 'Ativas', statusGeral.ativas],
        ['whatsapp_pendente', 'WhatsApp pendente', statusGeral.aguardandoWhatsapp],
        ['reconexao', 'Reconexão acima de 5min', statusGeral.reconexaoPendente],
        ['avaliacao', 'Em teste', statusGeral.emAvaliacao],
        ['licenca_vencida', 'Licença vencida', statusGeral.licencasVencidas],
        ['prontas', 'Prontas para venda', statusGeral.prontasParaVenda],
        ['pendencias', 'Com pendências', Math.max(0, Number(statusGeral.ativas || 0) - Number(statusGeral.prontasParaVenda || 0))],
        ['observacao', 'Com observação', statusGeral.comObservacao],
        ['arquivadas', 'Arquivadas', statusGeral.arquivadas]
    ];
}

function painelChecklistComercial(instalacoes = []) {
    const itens = instalacoes
        .filter(item => String(item.status || '').toLowerCase() !== 'arquivado')
        .map(item => ({ item, auditoria: avaliarProntidaoComercial(item) }))
        .filter(({ auditoria }) => auditoria.pendencias && auditoria.pendencias.length)
        .sort((a, b) => {
            const diferenca = b.auditoria.pendencias.length - a.auditoria.pendencias.length;
            if (diferenca !== 0) return diferenca;
            return String(a.item.cliente || a.item.nome || '').localeCompare(String(b.item.cliente || b.item.nome || ''), 'pt-BR');
        });

    const estilos = `<style>
        .commercial-checklist{margin-top:22px}
        .commercial-checklist-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
        .commercial-checklist-header p{margin:6px 0 0;color:#697386}
        .commercial-checklist-badge{display:inline-flex;align-items:center;border-radius:999px;padding:7px 12px;font-weight:800;font-size:13px;white-space:nowrap}
        .commercial-checklist-badge.ok{background:#dff7ea;color:#087a42}
        .commercial-checklist-badge.warn{background:#fff3cd;color:#946200}
        .commercial-checklist-list{display:grid;gap:12px}
        .commercial-checklist-item{display:grid;grid-template-columns:minmax(170px,260px) 1fr;gap:18px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
        .commercial-checklist-item strong{display:block;font-size:16px;color:#081225}
        .commercial-checklist-item small{display:block;margin-top:3px;color:#697386;font-weight:700}
        .commercial-checklist-item .readiness-list{margin:0}
        .commercial-checklist-more{margin-top:12px;color:#697386;font-weight:700}
        @media (max-width:760px){.commercial-checklist-header,.commercial-checklist-item{display:block}.commercial-checklist-badge{margin-top:10px}.commercial-checklist-item .readiness-list{margin-top:10px}}
    </style>`;

    if (!itens.length) {
        return `${estilos}<section class="panel commercial-checklist">
        <div class="commercial-checklist-header">
            <div>
                <h2>Checklist comercial</h2>
                <p>Todas as instalações ativas estão prontas para entrega ou venda.</p>
            </div>
            <span class="commercial-checklist-badge ok">Tudo pronto</span>
        </div>
    </section>`;
    }

    const visiveis = itens.slice(0, 6);
    const restantes = itens.length - visiveis.length;

    return `${estilos}<section class="panel commercial-checklist">
        <div class="commercial-checklist-header">
            <div>
                <h2>Checklist comercial</h2>
                <p>Confira os itens que ainda merecem atenção antes de entregar uma instalação.</p>
            </div>
            <span class="commercial-checklist-badge warn">${itens.length} instalação(ões) com pendência</span>
        </div>
        <div class="commercial-checklist-list">
            ${visiveis.map(({ item, auditoria }) => {
                const portaTexto = item.porta ? ' - porta ' + escapar(String(item.porta)) : '';
                return `
                <div class="commercial-checklist-item">
                    <div>
                        <strong>${escapar(item.cliente || item.nome || item.slug || 'Instalação')}</strong>
                        <small>${escapar(item.slug || '')}${portaTexto}</small>
                    </div>
                    <ul class="readiness-list">
                        ${auditoria.pendencias.map(pendencia => `
                            <li>
                                <span>${escapar(pendencia)}</span>
                                ${acaoCorrecaoPendencia(item, pendencia)}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
            }).join('')}
        </div>
        ${restantes > 0 ? `<p class="commercial-checklist-more">Mais ${restantes} instalação(ões) com pendência.</p>` : ''}
    </section>`;
}

function cardStatusGeral(rotulo, valor, detalhe, classe = '') {
    return `<div class="status-card ${classe}">
        <div class="status-label">${escapar(rotulo)}</div>
        <div class="status-value">${escapar(valor)}</div>
        <div class="status-detail">${escapar(detalhe)}</div>
    </div>`;
}

function resumirOcorrenciasLog(logs = '') {
    const linhas = String(logs || '')
        .split(/\r?\n/)
        .map(linha => linha.trim())
        .filter(Boolean)
        .filter(linha => /erro|error|falha|desconect|chrome|timeout|atendimento humano|n[aã]o conectado|qr code/i.test(linha));

    return linhas.slice(-12);
}

function paginaSaude(instalacao, saude, logs = '') {
    const classe = saude.online ? (saude.whatsapp ? 'ok' : 'warn') : 'error';
    const rotulo = saude.online ? (saude.whatsapp ? 'WhatsApp conectado' : 'Aguardando WhatsApp') : 'Processo indisponível';
    const ocorrencias = resumirOcorrenciasLog(logs);
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saúde - ${escapar(instalacao.nome)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1060px,calc(100% - 30px));margin:34px auto}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.secondary{background:#eef1f5;color:#263247}.warning{background:#e98a13}.danger{background:#dc3545}h1{margin:18px 0 6px}.sub{color:#697386;margin-bottom:18px}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);padding:22px;margin-top:18px}.badge{display:inline-flex;padding:6px 11px;border-radius:999px;font-weight:800}.ok{background:#dff8ee;color:#047446}.warn{background:#fff2dc;color:#a76100}.error{background:#ffe5e7;color:#c52e35}.row{display:grid;grid-template-columns:220px 1fr;border-top:1px solid #e8ebf0;padding:12px 0}.row:first-of-type{border-top:0}.label{font-weight:800;color:#697386}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.inline{display:inline}.logbox{background:#081225;color:#dfe7ff;border-radius:8px;padding:14px;line-height:1.45;white-space:pre-wrap;max-height:360px;overflow:auto}.empty{color:#697386;text-align:center;padding:18px}
    </style></head><body><main><a class="button" href="/">Voltar</a><h1>Saúde de ${escapar(instalacao.nome)}</h1><div class="sub">${escapar(instalacao.processoPm2)} · porta ${escapar(instalacao.porta)}</div>
    <div class="actions">
        <a class="button secondary" href="https://${escapar(instalacao.dominio)}/clientes" target="_blank">Abrir painel</a>
        <a class="button secondary" href="https://${escapar(instalacao.dominio)}/qr" target="_blank">QR Code</a>
        <a class="button secondary" href="/instalacoes/${instalacao.id}/logs">Logs completos</a>
        ${botaoAvisoReconexaoWhatsapp({ ...instalacao, saude }, 'secondary')}
        ${instalacao.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${instalacao.id}/liberar-atendimento" onsubmit="return confirm('Liberar atendimentos humanos travados desta instalação?');"><button class="secondary" type="submit">Liberar atendimento</button></form>` : ''}
        ${instalacao.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${instalacao.id}/backup"><button class="secondary" type="submit">Gerar backup</button></form>` : ''}
        ${instalacao.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${instalacao.id}/reiniciar" onsubmit="return confirm('Reiniciar o robô desta instalação?');"><button type="submit">Reiniciar robô</button></form>` : ''}
    </div>
    <section class="panel">
        <p><span class="badge ${classe}">${escapar(rotulo)}</span></p>
        <div class="row"><div class="label">WhatsApp esperado</div><div>${escapar(instalacao.whatsappEsperado || 'Não informado')}</div></div>
        <div class="row"><div class="label">WhatsApp conectado</div><div>${escapar(saude.numero || 'Não conectado')}</div></div>
        <div class="row"><div class="label">Status interno</div><div>${escapar(saude.whatsappStatus || saude.estado || 'Não informado')}</div></div>
        <div class="row"><div class="label">Tempo online</div><div>${escapar(formatarTempoOnline(saude.uptime))}</div></div>
        <div class="row"><div class="label">Última checagem</div><div>${escapar(saude.timestamp || new Date().toISOString())}</div></div>
        ${saude.erro ?`<div class="row"><div class="label">Detalhe</div><div>${escapar(saude.erro)}</div></div>` : ''}
    </section>
    <section class="panel">
        <h2>Ocorrências recentes</h2>
        <div class="sub">Resumo dos últimos logs com erros, QR Code, desconexões ou atendimento humano</div>
        ${ocorrencias.length ?`<div class="logbox">${escapar(ocorrencias.join('\n'))}</div>` : '<div class="empty">Nenhuma ocorrência importante encontrada nos logs recentes.</div>'}
    </section></main></body></html>`;
}

function pagina(instalacoes, opcoes = {}) {
    const criado = opcoes.criado;
    const statusGeral = calcularStatusGeral(instalacoes);
    const filtrosInstalacoes = {
        filtro: String(opcoes.filtro || 'todas'),
        busca: String(opcoes.busca || '')
    };
    const instalacoesFiltradas = filtrarInstalacoesPainel(instalacoes, filtrosInstalacoes);
    const opcoesFiltro = opcoesFiltroInstalacoes(statusGeral);
    const recursos = opcoes.recursos || {};
    const versaoSistema = packageInfo.version || '1.0.0';
    const sugestaoAdmin = obterSugestaoInstalacaoAdministradoraAtual();
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel Mestre - Julian Play</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1480px,calc(100% - 30px));margin:34px auto}h1,h2{margin:0 0 8px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.topbar form{margin:0}.sub{color:#697386}.version-pill{display:inline-flex;margin-top:10px;padding:5px 10px;border-radius:999px;background:#eef1f5;color:#4b5565;font-size:12px;font-weight:800}main>h1:first-of-type,main>h1:first-of-type+.sub,main>h1:first-of-type+.sub+form{display:none}.status-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-top:22px}.status-card{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);padding:18px}.status-label{color:#697386;font-size:13px;font-weight:800}.status-value{font-size:34px;font-weight:900;line-height:1.1;margin-top:8px}.status-detail{color:#697386;font-size:12px;margin-top:8px}.status-card.ok .status-value{color:#047446}.status-card.warn .status-value{color:#a76100}.status-card.error .status-value{color:#c52e35}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);margin-top:22px;padding:22px}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:700}input,select{border:1px solid #dfe3ea;border-radius:8px;padding:11px;font:inherit}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.button.smallbtn,button.smallbtn{padding:7px 10px;font-size:13px}.secondary{background:#eef1f5;color:#263247}.danger{background:#dc3545}.warning{background:#e98a13}.actions{display:flex;gap:7px;flex-wrap:wrap}.support-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.full{grid-column:1/-1}.notice{padding:14px;border-radius:8px;margin-top:18px;background:#dff8ee;color:#047446;font-weight:700}.errorbox{background:#ffe5e7;color:#c52e35}.credentials{background:#fff8dd;border:1px solid #f2d56b;padding:16px;border-radius:8px;margin-top:18px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:12px 9px;border-bottom:1px solid #e8ebf0;text-align:left;vertical-align:top}th{font-size:12px;color:#697386;text-transform:uppercase}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.badge.ok{background:#dff8ee;color:#047446}.badge.warn{background:#fff2dc;color:#a76100}.badge.error{background:#ffe5e7;color:#c52e35}.small{font-size:12px;color:#697386;margin-top:4px}.dangertext{color:#c52e35;font-weight:700}.diagnostic{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;max-width:390px}.diagnostic span{background:#f4f6f9;border:1px solid #e8ebf0;border-radius:999px;color:#4b5565;font-size:12px;padding:4px 8px}.event-list{display:grid;gap:5px;margin-top:8px;color:#596273;font-size:12px;line-height:1.35}.event-list strong{color:#263247}.readiness-list{margin:7px 0 5px;padding:0;list-style:none;color:#697386;font-size:12px;line-height:1.4}.readiness-list li{display:grid;grid-template-columns:minmax(130px,1fr) auto;align-items:start;gap:7px;padding:6px 0;border-bottom:1px solid #eef1f5}.readiness-list a,.readiness-action{color:#315bd6;font-weight:800;text-decoration:none;white-space:nowrap}.readiness-action{display:inline-flex;margin-top:6px;font-size:12px}.inline{display:inline}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:1100px){.status-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:900px){.topbar{display:block}.fields{grid-template-columns:1fr}.status-grid{grid-template-columns:1fr 1fr}.table-wrap{overflow:auto}table{min-width:1300px}}@media(max-width:560px){.status-grid{grid-template-columns:1fr}}
    </style></head><body><main>
    <div class="topbar">
      <div>
        <h1>Painel Mestre</h1>
        <div class="sub">Instala&ccedil;&otilde;es comerciais isoladas em ${escapar(baseDomain)}</div>
        <div class="version-pill">Vers&atilde;o ${escapar(versaoSistema)}</div>
      </div>
      <form method="post" action="/logout"><button class="secondary" type="submit">Sair</button></form>
    </div>
    <h1>Painel Mestre</h1><div class="sub">Instalações comerciais isoladas em ${escapar(baseDomain)}</div>
    <form method="post" action="/logout" style="margin-top:12px"><button class="secondary" type="submit">Sair</button></form>
    ${opcoes.mensagem ?`<div class="notice">${escapar(opcoes.mensagem)}</div>` : ''}
    ${opcoes.erro ?`<div class="notice errorbox">${escapar(opcoes.erro)}</div>` : ''}
    ${criado ?`<div class="credentials"><strong>Instalação criada.</strong><br>URL: <a href="https://${escapar(criado.dominio)}" target="_blank">https://${escapar(criado.dominio)}</a><br>Usuário: ${escapar(criado.usuarioPainel)}<br>Senha inicial: <strong>${escapar(criado.senhaInicial)}</strong><div class="small">Anote agora. A senha não fica armazenada no Painel Mestre.</div></div>` : ''}
    <section class="status-grid" aria-label="Status geral das instalações">
        ${cardStatusGeral('Instalações', statusGeral.total, `${statusGeral.ativas} ativa(s), ${statusGeral.arquivadas} arquivada(s)`)}
        ${cardStatusGeral('WhatsApp conectado', statusGeral.whatsappConectado, `${statusGeral.aguardandoWhatsapp} aguardando conex\u00e3o, ${statusGeral.reconexaoPendente} acima de 5min`, statusGeral.aguardandoWhatsapp ? 'warn' : 'ok')}
        ${cardStatusGeral('Em avaliação', statusGeral.emAvaliacao, 'Instalações em período de teste', statusGeral.emAvaliacao ? 'warn' : '')}
        ${cardStatusGeral('Prontas para venda', statusGeral.prontasParaVenda, `de ${statusGeral.ativas} instalação(ões) ativa(s)`, statusGeral.prontasParaVenda === statusGeral.ativas && statusGeral.ativas ? 'ok' : 'warn')}
        ${cardStatusGeral('Com atenção', statusGeral.comAtencao, 'Erro, licença vencida ou WhatsApp pendente', statusGeral.comAtencao ? 'error' : 'ok')}
        ${cardStatusGeral('Processos off-line', statusGeral.processosIndisponiveis, 'Sem resposta na porta local', statusGeral.processosIndisponiveis ? 'error' : 'ok')}
        ${cardStatusGeral('Licenças vencidas', statusGeral.licencasVencidas, `${statusGeral.suspensas} instalação(ões) suspensa(s)`, statusGeral.licencasVencidas || statusGeral.suspensas ? 'error' : 'ok')}
        ${cardStatusGeral('RAM livre', `${recursos.memoriaLivreMb ?? '-'} MB`, `de ${recursos.memoriaTotalMb ?? '-'} MB`, Number(recursos.memoriaLivreMb || 0) < 512 ? 'error' : Number(recursos.memoriaLivreMb || 0) < 1024 ? 'warn' : 'ok')}
        ${cardStatusGeral('Processos Chrome', recursos.processosChrome ?? '-', 'Navegadores usados pelos robôs', Number(recursos.processosChrome || 0) > 30 ? 'warn' : '')}
        ${cardStatusGeral('Disco livre', recursos.discoLivreGb == null ? '-' : `${recursos.discoLivreGb} GB`, recursos.discoTotalGb == null ? 'Métrica indisponível' : `de ${recursos.discoTotalGb} GB`, Number(recursos.discoLivreGb || 0) < 5 ? 'error' : 'ok')}
    </section>
    ${painelChecklistComercial(instalacoes)}
    <section class="panel"><h2>Limpeza segura</h2><div class="sub">Mantém os backups mais recentes de cada instalação e remove somente sessões de instalações já arquivadas.</div>
      <form class="actions" method="post" action="/manutencao/limpar" onsubmit="return confirm('Executar a limpeza segura? Bancos e sessões dos robôs ativos serão preservados.');">
        <label>Backups mantidos por instalação<input type="number" name="retencao" value="10" min="3" max="100" required style="width:150px"></label>
        <div style="align-self:end"><button type="submit">Executar limpeza segura</button></div>
      </form>
    </section>
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
    <section class="panel"><h2>Instalação administradora</h2><div class="sub">Vincule a instalação principal antiga ao Painel Mestre como administradora vitalícia.</div>
      <form class="fields" method="post" action="/instalacoes/admin-atual">
        <label>Nome da instalação<input name="nome" value="${escapar(sugestaoAdmin.nome)}" required></label>
        <label>Identificador da URL<input name="slug" value="${escapar(sugestaoAdmin.slug)}" required></label>
        <label>Domínio<input name="dominio" value="${escapar(sugestaoAdmin.dominio)}" required></label>
        <label>Porta local<input type="number" name="porta" value="${escapar(sugestaoAdmin.porta)}" min="1" max="65535" required></label>
        <label>Processo PM2<input name="processoPm2" value="${escapar(sugestaoAdmin.processoPm2)}" required></label>
        <label>Pasta de dados<input name="pastaDados" value="${escapar(sugestaoAdmin.pastaDados)}" required></label>
        <label>Usuário do painel<input name="usuarioPainel" value="${escapar(sugestaoAdmin.usuarioPainel)}" required></label>
        <label>Token interno<input name="codigoFornecedor" value="${escapar(sugestaoAdmin.codigoFornecedor)}" placeholder="Gerado pelo instalador"></label>
        <div class="notice full">Esta ação não recria o robô nem apaga dados. Ela apenas cadastra a instalação atual no Painel Mestre com perfil administrador.</div>
        <div style="align-self:end"><button class="secondary" type="submit">Vincular administradora</button></div>
      </form>
    </section>
    <section class="panel"><div class="topbar"><div><h2>Instalações</h2><div class="sub">${instalacoesFiltradas.length} de ${instalacoes.length} instalação(ões) exibida(s)</div></div><a class="button secondary" href="/?mensagem=${encodeURIComponent('Prontidão de todas as instalações revalidada.')}#instalacoes">Revalidar todas</a></div>
      <form method="get" action="/" style="display:grid;grid-template-columns:minmax(180px,260px) minmax(220px,1fr) auto;gap:10px;margin-top:16px;align-items:end">
        <label>Filtro<select name="filtro">${opcoesFiltro.map(([valor, texto, total]) => `<option value="${escapar(valor)}" ${valor === filtrosInstalacoes.filtro ?'selected' : ''}>${escapar(texto)} (${escapar(total ?? 0)})</option>`).join('')}</select></label>
        <label>Busca<input name="busca" value="${escapar(filtrosInstalacoes.busca)}" placeholder="Cliente, domínio, WhatsApp ou observação"></label>
        <button type="submit">Filtrar</button>
      </form>
      <div class="actions" style="margin-top:12px">
        ${opcoesFiltro.map(([valor, texto, total]) => `<a class="button smallbtn ${valor === filtrosInstalacoes.filtro ?'' : 'secondary'}" href="${escapar(urlFiltroPainel(valor, filtrosInstalacoes.busca))}">${escapar(texto)} (${escapar(total ?? 0)})</a>`).join('')}
        ${(filtrosInstalacoes.filtro !== 'todas' || filtrosInstalacoes.busca) ?'<a class="button smallbtn secondary" href="/#instalacoes">Limpar filtros</a>' : ''}
      </div>
      <div class="table-wrap" id="instalacoes">
      ${instalacoesFiltradas.length ?`<table><thead><tr><th>Cliente</th><th>URL</th><th>Robô</th><th>Licença</th><th>Prontidão</th><th>Status</th><th>Ações</th></tr></thead><tbody>${instalacoesFiltradas.map(item => `<tr id="instalacao-${item.id}">
        <td><strong>${escapar(item.nome)}</strong><div class="small">${escapar(item.whatsappEsperado || 'WhatsApp não informado')} · avisos ${String(item.horaEnvio ?? 9).padStart(2, '0')}:${String(item.minutoEnvio ?? 0).padStart(2, '0')}</div>${item.observacaoOperacional ?`<div class="small"><strong>Obs. operacional:</strong> ${escapar(item.observacaoOperacional)}</div>` : ''}</td>
        <td><a href="https://${escapar(item.dominio)}" target="_blank">${escapar(item.dominio)}</a><div class="small">${escapar(item.pastaDados)}</div><div class="small"><strong>Uso: ${escapar(formatarBytes(item.usoDiscoBytes))}</strong></div></td>
        <td>${resumoDiagnostico(item)}</td><td>${escapar(item.estadoLicenca?.rotulo || item.tipoLicenca)}${item.estadoLicenca?.vencimento ?`<div class="small">até ${escapar(item.estadoLicenca.vencimento.split('-').reverse().join('/'))}</div>` : item.diasAvaliacao ?` (${item.diasAvaliacao} dias)` : ''}</td><td>${resumoProntidaoComercial(item)}</td>
        <td><span class="badge ${item.estadoLicenca && !item.estadoLicenca.permitida ?'error' : statusClasse(item.status)}">${escapar(item.estadoLicenca && !item.estadoLicenca.permitida ?item.estadoLicenca.rotulo : item.status)}</span>${item.detalheStatus ?`<div class="small">${escapar(item.detalheStatus)}</div>` : ''}${eventosRecentesHtml(item)}</td>
        <td id="acoes-${item.id}"><div class="support-actions">
          <a class="button smallbtn secondary" href="https://${escapar(item.dominio)}/clientes" target="_blank">Painel</a>
          <a class="button smallbtn secondary" href="https://${escapar(item.dominio)}/qr" target="_blank">QR Code</a>
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/saude">Saúde</a>
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/logs">Logs</a>
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/historico">Histórico</a>
          ${botaoAvisoReconexaoWhatsapp(item)}
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/backup"><button class="smallbtn secondary" type="submit">Backup</button></form>` : ''}
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/liberar-atendimento" onsubmit="return confirm('Liberar atendimentos humanos travados desta instalação?');"><button class="smallbtn secondary" type="submit">Liberar atendimento</button></form>` : ''}
          ${item.status !== 'arquivado' && item.status !== 'parado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/reiniciar" onsubmit="return confirm('Reiniciar o robô desta instalação?');"><button class="smallbtn" type="submit">Reiniciar robô</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/parar" onsubmit="return confirm('Parar somente este robô com segurança?');"><button class="smallbtn warning" type="submit">Parar robô</button></form>` : ''}
          ${item.status === 'parado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/iniciar"><button class="smallbtn" type="submit">Iniciar robô</button></form>` : ''}
        </div><div class="actions">
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/whatsapp" onsubmit="return confirm('Trocar o WhatsApp encerrará a conexão atual deste robô e gerará um novo QR Code. Continuar?');"><input name="whatsappEsperado" inputmode="numeric" value="${escapar(item.whatsappEsperado || '')}" minlength="10" maxlength="15" placeholder="55 + DDD + número" required style="width:185px;padding:9px"><button class="warning" type="submit">Trocar WhatsApp</button></form>` : ''}
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/observacao"><input name="observacaoOperacional" value="${escapar(item.observacaoOperacional || '')}" maxlength="500" placeholder="Obs. operacional" style="width:260px;padding:9px"><button class="secondary" type="submit">Salvar obs.</button></form>` : ''}
          ${item.status !== 'arquivado' ?`<form id="resetar-senha-${item.id}" class="inline" method="post" action="/instalacoes/${item.id}/resetar-senha" onsubmit="return confirm('Redefinir a senha do painel deste cliente?');"><input name="senhaPainel" type="password" minlength="8" placeholder="Nova senha" required style="width:150px;padding:9px"><button class="secondary" type="submit">Resetar senha</button></form>` : ''}
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/licenca" onsubmit="return confirm('Ativar esta licença comercial para o cliente?');"><select name="tipoLicenca" aria-label="Tipo de licença comercial"><option value="mensal">Mensal</option><option value="semestral">Semestral</option><option value="anual">Anual</option><option value="vitalicia">Vitalícia</option></select><button type="submit">Ativar licença</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/prorrogar"><select name="dias" aria-label="Dias de prorrogação"><option value="15">15 dias</option><option value="30">30 dias</option></select><button class="secondary" type="submit">Prorrogar teste</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/suspender"><button class="warning" type="submit">Suspender</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/arquivar" onsubmit="return confirm('Arquivar esta instalação e parar o robô?');"><button class="secondary" type="submit">Arquivar</button></form>` : `<form class="inline" method="post" action="/instalacoes/${item.id}/excluir" onsubmit="return confirm('EXCLUSÃO DEFINITIVA: apagar banco, sessão e todos os clientes desta instalação?');"><button class="danger" type="submit">Excluir definitivamente</button></form>`}
        </div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma instalação encontrada para este filtro.</div>'}
    </div></section></main></body></html>`;
}

function paginaLogs(instalacao, logs) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logs - ${escapar(instalacao.nome)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1200px,calc(100% - 30px));margin:34px auto}.button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none}h1{margin:18px 0 6px}.sub{color:#697386;margin-bottom:18px}pre{white-space:pre-wrap;background:#081225;color:#dfe7ff;border-radius:8px;padding:16px;line-height:1.45;max-height:76vh;overflow:auto}
    </style></head><body><main><a class="button" href="/">Voltar</a><h1>Logs de ${escapar(instalacao.nome)}</h1><div class="sub">${escapar(instalacao.processoPm2)} · porta ${escapar(instalacao.porta)}</div><pre>${escapar(logs || 'Nenhum log encontrado.')}</pre></main></body></html>`;
}

function paginaHistorico(instalacao, eventos = []) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Histórico - ${escapar(instalacao.nome)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1100px,calc(100% - 30px));margin:34px auto}.button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none}h1{margin:18px 0 6px}.sub{color:#697386;margin-bottom:18px}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);overflow:hidden}.event{display:grid;grid-template-columns:150px 150px 1fr;gap:14px;padding:14px 16px;border-bottom:1px solid #e8ebf0}.event:last-child{border-bottom:0}.date,.type{font-size:13px;color:#697386;font-weight:800}.msg{font-weight:800}.details{margin-top:5px;color:#697386;font-size:13px;line-height:1.4}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:720px){.event{grid-template-columns:1fr}.date,.type{font-size:12px}}
    </style></head><body><main><a class="button" href="/#instalacao-${escapar(instalacao.id)}">Voltar</a><h1>Histórico de ${escapar(instalacao.nome)}</h1><div class="sub">${escapar(instalacao.dominio)} · ${escapar(instalacao.processoPm2)}</div>
    <section class="panel">
        ${eventos.length ? eventos.map(evento => `<div class="event">
            <div class="date">${escapar(formatarDataHoraPainel(evento.criadoEm))}</div>
            <div class="type">${escapar(evento.tipo)}</div>
            <div><div class="msg">${escapar(evento.mensagem)}</div>${evento.detalhes ?`<div class="details">${escapar(evento.detalhes)}</div>` : ''}</div>
        </div>`).join('') : '<div class="empty">Nenhum evento registrado para esta instalação.</div>'}
    </section></main></body></html>`;
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

async function renderizarPainel(opcoes = {}) {
    const [instalacoes, recursos] = await Promise.all([
        listarInstalacoes(),
        obterRecursosServidor().catch(() => ({}))
    ]);
    return pagina(instalacoes, { ...opcoes, recursos });
}

app.get('/', async (req, res) => {
    res.send(await renderizarPainel({
        mensagem: req.query.mensagem,
        erro: req.query.erro,
        filtro: req.query.filtro,
        busca: req.query.busca
    }));
});

app.post('/manutencao/limpar', async (req, res) => {
    try {
        const resultado = await limparServidorSeguro(req.body.retencao);
        const liberado = formatarBytes(resultado.bytesLiberados);
        const mensagem = `Limpeza concluída: ${resultado.backupsRemovidos} backup(s) e ${resultado.sessoesArquivadasRemovidas} sessão(ões) arquivada(s) removidos. Espaço liberado: ${liberado}.`;
        res.redirect(`/?mensagem=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});

app.post('/instalacoes', async (req, res) => {
    try {
        const criado = await criarInstalacao(req.body);
        res.send(await renderizarPainel({ criado }));
    } catch (err) {
        res.status(400).send(await renderizarPainel({ erro: err.detalhes || err.message }));
    }
});

app.post('/instalacoes/admin-atual', async (req, res) => {
    try {
        const instalacao = await vincularInstalacaoAdministradoraAtual(req.body);
        res.redirect(`/?mensagem=${encodeURIComponent(`Instalação administradora vinculada: ${instalacao.nome}.`)}#instalacao-${instalacao.id}`);
    } catch (err) {
        res.status(400).send(await renderizarPainel({ erro: err.detalhes || err.message }));
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
app.post('/instalacoes/:id/parar', acao(pararInstalacao, 'Robô parado com segurança.'));
app.post('/instalacoes/:id/iniciar', acao(iniciarInstalacao, 'Robô iniciado. Aguarde o WhatsApp conectar.'));
app.post('/instalacoes/:id/whatsapp', async (req, res) => {
    try {
        const resultado = await trocarWhatsappInstalacao(req.params.id, req.body.whatsappEsperado);
        const mensagem = `WhatsApp atualizado para ${resultado.whatsappEsperado}. Abra o QR Code para conectar o novo aparelho.`;
        res.redirect(`/?mensagem=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.detalhes || err.message)}`);
    }
});

app.post('/instalacoes/:id/observacao', async (req, res) => {
    try {
        const texto = await atualizarObservacaoOperacional(req.params.id, req.body.observacaoOperacional);
        const mensagem = texto ? 'Observação operacional salva.' : 'Observação operacional removida.';
        res.redirect(`/?mensagem=${encodeURIComponent(mensagem)}#instalacao-${req.params.id}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}#instalacao-${req.params.id}`);
    }
});

app.post('/instalacoes/:id/backup', async (req, res) => {
    try {
        const nomeBackup = await gerarBackupInstalacao(req.params.id);
        res.redirect(`/?mensagem=${encodeURIComponent(`Backup criado: ${nomeBackup}`)}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
app.post('/instalacoes/:id/liberar-atendimento', async (req, res) => {
    try {
        const liberados = await liberarAtendimentoInstalacao(req.params.id);
        res.redirect(`/?mensagem=${encodeURIComponent(`${liberados} atendimento(s) liberado(s).`)}`);
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
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
app.get('/instalacoes/:id/historico', async (req, res) => {
    try {
        const [instalacao, eventos] = await Promise.all([
            buscarInstalacao(req.params.id),
            listarEventosInstalacao(req.params.id, req.query.linhas)
        ]);
        if (!instalacao) throw new Error('Instalação não encontrada.');
        res.send(paginaHistorico(instalacao, eventos));
    } catch (err) {
        res.redirect(`/?erro=${encodeURIComponent(err.message)}`);
    }
});
app.get('/instalacoes/:id/saude', async (req, res) => {
    try {
        const [resultado, logs] = await Promise.all([
            obterDiagnosticoInstalacao(req.params.id),
            obterLogsInstalacao(req.params.id, 80).catch(() => ({ logs: '' }))
        ]);
        res.send(paginaSaude(resultado.instalacao, resultado.saude, logs.logs));
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
