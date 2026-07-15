const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const packageInfo = require('../package.json');
const masterDb = require('./db');
const { verificarSenha } = require('../services/passwordService');
const { gerarCodigoLicencaAssinado } = require('../services/licencaCodigo');
const { dataHojeSaoPaulo, adicionarDias } = require('../services/licencaCalculo');
const { formatarDataHoraBrasil } = require('../utils/dataHora');
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

function instalacaoAdministradora(item = {}) {
    return ['admin', 'administrador', 'fornecedor'].includes(String(item.perfilLicenca || '').trim().toLowerCase());
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
    return formatarDataHoraBrasil(valor);
}

function formatarDataPainel(valor) {
    const data = String(valor || '').slice(0, 10);
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

function diasAteData(valor) {
    const data = String(valor || '').slice(0, 10);
    if (!data) return null;
    const hoje = new Date(`${dataHojeSaoPaulo()}T00:00:00Z`);
    const vencimento = new Date(`${data}T00:00:00Z`);
    return Math.ceil((vencimento - hoje) / 86400000);
}

function estadoLicencaLocal(licenca = {}) {
    if (String(licenca.suspensa || '0') === '1') {
        return { classe: 'error', texto: 'Suspensa', detalhe: 'Bloqueada pelo fornecedor' };
    }
    if (String(licenca.vitalicia || '0') === '1' || licenca.tipo === 'vitalicia') {
        return { classe: 'ok', texto: 'Vitalícia', detalhe: 'Sem vencimento' };
    }

    const dias = diasAteData(licenca.vencimento);
    if (dias === null) return { classe: 'warn', texto: 'Sem vencimento', detalhe: 'Revise a licenca' };
    if (dias < 0) return { classe: 'error', texto: 'Vencida', detalhe: `${Math.abs(dias)} dia(s) vencida` };
    if (dias <= 7) return { classe: 'warn', texto: 'Vencendo', detalhe: `${dias} dia(s) restante(s)` };
    return { classe: 'ok', texto: 'Ativa', detalhe: `${dias} dia(s) restante(s)` };
}

function diasDesdeDataHora(valor) {
    if (!valor) return null;
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return null;
    return Math.floor((Date.now() - data.getTime()) / 86400000);
}

function licencaLocalSemConsultaRecente(licenca = {}) {
    const dias = diasDesdeDataHora(licenca.ultimoPingEm);
    return dias === null || dias >= 3;
}

function licencaLocalBloqueadaPorMaquina(licenca = {}) {
    return String(licenca.ultimoStatus || '').trim() === 'bloqueada_maquina';
}

function resumoLicencasLocais(licencas = []) {
    const resumo = {
        ativas: 0,
        suspensas: 0,
        vencidas: 0,
        vencendo: 0,
        semConsulta: 0,
        bloqueadasMaquina: 0,
        atencao: []
    };

    licencas.forEach((licenca) => {
        const estado = estadoLicencaLocal(licenca);
        const suspensa = String(licenca.suspensa || '0') === '1';
        const vencida = estado.texto === 'Vencida';
        const vencendo = estado.texto === 'Vencendo';
        const semConsulta = licencaLocalSemConsultaRecente(licenca);
        const bloqueadaMaquina = licencaLocalBloqueadaPorMaquina(licenca);

        if (suspensa) resumo.suspensas += 1;
        else resumo.ativas += 1;
        if (vencida) resumo.vencidas += 1;
        if (vencendo) resumo.vencendo += 1;
        if (semConsulta) resumo.semConsulta += 1;
        if (bloqueadaMaquina) resumo.bloqueadasMaquina += 1;

        const motivos = [];
        if (suspensa) motivos.push('suspensa');
        if (vencida) motivos.push('vencida');
        if (vencendo) motivos.push('vence em até 7 dias');
        if (semConsulta) motivos.push(licenca.ultimoPingEm ? 'sem consulta há 3 dias' : 'sem consulta');
        if (bloqueadaMaquina) motivos.push('bloqueio por máquina diferente');
        if (!String(licenca.machineFingerprint || '').trim()) motivos.push('sem chave de máquina');

        if (motivos.length) resumo.atencao.push({ licenca, estado, motivos });
    });

    return resumo;
}

function cardResumoLicenca(rotulo, valor, detalhe, classe = '') {
    return `<div class="summary-card ${classe}">
        <div class="small">${escapar(rotulo)}</div>
        <strong>${escapar(valor)}</strong>
        <div class="small">${escapar(detalhe)}</div>
    </div>`;
}

function secaoResumoLicencasLocais(resumo) {
    return `<section class="license-summary">
        ${cardResumoLicenca('Ativas', resumo.ativas, 'licença(s) em uso', 'ok')}
        ${cardResumoLicenca('Vencendo', resumo.vencendo, 'próximos 7 dias', resumo.vencendo ? 'warn' : 'ok')}
        ${cardResumoLicenca('Vencidas', resumo.vencidas, 'precisam renovar', resumo.vencidas ? 'error' : 'ok')}
        ${cardResumoLicenca('Sem consulta', resumo.semConsulta, 'sem retorno recente', resumo.semConsulta ? 'warn' : 'ok')}
        ${cardResumoLicenca('Bloqueadas', resumo.bloqueadasMaquina, 'máquina diferente', resumo.bloqueadasMaquina ? 'error' : 'ok')}
        ${cardResumoLicenca('Suspensas', resumo.suspensas, 'bloqueadas por você', resumo.suspensas ? 'error' : 'ok')}
    </section>`;
}

function secaoAtencaoLicencasLocais(resumo) {
    const itens = resumo.atencao.slice(0, 8);
    if (!itens.length) {
        return `<section class="panel"><h2>Licenças locais com atenção</h2><div class="empty">Tudo certo nas licenças locais.</div></section>`;
    }

    return `<section class="panel"><div class="topbar"><div><h2>Licenças locais com atenção</h2><div class="sub">${resumo.atencao.length} ponto(s) para acompanhar</div></div><a class="button secondary" href="#licencas-locais">Ver lista</a></div>
        <div class="attention-list">
            ${itens.map(({ licenca, estado, motivos }) => `<div class="attention-item">
                <div><strong>${escapar(licenca.cliente || '-')}</strong><div class="small">${escapar(motivos.join(', '))}</div></div>
                <div><span class="badge ${estado.classe}">${escapar(estado.texto)}</span><div class="small">${escapar(licenca.ultimoPingEm ? formatarDataHoraPainel(licenca.ultimoPingEm) : 'Sem consulta')}</div></div>
                <div class="actions"><a class="button smallbtn secondary" href="/licencas/${encodeURIComponent(licenca.instalacaoId)}/historico">Histórico</a><a class="button smallbtn secondary" href="#licencas-locais">Renovar</a></div>
            </div>`).join('')}
        </div>
    </section>`;
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
    if (instalacaoAdministradora(item)) return { pronta: true, pendencias: [], administradora: true };

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
    if (instalacaoAdministradora(item)) {
        return '<span class="badge ok">Administradora</span><div class="small">Instalação vitalícia do fornecedor</div>';
    }

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
    const comerciais = ativos.filter(item => !instalacaoAdministradora(item));
    const administradoras = ativos.filter(instalacaoAdministradora);
    const whatsappConectado = comerciais.filter(item => Boolean(item.saude?.whatsapp));
    const aguardandoWhatsapp = comerciais.filter(item => Boolean(item.saude?.online) && !item.saude?.whatsapp);
    const reconexaoPendente = aguardandoWhatsapp.filter(precisaAvisoReconexaoWhatsapp);
    const processosIndisponiveis = ativos.filter(item => !item.saude?.online);
    const emAvaliacao = comerciais.filter(item => String(item.tipoLicenca || '').startsWith('avaliacao'));
    const licencasVencidas = comerciais.filter(item => item.estadoLicenca && !item.estadoLicenca.permitida);
    const suspensas = comerciais.filter(item => item.status === 'suspenso');
    const prontasParaVenda = comerciais.filter(item => avaliarProntidaoComercial(item).pronta);
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
        comerciais: comerciais.length,
        administradoras: administradoras.length,
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
    const administradora = instalacaoAdministradora(item);

    if (filtro === 'ativas') return ativo;
    if (filtro === 'admin') return ativo && administradora;
    if (filtro === 'clientes') return ativo && !administradora;
    if (filtro === 'whatsapp_pendente') return ativo && !administradora && Boolean(item.saude?.online) && !item.saude?.whatsapp;
    if (filtro === 'reconexao') return ativo && !administradora && precisaAvisoReconexaoWhatsapp(item);
    if (filtro === 'avaliacao') return ativo && !administradora && String(item.tipoLicenca || '').startsWith('avaliacao');
    if (filtro === 'licenca_vencida') return ativo && !administradora && Boolean(item.estadoLicenca && !item.estadoLicenca.permitida);
    if (filtro === 'prontas') return ativo && !administradora && auditoria.pronta;
    if (filtro === 'pendencias') return ativo && !administradora && !auditoria.pronta;
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
        ['admin', 'Administradora', statusGeral.administradoras],
        ['clientes', 'Clientes', statusGeral.comerciais],
        ['whatsapp_pendente', 'WhatsApp pendente', statusGeral.aguardandoWhatsapp],
        ['reconexao', 'Reconexão acima de 5min', statusGeral.reconexaoPendente],
        ['avaliacao', 'Em teste', statusGeral.emAvaliacao],
        ['licenca_vencida', 'Licença vencida', statusGeral.licencasVencidas],
        ['prontas', 'Prontas para venda', statusGeral.prontasParaVenda],
        ['pendencias', 'Com pendências', Math.max(0, Number(statusGeral.comerciais || 0) - Number(statusGeral.prontasParaVenda || 0))],
        ['observacao', 'Com observação', statusGeral.comObservacao],
        ['arquivadas', 'Arquivadas', statusGeral.arquivadas]
    ];
}

function painelChecklistComercial(instalacoes = []) {
    const itens = instalacoes
        .filter(item => String(item.status || '').toLowerCase() !== 'arquivado' && !instalacaoAdministradora(item))
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

function nomesResumoClientes(lista = []) {
    const itens = Array.isArray(lista) ? lista : [];
    if (!itens.length) return '';
    return `<div class="small">${itens.map(item => {
        const vencimento = item.vencimento ? ` (${formatarDataHoraPainel(item.vencimento)})` : '';
        return escapar(`${item.nome || item.telefone || 'Cliente'}${vencimento}`);
    }).join(', ')}</div>`;
}

function itemPrioridade(titulo, detalhe, tipo, acoes = [], extra = '') {
    return `<article class="priority-item ${tipo}">
        <div>
            <strong>${escapar(titulo)}</strong>
            <div class="small">${escapar(detalhe)}</div>
            ${extra}
        </div>
        <div class="actions">${acoes.map(acao => `<a class="button smallbtn ${acao.destaque ? '' : 'secondary'}" href="${escapar(acao.href)}" ${acao.externo ? 'target="_blank"' : ''}>${escapar(acao.texto)}</a>`).join('')}</div>
    </article>`;
}

function secaoPrioridades(instalacoes = []) {
    const clientes = instalacoes.filter(item => String(item.status || '').toLowerCase() !== 'arquivado' && !instalacaoAdministradora(item));
    const venda = [];
    const renovacao = [];
    const whatsapp = [];
    const financeiro = [];

    for (const item of clientes) {
        const resumo = item.resumoComercial || {};
        const dominio = `https://${item.dominio}`;
        const auditoria = avaliarProntidaoComercial(item);

        if (!auditoria.pronta) {
            venda.push(itemPrioridade(
                item.nome,
                `${auditoria.pendencias.length} pendência(s) antes de venda ou entrega`,
                'warn',
                [
                    { texto: 'Abrir painel', href: `${dominio}/clientes`, externo: true },
                    { texto: 'Manutenção', href: `${dominio}/manutencao`, externo: true }
                ],
                `<ul class="readiness-list">${auditoria.pendencias.slice(0, 3).map(p => `<li><span>${escapar(p)}</span></li>`).join('')}</ul>`
            ));
        }

        if (Number(resumo.testesVencendo || 0) > 0) {
            venda.push(itemPrioridade(
                item.nome,
                `${resumo.testesVencendo} teste(s) vencendo hoje ou amanhã`,
                'warn',
                [
                    { texto: 'Clientes', href: `${dominio}/clientes/todos`, externo: true },
                    { texto: 'Financeiro', href: `${dominio}/financeiro`, externo: true }
                ],
                nomesResumoClientes(resumo.testesVencendoLista)
            ));
        }

        if (Number(resumo.renovacoes7Dias || 0) > 0) {
            renovacao.push(itemPrioridade(
                item.nome,
                `${resumo.renovacoes7Dias} cliente(s) vencendo nos próximos 7 dias`,
                'warn',
                [
                    { texto: 'Clientes', href: `${dominio}/clientes/todos`, externo: true },
                    { texto: 'Enviar cobranças', href: `${dominio}/clientes`, externo: true }
                ],
                nomesResumoClientes(resumo.renovacoes7DiasLista)
            ));
        }

        if (Boolean(item.saude?.online) && !item.saude?.whatsapp) {
            whatsapp.push(itemPrioridade(
                item.nome,
                precisaAvisoReconexaoWhatsapp(item) ? 'WhatsApp desconectado há mais de 5 minutos' : 'WhatsApp aguardando conexão',
                precisaAvisoReconexaoWhatsapp(item) ? 'error' : 'warn',
                [
                    { texto: 'Abrir QR Code', href: `${dominio}/qr`, externo: true, destaque: true },
                    { texto: 'Saúde', href: `/instalacoes/${item.id}/saude` }
                ]
            ));
        }

        const pendenciasFinanceiras = [];
        if (!String(item.configuracoesTenant?.pixChave || '').trim()
            || !String(item.configuracoesTenant?.pixNome || '').trim()
            || !String(item.configuracoesTenant?.pixCidade || '').trim()) {
            pendenciasFinanceiras.push('PIX incompleto');
        }
        if (Number(resumo.planosComValor || 0) < 1) pendenciasFinanceiras.push('sem plano com valor');
        if (Number(resumo.pagamentosRegistrados || 0) < 1) pendenciasFinanceiras.push('sem pagamentos registrados');

        if (pendenciasFinanceiras.length) {
            financeiro.push(itemPrioridade(
                item.nome,
                pendenciasFinanceiras.join(', '),
                'warn',
                [
                    { texto: 'Manutenção', href: `${dominio}/manutencao`, externo: true },
                    { texto: 'Financeiro', href: `${dominio}/financeiro`, externo: true }
                ]
            ));
        }
    }

    const grupos = [
        ['Venda', venda],
        ['Renovação', renovacao],
        ['WhatsApp', whatsapp],
        ['Financeiro', financeiro]
    ];
    const total = grupos.reduce((soma, [, itens]) => soma + itens.length, 0);

    return `<section class="panel priorities">
        <div class="topbar">
            <div>
                <h2>Prioridades do dia</h2>
                <div class="sub">${total ? `${total} ponto(s) de atenção nos clientes` : 'Nenhuma prioridade crítica nos clientes agora'}</div>
            </div>
            <a class="button secondary" href="/?filtro=pendencias#instalacoes">Ver pendências</a>
        </div>
        <div class="priority-grid">
            ${grupos.map(([titulo, itens]) => `<div class="priority-group">
                <h3>${escapar(titulo)}</h3>
                ${itens.length ? itens.slice(0, 5).join('') : '<div class="empty compact">Tudo certo.</div>'}
                ${itens.length > 5 ? `<div class="small">Mais ${itens.length - 5} item(ns) neste grupo.</div>` : ''}
            </div>`).join('')}
        </div>
    </section>`;
}

function perfilInstalacaoHtml(item = {}) {
    if (!instalacaoAdministradora(item)) return '';
    return '<div class="small"><span class="badge ok">Administrador / fornecedor</span></div>';
}

function acoesInstalacaoHtml(item = {}) {
    const admin = instalacaoAdministradora(item);
    const botoesBase = `<div class="support-actions">
          <a class="button smallbtn secondary" href="https://${escapar(item.dominio)}/clientes" target="_blank">Painel</a>
          ${admin ? '' : `<a class="button smallbtn secondary" href="https://${escapar(item.dominio)}/qr" target="_blank">QR Code</a>`}
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/saude">Saúde</a>
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/logs">Logs</a>
          <a class="button smallbtn secondary" href="/instalacoes/${item.id}/historico">Histórico</a>
          ${admin ? '' : botaoAvisoReconexaoWhatsapp(item)}
          ${item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/backup"><button class="smallbtn secondary" type="submit">Backup</button></form>` : ''}
          ${!admin && item.status !== 'arquivado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/liberar-atendimento" onsubmit="return confirm('Liberar atendimentos humanos travados desta instalação?');"><button class="smallbtn secondary" type="submit">Liberar atendimento</button></form>` : ''}
          ${item.status !== 'arquivado' && item.status !== 'parado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/reiniciar" onsubmit="return confirm('Reiniciar o robô desta instalação?');"><button class="smallbtn" type="submit">Reiniciar robô</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/parar" onsubmit="return confirm('Parar somente este robô com segurança?');"><button class="smallbtn warning" type="submit">Parar robô</button></form>` : ''}
          ${item.status === 'parado' ?`<form class="inline" method="post" action="/instalacoes/${item.id}/iniciar"><button class="smallbtn" type="submit">Iniciar robô</button></form>` : ''}
        </div>`;

    if (item.status === 'arquivado') {
        return `${botoesBase}<div class="actions"><form class="inline" method="post" action="/instalacoes/${item.id}/excluir" onsubmit="return confirm('EXCLUSÃO DEFINITIVA: apagar banco, sessão e todos os clientes desta instalação?');"><button class="danger" type="submit">Excluir definitivamente</button></form></div>`;
    }

    const suporte = `<form class="inline" method="post" action="/instalacoes/${item.id}/observacao"><input name="observacaoOperacional" value="${escapar(item.observacaoOperacional || '')}" maxlength="500" placeholder="Obs. operacional" style="width:260px;padding:9px"><button class="secondary" type="submit">Salvar obs.</button></form>
          <form id="resetar-senha-${item.id}" class="inline" method="post" action="/instalacoes/${item.id}/resetar-senha" onsubmit="return confirm('Redefinir a senha do painel desta instalação?');"><input name="senhaPainel" type="password" minlength="8" placeholder="Nova senha" required style="width:150px;padding:9px"><button class="secondary" type="submit">Resetar senha</button></form>`;

    if (admin) return `${botoesBase}<div class="actions">${suporte}</div>`;

    return `${botoesBase}<div class="actions">
          <form class="inline" method="post" action="/instalacoes/${item.id}/whatsapp" onsubmit="return confirm('Trocar o WhatsApp encerrará a conexão atual deste robô e gerará um novo QR Code. Continuar?');"><input name="whatsappEsperado" inputmode="numeric" value="${escapar(item.whatsappEsperado || '')}" minlength="10" maxlength="15" placeholder="55 + DDD + número" required style="width:185px;padding:9px"><button class="warning" type="submit">Trocar WhatsApp</button></form>
          ${suporte}
          <form class="inline" method="post" action="/instalacoes/${item.id}/licenca" onsubmit="return confirm('Ativar esta licença comercial para o cliente?');"><select name="tipoLicenca" aria-label="Tipo de licença comercial"><option value="mensal">Mensal</option><option value="semestral">Semestral</option><option value="anual">Anual</option><option value="vitalicia">Vitalícia</option></select><button type="submit">Ativar licença</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/prorrogar"><select name="dias" aria-label="Dias de prorrogação"><option value="15">15 dias</option><option value="30">30 dias</option></select><button class="secondary" type="submit">Prorrogar teste</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/suspender"><button class="warning" type="submit">Suspender</button></form><form class="inline" method="post" action="/instalacoes/${item.id}/arquivar" onsubmit="return confirm('Arquivar esta instalação e parar o robô?');"><button class="secondary" type="submit">Arquivar</button></form>
        </div>`;
}

function cardStatusGeral(rotulo, valor, detalhe, classe = '') {
    return `<div class="status-card ${classe}">
        <div class="status-label">${escapar(rotulo)}</div>
        <div class="status-value">${escapar(valor)}</div>
        <div class="status-detail">${escapar(detalhe)}</div>
    </div>`;
}

function menuMestre(ativo = 'inicio') {
    const itens = [
        ['inicio', '/', 'Início'],
        ['licencas', '/licencas', 'Licenças locais'],
        ['renovacoes', '/renovacoes', 'Renovações'],
        ['instalacoes', '/#instalacoes', 'Instalações'],
        ['nova', '/#nova-instalacao', 'Nova instalação'],
        ['manutencao', '/#manutencao', 'Manutenção']
    ];
    return `<nav class="master-nav">${itens.map(([id, href, texto]) => `<a class="${id === ativo ? 'active' : ''}" href="${href}">${texto}</a>`).join('')}</nav>`;
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
        <div class="row"><div class="label">Última mensagem recebida</div><div>${saude.ultimaMensagemRecebidaEm ?`${escapar(formatarDataHoraPainel(saude.ultimaMensagemRecebidaEm))}${saude.ultimaMensagemRecebidaDe ?` de ${escapar(saude.ultimaMensagemRecebidaDe)}` : ''}` : 'Nenhuma desde o último início'}</div></div>
        <div class="row"><div class="label">Última resposta do robô</div><div>${saude.ultimoEnvioRoboEm ?`${escapar(formatarDataHoraPainel(saude.ultimoEnvioRoboEm))}${saude.ultimoEnvioRoboPara ?` para ${escapar(saude.ultimoEnvioRoboPara)}` : ''}` : 'Nenhuma desde o último início'}</div></div>
        <div class="row"><div class="label">Mensagens recebidas</div><div>${escapar(saude.mensagensRecebidasTotal || 0)} desde o último início</div></div>
        <div class="row"><div class="label">Eventos ignorados</div><div>${escapar(Number(saude.eventosInternosIgnoradosTotal || 0) + Number(saude.conversasNaoIndividuaisIgnoradasTotal || 0))} (${escapar(saude.eventosInternosIgnoradosTotal || 0)} internos, ${escapar(saude.conversasNaoIndividuaisIgnoradasTotal || 0)} grupos/newsletters)</div></div>
        <div class="row"><div class="label">Memória do processo</div><div>${escapar(formatarBytes(saude.memoriaRss || 0))} em uso, heap ${escapar(formatarBytes(saude.memoriaHeapUsado || 0))} de ${escapar(formatarBytes(saude.memoriaHeapTotal || 0))}</div></div>
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
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1480px,calc(100% - 30px));margin:34px auto}h1,h2{margin:0 0 8px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.topbar form{margin:0}.sub{color:#697386}.version-pill{display:inline-flex;margin-top:10px;padding:5px 10px;border-radius:999px;background:#eef1f5;color:#4b5565;font-size:12px;font-weight:800}main>h1:first-of-type,main>h1:first-of-type+.sub,main>h1:first-of-type+.sub+form{display:none}.status-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-top:22px}.status-card{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);padding:18px}.status-label{color:#697386;font-size:13px;font-weight:800}.status-value{font-size:34px;font-weight:900;line-height:1.1;margin-top:8px}.status-detail{color:#697386;font-size:12px;margin-top:8px}.status-card.ok .status-value{color:#047446}.status-card.warn .status-value{color:#a76100}.status-card.error .status-value{color:#c52e35}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);margin-top:22px;padding:22px}.priority-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:16px}.priority-group{border:1px solid #e8ebf0;border-radius:8px;padding:14px;background:#fafbfc}.priority-group h3{margin:0 0 10px;font-size:15px}.priority-item{display:grid;gap:10px;border-left:4px solid #dfe3ea;background:#fff;border-radius:8px;padding:12px;margin-top:10px}.priority-item.warn{border-left-color:#e98a13}.priority-item.error{border-left-color:#dc3545}.empty.compact{padding:16px}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:700}input,select,textarea{border:1px solid #dfe3ea;border-radius:8px;padding:11px;font:inherit}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.button.smallbtn,button.smallbtn{padding:7px 10px;font-size:13px}.secondary{background:#eef1f5;color:#263247}.danger{background:#dc3545}.warning{background:#e98a13}.actions{display:flex;gap:7px;flex-wrap:wrap}.support-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.full{grid-column:1/-1}.notice{padding:14px;border-radius:8px;margin-top:18px;background:#dff8ee;color:#047446;font-weight:700}.errorbox{background:#ffe5e7;color:#c52e35}.credentials{background:#fff8dd;border:1px solid #f2d56b;padding:16px;border-radius:8px;margin-top:18px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:12px 9px;border-bottom:1px solid #e8ebf0;text-align:left;vertical-align:top}th{font-size:12px;color:#697386;text-transform:uppercase}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.badge.ok{background:#dff8ee;color:#047446}.badge.warn{background:#fff2dc;color:#a76100}.badge.error{background:#ffe5e7;color:#c52e35}.small{font-size:12px;color:#697386;margin-top:4px}.dangertext{color:#c52e35;font-weight:700}.diagnostic{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;max-width:390px}.diagnostic span{background:#f4f6f9;border:1px solid #e8ebf0;border-radius:999px;color:#4b5565;font-size:12px;padding:4px 8px}.event-list{display:grid;gap:5px;margin-top:8px;color:#596273;font-size:12px;line-height:1.35}.event-list strong{color:#263247}.readiness-list{margin:7px 0 5px;padding:0;list-style:none;color:#697386;font-size:12px;line-height:1.4}.readiness-list li{display:grid;grid-template-columns:minmax(130px,1fr) auto;align-items:start;gap:7px;padding:6px 0;border-bottom:1px solid #eef1f5}.readiness-list a,.readiness-action{color:#315bd6;font-weight:800;text-decoration:none;white-space:nowrap}.readiness-action{display:inline-flex;margin-top:6px;font-size:12px}.inline{display:inline}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:1200px){.priority-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:1100px){.status-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:900px){.topbar{display:block}.fields{grid-template-columns:1fr}.status-grid{grid-template-columns:1fr 1fr}.priority-grid{grid-template-columns:1fr}.table-wrap{overflow:auto}table{min-width:1300px}}@media(max-width:560px){.status-grid{grid-template-columns:1fr}}
    </style><style>.master-nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.master-nav a{display:inline-flex;align-items:center;border-radius:8px;padding:10px 13px;background:#eef1f5;color:#263247;text-decoration:none;font-weight:800}.master-nav a.active{background:#4368e8;color:#fff}</style></head><body><main>
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
    ${menuMestre('inicio')}
    ${opcoes.mensagem ?`<div class="notice">${escapar(opcoes.mensagem)}</div>` : ''}
    ${opcoes.erro ?`<div class="notice errorbox">${escapar(opcoes.erro)}</div>` : ''}
    ${criado ?`<div class="credentials"><strong>Instalação criada.</strong><br>URL: <a href="https://${escapar(criado.dominio)}" target="_blank">https://${escapar(criado.dominio)}</a><br>Usuário: ${escapar(criado.usuarioPainel)}<br>Senha inicial: <strong>${escapar(criado.senhaInicial)}</strong><div class="small">Anote agora. A senha não fica armazenada no Painel Mestre.</div></div>` : ''}
    <section class="status-grid" aria-label="Status geral das instalações">
        ${cardStatusGeral('Instalações', statusGeral.total, `${statusGeral.comerciais} cliente(s), ${statusGeral.administradoras} administradora(s)`)}
        ${cardStatusGeral('WhatsApp conectado', statusGeral.whatsappConectado, `${statusGeral.aguardandoWhatsapp} aguardando conex\u00e3o, ${statusGeral.reconexaoPendente} acima de 5min`, statusGeral.aguardandoWhatsapp ? 'warn' : 'ok')}
        ${cardStatusGeral('Em avaliação', statusGeral.emAvaliacao, 'Instalações em período de teste', statusGeral.emAvaliacao ? 'warn' : '')}
        ${cardStatusGeral('Prontas para venda', statusGeral.prontasParaVenda, `de ${statusGeral.comerciais} cliente(s) ativo(s)`, statusGeral.prontasParaVenda === statusGeral.comerciais && statusGeral.comerciais ? 'ok' : 'warn')}
        ${cardStatusGeral('Com atenção', statusGeral.comAtencao, 'Erro, licença vencida ou WhatsApp pendente', statusGeral.comAtencao ? 'error' : 'ok')}
        ${cardStatusGeral('Processos off-line', statusGeral.processosIndisponiveis, 'Sem resposta na porta local', statusGeral.processosIndisponiveis ? 'error' : 'ok')}
        ${cardStatusGeral('Licenças vencidas', statusGeral.licencasVencidas, `${statusGeral.suspensas} instalação(ões) suspensa(s)`, statusGeral.licencasVencidas || statusGeral.suspensas ? 'error' : 'ok')}
        ${cardStatusGeral('RAM livre', `${recursos.memoriaLivreMb ?? '-'} MB`, `de ${recursos.memoriaTotalMb ?? '-'} MB`, Number(recursos.memoriaLivreMb || 0) < 512 ? 'error' : Number(recursos.memoriaLivreMb || 0) < 1024 ? 'warn' : 'ok')}
        ${cardStatusGeral('Processos Chrome', recursos.processosChrome ?? '-', 'Navegadores usados pelos robôs', Number(recursos.processosChrome || 0) > 30 ? 'warn' : '')}
        ${cardStatusGeral('Disco livre', recursos.discoLivreGb == null ? '-' : `${recursos.discoLivreGb} GB`, recursos.discoTotalGb == null ? 'Métrica indisponível' : `de ${recursos.discoTotalGb} GB`, Number(recursos.discoLivreGb || 0) < 5 ? 'error' : 'ok')}
    </section>
    ${secaoPrioridades(instalacoes)}
    ${painelChecklistComercial(instalacoes)}
    <section class="panel" id="manutencao"><h2>Limpeza segura</h2><div class="sub">Mantém os backups mais recentes de cada instalação e remove somente sessões de instalações já arquivadas.</div>
      <form class="actions" method="post" action="/manutencao/limpar" onsubmit="return confirm('Executar a limpeza segura? Bancos e sessões dos robôs ativos serão preservados.');">
        <label>Backups mantidos por instalação<input type="number" name="retencao" value="10" min="3" max="100" required style="width:150px"></label>
        <div style="align-self:end"><button type="submit">Executar limpeza segura</button></div>
      </form>
    </section>
    <section class="panel" id="nova-instalacao"><h2>Nova instalação</h2><div class="sub">Crie um painel, banco e robô independentes</div>
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
        <td><strong>${escapar(item.nome)}</strong>${perfilInstalacaoHtml(item)}<div class="small">${escapar(item.whatsappEsperado || 'WhatsApp não informado')} · avisos ${String(item.horaEnvio ?? 9).padStart(2, '0')}:${String(item.minutoEnvio ?? 0).padStart(2, '0')}</div>${item.observacaoOperacional ?`<div class="small"><strong>Obs. operacional:</strong> ${escapar(item.observacaoOperacional)}</div>` : ''}</td>
        <td><a href="https://${escapar(item.dominio)}" target="_blank">${escapar(item.dominio)}</a><div class="small">${escapar(item.pastaDados)}</div><div class="small"><strong>Uso: ${escapar(formatarBytes(item.usoDiscoBytes))}</strong></div></td>
        <td>${resumoDiagnostico(item)}</td><td>${escapar(item.estadoLicenca?.rotulo || item.tipoLicenca)}${item.estadoLicenca?.vencimento ?`<div class="small">até ${escapar(item.estadoLicenca.vencimento.split('-').reverse().join('/'))}</div>` : item.diasAvaliacao ?` (${item.diasAvaliacao} dias)` : ''}</td><td>${resumoProntidaoComercial(item)}</td>
        <td><span class="badge ${item.estadoLicenca && !item.estadoLicenca.permitida ?'error' : statusClasse(item.status)}">${escapar(item.estadoLicenca && !item.estadoLicenca.permitida ?item.estadoLicenca.rotulo : item.status)}</span>${item.detalheStatus ?`<div class="small">${escapar(item.detalheStatus)}</div>` : ''}${eventosRecentesHtml(item)}</td>
        <td id="acoes-${item.id}">${acoesInstalacaoHtml(item)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhuma instalação encontrada para este filtro.</div>'}
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

function secaoCodigoLicencaLocal(opcoes = {}) {
    const codigoGerado = opcoes.codigoLicenca || '';
    return `<section class="panel"><h2>Licença para instalação local</h2><div class="sub">Use quando o cliente instalar o sistema no próprio computador. Ele envia o ID da instalação, você gera o código e ele cola na tela de licença.</div>
      ${codigoGerado ?`<div class="credentials"><strong>Código gerado.</strong><div class="small">Envie este código ao cliente aplicar em /licenca.</div><textarea readonly style="width:100%;min-height:130px;margin-top:10px;border:1px solid #dfe3ea;border-radius:8px;padding:12px;font:inherit">${escapar(codigoGerado)}</textarea></div>` : ''}
      <form class="fields" method="post" action="/licencas/codigo">
        <label>ID da instalação<input name="instalacaoId" value="${escapar(opcoes.instalacaoId || '')}" required></label>
        <label>Cliente / Empresa<input name="licencaCliente" value="${escapar(opcoes.licencaCliente || '')}" required></label>
        <label>Telefone<input name="licencaTelefone" value="${escapar(opcoes.licencaTelefone || '')}"></label>
        <label>Tipo de licença<select name="licencaTipo"><option value="avaliacao_15">Avaliação 15 dias</option><option value="avaliacao_30">Avaliação 30 dias</option><option value="mensal">Mensal</option><option value="semestral">Semestral</option><option value="anual">Anual</option><option value="vitalicia">Vitalícia</option><option value="suspensa">Suspensa</option></select></label>
        <label>Vencimento manual<input type="date" name="licencaVencimento" value="${escapar(opcoes.licencaVencimento || '')}"></label>
        <label>Observação<input name="licencaObservacoes" value="${escapar(opcoes.licencaObservacoes || '')}" placeholder="Opcional"></label>
        <div style="align-self:end"><button type="submit">Gerar código</button></div>
      </form>
    </section>`;
}

function opcoesTipoLicencaSelect(tipoAtual = '') {
    const atual = String(tipoAtual || '');
    return [
        ['', 'Selecione...'],
        ['avaliacao_15', 'Avaliação 15 dias'],
        ['avaliacao_30', 'Avaliação 30 dias'],
        ['mensal', 'Mensal'],
        ['semestral', 'Semestral'],
        ['anual', 'Anual'],
        ['vitalicia', 'Vitalícia'],
        ['suspensa', 'Suspensa']
    ].map(([valor, texto]) => `<option value="${valor}" ${valor === atual ? 'selected' : ''}>${texto}</option>`).join('');
}

function formularioCodigoLicencaLocal(opcoes = {}) {
    const codigoGerado = opcoes.codigoLicenca || '';
    const resumo = [
        opcoes.licencaCliente ? `Cliente: ${opcoes.licencaCliente}` : '',
        opcoes.instalacaoId ? `ID: ${opcoes.instalacaoId}` : '',
        opcoes.machineFingerprint ? `Máquina: ${opcoes.machineFingerprint}` : '',
        opcoes.licencaVencimento ? `Vencimento: ${formatarDataPainel(opcoes.licencaVencimento)}` : ''
    ].filter(Boolean).join(' | ');

    return `<section class="panel" id="gerar-licenca"><h2>Licença para instalação local</h2><div class="sub">Use quando o cliente instalar o sistema no próprio computador. Ele envia o ID da instalação, você gera o código e ele cola na tela de licença.</div>
      ${codigoGerado ?`<div class="credentials"><div class="topbar"><div><strong>Código gerado.</strong><div class="small">${escapar(resumo || 'Envie este código ao cliente aplicar em /licenca.')}</div></div><button class="secondary smallbtn" type="button" data-copy-license>Copiar código</button></div><textarea id="codigoLicencaGerado" readonly style="width:100%;min-height:130px;margin-top:10px;border:1px solid #dfe3ea;border-radius:8px;padding:12px;font:inherit">${escapar(codigoGerado)}</textarea></div>` : ''}
      <form class="fields" method="post" action="/licencas/codigo">
        <label>ID da instalação<input name="instalacaoId" value="${escapar(opcoes.instalacaoId || '')}" required></label>
        <label>Chave da máquina<input name="machineFingerprint" value="${escapar(opcoes.machineFingerprint || '')}" required></label>
        <label>Cliente / Empresa<input name="licencaCliente" value="${escapar(opcoes.licencaCliente || '')}" required></label>
        <label>Telefone<input name="licencaTelefone" value="${escapar(opcoes.licencaTelefone || '')}"></label>
        <label>Tipo de licença<select name="licencaTipo">${opcoesTipoLicencaSelect(opcoes.licencaTipo)}</select></label>
        <label>Vencimento manual<input type="date" name="licencaVencimento" value="${escapar(opcoes.licencaVencimento || '')}"></label>
        <label>Observação<input name="licencaObservacoes" value="${escapar(opcoes.licencaObservacoes || '')}" placeholder="Opcional"></label>
        <div style="align-self:end"><button type="submit">Gerar código</button></div>
      </form>
    </section>`;
}

function secaoLicencasLocaisGerenciamento(licencas = []) {
    const vencendo = licencas.filter(item => ['warn', 'error'].includes(estadoLicencaLocal(item).classe)).length;

    return `<section class="panel" id="licencas-locais"><div class="topbar"><div><h2>Licenças locais emitidas</h2><div class="sub">${licencas.length} licença(s) ativa(s), ${vencendo} com vencimento ou atenção</div></div><a class="button secondary" href="#gerar-licenca">Gerar nova</a></div>
      <div class="table-wrap">
      ${licencas.length ? `<table><thead><tr><th>Cliente</th><th>ID da instalação</th><th>Vencimento</th><th>Status</th><th>Última consulta</th><th>Ações</th></tr></thead><tbody>${licencas.map(item => {
        const estado = estadoLicencaLocal(item);
        const tipo = item.vitalicia === '1' ? 'Vitalícia' : item.suspensa === '1' ? 'Suspensa' : item.tipo || '-';
        return `<tr>
          <td><strong>${escapar(item.cliente)}</strong><div class="small">${escapar(item.telefone || '-')}</div>${item.observacoes ? `<div class="small">${escapar(item.observacoes)}</div>` : ''}</td>
          <td><code>${escapar(item.instalacaoId)}</code>${item.machineFingerprint ? `<div class="small">Máquina: <code>${escapar(item.machineFingerprint)}</code></div>` : '<div class="small">Máquina não vinculada</div>'}</td>
          <td><strong>${escapar(item.vencimento ? formatarDataPainel(item.vencimento) : 'Sem vencimento')}</strong><div class="small">${escapar(tipo)}</div></td>
          <td><span class="badge ${estado.classe}">${escapar(estado.texto)}</span><div class="small">${escapar(estado.detalhe)}</div></td>
          <td>${escapar(item.ultimoPingEm ? formatarDataHoraPainel(item.ultimoPingEm) : 'Sem consulta')}<div class="small">${escapar(item.ultimoStatus || '')}</div></td>
          <td>
            <div class="actions">
              <a class="button smallbtn secondary" href="/licencas/${encodeURIComponent(item.instalacaoId)}/historico">Histórico</a>
              <form class="inline" method="post" action="/licencas/codigo">
                <input type="hidden" name="instalacaoId" value="${escapar(item.instalacaoId)}">
                <input type="hidden" name="machineFingerprint" value="${escapar(item.machineFingerprint || '')}">
                <input type="hidden" name="licencaCliente" value="${escapar(item.cliente)}">
                <input type="hidden" name="licencaTelefone" value="${escapar(item.telefone || '')}">
                <input type="hidden" name="licencaObservacoes" value="${escapar(item.observacoes || '')}">
                <select name="licencaTipo" style="max-width:160px;margin-bottom:6px">${opcoesTipoLicencaSelect(tipoLicencaFormulario(item.tipo))}</select>
                <input type="date" name="licencaVencimento" value="${escapar(item.vencimento || '')}" title="Opcional: defina uma data manual" style="max-width:160px;margin-bottom:6px">
                <button class="smallbtn" type="submit">Gerar renovação</button>
              </form>
              <details style="width:100%;margin-top:6px">
                <summary class="smallbtn secondary" style="display:inline-flex;cursor:pointer">Transferir</summary>
                <form method="post" action="/licencas/${encodeURIComponent(item.instalacaoId)}/transferir" style="display:grid;gap:6px;margin-top:8px;min-width:260px">
                  <input name="novaInstalacaoId" placeholder="Novo ID da instalação (opcional)">
                  <input name="novaMachineFingerprint" required placeholder="Nova chave da máquina">
                  <select name="licencaTipo">${opcoesTipoLicencaSelect(tipoLicencaFormulario(item.tipo))}</select>
                  <input type="date" name="licencaVencimento" value="${escapar(item.vencimento || '')}" title="Opcional: novo vencimento">
                  <input name="motivoTransferencia" placeholder="Motivo: formatou, trocou PC...">
                  <button class="smallbtn" type="submit">Vincular / transferir</button>
                </form>
              </details>
              ${item.suspensa === '1'
                ? `<form class="inline" method="post" action="/licencas/${encodeURIComponent(item.instalacaoId)}/reativar-local" onsubmit="return confirm('Reativar esta licença local?');"><button class="smallbtn" type="submit">Reativar</button></form>`
                : `<form class="inline" method="post" action="/licencas/${encodeURIComponent(item.instalacaoId)}/suspender-local" onsubmit="return confirm('Suspender esta licença local? O cliente ficará bloqueado ao consultar o Painel Mestre.');"><button class="smallbtn warning" type="submit">Suspender</button></form>`}
              <form class="inline" method="post" action="/licencas/${encodeURIComponent(item.instalacaoId)}/apagar" onsubmit="return confirm('Apagar esta licença local da lista ativa? O histórico será preservado.');"><button class="smallbtn danger" type="submit">Apagar</button></form>
            </div>
          </td>
        </tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">Nenhuma licença local emitida ainda.</div>'}
      </div>
    </section>`;
}

function paginaLicencasLocais(licencas = [], opcoes = {}) {
    const versaoSistema = packageInfo.version || '1.0.0';
    const resumo = resumoLicencasLocais(licencas);
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Licenças locais - Painel Mestre</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1480px,calc(100% - 30px));margin:34px auto}h1,h2{margin:0 0 8px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sub{color:#697386}.version-pill{display:inline-flex;margin-top:10px;padding:5px 10px;border-radius:999px;background:#eef1f5;color:#4b5565;font-size:12px;font-weight:800}.master-nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.master-nav a{display:inline-flex;align-items:center;border-radius:8px;padding:10px 13px;background:#eef1f5;color:#263247;text-decoration:none;font-weight:800}.master-nav a.active{background:#4368e8;color:#fff}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);margin-top:22px;padding:22px}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}label{display:grid;gap:6px;font-weight:700}input,select,textarea{border:1px solid #dfe3ea;border-radius:8px;padding:11px;font:inherit}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.smallbtn{padding:7px 10px;font-size:13px}.secondary{background:#eef1f5;color:#263247}.warning{background:#f59e0b;color:#fff}.danger{background:#dc3545}.actions{display:flex;gap:7px;flex-wrap:wrap}.inline{display:inline}.notice{padding:14px;border-radius:8px;margin-top:18px;background:#dff8ee;color:#047446;font-weight:700}.errorbox{background:#ffe5e7;color:#c52e35}.credentials{background:#fff8dd;border:1px solid #f2d56b;padding:16px;border-radius:8px;margin-top:18px}.license-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-top:22px}.summary-card{background:#fff;border:1px solid #e2e6ed;border-radius:8px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,.05)}.summary-card strong{display:block;font-size:32px;margin:8px 0}.summary-card.ok strong{color:#047446}.summary-card.warn strong{color:#a76100}.summary-card.error strong{color:#c52e35}.attention-list{display:grid;gap:10px}.attention-item{display:grid;grid-template-columns:1fr 190px auto;gap:12px;align-items:center;border:1px solid #e8ebf0;border-radius:8px;padding:12px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:12px 9px;border-bottom:1px solid #e8ebf0;text-align:left;vertical-align:top}th{font-size:12px;color:#697386;text-transform:uppercase}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.badge.ok{background:#dff8ee;color:#047446}.badge.warn{background:#fff2dc;color:#a76100}.badge.error{background:#ffe5e7;color:#c52e35}.small{font-size:12px;color:#697386;margin-top:4px}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:1100px){.license-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.attention-item{grid-template-columns:1fr}}@media(max-width:900px){.topbar{display:block}.fields{grid-template-columns:1fr}.table-wrap{overflow:auto}table{min-width:1200px}.license-summary{grid-template-columns:1fr 1fr}}
    </style></head><body><main><div class="topbar"><div><h1>Painel Mestre</h1><div class="sub">Gestão de licenças locais</div><div class="version-pill">Versão ${escapar(versaoSistema)}</div></div><form method="post" action="/logout"><button class="secondary" type="submit">Sair</button></form></div>
    ${menuMestre('licencas')}
    ${opcoes.mensagem ?`<div class="notice">${escapar(opcoes.mensagem)}</div>` : ''}
    ${opcoes.erro ?`<div class="notice errorbox">${escapar(opcoes.erro)}</div>` : ''}
    ${formularioCodigoLicencaLocal(opcoes.codigoLicenca || {})}
    ${secaoResumoLicencasLocais(resumo)}
    ${secaoAtencaoLicencasLocais(resumo)}
    ${secaoLicencasLocaisGerenciamento(licencas)}
    <script>
    document.querySelector('[data-copy-license]')?.addEventListener('click', async (event) => {
        const campo = document.getElementById('codigoLicencaGerado');
        if (!campo) return;
        try {
            await navigator.clipboard.writeText(campo.value);
            event.currentTarget.textContent = 'Copiado';
        } catch (_) {
            campo.focus();
            campo.select();
            document.execCommand('copy');
            event.currentTarget.textContent = 'Copiado';
        }
    });
    function dataLicencaPorTipo(tipo) {
        const data = new Date();
        data.setHours(12, 0, 0, 0);
        const dias = {
            avaliacao_15: 15,
            avaliacao_30: 30,
            mensal: 30,
            semestral: 180,
            anual: 365
        };
        if (tipo === 'vitalicia') {
            data.setFullYear(data.getFullYear() + 100);
        } else if (dias[tipo]) {
            data.setDate(data.getDate() + dias[tipo]);
        } else {
            return '';
        }
        return data.toISOString().slice(0, 10);
    }
    document.querySelectorAll('select[name="licencaTipo"]').forEach((select) => {
        select.addEventListener('change', () => {
            const form = select.closest('form');
            const campoVencimento = form?.querySelector('input[name="licencaVencimento"]');
            if (!campoVencimento) return;
            campoVencimento.value = dataLicencaPorTipo(select.value);
        });
    });
    </script></main></body></html>`;
}

function paginaHistoricoLicencaLocal(licenca, eventos = []) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Histórico da licença - Painel Mestre</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1100px,calc(100% - 30px));margin:34px auto}.button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none}h1{margin:18px 0 6px}.sub{color:#697386;margin-bottom:18px}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);overflow:hidden}.event{display:grid;grid-template-columns:160px 150px 1fr;gap:14px;padding:14px 16px;border-bottom:1px solid #e8ebf0}.event:last-child{border-bottom:0}.date,.type{font-size:13px;color:#697386;font-weight:800}.msg{font-weight:800}.details{margin-top:5px;color:#697386;font-size:13px;line-height:1.4}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:720px){.event{grid-template-columns:1fr}.date,.type{font-size:12px}}
    </style></head><body><main><a class="button" href="/licencas#licencas-locais">Voltar</a><h1>Histórico da licença</h1><div class="sub">${escapar(licenca.cliente)} | ${escapar(licenca.instalacaoId)} | vencimento ${escapar(licenca.vencimento ? formatarDataPainel(licenca.vencimento) : 'sem vencimento')}</div>
    <section class="panel">
        ${eventos.length ? eventos.map(evento => `<div class="event">
            <div class="date">${escapar(formatarDataHoraPainel(evento.criadoEm))}</div>
            <div class="type">${escapar(evento.tipo)}</div>
            <div><div class="msg">${escapar(evento.mensagem)}</div>${evento.detalhes ?`<div class="details">${escapar(evento.detalhes)}</div>` : ''}</div>
        </div>`).join('') : '<div class="empty">Nenhum evento registrado para esta licença.</div>'}
    </section></main></body></html>`;
}

function consultaAposUltimaEmissao(licenca = {}) {
    if (!licenca.ultimoPingEm || !licenca.atualizadoEm) return false;
    const consulta = new Date(licenca.ultimoPingEm).getTime();
    const emissao = new Date(licenca.atualizadoEm).getTime();
    return Number.isFinite(consulta) && Number.isFinite(emissao) && consulta >= emissao;
}

function mensagemRenovacaoLicencaLocal(licenca = {}) {
    const vencimento = licenca.vencimento ? formatarDataPainel(licenca.vencimento) : 'sem data definida';
    const estado = estadoLicencaLocal(licenca);
    return `Olá! Sua licença do painel ${licenca.cliente || 'Julian Play'} está ${estado.texto.toLowerCase()} com vencimento em ${vencimento}. Para manter o sistema ativo, solicite a renovação comigo.`;
}

function filtrarLicencasRenovacao(licencas = [], filtros = {}) {
    const filtro = String(filtros.filtro || 'todas');
    const busca = String(filtros.busca || '').trim().toLowerCase();

    return licencas.filter((licenca) => {
        const estado = estadoLicencaLocal(licenca);
        const dias = diasAteData(licenca.vencimento);
        const textoBusca = [
            licenca.cliente,
            licenca.telefone,
            licenca.instalacaoId,
            licenca.machineFingerprint,
            licenca.observacoes
        ].join(' ').toLowerCase();

        if (busca && !textoBusca.includes(busca)) return false;
        if (filtro === 'vencendo7') return dias !== null && dias >= 0 && dias <= 7;
        if (filtro === 'vencendo15') return dias !== null && dias >= 0 && dias <= 15;
        if (filtro === 'vencendo30') return dias !== null && dias >= 0 && dias <= 30;
        if (filtro === 'vencidas') return estado.texto === 'Vencida';
        if (filtro === 'suspensas') return String(licenca.suspensa || '0') === '1';
        if (filtro === 'semconsulta') return licencaLocalSemConsultaRecente(licenca);
        if (filtro === 'bloqueadas') return licencaLocalBloqueadaPorMaquina(licenca);
        return true;
    });
}

function opcoesFiltroRenovacoes(filtroAtual = 'todas') {
    return [
        ['todas', 'Todas'],
        ['vencendo7', 'Vencem em 7 dias'],
        ['vencendo15', 'Vencem em 15 dias'],
        ['vencendo30', 'Vencem em 30 dias'],
        ['vencidas', 'Vencidas'],
        ['suspensas', 'Suspensas'],
        ['semconsulta', 'Sem consulta'],
        ['bloqueadas', 'Máquina bloqueada']
    ].map(([valor, texto]) => `<option value="${valor}" ${valor === filtroAtual ? 'selected' : ''}>${texto}</option>`).join('');
}

function paginaRenovacoesLicencasLocais(licencas = [], opcoes = {}) {
    const filtros = {
        filtro: String(opcoes.filtro || 'todas'),
        busca: String(opcoes.busca || '')
    };
    const lista = filtrarLicencasRenovacao(licencas, filtros);
    const resumo = resumoLicencasLocais(licencas);
    const versaoSistema = packageInfo.version || '1.0.0';
    const codigoGerado = opcoes.codigoLicenca?.codigoLicenca || '';
    const resumoCodigo = opcoes.codigoLicenca ? [
        opcoes.codigoLicenca.licencaCliente ? `Cliente: ${opcoes.codigoLicenca.licencaCliente}` : '',
        opcoes.codigoLicenca.licencaVencimento ? `Vencimento: ${formatarDataPainel(opcoes.codigoLicenca.licencaVencimento)}` : ''
    ].filter(Boolean).join(' | ') : '';

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renovações - Painel Mestre</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(1480px,calc(100% - 30px));margin:34px auto}h1,h2{margin:0 0 8px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sub{color:#697386}.version-pill{display:inline-flex;margin-top:10px;padding:5px 10px;border-radius:999px;background:#eef1f5;color:#4b5565;font-size:12px;font-weight:800}.master-nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.master-nav a{display:inline-flex;align-items:center;border-radius:8px;padding:10px 13px;background:#eef1f5;color:#263247;text-decoration:none;font-weight:800}.master-nav a.active{background:#4368e8;color:#fff}.panel{background:#fff;border:1px solid #e2e6ed;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.05);margin-top:22px;padding:22px}.filters{display:grid;grid-template-columns:220px 1fr auto;gap:10px;align-items:end}.renewal-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:22px}.summary-card{background:#fff;border:1px solid #e2e6ed;border-radius:8px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,.05)}.summary-card strong{display:block;font-size:30px;margin:8px 0}.summary-card.ok strong{color:#047446}.summary-card.warn strong{color:#a76100}.summary-card.error strong{color:#c52e35}label{display:grid;gap:6px;font-weight:800}input,select,textarea{border:1px solid #dfe3ea;border-radius:8px;padding:11px;font:inherit}.button,button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;padding:10px 14px;background:#4368e8;color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.smallbtn{padding:7px 10px;font-size:13px}.secondary{background:#eef1f5;color:#263247}.warning{background:#f59e0b;color:#fff}.danger{background:#dc3545}.notice{padding:14px;border-radius:8px;margin-top:18px;background:#dff8ee;color:#047446;font-weight:700}.errorbox{background:#ffe5e7;color:#c52e35}.credentials{background:#fff8dd;border:1px solid #f2d56b;padding:16px;border-radius:8px;margin-top:18px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;margin-top:10px;min-width:1180px}th,td{padding:12px 9px;border-bottom:1px solid #e8ebf0;text-align:left;vertical-align:top}th{font-size:12px;color:#697386;text-transform:uppercase}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.badge.ok{background:#dff8ee;color:#047446}.badge.warn{background:#fff2dc;color:#a76100}.badge.error{background:#ffe5e7;color:#c52e35}.small{font-size:12px;color:#697386;margin-top:4px}.actions{display:flex;gap:7px;flex-wrap:wrap}.inline{display:inline}.renew-form{display:grid;grid-template-columns:150px 145px auto;gap:6px;align-items:center}.empty{text-align:center;padding:30px;color:#697386}@media(max-width:980px){.filters{grid-template-columns:1fr}.renewal-summary{grid-template-columns:1fr 1fr}.topbar{display:block}}@media(max-width:620px){.renewal-summary{grid-template-columns:1fr}}
    </style></head><body><main><div class="topbar"><div><h1>Painel Mestre</h1><div class="sub">Renovações de licenças locais</div><div class="version-pill">Versão ${escapar(versaoSistema)}</div></div><form method="post" action="/logout"><button class="secondary" type="submit">Sair</button></form></div>
    ${menuMestre('renovacoes')}
    ${opcoes.mensagem ?`<div class="notice">${escapar(opcoes.mensagem)}</div>` : ''}
    ${opcoes.erro ?`<div class="notice errorbox">${escapar(opcoes.erro)}</div>` : ''}
    ${codigoGerado ?`<div class="credentials"><div class="topbar"><div><strong>Código de renovação gerado.</strong><div class="small">${escapar(resumoCodigo || 'Envie este código ao cliente aplicar em /licenca.')}</div></div><button class="secondary smallbtn" type="button" data-copy-license>Copiar código</button></div><textarea id="codigoLicencaGerado" readonly style="width:100%;min-height:130px;margin-top:10px;border:1px solid #dfe3ea;border-radius:8px;padding:12px;font:inherit">${escapar(codigoGerado)}</textarea></div>` : ''}
    <section class="renewal-summary">
        ${cardResumoLicenca('Vencem em 7 dias', resumo.atencao.filter(item => item.motivos.includes('vence em até 7 dias')).length, 'prioridade comercial', 'warn')}
        ${cardResumoLicenca('Vencidas', resumo.vencidas, 'renovar ou suspender', resumo.vencidas ? 'error' : 'ok')}
        ${cardResumoLicenca('Sem consulta', resumo.semConsulta, 'cliente não confirmou', resumo.semConsulta ? 'warn' : 'ok')}
        ${cardResumoLicenca('Máquina bloqueada', resumo.bloqueadasMaquina, 'instalação diferente', resumo.bloqueadasMaquina ? 'error' : 'ok')}
        ${cardResumoLicenca('Suspensas', resumo.suspensas, 'bloqueadas por você', resumo.suspensas ? 'error' : 'ok')}
    </section>
    <section class="panel">
        <div class="topbar"><div><h2>Fila de renovação</h2><div class="sub">${lista.length} licença(s) exibida(s)</div></div><a class="button secondary" href="/licencas#gerar-licenca">Gerar licença nova</a></div>
        <form class="filters" method="get" action="/renovacoes">
            <label>Filtro<select name="filtro">${opcoesFiltroRenovacoes(filtros.filtro)}</select></label>
            <label>Busca<input name="busca" value="${escapar(filtros.busca)}" placeholder="Cliente, telefone, ID ou observação"></label>
            <button type="submit">Filtrar</button>
        </form>
        <div class="table-wrap">
        ${lista.length ? `<table><thead><tr><th>Cliente</th><th>Licença</th><th>Consulta</th><th>Último código</th><th>Renovar</th><th>Ações</th></tr></thead><tbody>${lista.map((item) => {
            const estado = estadoLicencaLocal(item);
            const consultouDepois = consultaAposUltimaEmissao(item);
            const mensagem = mensagemRenovacaoLicencaLocal(item);
            return `<tr>
                <td><strong>${escapar(item.cliente || '-')}</strong><div class="small">${escapar(item.telefone || '-')}</div>${item.observacoes ? `<div class="small">${escapar(item.observacoes)}</div>` : ''}</td>
                <td><span class="badge ${estado.classe}">${escapar(estado.texto)}</span><div class="small">${escapar(estado.detalhe)}</div><div class="small">Vencimento: ${escapar(item.vencimento ? formatarDataPainel(item.vencimento) : 'sem vencimento')}</div></td>
                <td>${escapar(item.ultimoPingEm ? formatarDataHoraPainel(item.ultimoPingEm) : 'Sem consulta')}<div class="small">${consultouDepois ? 'Cliente já consultou após a última emissão' : 'Ainda não consultou após a última emissão'}</div></td>
                <td>${item.codigo ? '<span class="badge ok">Disponível</span>' : '<span class="badge warn">Sem código</span>'}<div class="small">${escapar(item.atualizadoEm ? `Emitido em ${formatarDataHoraPainel(item.atualizadoEm)}` : '-')}</div></td>
                <td>
                    <form class="renew-form" method="post" action="/renovacoes/codigo">
                        <input type="hidden" name="instalacaoId" value="${escapar(item.instalacaoId)}">
                        <input type="hidden" name="machineFingerprint" value="${escapar(item.machineFingerprint || '')}">
                        <input type="hidden" name="licencaCliente" value="${escapar(item.cliente || '')}">
                        <input type="hidden" name="licencaTelefone" value="${escapar(item.telefone || '')}">
                        <input type="hidden" name="licencaObservacoes" value="${escapar(item.observacoes || '')}">
                        <select name="licencaTipo">${opcoesTipoLicencaSelect(tipoLicencaFormulario(item.tipo))}</select>
                        <input type="date" name="licencaVencimento" value="${escapar(item.vencimento || '')}">
                        <button class="smallbtn" type="submit">Gerar</button>
                    </form>
                </td>
                <td><div class="actions">
                    <button class="secondary smallbtn" type="button" data-copy-text="${escapar(mensagem)}">Copiar mensagem</button>
                    ${item.codigo ? `<button class="secondary smallbtn" type="button" data-copy-text="${escapar(item.codigo)}">Copiar último código</button>` : ''}
                    <a class="button smallbtn secondary" href="/licencas/${encodeURIComponent(item.instalacaoId)}/historico">Histórico</a>
                    <a class="button smallbtn secondary" href="/licencas#licencas-locais">Ver licença</a>
                </div></td>
            </tr>`;
        }).join('')}</tbody></table>` : '<div class="empty">Nenhuma licença encontrada para este filtro.</div>'}
        </div>
    </section>
    <script>
    function dataLicencaPorTipo(tipo) {
        const data = new Date();
        data.setHours(12, 0, 0, 0);
        const dias = { avaliacao_15: 15, avaliacao_30: 30, mensal: 30, semestral: 180, anual: 365 };
        if (tipo === 'vitalicia') data.setFullYear(data.getFullYear() + 100);
        else if (dias[tipo]) data.setDate(data.getDate() + dias[tipo]);
        else return '';
        return data.toISOString().slice(0, 10);
    }
    document.querySelectorAll('select[name="licencaTipo"]').forEach((select) => {
        select.addEventListener('change', () => {
            const campo = select.closest('form')?.querySelector('input[name="licencaVencimento"]');
            if (campo) campo.value = dataLicencaPorTipo(select.value);
        });
    });
    document.querySelector('[data-copy-license]')?.addEventListener('click', async (event) => {
        const campo = document.getElementById('codigoLicencaGerado');
        if (!campo) return;
        await navigator.clipboard.writeText(campo.value);
        event.currentTarget.textContent = 'Copiado';
    });
    document.querySelectorAll('[data-copy-text]').forEach((botao) => {
        botao.addEventListener('click', async () => {
            await navigator.clipboard.writeText(botao.getAttribute('data-copy-text') || '');
            botao.textContent = 'Copiado';
        });
    });
    </script></main></body></html>`;
}

function urlPublicaMestre(req) {
    const configurada = String(process.env.MASTER_PUBLIC_URL || '').trim();
    if (configurada) return configurada.replace(/\/+$/, '');
    const protocolo = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
        ? 'https'
        : 'http';
    return `${protocolo}://${req.headers.host}`;
}

async function salvarLicencaLocalGerada(dados = {}) {
    await masterDb.executar(
        `INSERT INTO licencas_locais (
            instalacaoId, cliente, telefone, machineFingerprint, tipo, ativacao, vencimento, vitalicia,
            suspensa, codigo, observacoes, apagada, apagadaEm, transferida, transferidaEm, transferidaPara, atualizadoEm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0', NULL, '0', NULL, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(instalacaoId) DO UPDATE SET
            cliente = excluded.cliente,
            telefone = excluded.telefone,
            machineFingerprint = excluded.machineFingerprint,
            tipo = excluded.tipo,
            ativacao = excluded.ativacao,
            vencimento = excluded.vencimento,
            vitalicia = excluded.vitalicia,
            suspensa = excluded.suspensa,
            codigo = excluded.codigo,
            observacoes = excluded.observacoes,
            apagada = '0',
            apagadaEm = NULL,
            transferida = '0',
            transferidaEm = NULL,
            transferidaPara = NULL,
            atualizadoEm = CURRENT_TIMESTAMP`,
        [
            dados.instalacaoId,
            dados.cliente,
            dados.telefone || '',
            dados.machineFingerprint || '',
            dados.tipo,
            dados.ativacao || '',
            dados.vencimento || '',
            dados.vitalicia || '0',
            dados.suspensa || '0',
            dados.codigo || '',
            dados.observacoes || ''
        ]
    );
    await registrarEventoLicencaLocal(dados.instalacaoId, 'codigo', 'Código de licença gerado.', `Tipo: ${dados.tipo || '-'}; vencimento: ${dados.vencimento || 'sem vencimento'}`);
}

async function registrarEventoLicencaLocal(instalacaoId, tipo, mensagem, detalhes = '') {
    await masterDb.executar(
        `INSERT INTO eventos_licenca_local (instalacaoId, tipo, mensagem, detalhes)
         VALUES (?, ?, ?, ?)`,
        [String(instalacaoId || '').trim(), tipo, mensagem, detalhes]
    );
}

async function buscarLicencaLocal(instalacaoId) {
    return masterDb.buscarUm(
        'SELECT * FROM licencas_locais WHERE instalacaoId = ? LIMIT 1',
        [String(instalacaoId || '').trim()]
    );
}

async function buscarLicencaAtivaPorMaquina(machineFingerprint, ignorarInstalacaoId = '') {
    const fingerprint = String(machineFingerprint || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!fingerprint) return null;

    return masterDb.buscarUm(
        `SELECT *
           FROM licencas_locais
          WHERE UPPER(REPLACE(REPLACE(COALESCE(machineFingerprint, ''), '-', ''), ' ', '')) = ?
            AND COALESCE(apagada, '0') <> '1'
            AND COALESCE(transferida, '0') <> '1'
            AND instalacaoId <> ?
          LIMIT 1`,
        [fingerprint, String(ignorarInstalacaoId || '').trim()]
    );
}

async function apagarLicencaLocal(instalacaoId) {
    const licenca = await buscarLicencaLocal(instalacaoId);
    if (!licenca) throw new Error('Licença local não encontrada.');
    await masterDb.executar(
        `UPDATE licencas_locais
            SET apagada = '1', apagadaEm = CURRENT_TIMESTAMP, atualizadoEm = CURRENT_TIMESTAMP
          WHERE instalacaoId = ?`,
        [licenca.instalacaoId]
    );
    await registrarEventoLicencaLocal(licenca.instalacaoId, 'apagada', 'Licença apagada da lista ativa.', licenca.cliente || '');
}

async function atualizarSuspensaoLicencaLocal(instalacaoId, suspensa, motivo = '') {
    const licenca = await buscarLicencaLocal(instalacaoId);
    if (!licenca) throw new Error('Licença local não encontrada.');
    const valor = suspensa ? '1' : '0';
    await masterDb.executar(
        `UPDATE licencas_locais
            SET suspensa = ?, atualizadoEm = CURRENT_TIMESTAMP
          WHERE instalacaoId = ?`,
        [valor, licenca.instalacaoId]
    );
    await registrarEventoLicencaLocal(
        licenca.instalacaoId,
        suspensa ? 'suspensao' : 'reativacao',
        suspensa ? 'Licença suspensa pelo fornecedor.' : 'Licença reativada pelo fornecedor.',
        motivo || ''
    );
}

async function marcarLicencaLocalTransferida(licenca, novaInstalacaoId, motivo = '') {
    await masterDb.executar(
        `UPDATE licencas_locais
            SET apagada = '1',
                apagadaEm = CURRENT_TIMESTAMP,
                transferida = '1',
                transferidaEm = CURRENT_TIMESTAMP,
                transferidaPara = ?,
                atualizadoEm = CURRENT_TIMESTAMP
          WHERE instalacaoId = ?`,
        [novaInstalacaoId, licenca.instalacaoId]
    );
    await registrarEventoLicencaLocal(
        licenca.instalacaoId,
        'transferencia',
        'Licença transferida para nova instalação.',
        `Nova instalação: ${novaInstalacaoId}; motivo: ${motivo || 'não informado'}`
    );
}

async function listarHistoricoLicencaLocal(instalacaoId) {
    return masterDb.buscarTodos(
        `SELECT * FROM eventos_licenca_local
          WHERE instalacaoId = ?
          ORDER BY criadoEm DESC
          LIMIT 200`,
        [String(instalacaoId || '').trim()]
    );
}

async function listarLicencasLocaisEmitidas(opcoes = {}) {
    const incluirApagadas = Boolean(opcoes.incluirApagadas);
    return masterDb.buscarTodos(
        `SELECT *
           FROM licencas_locais
          WHERE ${incluirApagadas ? '1 = 1' : "COALESCE(apagada, '0') <> '1'"}
          ORDER BY
            CASE
              WHEN COALESCE(apagada, '0') = '1' THEN 4
              WHEN suspensa = '1' THEN 0
              WHEN vitalicia = '1' THEN 3
              WHEN TRIM(COALESCE(vencimento, '')) = '' THEN 1
              WHEN date(vencimento) < date('now', 'localtime') THEN 0
              WHEN date(vencimento) <= date('now', 'localtime', '+7 days') THEN 1
              ELSE 2
            END,
            date(COALESCE(NULLIF(vencimento, ''), '9999-12-31')) ASC,
            cliente COLLATE NOCASE ASC`
    );
}

function tipoLicencaFormulario(tipo) {
    if (tipo === 'avaliacao') return 'avaliacao_15';
    if (['mensal', 'semestral', 'anual', 'vitalicia', 'suspensa'].includes(String(tipo || ''))) return tipo;
    return 'mensal';
}

function opcoesTipoLicencaLocal(tipoAtual) {
    const atual = tipoLicencaFormulario(tipoAtual);
    return [
        ['avaliacao_15', 'Avaliação 15 dias'],
        ['avaliacao_30', 'Avaliação 30 dias'],
        ['mensal', 'Mensal'],
        ['semestral', 'Semestral'],
        ['anual', 'Anual'],
        ['vitalicia', 'Vitalícia'],
        ['suspensa', 'Suspensa']
    ].map(([valor, texto]) => `<option value="${valor}" ${valor === atual ? 'selected' : ''}>${texto}</option>`).join('');
}

function secaoLicencasLocais(licencas = []) {
    const vencendo = licencas.filter(item => {
        const estado = estadoLicencaLocal(item);
        return estado.classe === 'warn' || estado.classe === 'error';
    }).length;

    return `<section class="panel" id="licencas-locais"><div class="topbar"><div><h2>Licenças locais emitidas</h2><div class="sub">${licencas.length} licença(s) cadastrada(s), ${vencendo} com vencimento ou atenção</div></div><a class="button secondary" href="#licenca-local">Gerar nova</a></div>
      <div class="table-wrap">
      ${licencas.length ? `<table><thead><tr><th>Cliente</th><th>ID da instalação</th><th>Licença</th><th>Status</th><th>Última consulta</th><th>Ações</th></tr></thead><tbody>${licencas.map(item => {
        const estado = estadoLicencaLocal(item);
        return `<tr>
          <td><strong>${escapar(item.cliente)}</strong><div class="small">${escapar(item.telefone || '-')}</div>${item.observacoes ? `<div class="small">${escapar(item.observacoes)}</div>` : ''}</td>
          <td><code>${escapar(item.instalacaoId)}</code>${item.machineFingerprint ? `<div class="small">Máquina: <code>${escapar(item.machineFingerprint)}</code></div>` : '<div class="small">Máquina não vinculada</div>'}</td>
          <td>${escapar(item.tipo || '-')}${item.vencimento ? `<div class="small">até ${escapar(formatarDataPainel(item.vencimento))}</div>` : '<div class="small">Sem vencimento</div>'}</td>
          <td><span class="badge ${estado.classe}">${escapar(estado.texto)}</span><div class="small">${escapar(estado.detalhe)}</div></td>
          <td>${escapar(formatarDataHoraPainel(item.ultimoPingEm || item.atualizadoEm))}<div class="small">${escapar(item.ultimoStatus || 'Sem consulta')}</div></td>
          <td>
            <form class="inline" method="post" action="/licencas/codigo">
              <input type="hidden" name="instalacaoId" value="${escapar(item.instalacaoId)}">
              <input type="hidden" name="machineFingerprint" value="${escapar(item.machineFingerprint || '')}">
              <input type="hidden" name="licencaCliente" value="${escapar(item.cliente)}">
              <input type="hidden" name="licencaTelefone" value="${escapar(item.telefone || '')}">
              <input type="hidden" name="licencaObservacoes" value="${escapar(item.observacoes || '')}">
              <select name="licencaTipo" style="max-width:160px;margin-bottom:6px">${opcoesTipoLicencaLocal(item.tipo)}</select>
              <input type="date" name="licencaVencimento" value="" title="Opcional: defina uma data manual" style="max-width:160px;margin-bottom:6px">
              <button class="smallbtn" type="submit">Gerar renovação</button>
            </form>
          </td>
        </tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">Nenhuma licença local emitida ainda.</div>'}
      </div>
    </section>`;
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'julian-master' }));

app.get('/api/licencas/:instalacaoId/status', async (req, res) => {
    try {
        const instalacaoId = String(req.params.instalacaoId || '').trim();
        const machineFingerprint = String(req.query.machineFingerprint || req.headers['x-machine-fingerprint'] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const licenca = await masterDb.buscarUm("SELECT * FROM licencas_locais WHERE instalacaoId = ? AND COALESCE(apagada, '0') <> '1' LIMIT 1", [instalacaoId]);
        if (!licenca) {
            return res.status(404).json({ ok: false, encontrada: false, mensagem: 'Licença não encontrada no Painel Mestre.' });
        }

        const machineEsperada = String(licenca.machineFingerprint || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (machineEsperada && machineFingerprint && machineEsperada !== machineFingerprint) {
            await masterDb.executar(
                'UPDATE licencas_locais SET ultimoStatus = ?, ultimoPingEm = CURRENT_TIMESTAMP WHERE instalacaoId = ?',
                ['bloqueada_maquina', instalacaoId]
            );
            await registrarEventoLicencaLocal(instalacaoId, 'bloqueio', 'Consulta bloqueada por computador diferente.', `Esperado: ${machineEsperada}; recebido: ${machineFingerprint}`);
            return res.json({
                ok: true,
                encontrada: true,
                instalacaoId: licenca.instalacaoId,
                cliente: licenca.cliente,
                telefone: licenca.telefone || '',
                machineFingerprint: machineEsperada,
                tipo: licenca.tipo,
                ativacao: licenca.ativacao || '',
                vencimento: licenca.vencimento || '',
                vitalicia: licenca.vitalicia === '1',
                suspensa: true,
                observacoes: 'Licenca vinculada a outro computador. Solicite liberacao ao fornecedor.',
                atualizadoEm: licenca.atualizadoEm
            });
        }

        await masterDb.executar(
            'UPDATE licencas_locais SET ultimoStatus = ?, ultimoPingEm = CURRENT_TIMESTAMP WHERE instalacaoId = ?',
            ['consultada', instalacaoId]
        );
        await registrarEventoLicencaLocal(instalacaoId, 'consulta', 'Instalação local consultou a licença.', `Status anterior: ${licenca.ultimoStatus || 'sem consulta'}`);

        res.json({
            ok: true,
            encontrada: true,
            instalacaoId: licenca.instalacaoId,
            cliente: licenca.cliente,
            telefone: licenca.telefone || '',
            machineFingerprint: licenca.machineFingerprint || '',
            tipo: licenca.tipo,
            ativacao: licenca.ativacao || '',
            vencimento: licenca.vencimento || '',
            vitalicia: licenca.vitalicia === '1',
            suspensa: licenca.suspensa === '1',
            observacoes: licenca.observacoes || '',
            atualizadoEm: licenca.atualizadoEm
        });
    } catch (err) {
        res.status(500).json({ ok: false, mensagem: err.message });
    }
});

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
        erro: 'Usuário ou senha inválidos.'
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

async function gerarCodigoLicencaLocalPorRequest(req) {
    const tipo = String(req.body.licencaTipo || '').trim();
    const instalacaoId = String(req.body.instalacaoId || '').trim();
    const machineFingerprint = String(req.body.machineFingerprint || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cliente = String(req.body.licencaCliente || '').trim();
    const hoje = dataHojeSaoPaulo();
    const diasPorTipo = {
        avaliacao_15: 15,
        avaliacao_30: 30,
        mensal: 30,
        semestral: 180,
        anual: 365
    };

    if (!instalacaoId) throw new Error('Informe o ID da instalação.');
    if (!machineFingerprint) throw new Error('Informe a chave da máquina exibida na tela de licença do cliente.');
    if (!cliente) throw new Error('Informe o cliente ou empresa.');
    if (!tipo) throw new Error('Selecione o tipo de licença.');

    const licencaMesmaMaquina = await buscarLicencaAtivaPorMaquina(machineFingerprint, instalacaoId);
    if (licencaMesmaMaquina) {
        throw new Error(`Esta máquina já possui licença ativa para ${licencaMesmaMaquina.cliente}. Use Transferir na licença existente ou apague/suspenda a licença antiga antes de gerar outra.`);
    }

    const tipoSalvo = tipo.startsWith('avaliacao_') ? 'avaliacao' : tipo;
    const vencimento = tipo === 'vitalicia'
        ? ''
        : String(req.body.licencaVencimento || '').slice(0, 10) || adicionarDias(hoje, diasPorTipo[tipo] || 30);
    const servidorUrl = urlPublicaMestre(req);
    const codigoLicenca = gerarCodigoLicencaAssinado({
        v: 1,
        instalacaoId,
        machineFingerprint,
        cliente,
        telefone: String(req.body.licencaTelefone || '').trim(),
        tipo: tipo === 'vitalicia' ? 'vitalicia' : tipoSalvo,
        ativacao: hoje,
        vencimento,
        vitalicia: tipo === 'vitalicia' ? '1' : '0',
        periodoTesteDias: tipo === 'avaliacao_15' ? '15' : tipo === 'avaliacao_30' ? '30' : '0',
        suspensa: tipo === 'suspensa' ? '1' : '0',
        observacoes: String(req.body.licencaObservacoes || '').trim(),
        servidorUrl,
        emitidoEm: new Date().toISOString()
    });

    await salvarLicencaLocalGerada({
        instalacaoId,
        machineFingerprint,
        cliente,
        telefone: req.body.licencaTelefone,
        tipo: tipo === 'vitalicia' ? 'vitalicia' : tipoSalvo,
        ativacao: hoje,
        vencimento,
        vitalicia: tipo === 'vitalicia' ? '1' : '0',
        suspensa: tipo === 'suspensa' ? '1' : '0',
        codigo: codigoLicenca,
        observacoes: req.body.licencaObservacoes
    });

    return {
        codigoLicenca,
        dadosFormulario: { ...req.body, licencaTipo: tipo, licencaVencimento: vencimento, codigoLicenca }
    };
}

app.get('/', async (req, res) => {
    res.send(await renderizarPainel({
        mensagem: req.query.mensagem,
        erro: req.query.erro,
        filtro: req.query.filtro,
        busca: req.query.busca
    }));
});

app.get('/licencas', async (req, res) => {
    const licencas = await listarLicencasLocaisEmitidas();
    res.send(paginaLicencasLocais(licencas, {
        mensagem: req.query.mensagem,
        erro: req.query.erro
    }));
});

app.get('/renovacoes', async (req, res) => {
    const licencas = await listarLicencasLocaisEmitidas();
    res.send(paginaRenovacoesLicencasLocais(licencas, {
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

app.post('/licencas/codigo', async (req, res) => {
    try {
        const { dadosFormulario } = await gerarCodigoLicencaLocalPorRequest(req);
        const licencasAtualizadas = await listarLicencasLocaisEmitidas();
        return res.send(paginaLicencasLocais(licencasAtualizadas, {
            mensagem: 'Código de licença gerado. Envie ao cliente para aplicar na tela de licença.',
            codigoLicenca: dadosFormulario
        }));

        const tipo = String(req.body.licencaTipo || '').trim();
        const instalacaoId = String(req.body.instalacaoId || '').trim();
        const machineFingerprint = String(req.body.machineFingerprint || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cliente = String(req.body.licencaCliente || '').trim();
        const hoje = dataHojeSaoPaulo();
        const diasPorTipo = {
            avaliacao_15: 15,
            avaliacao_30: 30,
            mensal: 30,
            semestral: 180,
            anual: 365
        };
        if (!instalacaoId) throw new Error('Informe o ID da instalação.');
        if (!machineFingerprint) throw new Error('Informe a chave da máquina exibida na tela de licença do cliente.');
        if (!cliente) throw new Error('Informe o cliente ou empresa.');
        if (!tipo) throw new Error('Selecione o tipo de licença.');
        const licencaMesmaMaquina = await buscarLicencaAtivaPorMaquina(machineFingerprint, instalacaoId);
        if (licencaMesmaMaquina) {
            throw new Error(`Esta máquina já possui licença ativa para ${licencaMesmaMaquina.cliente}. Use Transferir na licença existente ou apague/suspenda a licença antiga antes de gerar outra.`);
        }
        const tipoSalvo = tipo.startsWith('avaliacao_') ? 'avaliacao' : tipo;
        const vencimento = tipo === 'vitalicia'
            ? ''
            : String(req.body.licencaVencimento || '').slice(0, 10) || adicionarDias(hoje, diasPorTipo[tipo] || 30);
        const servidorUrl = urlPublicaMestre(req);
        const codigoLicenca = gerarCodigoLicencaAssinado({
            v: 1,
            instalacaoId,
            machineFingerprint,
            cliente,
            telefone: String(req.body.licencaTelefone || '').trim(),
            tipo: tipo === 'vitalicia' ? 'vitalicia' : tipoSalvo,
            ativacao: hoje,
            vencimento,
            vitalicia: tipo === 'vitalicia' ? '1' : '0',
            periodoTesteDias: tipo === 'avaliacao_15' ? '15' : tipo === 'avaliacao_30' ? '30' : '0',
            suspensa: tipo === 'suspensa' ? '1' : '0',
            observacoes: String(req.body.licencaObservacoes || '').trim(),
            servidorUrl,
            emitidoEm: new Date().toISOString()
        });
        await salvarLicencaLocalGerada({
            instalacaoId,
            machineFingerprint,
            cliente,
            telefone: req.body.licencaTelefone,
            tipo: tipo === 'vitalicia' ? 'vitalicia' : tipoSalvo,
            ativacao: hoje,
            vencimento,
            vitalicia: tipo === 'vitalicia' ? '1' : '0',
            suspensa: tipo === 'suspensa' ? '1' : '0',
            codigo: codigoLicenca,
            observacoes: req.body.licencaObservacoes
        });

        const licencas = await listarLicencasLocaisEmitidas();
        res.send(paginaLicencasLocais(licencas, {
            mensagem: 'Código de licença gerado. Envie ao cliente para aplicar na tela de licença.',
            codigoLicenca: { ...req.body, licencaTipo: tipo, licencaVencimento: vencimento, codigoLicenca }
        }));
    } catch (err) {
        const licencas = await listarLicencasLocaisEmitidas().catch(() => []);
        res.status(400).send(paginaLicencasLocais(licencas, {
            erro: err.message,
            codigoLicenca: req.body
        }));
    }
});

app.post('/renovacoes/codigo', async (req, res) => {
    try {
        const { dadosFormulario } = await gerarCodigoLicencaLocalPorRequest(req);
        const licencas = await listarLicencasLocaisEmitidas();
        res.send(paginaRenovacoesLicencasLocais(licencas, {
            mensagem: 'Código de renovação gerado. Envie ao cliente para aplicar na tela de licença.',
            codigoLicenca: dadosFormulario
        }));
    } catch (err) {
        const licencas = await listarLicencasLocaisEmitidas().catch(() => []);
        res.status(400).send(paginaRenovacoesLicencasLocais(licencas, {
            erro: err.message
        }));
    }
});

app.post('/licencas/:instalacaoId/transferir', async (req, res) => {
    try {
        const licencaAtual = await buscarLicencaLocal(req.params.instalacaoId);
        if (!licencaAtual) throw new Error('Licença local não encontrada.');

        const tipo = String(req.body.licencaTipo || tipoLicencaFormulario(licencaAtual.tipo)).trim();
        const instalacaoId = String(req.body.novaInstalacaoId || licencaAtual.instalacaoId || '').trim();
        const machineFingerprint = String(req.body.novaMachineFingerprint || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const motivo = String(req.body.motivoTransferencia || '').trim();
        const hoje = dataHojeSaoPaulo();
        const diasPorTipo = {
            avaliacao_15: 15,
            avaliacao_30: 30,
            mensal: 30,
            semestral: 180,
            anual: 365
        };

        if (!instalacaoId) throw new Error('Informe o ID da instalação.');
        if (!machineFingerprint) throw new Error('Informe a nova chave da máquina exibida na tela de licença do cliente.');
        const mantendoMesmaInstalacao = instalacaoId === licencaAtual.instalacaoId;

        const existente = await buscarLicencaLocal(instalacaoId);
        if (!mantendoMesmaInstalacao && existente && String(existente.apagada || '0') !== '1') {
            throw new Error('Já existe uma licença ativa para o novo ID informado.');
        }
        const licencaMesmaMaquina = await buscarLicencaAtivaPorMaquina(machineFingerprint, licencaAtual.instalacaoId);
        if (licencaMesmaMaquina) {
            throw new Error(`Esta máquina já possui licença ativa para ${licencaMesmaMaquina.cliente}. Para liberar outra instalação neste mesmo computador, remova ou transfira a licença existente primeiro.`);
        }

        const tipoSalvo = tipo.startsWith('avaliacao_') ? 'avaliacao' : tipo;
        const vencimento = tipo === 'vitalicia'
            ? ''
            : String(req.body.licencaVencimento || '').slice(0, 10) || licencaAtual.vencimento || adicionarDias(hoje, diasPorTipo[tipo] || 30);
        const servidorUrl = urlPublicaMestre(req);
        const codigoLicenca = gerarCodigoLicencaAssinado({
            v: 1,
            instalacaoId,
            machineFingerprint,
            cliente: licencaAtual.cliente,
            telefone: licencaAtual.telefone || '',
            tipo: tipo === 'vitalicia' ? 'vitalicia' : tipoSalvo,
            ativacao: hoje,
            vencimento,
            vitalicia: tipo === 'vitalicia' ? '1' : '0',
            periodoTesteDias: tipo === 'avaliacao_15' ? '15' : tipo === 'avaliacao_30' ? '30' : '0',
            suspensa: tipo === 'suspensa' ? '1' : '0',
            observacoes: licencaAtual.observacoes || '',
            servidorUrl,
            emitidoEm: new Date().toISOString()
        });

        await salvarLicencaLocalGerada({
            instalacaoId,
            machineFingerprint,
            cliente: licencaAtual.cliente,
            telefone: licencaAtual.telefone || '',
            tipo: tipo === 'vitalicia' ? 'vitalicia' : tipoSalvo,
            ativacao: hoje,
            vencimento,
            vitalicia: tipo === 'vitalicia' ? '1' : '0',
            suspensa: tipo === 'suspensa' ? '1' : '0',
            codigo: codigoLicenca,
            observacoes: licencaAtual.observacoes || ''
        });
        if (mantendoMesmaInstalacao) {
            await registrarEventoLicencaLocal(
                instalacaoId,
                'maquina',
                'Chave da máquina vinculada à licença existente.',
                `Máquina: ${machineFingerprint}; motivo: ${motivo || 'não informado'}`
            );
        } else {
            await marcarLicencaLocalTransferida(licencaAtual, instalacaoId, motivo);
            await registrarEventoLicencaLocal(
                instalacaoId,
                'transferencia',
                'Licença criada por transferência.',
                `Instalação anterior: ${licencaAtual.instalacaoId}; motivo: ${motivo || 'não informado'}`
            );
        }

        const licencas = await listarLicencasLocaisEmitidas();
        res.send(paginaLicencasLocais(licencas, {
            mensagem: mantendoMesmaInstalacao
                ? 'Chave da máquina vinculada. Envie o código novo ao cliente para aplicar na tela de licença.'
                : 'Transferência gerada. Envie o código novo ao cliente para aplicar na tela de licença.',
            codigoLicenca: {
                instalacaoId,
                machineFingerprint,
                licencaCliente: licencaAtual.cliente,
                licencaTelefone: licencaAtual.telefone || '',
                licencaTipo: tipo,
                licencaVencimento: vencimento,
                licencaObservacoes: licencaAtual.observacoes || '',
                codigoLicenca
            }
        }));
    } catch (err) {
        const licencas = await listarLicencasLocaisEmitidas().catch(() => []);
        res.status(400).send(paginaLicencasLocais(licencas, { erro: err.message }));
    }
});

app.post('/licencas/:instalacaoId/apagar', async (req, res) => {
    try {
        await apagarLicencaLocal(req.params.instalacaoId);
        res.redirect('/licencas?mensagem=' + encodeURIComponent('Licença local apagada da lista ativa. O histórico foi preservado.'));
    } catch (err) {
        res.redirect('/licencas?erro=' + encodeURIComponent(err.message));
    }
});

app.post('/licencas/:instalacaoId/suspender-local', async (req, res) => {
    try {
        await atualizarSuspensaoLicencaLocal(req.params.instalacaoId, true, 'Suspensão manual pelo Painel Mestre.');
        res.redirect('/licencas?mensagem=' + encodeURIComponent('Licença local suspensa. O cliente será bloqueado na próxima consulta de licença.'));
    } catch (err) {
        res.redirect('/licencas?erro=' + encodeURIComponent(err.message));
    }
});

app.post('/licencas/:instalacaoId/reativar-local', async (req, res) => {
    try {
        await atualizarSuspensaoLicencaLocal(req.params.instalacaoId, false, 'Reativação manual pelo Painel Mestre.');
        res.redirect('/licencas?mensagem=' + encodeURIComponent('Licença local reativada.'));
    } catch (err) {
        res.redirect('/licencas?erro=' + encodeURIComponent(err.message));
    }
});

app.get('/licencas/:instalacaoId/historico', async (req, res) => {
    try {
        const instalacaoId = String(req.params.instalacaoId || '').trim();
        const [licenca, eventos] = await Promise.all([
            buscarLicencaLocal(instalacaoId),
            listarHistoricoLicencaLocal(instalacaoId)
        ]);
        if (!licenca) throw new Error('Licença local não encontrada.');
        res.send(paginaHistoricoLicencaLocal(licenca, eventos));
    } catch (err) {
        res.redirect('/licencas?erro=' + encodeURIComponent(err.message));
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
