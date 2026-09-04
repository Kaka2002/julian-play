const express = require('express');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { execFile, spawn } = require('child_process');
const { MessageMedia } = require('whatsapp-web.js');
const { formatarAniversario, mesDiaAniversario } = require('../utils/aniversario');
const { lerUploadMultipart, validarImagemUpload } = require('../services/uploadMultipartService');
const {
    listarClientes,
    listarClientesAtivosComerciais,
    salvarCliente,
    buscarClientePorId,
    buscarClientePorTelefone,
    aplicarBonusCliente,
    listarClientesAniversarioHoje,
    registrarBonusAniversario,
    listarPagamentosCliente,
    buscarPagamentoCliente,
    listarReceitaMensalFinanceira,
    listarPagamentosFinanceiro,
    renovarCliente,
    registrarPagamentoAssinaturaInicial,
    marcarPagamentoMensagem,
    atualizarPagamentoCliente,
    removerPagamentoCliente,
    normalizarTelefone,
    listarNotasCliente,
    campanhaAmizadeJaEnviada,
    adicionarNotaCliente,
    buscarAlertasCadastroCliente,
    listarClientesVencidosParaCobranca,
    registrarAvisoRenovacaoProgramado,
    avisoRenovacaoProgramadoExiste
} = require('../services/clientes');
const {
    verificarRenovacoes,
    verificarClientesVencendoUmaHora,
    verificarClientesVencidosPorDias
} = require('../services/renovacaoAutomatica');
const {
    getClient,
    getStatusWhatsApp,
    gerarNovoQrCodeWhatsApp,
    recuperarWhatsAppAutomaticamente
} = require('../config/whatsapp');
const {
    listarModelos,
    buscarModeloPorId,
    salvarModelo,
    removerModelo,
    montarMensagemPorModelo,
    montarMensagemCobrancaVencido,
    montarMensagemCampanhaAmizade,
    montarMensagemModeloManual,
    montarMensagemTesteExpiradoAssinatura,
    CHAVE_MODELO_TESTE_EXPIRADO_ASSINATURA
} = require('../services/modelosMensagem');
const {
    obterConfiguracoes,
    salvarConfiguracoesPainel,
    salvarConfiguracoesRobo,
    salvarImagemRobo,
    salvarConfiguracoesPix,
    salvarConfiguracoesProvedorPix,
    salvarConfiguracoesPayPal,
    salvarConfiguracoesMonitoramento,
    salvarConfiguracoesAcesso
} = require('../services/configuracoesPainel');
const { atualizarLicencaComercial, calcularEstadoLicenca, instalacaoAdministrador } = require('../services/licencaService');
const {
    criarBackupManual,
    criarBackupManualComCopiaExterna,
    restaurarBackup,
    verificarArquivoBackup,
    exportarBackupCriptografado,
    copiarBackupExterno,
    executarExercicioRestauracaoMensal,
    executarDiagnosticoSistema,
    obterStatusSistema
} = require('../services/manutencao');
const { agendarEncerramentoTeste } = require('../services/encerramentoTesteService');
const {
    listarTiposPlanos,
    buscarTipoPlanoPorId,
    salvarTipoPlano,
    removerTipoPlano
} = require('../services/tiposPlanos');
const {
    listarApps,
    buscarAppPorId,
    salvarApp,
    removerApp,
    listarDispositivos,
    buscarDispositivoPorId,
    salvarDispositivo,
    removerDispositivo,
    listarPaineis,
    buscarPainelPorId,
    salvarPainel,
    removerPainel
} = require('../services/appsDispositivos');
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('../services/mensagensPropriasService');
const {
    buscarPlanoPorNome,
    prepararPlanoPixCliente: prepararPlanoPixPlanoAtual,
    enviarQRCodePIXParaDestino,
    listarPlanosComerciais,
    montarPlanosPadraoComerciais
} = require('../services/pixService');
const { criarCobrancaPayPal } = require('../services/paypalService');
const { testarWebhookAlertas, enviarWebhook } = require('../services/monitoramentoComercial');
const {
    criarCampanha,
    atualizarCampanha,
    registrarItemCampanha,
    atualizarItemCampanha,
    buscarCampanha,
    listarCampanhas,
    listarItensCampanha,
    listarItensCampanhaPorStatus,
    contarItensCampanhaPorStatus,
    contarEnviosClienteDesde,
    buscarCampanhaRetomavel
} = require('../services/campanhasService');
const menuRenovacao = require('../menus/renovacao');
const { agoraSaoPauloInput, formatarDataHoraBrasil, partesDataHora } = require('../utils/dataHora');
const {
    listarAtendimentos,
    listarAtendimentosCliente,
    buscarAtendimentoPorId,
    criarAtendimento,
    atualizarStatusAtendimento,
    removerAtendimento,
    resumoAtendimentos
} = require('../services/atendimentos');
const {
    listarLeads,
    buscarLeadPorId,
    listarHistoricoLead,
    salvarLead,
    atualizarStatusLead,
    vincularLeadAoCliente,
    removerLead,
    adicionarHistoricoLead,
    resumoCrm,
    relatorioComercial
} = require('../services/crmService');
const { enfileirarEnvio } = require('../services/filaMensagensService');
const { confirmarSenhaAtual } = require('../services/authService');
const { registrarEventoSistema } = require('../services/eventosSistema');
const { mascararSegredos } = require('../services/securityService');
const { listarInteracoesCliente } = require('../services/interacoesRoboService');
const { listarAuditoriaCliente, registrarEventoCliente } = require('../services/clienteAuditoriaService');
const { verificarExclusaoDefinitivaCliente } = require('../services/privacidadeService');
const {
    salvarProtecaoWhatsapp
} = require('../services/protecaoWhatsappService');
const {
    listarHistoricoRenovacoes,
    testarIntegracaoPainel,
    reagendarRenovacao
} = require('../services/renovacaoPainelService');

const router = express.Router();
const contextoAuditoria = new AsyncLocalStorage();
router.use((req, res, next) => contextoAuditoria.run({ req }, next));
const WHATSAPP_ENVIO_DUPLICADO_MS = 5 * 60 * 1000;
const RENOVACAO_SUBMISSAO_DUPLICADA_MS = 120000;
const mensagensWhatsAppRecentes = new Map();
const renovacoesRecentes = new Map();
const campanhaAmizadeExecucao = {
    id: null,
    emAndamento: false,
    pausada: false,
    cancelada: false,
    iniciadaEm: '',
    pausadaEm: '',
    canceladaEm: '',
    finalizadaEm: '',
    enviados: 0,
    ignorados: 0,
    erros: 0,
    jaEnviados: 0,
    total: 0,
    loteAtual: 0,
    totalLotes: 0,
    proximoLoteEm: '',
    mensagem: '',
    erro: '',
    clientesEnviados: [],
    clientesIgnorados: [],
    clientesJaEnviados: []
};
const DIAS_DASHBOARD = 7;
const CODIGO_COBRANCA_VENCIDO = -90;
const CODIGO_TESTE_EXPIRADO_PLANOS_MANUAL = -33;
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ?'/var/data' : path.join(__dirname, '..'));
const ASSETS_DIR = path.join(DATA_DIR, 'assets');
const CLIENTES_AUTO_REFRESH_MS = Number(process.env.CLIENTES_AUTO_REFRESH_MS || 30000);
const DASHBOARD_AUTO_REFRESH_MS = Number(process.env.DASHBOARD_AUTO_REFRESH_MS || 30000);
const CLIENTES_POR_PAGINA = 6;
const FINANCEIRO_POR_PAGINA = 6;
const REGISTROS_POR_PAGINA = 6;
const DASHBOARD_VENCIMENTOS_POR_PAGINA = 6;
const OPCOES_POR_PAGINA = [6, 10, 20, 40, 60, 80, 100];
const IMAGEM_CAMPANHA_AMIZADE = path.join(__dirname, '..', 'assets', 'amizade-presente.png');
const IMAGEM_CAMPANHA_AMIZADE_BASE = path.join(__dirname, '..', 'assets', 'amizade-presente-base.png');
const CHAVE_IMAGEM_CAMPANHA_AMIZADE = 'imagemCampanhaAmizade';
const CAMPANHA_AMIZADE_LOTE_TAMANHO = 10;
const CAMPANHA_AMIZADE_INTERVALO_LOTES_MIN_MS = 150 * 1000;
const CAMPANHA_AMIZADE_INTERVALO_LOTES_MAX_MS = 210 * 1000;
const CAMPANHA_AMIZADE_INTERVALO_CLIENTES_MIN_MS = 2 * 1000;
const CAMPANHA_AMIZADE_INTERVALO_CLIENTES_MAX_MS = 5 * 1000;
const IMPORTACOES_DIR = path.join(__dirname, '..', 'backups', 'importacoes');
const ORIGENS_CLIENTE = [
    'Indicação pessoal',
    'Instagram',
    'WhatsApp',
    'Facebook',
    'Google',
    'Cliente antigo',
    'Fornecedor',
    'Outro'
];
const PAISES_TELEFONE = [
    { codigo: 'BR', pais: 'Brasil', ddi: '55', exemplo: '11999999999' },
    { codigo: 'US', pais: 'Estados Unidos', ddi: '1', exemplo: '5303531844' },
    { codigo: 'CA', pais: 'Canadá', ddi: '1', exemplo: '4165551234' },
    { codigo: 'PT', pais: 'Portugal', ddi: '351', exemplo: '912345678' },
    { codigo: 'ES', pais: 'Espanha', ddi: '34', exemplo: '612345678' },
    { codigo: 'IT', pais: 'Itália', ddi: '39', exemplo: '3123456789' },
    { codigo: 'FR', pais: 'França', ddi: '33', exemplo: '612345678' },
    { codigo: 'DE', pais: 'Alemanha', ddi: '49', exemplo: '15123456789' },
    { codigo: 'GB', pais: 'Reino Unido', ddi: '44', exemplo: '7123456789' },
    { codigo: 'MX', pais: 'México', ddi: '52', exemplo: '5512345678' },
    { codigo: 'AR', pais: 'Argentina', ddi: '54', exemplo: '91123456789' },
    { codigo: 'CL', pais: 'Chile', ddi: '56', exemplo: '912345678' },
    { codigo: 'UY', pais: 'Uruguai', ddi: '598', exemplo: '91234567' },
    { codigo: 'PY', pais: 'Paraguai', ddi: '595', exemplo: '981123456' },
    { codigo: 'BO', pais: 'Bolívia', ddi: '591', exemplo: '71234567' },
    { codigo: 'CO', pais: 'Colômbia', ddi: '57', exemplo: '3012345678' }
];

function paisTelefoneDoCliente(cliente = {}) {
    const codigoSalvo = String(cliente.paisTelefone || '').trim().toUpperCase();
    const ddi = String(cliente.ddiTelefone || '').replace(/\D/g, '');
    const telefone = String(cliente.telefone || '').replace(/\D/g, '');
    return PAISES_TELEFONE.find(item => item.codigo === codigoSalvo)
        || PAISES_TELEFONE.find(item => item.ddi === ddi)
        || [...PAISES_TELEFONE].sort((a, b) => b.ddi.length - a.ddi.length)
            .find(item => telefone.startsWith(item.ddi))
        || PAISES_TELEFONE[0];
}

function bandeiraPaisTelefone(cliente = {}) {
    const pais = paisTelefoneDoCliente(cliente);

    return pais.codigo
        .toUpperCase()
        .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function imagemBandeiraPaisTelefone(cliente = {}) {
    const pais = paisTelefoneDoCliente(cliente);
    const codigo = String(pais.codigo || 'BR').toLowerCase();

    return `<img class="country-flag-inline" src="https://flagcdn.com/w40/${escapar(codigo)}.png" alt="${escapar(pais.pais)}" title="${escapar(pais.pais)}" loading="lazy">`;
}
const TAGS_CLIENTE = [
    'VIP',
    'Problemático',
    'Indicado',
    'Retorno',
    'Fornecedor',
    'Acompanhar',
    'Bom pagador',
    'Atrasou pagamento'
];
const NOTAS_ATENDIMENTO_PADRAO = [
    'Cliente pediu teste grátis.',
    'Cliente teve dificuldade para instalar o aplicativo.',
    'Cliente recebeu orientação passo a passo pelo WhatsApp.',
    'Cliente reclamou de travamentos.',
    'Orientado a testar a internet e reiniciar o roteador.',
    'Cliente solicitou renovação de assinatura.',
    'Cliente informou pagamento realizado.',
    'Pagamento atrasou, mas foi regularizado.',
    'Cliente pediu troca de aplicativo.',
    'Cliente pediu troca de dispositivo.',
    'Cliente pediu suporte para configurar TV.',
    'Cliente pediu suporte para configurar celular.',
    'O Cliente informou que o aplicativo não está carregando os canais e/ou app não está funcionando.',
    'Cliente indicado por outro cliente.',
    'Cliente deve receber atendimento com prioridade.',
    'Cliente demonstrou comportamento problemático.',
    'Cliente não seguiu as orientações enviadas.',
    'Cliente pediu cancelamento.',
    'Cliente retornou após período sem usar o serviço.',
    'Cliente precisa de acompanhamento no próximo atendimento.'
];
function instalacaoComercialCliente() {
    return Boolean(String(process.env.LICENSE_CUSTOMER_NAME || '').trim());
}

function bloquearManutencaoRestritaCliente(req, res, next) {
    if (!instalacaoComercialCliente() || instalacaoAdministrador()) return next();
    return res.redirect(`/manutencao?mensagem=${encodeURIComponent('Esta opção é restrita ao fornecedor.')}`);
}

function manutencaoRestritaCliente() {
    return instalacaoComercialCliente() && !instalacaoAdministrador();
}

function monitoramentoOperacionalPermitido() {
    return !manutencaoRestritaCliente() || process.env.JULIAN_PLAY_INSTALL_MODE === 'local';
}

function instalacaoLocal() {
    return String(process.env.JULIAN_PLAY_INSTALL_MODE || '').trim().toLowerCase() === 'local';
}

function bloquearControleRoboLocal(req, res, next) {
    if (instalacaoLocal()) return next();
    return res.status(403).send('Controle do robô disponível somente na instalação local.');
}

function agendarControleProcessoLocal(acao) {
    const permitidas = new Set(['restart', 'stop']);
    if (!permitidas.has(acao)) throw new Error('Ação de processo inválida.');
    const nomeProcesso = String(process.env.JULIAN_PLAY_APP_NAME || '').trim();
    if (!nomeProcesso) throw new Error('Nome do processo local não configurado.');
    const appData = String(process.env.APPDATA || '').trim();
    if (!appData) throw new Error('APPDATA não disponível para localizar o PM2.');
    const pm2Cli = path.join(appData, 'npm', 'node_modules', 'pm2', 'bin', 'pm2');
    if (!fs.existsSync(pm2Cli) && !fs.existsSync(`${pm2Cli}.js`)) {
        throw new Error('PM2 global não encontrado nesta instalação.');
    }

    setTimeout(() => {
        const argumentos = [pm2Cli, acao, nomeProcesso];
        if (acao === 'restart') argumentos.push('--update-env');
        const filho = spawn(process.execPath, argumentos, {
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
        });
        filho.unref();
    }, 700);
}

function bloquearMonitoramentoOperacional(req, res, next) {
    if (monitoramentoOperacionalPermitido()) return next();
    return res.redirect(`/manutencao?mensagem=${encodeURIComponent('O monitoramento do servidor e centralizado no Painel Mestre.')}`);
}

const LOCAIS_INSTALACAO_APP = [
    'TV da sala',
    'TV do quarto',
    'TV da cozinha',
    'TV principal',
    'TV secundária',
    'TV box',
    'Celular do cliente',
    'Celular do filho',
    'Tablet',
    'Roku',
    'BTV'
];

function escapar(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function paginaAtual(valor) {
    const pagina = Number.parseInt(valor, 10);
    return Number.isFinite(pagina) && pagina > 0 ?pagina : 1;
}

function quantidadePorPagina(valor, padrao = 6) {
    const quantidade = Number.parseInt(valor, 10);
    return OPCOES_POR_PAGINA.includes(quantidade) ? quantidade : padrao;
}

function quantidadeVencimentosDashboard(valor, padrao = DASHBOARD_VENCIMENTOS_POR_PAGINA) {
    const quantidade = Number.parseInt(valor, 10);
    return Number.isFinite(quantidade) && quantidade >= 1 && quantidade <= DASHBOARD_VENCIMENTOS_POR_PAGINA
        ? quantidade
        : padrao;
}

function paginarItens(itens = [], pagina = 1, porPagina = 6) {
    const total = itens.length;
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    const paginaSegura = Math.min(Math.max(1, pagina), totalPaginas);
    const inicio = (paginaSegura - 1) * porPagina;

    return {
        itens: itens.slice(inicio, inicio + porPagina),
        pagina: paginaSegura,
        total,
        totalPaginas,
        porPagina
    };
}

function montarUrlPaginacao(base, params = {}, pagina = 1) {
    const query = new URLSearchParams();
    const parametroPagina = String(params.parametroPagina || 'pagina');

    Object.entries(params).forEach(([chave, valor]) => {
        if (chave === 'parametroPagina') return;
        if (valor !== undefined && valor !== null && String(valor) !== '') {
            query.set(chave, String(valor));
        }
    });

    query.set(parametroPagina, String(pagina));
    return `${base}?${query.toString()}`;
}

function montarUrlComFiltros(base, params = {}) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([chave, valor]) => {
        if (valor !== undefined && valor !== null && String(valor) !== '') {
            query.set(chave, String(valor));
        }
    });

    const textoQuery = query.toString();
    return textoQuery ?`${base}?${textoQuery}` : base;
}

function filtrosClientesQuery(query = {}) {
    return {
        busca: query.busca || '',
        status: query.status || '',
        origem: query.origem || '',
        tag: query.tag || '',
        renovacao: ['hoje', 'tres_dias', 'teste_vencido'].includes(String(query.renovacao || '')) ? String(query.renovacao) : '',
        porPagina: quantidadePorPagina(query.porPagina)
    };
}

function filtrosFinanceiroQuery(query = {}) {
    const status = String(query.status || '');

    return {
        busca: String(query.busca || '').trim(),
        mes: String(query.mes || mesAtualInput()).slice(0, 7),
        dataInicio: String(query.dataInicio || '').slice(0, 10),
        dataFim: String(query.dataFim || '').slice(0, 10),
        status: ['validos', 'removidos', 'todos'].includes(status) ?status : 'validos',
        porPagina: quantidadePorPagina(query.porPagina)
    };
}

function extensaoLogoPermitida(nome) {
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(path.extname(nome).toLowerCase());
}

function nomeImagemRobo(chave) {
    return String(chave || '')
        .replace(/^imagemRobo/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        || 'Imagem';
}

function campoImagemRobo(config = {}, chave, descricao) {
    const arquivo = config[chave] || '';
    const arquivoSeguro = path.basename(String(arquivo).split('?')[0]);
    const origem = arquivoSeguro && fs.existsSync(path.join(ASSETS_DIR, arquivoSeguro))
        ?`/tenant-assets/${escapar(arquivoSeguro)}?v=${Date.now()}`
        : arquivoSeguro
            ?`/assets/${escapar(arquivoSeguro)}`
            : '';
    const preview = arquivo
        ?`<div class="subtitle">Atual: ${escapar(arquivoSeguro)}</div><img class="brand-logo" src="${origem}" alt="${escapar(descricao)}" style="width:54px;height:54px;margin-top:8px;">`
        : '<div class="subtitle">Nenhuma imagem configurada</div>';

    return `<div class="panel mini-card" style="padding:14px;">
        <strong>${escapar(descricao)}</strong>
        ${preview}
        <form method="post" action="/manutencao/robo/imagem/${escapar(chave)}" enctype="multipart/form-data" style="margin-top:10px;">
            <label class="logo-upload">
                Escolher imagem
                <input type="file" name="imagem" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onchange="this.form.submit()">
                <span class="button secondary" style="margin-top:7px;">${icon('image')} Procurar</span>
            </label>
        </form>
        ${arquivo ? `<form method="post" action="/manutencao/robo/imagem/${escapar(chave)}/limpar" style="margin-top:8px;" onsubmit="return confirm('Remover esta imagem das mensagens do robô?');">
            <button class="button secondary" type="submit">${icon('trash')} Limpar imagem</button>
        </form>` : ''}
    </div>`;
}

function removerArquivoImagemTenant(nomeArquivo) {
    const arquivoSeguro = path.basename(String(nomeArquivo || '').split('?')[0]);
    if (!arquivoSeguro) return false;

    const raizAssets = path.resolve(ASSETS_DIR);
    const arquivo = path.resolve(raizAssets, arquivoSeguro);
    if (!arquivo.startsWith(`${raizAssets}${path.sep}`) || !fs.existsSync(arquivo)) return false;

    fs.unlinkSync(arquivo);
    return true;
}

function obterImagemBaseCampanhaAmizade(config = {}) {
    const arquivoSeguro = path.basename(String(config[CHAVE_IMAGEM_CAMPANHA_AMIZADE] || '').split('?')[0]);
    const imagemConfigurada = arquivoSeguro ? path.join(ASSETS_DIR, arquivoSeguro) : '';

    if (imagemConfigurada && fs.existsSync(imagemConfigurada)) {
        return imagemConfigurada;
    }

    return fs.existsSync(IMAGEM_CAMPANHA_AMIZADE_BASE)
        ? IMAGEM_CAMPANHA_AMIZADE_BASE
        : IMAGEM_CAMPANHA_AMIZADE;
}

function formatarData(dataISO) {
    if (!dataISO) return '-';

    const [ano, mes, dia] = dataISO.slice(0, 10).split('-');
    if (!ano || !mes || !dia) return dataISO;

    return `${dia}/${mes}/${ano}`;
}

function hojeISO() {
    return hojeSaoPauloISO();
}

function adicionarDiasISO(dias) {
    const data = new Date(`${hojeSaoPauloISO()}T12:00:00`);
    data.setDate(data.getDate() + dias);
    return data.toISOString().slice(0, 10);
}

function fimMesSaoPauloISO() {
    const hoje = hojeSaoPauloISO();
    const [ano, mes] = hoje.split('-').map(Number);
    const data = new Date(ano, mes, 0);
    const dia = String(data.getDate()).padStart(2, '0');

    return `${ano}-${String(mes).padStart(2, '0')}-${dia}`;
}

function hojeSaoPauloISO() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function vencimentoCliente(cliente = {}) {
    return cliente.dataVencimento || cliente.vencimento || '';
}

function dataHoraVencimento(valor) {
    if (!valor) return null;

    const texto = String(valor);
    const data = new Date(texto.length <= 10 ?`${texto}T23:59:59` : texto);
    return Number.isNaN(data.getTime()) ?null : data;
}

function vencimentoExpirou(valor) {
    const data = dataHoraVencimento(valor);
    return Boolean(data && data < new Date());
}

function infoTempoVencimento(valor, agora = new Date()) {
    const data = dataHoraVencimento(valor);
    if (!data) return null;

    const minuto = 60 * 1000;
    const hora = 60 * minuto;
    const dia = 24 * hora;
    const diff = data - agora;
    const vencido = diff < 0;
    const absoluto = Math.abs(diff);
    const totalMinutos = Math.ceil(absoluto / minuto);
    const diasInteiros = Math.floor(absoluto / dia);
    const horasInteiras = Math.floor((absoluto % dia) / hora);
    const minutosRestantes = Math.ceil((absoluto % hora) / minuto);

    return {
        data,
        diff,
        vencido,
        totalMinutos,
        diasInteiros,
        horasInteiras,
        minutosRestantes,
        diasMensagem: vencido ?-diasInteiros : diasInteiros
    };
}

function vencimentoNoIntervalo(valor, inicio, fim) {
    const data = dataHoraVencimento(valor);
    return Boolean(data && data >= inicio && data <= fim);
}

function numeroMoeda(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;

    let texto = String(valor)
        .replace(/[^\d,.-]/g, '')
        .trim();

    if (texto.includes(',')) {
        texto = texto.replace(/\./g, '').replace(',', '.');
    }

    const numero = Number(texto);

    return Number.isFinite(numero) ?numero : 0;
}

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function valorPrincipalPagamento(pagamento = {}) {
    const valorPlano = numeroMoeda(pagamento.valorPlano);
    return valorPlano > 0 ?valorPlano : numeroMoeda(pagamento.valorTotal);
}

function diasPlanoCliente(cliente = {}) {
    const dias = Number(cliente.diasContrato || 0);
    const plano = String(cliente.plano || '').toLowerCase();

    if (dias > 0) return dias;
    if (plano.includes('trimestral')) return 90;
    if (plano.includes('semestral')) return 180;
    if (plano.includes('anual')) return 365;

    return 30;
}

function grupoPlanoReceita(cliente = {}) {
    const plano = String(cliente.plano || 'Mensal').trim();
    const normalizado = plano.toLowerCase();

    if (normalizado.includes('trimestral')) return 'Trimestral';
    if (normalizado.includes('semestral')) return 'Semestral';
    if (normalizado.includes('anual')) return 'Anual';
    if (normalizado.includes('mensal')) return 'Mensal';

    return plano || 'Outros';
}

function calcularReceitaMensal(clientes) {
    const grupos = new Map();

    clientes
        .filter(cliente => cliente.status === 'ativo' && !clienteEhTeste(cliente))
        .forEach((cliente) => {
            const temHistoricoFinanceiro = Number(cliente.totalPagamentos || 0) > 0;
            const temPagamentoValido = Boolean(cliente.pagamentoPlano);
            const base = temHistoricoFinanceiro
                ?{
                    plano: cliente.pagamentoPlano || cliente.plano,
                    diasContrato: cliente.pagamentoDiasContrato,
                    valorPlano: cliente.pagamentoValorPlano,
                    assinaturaApp: cliente.pagamentoAssinaturaApp
                }
                : cliente;
            const grupo = grupoPlanoReceita(base);
            const dias = diasPlanoCliente(base);
            const valorPlano = temHistoricoFinanceiro && !temPagamentoValido ?0 : numeroMoeda(base.valorPlano);
            const assinaturaApp = temHistoricoFinanceiro && !temPagamentoValido ?0 : numeroMoeda(base.assinaturaApp);
            const mensalPlano = dias > 0 ?(valorPlano / dias) * 30 : valorPlano;
            const mensal = mensalPlano + assinaturaApp;
            const atual = grupos.get(grupo) || { plano: grupo, clientes: 0, total: 0 };

            if (mensal <= 0 && temHistoricoFinanceiro) return;

            atual.clientes += 1;
            atual.total += mensal;
            grupos.set(grupo, atual);
        });

    const ordem = ['Mensal', 'Trimestral', 'Semestral', 'Anual'];
    const itens = Array.from(grupos.values())
        .sort((a, b) => {
            const posA = ordem.indexOf(a.plano);
            const posB = ordem.indexOf(b.plano);
            if (posA !== -1 || posB !== -1) return (posA === -1 ?99 : posA) - (posB === -1 ?99 : posB);
            return a.plano.localeCompare(b.plano, 'pt-BR');
        });
    const total = itens.reduce((soma, item) => soma + item.total, 0);

    return { total, itens };
}

function calcularDiasRestantes(vencimento) {
    const info = infoTempoVencimento(vencimento);
    return info ?info.diasMensagem : null;
}

function calcularResumo(clientes) {
    const hoje = hojeISO();
    const agora = new Date();
    const limite = new Date(agora.getTime() + (DIAS_DASHBOARD * 24 * 60 * 60 * 1000));
    const fimMesISO = fimMesSaoPauloISO();
    const fimMes = new Date(`${fimMesISO}T23:59:59`);

    return {
        total: clientes.length,
        testes: clientes.filter(cliente => cliente.status === 'teste').length,
        ativos: clientes.filter(cliente => cliente.status === 'ativo').length,
        vencidos: clientes.filter(cliente => {
            const vencimento = vencimentoCliente(cliente);
            return !clienteEhTeste(cliente) && vencimento && (vencimento.slice(0, 10) < hoje || vencimentoExpirou(vencimento));
        }).length,
        vencendo: clientes.filter(cliente => {
            const vencimento = vencimentoCliente(cliente);
            return !clienteEhTeste(cliente) && vencimento && vencimentoNoIntervalo(vencimento, agora, limite);
        }).length,
        vencemMes: clientes.filter(cliente => {
            const vencimento = vencimentoCliente(cliente);
            return !clienteEhTeste(cliente) && vencimento && vencimentoNoIntervalo(vencimento, agora, fimMes);
        }).length
    };
}

function clientesComVencimentoProximo(clientes) {
    const agora = new Date();
    const limite = new Date(agora.getTime() + (DIAS_DASHBOARD * 24 * 60 * 60 * 1000));

    return clientes
        .filter(cliente => {
            const vencimento = vencimentoCliente(cliente);
            return !clienteEhTeste(cliente) && vencimento && vencimentoNoIntervalo(vencimento, agora, limite);
        })
        .sort((a, b) => dataHoraVencimento(vencimentoCliente(a)) - dataHoraVencimento(vencimentoCliente(b)));
}

function statusClasse(status) {
    if (status === 'ativo') return 'ok';
    if (status === 'teste') return 'info';
    if (status === 'pendente') return 'info';
    if (status === 'expirado') return 'warn';
    if (status === 'suspenso') return 'warn';
    return 'muted';
}

function textoVencimento(cliente) {
    const vencimento = vencimentoCliente(cliente);
    const dias = calcularDiasRestantes(vencimento);
    const tempo = textoTempoRestante(vencimento);

    if (dias === null) return 'Sem vencimento';
    if (vencimentoExpirou(vencimento)) {
        if (dias === 0) return 'Vencido hoje';
        return `Vencido há ${Math.abs(dias)} dia(s)`;
    }
    if (dias < 0) return `Vencido há ${Math.abs(dias)} dia(s)`;
    if (tempo && tempo !== '-') {
        return `Vence em ${tempo.replace(/ restantes?$/, '')}`;
    }

    return `Vence em ${dias} dia(s)`;
}

function iniciais(nome) {
    const partes = String(nome || '?').trim().split(/\s+/).filter(Boolean);
    const letras = partes.slice(0, 2).map(parte => parte[0]).join('');

    return (letras || '?').toUpperCase();
}

function icon(nome) {
    const icones = {
        logo: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        painel: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        clientes: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
        crm: '<svg viewBox="0 0 24 24"><path d="M3 7h18"/><path d="M6 7v13"/><path d="M12 7v13"/><path d="M18 7v13"/><path d="M4 4h16a1 1 0 0 1 1 1v2H3V5a1 1 0 0 1 1-1Z"/><path d="M3 20h18"/></svg>',
        modelos: '<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
        atendimento: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.4-5.6A8 8 0 1 1 21 12Z"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>',
        apps: '<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
        dispositivos: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3"/><path d="M16 6V3"/><path d="M3 11h18"/></svg>',
        paineis: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8"/><path d="M12 18v4"/></svg>',
        financeiro: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/><path d="M7 6v12"/><path d="M17 6v12"/></svg>',
        sair: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        alert: '<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
        close: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
        whats: '<svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 10.5c.5 2 2 3.5 4 4l1.3-1.3a1 1 0 0 1 1-.2c1 .4 1.7.6 2.7.6"/></svg>',
        arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
        user: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>',
        search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
        edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
        trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
        info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
        image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>'
        ,
        licenca: '<svg viewBox="0 0 24 24"><path d="M15 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M9 7v4h6V7"/><path d="M9 15h6"/></svg>',
        manutencao: '<svg viewBox="0 0 24 24"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>',
        planos: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>',
        trend: '<svg viewBox="0 0 24 24"><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
        refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M16 8h5V3"/></svg>'
    };

    return icones[nome] || '';
}

function layout({ titulo, conteudo, mensagem = '', ativo = 'painel', config = {} }) {
    const status = getStatusWhatsApp();
    const nomeSistema = config.nomeSistema || 'Controle de Cliente IPTV e P2P';
    const logoUrl = config.logoUrl || '';
    const marcaDaguaUrl = '/assets/julian-play-fundo-painel.png';
    const bodyClass = ativo === 'preparacao' ? 'commercial-mode' : ativo === 'painel' ? 'dashboard-page' : '';
    const licenca = calcularEstadoLicenca(config);
    const avisoLicenca = (() => {
        if (!licenca.bloqueioAtivo || !licenca.permitida || licenca.vitalicia) return '';
        const dias = Math.max(0, licenca.diasRestantes);
        if (licenca.status === 'vencendo') return `Atenção: sua licença vence em ${dias} dia(s).`;
        if (licenca.tipo === 'avaliacao') return `Período de avaliação: ${dias} dia(s) restante(s).`;
        return '';
    })();

    return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="${escapar(logoUrl || '/assets/Logo.png')}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <title>${escapar(titulo)} - ${escapar(nomeSistema)}</title>
    <style>
        :root {
            color-scheme: light;
            --font-inter: "Inter", Arial, sans-serif;
            --bg: #f5f6f8;
            --panel: #ffffff;
            --ink: #081225;
            --muted: #6c7383;
            --line: #e4e7ec;
            --blue: #4368e8;
            --blue-soft: #eef2ff;
            --blue-deep: #071b4f;
            --cyan: #11c8d6;
            --gold: #f6b21a;
            --green: #16a76a;
            --green-soft: #dff8ee;
            --red: #ef4444;
            --red-soft: #ffe5e7;
            --orange: #f08a12;
            --orange-soft: #fff2dc;
            --shadow: 0 1px 2px rgba(15, 23, 42, .08), 0 10px 24px rgba(15, 23, 42, .04);
            --shadow-card: 0 1px 2px rgba(8, 18, 37, .08), 0 18px 42px rgba(8, 18, 37, .075);
            --brand-gradient: linear-gradient(120deg, #071b4f 0%, #123c97 42%, #11c8d6 100%);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100vh;
            background:
                radial-gradient(circle at 12% 12%, rgba(17, 200, 214, .12), transparent 26%),
                radial-gradient(circle at 88% 10%, rgba(246, 178, 26, .12), transparent 22%),
                linear-gradient(180deg, #f4f7fb 0%, #eef2f7 100%);
            color: var(--ink);
            font-family: var(--font-inter);
        }

        body::before {
            content: "";
            position: fixed;
            left: clamp(18px, 3.2vw, 64px);
            top: 132px;
            width: clamp(220px, 14vw, 300px);
            height: calc(100vh - 158px);
            background: url("${escapar(marcaDaguaUrl)}") center top / contain no-repeat;
            opacity: .22;
            pointer-events: none;
            z-index: 0;
            filter: saturate(1.1) contrast(1.06);
        }

        svg {
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 2;
            flex: 0 0 auto;
        }

        a, button, input, select {
            font: inherit;
        }

        a {
            color: inherit;
            text-decoration: none;
        }

        button {
            border: 0;
            cursor: pointer;
        }

        .top-shell {
            background:
                linear-gradient(90deg, rgba(7, 27, 79, .98), rgba(18, 60, 151, .96) 48%, rgba(17, 200, 214, .92)),
                var(--brand-gradient);
            border-bottom: 1px solid rgba(255, 255, 255, .18);
            position: sticky;
            top: 0;
            z-index: 10;
            backdrop-filter: blur(10px);
            box-shadow: 0 14px 34px rgba(7, 27, 79, .18);
        }

        .topbar, main {
            width: min(1760px, calc(100% - 24px));
            margin: 0 auto;
        }

        main {
            position: relative;
            z-index: 1;
        }

        .topbar {
            width: min(1980px, calc(100% - 24px));
            min-height: 76px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .brand {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            flex: 0 0 150px;
            min-width: 132px;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.05;
            color: #fff;
        }

        .brand form {
            margin: 0;
        }

        .brand-text {
            font-weight: 800;
            overflow-wrap: anywhere;
        }

        .brand-icon {
            display: grid;
            place-items: center;
            width: 42px;
            height: 42px;
            color: #fff;
            background: var(--blue);
            border-radius: 14px;
        }

        .brand-logo {
            width: 42px;
            height: 42px;
            object-fit: contain;
            border-radius: 10px;
            background: rgba(255, 255, 255, .96);
            border: 1px solid rgba(255, 255, 255, .42);
            box-shadow: 0 8px 20px rgba(0, 0, 0, .18);
        }

        nav {
            flex: 1 1 auto;
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 3px;
            color: rgba(255, 255, 255, .78);
            font-weight: 700;
            overflow-x: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }

        nav::-webkit-scrollbar {
            display: none;
        }

        .navlink {
            min-height: 38px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 0 7px;
            border-radius: 10px;
            font-size: 13px;
            white-space: nowrap;
            flex: 0 0 auto;
            transition: background .18s ease, color .18s ease, transform .18s ease;
        }

        .navlink:hover {
            background: rgba(255, 255, 255, .12);
            color: #fff;
        }

        .navlink.active {
            background: rgba(255, 255, 255, .96);
            color: var(--blue-deep);
            box-shadow: 0 10px 24px rgba(0, 0, 0, .18);
        }

        .navlink.disabled {
            pointer-events: none;
        }

        main {
            padding: 38px 0 54px;
        }

        .page-title {
            margin: 0 0 34px;
        }

        h1 {
            margin: 0 0 6px;
            font-size: 34px;
            line-height: 1.15;
            letter-spacing: 0;
        }

        .subtitle, .helper {
            color: var(--muted);
        }

        .subtitle {
            font-size: 19px;
        }

        .notice {
            margin-bottom: 18px;
            padding: 13px 16px;
            border: 1px solid #b8efd5;
            border-radius: 10px;
            background: #ecfbf4;
            color: #12623f;
            font-weight: 700;
        }

        .notice.warn {
            border-color: #ffd99d;
            background: #fff7e8;
            color: #8a4b00;
        }

        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 36px;
        }

        .dashboard-metrics {
            grid-template-columns: repeat(8, minmax(0, 1fr));
            gap: 9px;
        }

        .client-summary-metrics {
            grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
            gap: 14px;
        }

        .metric, .panel {
            background: rgba(255, 255, 255, .94);
            border: 1px solid rgba(226, 232, 240, .92);
            border-radius: 16px;
            box-shadow: var(--shadow-card);
            backdrop-filter: blur(8px);
        }

        .metric {
            position: relative;
            min-height: 142px;
            padding: 26px 28px;
            display: flex;
            justify-content: space-between;
            gap: 16px;
            overflow: hidden;
        }

        .metric::before {
            content: "";
            position: absolute;
            inset: 0 auto 0 0;
            width: 4px;
            background: linear-gradient(180deg, var(--cyan), var(--blue));
            opacity: .78;
        }

        .dashboard-metrics .metric {
            min-height: 124px;
            padding: 16px 12px;
            gap: 7px;
        }

        .client-summary-metrics .metric {
            min-height: 118px;
            padding: 16px 12px;
            gap: 7px;
            min-width: 0;
            overflow: visible;
        }

        .client-summary-metrics .metric > div {
            min-width: 0;
            flex: 1 1 auto;
        }

        .client-summary-metrics .metric-label {
            margin-bottom: 8px;
            font-size: 13px;
            line-height: 1.15;
        }

        .client-summary-metrics .metric-value {
            font-size: clamp(18px, 1.2vw, 24px);
            font-weight: 800;
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
            overflow-wrap: anywhere;
            max-width: 100%;
            line-height: 1.08;
        }

        .client-summary-metrics .metric-note {
            margin-top: 8px;
            font-size: 11px;
            line-height: 1.2;
            white-space: normal;
            overflow-wrap: anywhere;
        }

        .metric-label {
            display: block;
            margin-bottom: 14px;
            color: var(--muted);
            font-size: 16px;
            font-weight: 700;
        }

        .dashboard-metrics .metric-label {
            margin-bottom: 8px;
            font-size: 13px;
            line-height: 1.15;
        }

        .metric-value {
            display: block;
            color: var(--ink);
            font-size: 35px;
            font-weight: 800;
            line-height: 1;
        }

        .dashboard-metrics .metric-value {
            font-size: 28px;
        }

        .client-summary-metrics .metric-date .metric-value {
            font-size: clamp(18px, 1.05vw, 21px);
            white-space: normal;
        }

        .client-summary-metrics .metric-icon {
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
        }

        .metric-note {
            display: block;
            margin-top: 14px;
            color: var(--muted);
            font-size: 14px;
            font-weight: 600;
        }

        .back-to-top {
            position: fixed;
            right: max(22px, env(safe-area-inset-right));
            bottom: max(22px, env(safe-area-inset-bottom));
            z-index: 90;
            width: 48px;
            height: 48px;
            border: 0;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, var(--blue), var(--cyan));
            color: #fff;
            box-shadow: 0 12px 28px rgba(30, 64, 175, .28);
            font-size: 25px;
            font-weight: 900;
            line-height: 1;
            cursor: pointer;
            opacity: 0;
            visibility: hidden;
            transform: translateY(12px);
            transition: opacity .2s ease, transform .2s ease, visibility .2s;
        }

        .back-to-top.visible {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .back-to-top:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 32px rgba(30, 64, 175, .34);
        }

        .back-to-top:focus-visible {
            outline: 3px solid rgba(37, 99, 235, .35);
            outline-offset: 3px;
        }

        .dashboard-metrics .metric-note {
            margin-top: 8px;
            font-size: 11px;
            line-height: 1.2;
        }

        .metric-icon {
            display: grid;
            place-items: center;
            width: 52px;
            height: 52px;
            border-radius: 14px;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .62);
        }

        .dashboard-metrics .metric-icon {
            width: 32px;
            height: 32px;
            border-radius: 9px;
        }

        .metric-icon.blue { background: var(--blue-soft); color: var(--blue); }
        .metric-icon.info { background: var(--blue-soft); color: var(--blue); }
        .metric-icon.green { background: var(--green-soft); color: var(--green); }
        .metric-icon.red { background: var(--red-soft); color: var(--red); }
        .metric-icon.orange { background: var(--orange-soft); color: var(--orange); }

        .revenue-card {
            padding: 30px 34px;
            margin-bottom: 36px;
        }

        .revenue-head {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            align-items: flex-start;
            margin-bottom: 26px;
        }

        .revenue-title {
            color: var(--muted);
            font-size: 18px;
            font-weight: 700;
        }

        .revenue-total {
            display: block;
            margin-top: 10px;
            font-size: 38px;
            line-height: 1;
            font-weight: 800;
        }

        .revenue-note {
            display: block;
            margin-top: 12px;
            color: var(--muted);
            font-weight: 600;
        }

        .revenue-icon {
            display: grid;
            place-items: center;
            width: 54px;
            height: 54px;
            border-radius: 14px;
            background: var(--blue-soft);
            color: var(--blue);
        }

        .revenue-list {
            display: grid;
            gap: 14px;
            padding-top: 24px;
            border-top: 1px solid var(--line);
        }

        .revenue-row {
            display: grid;
            grid-template-columns: minmax(110px, 1fr) minmax(90px, .8fr) minmax(90px, 140px) minmax(90px, auto);
            gap: 14px;
            align-items: center;
        }

        .revenue-plan {
            color: var(--muted);
            font-size: 16px;
            font-weight: 600;
        }

        .revenue-count {
            color: var(--muted);
            font-weight: 600;
        }

        .revenue-bar {
            height: 7px;
            border-radius: 999px;
            background: #eef0f4;
            overflow: hidden;
        }

        .revenue-bar span {
            display: block;
            width: var(--bar-width);
            height: 100%;
            border-radius: inherit;
            background: var(--blue);
        }

        .revenue-value {
            text-align: right;
            font-size: 17px;
            font-weight: 800;
            white-space: nowrap;
        }

        .finance-breakdown-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 22px;
            margin-bottom: 28px;
        }

        .finance-breakdown-grid .revenue-card {
            margin-bottom: 0;
        }

        .panel {
            overflow: hidden;
        }

        .panel-head {
            min-height: 112px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            padding: 28px;
            border-bottom: 1px solid rgba(226, 232, 240, .9);
            background: linear-gradient(180deg, rgba(248, 250, 252, .9), rgba(255, 255, 255, .62));
        }

        .panel-title {
            margin: 0 0 6px;
            font-size: 22px;
            letter-spacing: 0;
        }

        .actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
        }

        .button {
            min-height: 38px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            padding: 0 16px;
            border-radius: 10px;
            border: 1px solid transparent;
            background: linear-gradient(135deg, #4368e8, #2457d6);
            color: #fff;
            font-weight: 800;
            white-space: nowrap;
            box-shadow: 0 8px 18px rgba(67, 104, 232, .22);
            transition: transform .16s ease, box-shadow .16s ease, filter .16s ease;
        }

        .button:hover {
            transform: translateY(-1px);
            filter: brightness(1.02);
            box-shadow: 0 12px 24px rgba(67, 104, 232, .28);
        }

        .button.green {
            background: linear-gradient(135deg, #16a34a, #0f8f5a);
            box-shadow: 0 8px 18px rgba(22, 163, 74, .22);
        }

        .button.secondary {
            background: rgba(255, 255, 255, .94);
            color: var(--ink);
            border-color: var(--line);
            box-shadow: 0 1px 6px rgba(15, 23, 42, .06);
        }

        .button.danger {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            box-shadow: 0 8px 18px rgba(239, 68, 68, .22);
        }

        .button.orange,
        .button.warn {
            background: linear-gradient(135deg, #f59e0b, #ea580c);
            box-shadow: 0 8px 18px rgba(240, 138, 18, .22);
        }

        .button.icon-only {
            width: 38px;
            padding: 0;
            border-radius: 999px;
        }

        .pagination {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            padding: 16px 18px;
            border-top: 1px solid var(--line);
            color: var(--muted);
            font-weight: 700;
        }

        .pagination-info {
            margin-right: auto;
            font-size: 14px;
        }

        .pagination-size {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            color: var(--muted);
            font-size: 13px;
            white-space: nowrap;
        }

        .pagination-size select {
            width: auto;
            min-width: 70px;
            margin: 0;
            padding: 7px 28px 7px 10px;
            border: 1px solid var(--line);
            border-radius: 9px;
            background-color: #fff;
            color: var(--ink);
            font-weight: 800;
        }

        .page-link {
            min-width: 36px;
            min-height: 34px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 10px;
            border-radius: 9px;
            border: 1px solid var(--line);
            background: #fff;
            color: var(--ink);
            font-size: 14px;
            box-shadow: 0 1px 6px rgba(15, 23, 42, .04);
        }

        .page-link.active {
            border-color: var(--blue);
            background: var(--blue);
            color: #fff;
        }

        .page-link.disabled {
            pointer-events: none;
            opacity: .45;
        }

        @media (min-width: 981px) {
            .dashboard-page main { padding-top: 16px; padding-bottom: 12px; }
            .dashboard-page .page-title { margin-bottom: 12px; }
            .dashboard-page h1 { margin-bottom: 2px; font-size: 34px; }
            .dashboard-page .subtitle { font-size: 16px; }
            .dashboard-page .dashboard-metrics { gap: 8px; margin-bottom: 12px; }
            .dashboard-page .dashboard-metrics .metric { min-height: 78px; padding: 11px 10px; }
            .dashboard-page .dashboard-metrics .metric-label { margin-bottom: 5px; font-size: 13px; }
            .dashboard-page .dashboard-metrics .metric-value { font-size: 28px; }
            .dashboard-page .dashboard-metrics .metric-note { margin-top: 4px; font-size: 11px; }
            .dashboard-page .dashboard-metrics .metric-icon { width: 28px; height: 28px; }
            .dashboard-page .dashboard-campaign { margin-bottom: 12px !important; }
            .dashboard-page .panel-head { min-height: 66px; padding: 12px 18px; }
            .dashboard-page .panel-title { margin-bottom: 3px; font-size: 22px; }
            .dashboard-page .button { min-height: 32px; padding: 0 12px; font-size: 14px; }
            .dashboard-page select { min-height: 32px; padding-top: 5px; padding-bottom: 5px; font-size: 14px; }
            .dashboard-page .revenue-card { margin-bottom: 12px; padding: 14px 20px; }
            .dashboard-page .revenue-head { align-items: center; margin-bottom: 10px; }
            .dashboard-page .revenue-title { font-size: 16px; }
            .dashboard-page .revenue-total { display: inline-block; margin-top: 4px; margin-right: 10px; font-size: 34px; }
            .dashboard-page .revenue-note { display: inline; margin-top: 0; font-size: 13px; }
            .dashboard-page .revenue-icon { width: 38px; height: 38px; border-radius: 10px; }
            .dashboard-page .revenue-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 28px; padding-top: 9px; }
            .dashboard-page .revenue-row { grid-template-columns: minmax(85px, 1fr) auto 74px auto; gap: 8px; }
            .dashboard-page .revenue-plan,
            .dashboard-page .revenue-count,
            .dashboard-page .revenue-value { font-size: 14px; }
            .dashboard-page .client-row { min-height: 48px; grid-template-columns: 38px minmax(170px, 1fr) minmax(170px, auto) auto auto; padding: 6px 14px; }
            .dashboard-page .avatar { width: 34px; height: 34px; font-size: 13px; }
            .dashboard-page .client-name,
            .dashboard-page .due { font-size: 15px; }
            .dashboard-page .due-date,
            .dashboard-page .helper { font-size: 13px; }
            .dashboard-page .badge { min-height: 23px; padding: 0 9px; font-size: 12px; }
            .dashboard-page .pagination { gap: 5px; padding: 7px 12px; }
            .dashboard-page .page-link { min-width: 30px; min-height: 28px; padding: 0 8px; font-size: 14px; }
        }

        .commercial-mode main {
            width: min(1560px, calc(100% - 28px));
        }

        .commercial-mode .page-title {
            position: relative;
            min-height: 168px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            margin-bottom: 28px;
            padding: 28px 34px;
            border-radius: 18px;
            color: #fff;
            overflow: hidden;
            background:
                linear-gradient(120deg, rgba(7, 27, 79, .96), rgba(18, 60, 151, .88) 52%, rgba(17, 200, 214, .78));
            box-shadow: 0 18px 42px rgba(7, 27, 79, .22);
        }

        .commercial-mode .page-title::after {
            content: "";
            position: absolute;
            inset: auto -40px -70px auto;
            width: 260px;
            height: 180px;
            border-radius: 999px;
            background: rgba(246, 178, 26, .24);
            filter: blur(4px);
        }

        .commercial-mode .page-title h1,
        .commercial-mode .page-title .subtitle {
            position: relative;
            z-index: 1;
            max-width: 820px;
            color: #fff;
        }

        .commercial-mode .page-title .subtitle {
            color: rgba(255, 255, 255, .84);
        }

        .commercial-mode .metric::before {
            background: linear-gradient(180deg, var(--gold), var(--cyan));
        }

        .client-row {
            min-height: 84px;
            display: grid;
            grid-template-columns: 54px minmax(170px, 1fr) minmax(170px, auto) auto auto;
            align-items: center;
            gap: 12px;
            padding: 18px 20px;
            border-bottom: 1px solid var(--line);
        }

        .client-row:last-child {
            border-bottom: 0;
        }

        .avatar {
            display: grid;
            place-items: center;
            width: 48px;
            height: 48px;
            border-radius: 999px;
            background: var(--blue-soft);
            color: var(--blue);
            font-weight: 800;
        }

        .client-name {
            font-size: 18px;
            font-weight: 800;
        }

        .due {
            text-align: right;
            color: var(--orange);
            font-size: 16px;
            font-weight: 800;
        }

        .due.expired {
            color: var(--red);
        }

        .due-date {
            margin-top: 3px;
            color: var(--muted);
            font-size: 14px;
            font-weight: 600;
        }

        .badge {
            display: inline-flex;
            min-height: 28px;
            align-items: center;
            border-radius: 999px;
            padding: 0 12px;
            font-size: 13px;
            font-weight: 800;
        }

        .badge.ok { background: #c9f7e2; color: #047446; }
        .badge.info { background: #dfe9ff; color: #3158cf; }
        .badge.warn { background: #fff0d5; color: #a76100; }
        .badge.error { background: var(--red-soft); color: #c52e35; }
        .badge.muted { background: #eef1f5; color: #576171; }

        .empty {
            padding: 30px;
            color: var(--muted);
            text-align: center;
            font-weight: 700;
        }

        .toolbar {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            flex-wrap: wrap;
            margin-bottom: 16px;
        }

        .search {
            display: flex;
            gap: 9px;
            flex-wrap: wrap;
        }

        input, select {
            width: 100%;
            min-height: 42px;
            padding: 9px 12px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
            color: var(--ink);
            outline-color: var(--blue);
        }

        textarea {
            width: 100%;
            min-height: 180px;
            padding: 13px 14px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
            color: var(--ink);
            font: inherit;
            line-height: 1.5;
            resize: vertical;
            outline-color: var(--blue);
        }

        textarea[name="observacoes"] {
            min-height: 72px;
        }

        .message-editor {
            position: relative;
        }

        .emoji-toolbar {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            flex-wrap: wrap;
            margin: 8px 0 10px;
        }

        .emoji-picker {
            width: min(560px, 100%);
            max-height: 280px;
            overflow: auto;
            padding: 8px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
            box-shadow: var(--shadow);
        }

        .emoji-picker[hidden] {
            display: none;
        }

        .emoji-search {
            width: 100%;
            min-height: 36px;
            margin-bottom: 8px;
            border-radius: 8px;
        }

        .emoji-group {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
            gap: 5px;
        }

        .emoji-title {
            margin: 8px 0 6px;
            color: var(--muted);
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
        }

        .emoji-picker button {
            width: 34px;
            height: 34px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: #fff;
            cursor: pointer;
            font-size: 18px;
        }

        .search input {
            width: min(380px, 100%);
        }

        .atendimentos-filters {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            flex: 1;
            max-width: 720px;
        }
        .atendimentos-filters input { flex: 2 1 220px; min-width: 0; }
        .atendimentos-filters select { flex: 1 1 180px; width: auto; min-width: 0; }
        @media (max-width: 640px) {
            .atendimentos-filters { width: 100%; }
            .atendimentos-filters input, .atendimentos-filters select { flex-basis: 100%; width: 100%; }
        }

        form.fields {
            display: grid;
            grid-template-columns: repeat(4, minmax(150px, 1fr));
            gap: 14px;
            padding: 28px;
        }

        label {
            color: var(--muted);
            font-size: 14px;
            font-weight: 800;
        }

        label input, label select {
            margin-top: 7px;
        }

        .full {
            grid-column: 1 / -1;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 14px 12px;
            border-bottom: 1px solid var(--line);
            text-align: left;
            vertical-align: middle;
        }

        th {
            color: var(--muted);
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
        }

        .row-actions {
            display: flex;
            gap: 4px;
            justify-content: flex-end;
        }

        .row-actions .button.icon-only {
            width: 30px;
            min-height: 30px;
        }

        .row-actions svg {
            width: 17px;
            height: 17px;
        }

        .vars {
            display: flex;
            gap: 14px;
            flex-wrap: wrap;
            padding: 20px 22px;
            align-items: center;
        }

        .var-token {
            display: inline-flex;
            min-height: 28px;
            align-items: center;
            padding: 0 9px;
            border-radius: 7px;
            background: #f2f4f7;
            border: 1px solid var(--line);
            color: #334155;
            font-family: Consolas, monospace;
            font-size: 14px;
            font-weight: 800;
        }

        button.var-token {
            cursor: pointer;
        }

        button.var-token:hover {
            border-color: var(--primary);
            color: var(--primary);
        }

        .model-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(260px, 1fr));
            gap: 18px;
        }

        .model-card {
            min-height: 245px;
            background: #fff;
            border: 1px solid var(--line);
            border-radius: 14px;
            box-shadow: var(--shadow);
            padding: 22px;
        }

        .model-top {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            align-items: flex-start;
            margin-bottom: 14px;
        }

        .model-actions {
            display: flex;
            gap: 8px;
        }

        .model-preview {
            margin-top: 14px;
            min-height: 124px;
            max-height: 170px;
            overflow: hidden;
            white-space: pre-wrap;
            line-height: 1.55;
            color: var(--muted);
            background: #f7f7f8;
            border-radius: 12px;
            padding: 16px;
        }

        .chip {
            display: inline-flex;
            min-height: 28px;
            align-items: center;
            border-radius: 999px;
            padding: 0 12px;
            font-size: 14px;
            font-weight: 800;
            background: var(--blue-soft);
            color: var(--blue);
            border: 1px solid #cfe0ff;
        }

        .chip.green { background: var(--green-soft); color: var(--green); border-color: #b8efd5; }
        .chip.orange { background: var(--orange-soft); color: var(--orange); border-color: #ffd99d; }
        .chip.red { background: var(--red-soft); color: var(--red); border-color: #ffc9cf; }
        .chip.purple { background: #f2e8ff; color: #7c3aed; border-color: #ddd6fe; }

        .logo-config {
            display: grid;
            grid-template-columns: 1fr 1fr auto auto;
            gap: 14px;
            align-items: end;
            padding: 22px;
        }

        .logo-upload input {
            display: none;
        }

        .logo-click {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
        }

        .logo-click input {
            display: none;
        }

        .logo-click button {
            border: 0;
            background: transparent;
            padding: 0;
            color: inherit;
            cursor: pointer;
        }

        .logo-click .brand-logo,
        .logo-click .brand-icon {
            transition: transform .15s ease, box-shadow .15s ease;
        }

        .logo-click:hover .brand-logo,
        .logo-click:hover .brand-icon {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(15, 23, 42, .12);
        }

        .logo-preview {
            display: flex;
            gap: 12px;
            align-items: center;
            padding: 14px 22px 0;
        }

        .client-form {
            grid-template-columns: repeat(2, minmax(240px, 1fr));
        }

        .client-alert-list {
            display: grid;
            gap: 10px;
            margin: 0 0 18px;
        }

        .client-alert-item {
            padding: 12px 14px;
            border: 1px solid #ffd99d;
            border-radius: 10px;
            background: #fffaf0;
            color: #713f12;
            font-weight: 700;
        }

        .client-alert-item small {
            display: block;
            margin-top: 4px;
            color: #8a4b00;
            font-weight: 600;
        }

        .notes-list {
            display: grid;
            gap: 10px;
            margin-top: 14px;
        }

        .note-item {
            padding: 12px 14px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #f8fafc;
        }

        .note-date {
            display: block;
            margin-bottom: 5px;
            color: var(--muted);
            font-size: 12px;
            font-weight: 800;
        }

        .model-send-body {
            padding: 24px;
        }

        .model-send-body .notice {
            margin-bottom: 20px;
        }

        .model-choice-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 16px;
        }

        .model-choice {
            position: relative;
            min-height: 190px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding: 20px;
            border: 1px solid var(--line);
            border-radius: 14px;
            background: linear-gradient(180deg, #fff, #f8fafc);
            cursor: pointer;
            transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease, background .16s ease;
        }

        .model-choice:hover {
            transform: translateY(-2px);
            border-color: #93b4ff;
            box-shadow: 0 12px 28px rgba(37, 87, 214, .12);
        }

        .model-choice:has(input:checked) {
            border-color: #3672ed;
            background: linear-gradient(180deg, #f7faff, #edf4ff);
            box-shadow: 0 0 0 3px rgba(54, 114, 237, .13), 0 14px 30px rgba(37, 87, 214, .14);
        }

        .model-choice input[type="radio"] {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 22px;
            height: 22px;
            margin: 0;
            accent-color: #2563eb;
            cursor: pointer;
        }

        .model-choice-head {
            min-width: 0;
            padding-right: 36px;
        }

        .model-choice-title {
            display: block;
            color: var(--ink);
            font-size: 17px;
            line-height: 1.3;
            font-weight: 900;
        }

        .model-choice-plan {
            display: inline-flex;
            margin-top: 9px;
            padding: 5px 9px;
            border-radius: 999px;
            background: #eaf0ff;
            color: #2956bd;
            font-size: 12px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: .03em;
        }

        .model-choice-preview {
            flex: 1;
            margin: 0;
            padding-top: 13px;
            border-top: 1px solid #e4eaf3;
            color: #556176;
            font-size: 14px;
            line-height: 1.5;
            font-weight: 650;
        }

        .model-send-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 22px;
            padding-top: 20px;
            border-top: 1px solid var(--line);
        }

        .model-client-head {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .model-client-icon {
            width: 46px;
            height: 46px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 13px;
            background: linear-gradient(135deg, #e7efff, #effcff);
            color: #285bd3;
        }

        .model-client-icon svg {
            width: 23px;
            height: 23px;
        }

        .form-section {
            margin-top: 10px;
            padding-top: 22px;
            border-top: 1px solid var(--line);
            color: var(--muted);
            font-size: 15px;
            font-weight: 900;
            letter-spacing: .04em;
            text-transform: uppercase;
        }

        .panel > .form-section {
            padding-left: 28px;
            padding-right: 28px;
        }

        .panel-content {
            padding: 28px;
        }

        .panel-content .form-section:first-child {
            margin-top: 0;
            padding-top: 0;
            border-top: 0;
        }

        .danger-zone {
            margin-top: 24px;
            padding: 20px;
            border: 1px solid rgba(239, 68, 68, .3);
            border-radius: 12px;
            background: rgba(254, 242, 242, .72);
        }

        .danger-zone h3 {
            margin: 0 0 6px;
            color: #b91c1c;
        }

        .client-form .form-section:first-of-type {
            margin-top: 0;
            padding-top: 0;
            border-top: 0;
        }

        .inline-field {
            display: grid;
            grid-template-columns: minmax(120px, 1fr) 46px;
            gap: 10px;
            margin-top: 7px;
        }

        .phone-field {
            display: grid;
            grid-template-columns: minmax(220px, 280px) minmax(120px, 1fr);
            align-items: center;
            margin-top: 7px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
            overflow: hidden;
        }

        .phone-country {
            display: grid;
            grid-template-columns: 36px minmax(0, 1fr);
            align-items: center;
            min-height: 42px;
            border-right: 1px solid var(--line);
            background: #f7f8fb;
        }

        .phone-country .country-flag {
            margin-left: 10px;
            width: 24px;
            height: 16px;
            object-fit: cover;
            border-radius: 2px;
            box-shadow: 0 0 0 1px rgba(15, 23, 42, .14);
        }

        .phone-field .phone-prefix {
            min-height: 42px;
            color: var(--ink);
            background: transparent;
            font-weight: 700;
            padding: 0 10px 0 2px;
        }

        .phone-field input,
        .phone-field select {
            margin-top: 0;
            border: 0;
            border-radius: 0;
        }

        .inline-field input {
            margin-top: 0;
        }

        .multi-chips {
            min-height: 31px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin: 8px 0;
        }

        .multi-chips:empty::before {
            content: attr(data-empty);
            color: var(--muted);
            font-style: italic;
            font-weight: 600;
        }

        .selected-chip {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 34px;
            padding: 0 12px;
            border-radius: 10px;
            background: #f7f8fb;
            color: var(--ink);
            font-weight: 700;
        }

        .selected-chip button {
            width: auto;
            min-height: 0;
            padding: 0;
            border: 0;
            background: transparent;
            color: var(--ink);
            font-size: 18px;
            font-weight: 500;
            line-height: 1;
        }

        .app-access-list {
            display: grid;
            gap: 12px;
            padding: 16px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #f8fafc;
        }

        .app-access-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
        }

        .app-access-header strong,
        .app-access-header span {
            display: block;
        }

        .app-access-header strong {
            color: var(--ink);
            font-size: 15px;
        }

        .app-access-header span {
            margin-top: 3px;
            color: var(--muted);
            font-size: 13px;
            font-weight: 600;
        }

        #listaAcessosApp {
            display: grid;
            gap: 10px;
        }

        .app-access-row {
            display: grid;
            grid-template-columns: repeat(4, minmax(150px, 1fr));
            gap: 10px;
            align-items: end;
            padding: 12px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
        }

        .remove-app-access {
            width: 42px;
            justify-self: start;
        }

        .app-access-row label {
            font-size: 12px;
        }

        .app-access-row input,
        .app-access-row select {
            min-height: 38px;
            font-size: 13px;
        }

        .toggle-line {
            min-height: 42px;
            display: flex;
            align-items: center;
            gap: 12px;
            margin-top: 22px;
            color: var(--ink);
            font-size: 16px;
        }

        .toggle-line input {
            width: 42px;
            height: 24px;
            min-height: 24px;
            accent-color: var(--blue);
        }

        .clients-panel {
            padding: 0;
        }

        .clients-toolbar {
            display: grid;
            grid-template-columns: minmax(260px, 1fr) 170px 170px 180px;
            gap: 14px;
            margin-bottom: 22px;
        }

        .clients-search {
            position: relative;
        }

        .clients-search svg {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--muted);
        }

        .clients-search input {
            padding-left: 46px;
        }

        .client-tags {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
            margin-top: 6px;
        }

        .tag-chip {
            display: inline-flex;
            align-items: center;
            min-height: 22px;
            padding: 0 8px;
            border-radius: 999px;
            background: #eef2ff;
            color: #3158cf;
            font-size: 12px;
            font-weight: 800;
        }

        .tag-chip.warn {
            background: #fff0d5;
            color: #a76100;
        }

        .clients-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            background: #fff;
            border: 1px solid var(--line);
            border-radius: 14px;
            overflow: hidden;
            box-shadow: var(--shadow);
            table-layout: auto;
        }

        .clients-table th:nth-child(1), .clients-table td:nth-child(1) { width: 17%; }
        .clients-table th:nth-child(2), .clients-table td:nth-child(2) { width: 12%; }
        .clients-table th:nth-child(3), .clients-table td:nth-child(3) { width: 10%; white-space: nowrap; }
        .clients-table th:nth-child(4), .clients-table td:nth-child(4) { width: 13%; white-space: nowrap; }
        .clients-table th:nth-child(5), .clients-table td:nth-child(5) { width: 18%; }
        .clients-table th:nth-child(6), .clients-table td:nth-child(6) { width: 15%; }
        .clients-table th:nth-child(7), .clients-table td:nth-child(7) { width: 8%; white-space: nowrap; }
        .clients-table th:nth-child(8), .clients-table td:nth-child(8) { width: 7%; white-space: nowrap; }

        .clients-table th {
            padding: 12px 10px;
            color: var(--muted);
            font-size: 13px;
            font-weight: 800;
            text-transform: none;
            white-space: nowrap;
        }

        .clients-table td {
            padding: 12px 10px;
            border-bottom: 1px solid var(--line);
            font-size: 14px;
            vertical-align: top;
        }

        .clients-table tr:last-child td {
            border-bottom: 0;
        }

        .cell-title {
            font-weight: 700;
            color: var(--ink);
            font-size: 15px;
            line-height: 1.25;
            white-space: nowrap;
        }

        .cell-muted {
            color: var(--muted);
            font-size: 13px;
            line-height: 1.25;
            white-space: nowrap;
        }

        .country-flag-inline {
            display: inline-block;
            width: 18px;
            height: 13px;
            margin-right: 7px;
            border-radius: 2px;
            object-fit: cover;
            box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.10);
            vertical-align: -1px;
        }

        .app-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            min-height: 24px;
            margin: 0 4px 4px 0;
            padding: 0 8px;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: #fff;
            color: var(--ink);
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
        }

        .device-chip {
            display: inline-flex;
            min-height: 24px;
            margin: 0 4px 4px 0;
            padding: 0 8px;
            align-items: center;
            border-radius: 999px;
            background: #f2f4f7;
            color: var(--ink);
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
        }

        .installed-chip {
            display: inline-flex;
            min-height: 25px;
            padding: 0 10px;
            align-items: center;
            border-radius: 999px;
            border: 1px solid #9ee7c7;
            background: #e8fbf2;
            color: #00875a;
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
        }

        .icon-action {
            color: #637083;
            background: transparent;
            border: 0;
            box-shadow: none;
        }

        .icon-action.whats {
            color: #009b72;
        }

        .icon-action.refresh {
            color: #1d5cff;
        }

        .catalog-panel {
            max-width: 980px;
        }

        .catalog-row {
            min-height: 98px;
            display: grid;
            grid-template-columns: 44px minmax(180px, 1fr) auto;
            align-items: center;
            gap: 18px;
            padding: 22px 30px;
            border-bottom: 1px solid var(--line);
        }

        .catalog-row:last-child {
            border-bottom: 0;
        }

        .catalog-icon, .device-icon {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            color: var(--blue);
        }

        .catalog-name, .device-name {
            color: var(--ink);
            font-size: 19px;
            font-weight: 700;
        }

        .catalog-desc {
            margin-top: 5px;
            color: var(--muted);
            font-size: 17px;
        }

        .device-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(220px, 1fr));
            gap: 18px;
        }

        .device-card {
            min-height: 96px;
            display: grid;
            grid-template-columns: 64px minmax(120px, 1fr) auto;
            align-items: center;
            gap: 14px;
            padding: 22px;
            background: #fff;
            border: 1px solid var(--line);
            border-radius: 14px;
            box-shadow: var(--shadow);
        }

        .device-icon {
            width: 52px;
            height: 52px;
            border-radius: 14px;
            background: var(--blue-soft);
        }

        @media (max-width: 980px) {
            body::before {
                left: -48px;
                width: 240px;
                opacity: .13;
            }

            .topbar {
                align-items: flex-start;
                flex-direction: column;
                padding: 16px 0;
            }

            nav {
                width: 100%;
                overflow-x: auto;
                padding-bottom: 4px;
            }

            .metrics {
                grid-template-columns: repeat(2, minmax(150px, 1fr));
            }

            .dashboard-metrics {
                grid-template-columns: repeat(2, minmax(150px, 1fr));
            }

            .revenue-row {
                grid-template-columns: minmax(100px, 1fr) minmax(82px, auto) minmax(90px, auto);
            }

            .revenue-bar {
                display: none;
            }

            .model-grid {
                grid-template-columns: 1fr;
            }

            .device-grid {
                grid-template-columns: repeat(2, minmax(180px, 1fr));
            }

            .logo-config {
                grid-template-columns: 1fr;
            }

            .client-row {
                grid-template-columns: 48px 1fr;
            }

            .due, .client-row .badge, .client-row .button {
                grid-column: 2;
                justify-self: start;
                text-align: left;
            }

            form.fields {
                grid-template-columns: 1fr;
            }

            .app-access-header,
            .app-access-row {
                display: grid;
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 640px) {
            body::before {
                display: none;
            }

            .topbar, main {
                width: min(100% - 24px, 1250px);
            }

            h1 {
                font-size: 28px;
            }

            .metrics {
                grid-template-columns: 1fr;
            }

            .dashboard-metrics {
                grid-template-columns: 1fr;
            }

            .metric {
                min-height: 120px;
            }

            .revenue-card {
                padding: 24px 20px;
            }

            .revenue-head {
                align-items: flex-start;
            }

            .revenue-total {
                font-size: 30px;
            }

            .revenue-row {
                grid-template-columns: 1fr;
                gap: 4px;
            }

            .revenue-value {
                text-align: left;
            }

            .panel-head {
                align-items: flex-start;
                flex-direction: column;
            }

            table, thead, tbody, th, td, tr {
                display: block;
            }

            thead {
                display: none;
            }

            tr {
                border-bottom: 1px solid var(--line);
                padding: 12px 0;
            }

            td {
                border: 0;
                padding: 7px 14px;
            }

            td::before {
                content: attr(data-label);
                display: block;
                color: var(--muted);
                font-size: 12px;
                font-weight: 800;
                text-transform: uppercase;
                margin-bottom: 2px;
            }

            .row-actions {
                justify-content: flex-start;
            }

            .pagination {
                align-items: stretch;
                flex-wrap: wrap;
                justify-content: flex-start;
            }

            .pagination-info {
                width: 100%;
                margin-right: 0;
            }

            .clients-toolbar {
                grid-template-columns: 1fr;
            }

            .catalog-row, .device-card {
                grid-template-columns: 44px 1fr;
            }

            .catalog-row .model-actions, .device-card .model-actions {
                grid-column: 2;
            }

            .device-grid {
                grid-template-columns: 1fr;
            }

            .model-send-body {
                padding: 16px;
            }

            .model-choice-grid {
                grid-template-columns: 1fr;
            }

            .model-send-actions {
                align-items: stretch;
                flex-direction: column;
            }

            .model-send-actions .button {
                width: 100%;
            }

            .back-to-top {
                right: max(14px, env(safe-area-inset-right));
                bottom: max(14px, env(safe-area-inset-bottom));
                width: 44px;
                height: 44px;
            }
        }
    </style>
</head>
<body class="${escapar(bodyClass)}">
    <div class="top-shell">
        <div class="topbar">
            <div class="brand">
                <form method="post" action="/configuracoes/logo" enctype="multipart/form-data">
                    <label class="logo-click" title="Clique para trocar a logo">
                        ${logoUrl ?`<img class="brand-logo" src="${escapar(logoUrl)}" alt="Logo">` : `<span class="brand-icon">${icon('logo')}</span>`}
                        <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onchange="this.form.submit()">
                    </label>
                </form>
                <a class="brand-text" href="/clientes">${escapar(nomeSistema)}</a>
            </div>
            <nav>
                <a class="navlink ${ativo === 'painel' ?'active' : ''}" href="/clientes">${icon('painel')} Painel</a>
                <a class="navlink ${ativo === 'clientes' ?'active' : ''}" href="/clientes/todos">${icon('clientes')} Clientes</a>
                <a class="navlink ${ativo === 'crm' ?'active' : ''}" href="/crm">${icon('crm')} CRM</a>
                <a class="navlink ${ativo === 'atendimentos' ?'active' : ''}" href="/atendimentos">${icon('atendimento')} Atendimentos</a>
                <a class="navlink ${ativo === 'campanhas' ?'active' : ''}" href="/campanhas">${icon('whats')} Campanhas</a>
                <a class="navlink ${ativo === 'planos' ?'active' : ''}" href="/planos">${icon('planos')} Planos</a>
                <a class="navlink ${ativo === 'modelos' ?'active' : ''}" href="/modelos">${icon('modelos')} Modelos</a>
                <a class="navlink ${ativo === 'apps' ?'active' : ''}" href="/apps">${icon('apps')} Apps</a>
                <a class="navlink ${ativo === 'dispositivos' ?'active' : ''}" href="/dispositivos">${icon('dispositivos')} Dispositivos</a>
                <a class="navlink ${ativo === 'paineis' ?'active' : ''}" href="/paineis">${icon('paineis')} Painéis</a>
                <a class="navlink ${ativo === 'financeiro' ?'active' : ''}" href="/financeiro">${icon('financeiro')} Financeiro</a>
                <a class="navlink ${ativo === 'preparacao' ?'active' : ''}" href="/preparacao-comercial">${icon('trend')} Preparação</a>
                <a class="navlink" href="/qr">${icon('whats')} WhatsApp</a>
                <a class="navlink" href="/licenca">${icon('licenca')} Licença</a>
                <a class="navlink ${ativo === 'manutencao' ?'active' : ''}" href="/manutencao">${icon('manutencao')} Manutenção</a>
                <a class="navlink" href="/logout" title="Sair do painel">${icon('sair')}</a>
            </nav>
        </div>
    </div>
    <main>
        ${avisoLicenca ?`<div class="notice">${escapar(avisoLicenca)} <a href="/licenca"><strong>Ver licença</strong></a></div>` : ''}
        ${mensagem ?`<div class="notice">${escapar(mensagem)}</div>` : ''}
        ${conteudo}
    </main>
    <button class="back-to-top" type="button" aria-label="Voltar ao topo da página" title="Voltar ao topo">↑</button>
    <script>
        (() => {
            const botaoTopo = document.querySelector('.back-to-top');
            if (!botaoTopo) return;

            const atualizarBotaoTopo = () => {
                const paginaLonga = document.documentElement.scrollHeight > window.innerHeight + 160;
                botaoTopo.classList.toggle('visible', paginaLonga && window.scrollY > 360);
            };

            window.addEventListener('scroll', atualizarBotaoTopo, { passive: true });
            window.addEventListener('resize', atualizarBotaoTopo);
            botaoTopo.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
            atualizarBotaoTopo();
        })();
    </script>
</body>
    </html>`;
}

function desativarCache(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
}

async function renderizar(res, opcoes) {
    const config = await obterConfiguracoes();
    res.send(layout({ ...opcoes, config }));
}

async function obterListasCliente() {
    const [planos, apps, dispositivos, paineis] = await Promise.all([
        listarTiposPlanos(),
        listarApps(),
        listarDispositivos(),
        listarPaineis()
    ]);

    return { planos, apps, dispositivos, paineis };
}

function campo({ nome, label, tipo = 'text', valor = '', opcoes = [], attrs = '' }) {
    if (opcoes.length) {
        return `<label>${label}
            <select name="${nome}" ${attrs}>
                ${opcoes.map(opcao => `<option value="${escapar(opcao.valor)}" ${String(opcao.valor) === String(valor) ?'selected' : ''}>${escapar(opcao.texto)}</option>`).join('')}
            </select>
        </label>`;
    }

    return `<label>${label}
        <input type="${tipo}" name="${nome}" value="${escapar(valor)}" ${attrs}>
    </label>`;
}

function areaTexto({ nome, label, valor = '' }) {
    return `<label class="full">${label}
        <textarea name="${nome}">${escapar(valor)}</textarea>
    </label>`;
}

const ATRIBUTOS_CAMPO_SEMPRE_VAZIO = 'autocomplete="off" data-autofill-empty="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"';

function normalizarTagsTela(valor) {
    if (Array.isArray(valor)) return valor.map(String).map(item => item.trim()).filter(Boolean);
    return String(valor || '').split(',').map(item => item.trim()).filter(Boolean);
}

function renderTagsCliente(tags) {
    const itens = normalizarTagsTela(tags);
    if (!itens.length) return '';

    return `<div class="client-tags">${itens.map((tag) => {
        const aviso = tag.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('problematico');
        return `<span class="tag-chip ${aviso ?'warn' : ''}">${escapar(tag)}</span>`;
    }).join('')}</div>`;
}

function formatarDataNota(valor) {
    if (!valor) return '';
    return formatarDataHoraBrasil(valor);
}

function alertaClienteHtml(alertas = []) {
    if (!alertas.length) return '';

    const itens = alertas.map(alerta => `<div class="client-alert-item">
        Atenção: existe cadastro anterior para ${escapar(alerta.nome || 'cliente')} (${escapar(alerta.telefone || '-')})
        <small>Status: ${escapar(rotuloStatus(alerta.status))}${alerta.tags ?` | Tags: ${escapar(alerta.tags)}` : ''}${alerta.origem ?` | Origem: ${escapar(alerta.origem)}` : ''}</small>
        ${alerta.ultimaNota ?`<small>Última nota: ${escapar(alerta.ultimaNota)}</small>` : ''}
    </div>`).join('');

    return `<div class="notice warn">Cliente com histórico que merece avaliação antes de continuar.</div>
    <div class="client-alert-list">${itens}</div>`;
}

function secaoNotasCliente(cliente = {}, notas = [], paginacaoNotas = null) {
    if (!cliente.id) return '';
    const notasVisiveis = paginacaoNotas?.itens || notas;

    const listaNotas = notasVisiveis.length
        ?`<div class="notes-list">${notasVisiveis.map(nota => `<div class="note-item">
            <span class="note-date">${escapar(formatarDataNota(nota.criadoEm))}</span>
            <div>${escapar(nota.texto)}</div>
        </div>`).join('')}</div>`
        : '<div class="empty">Nenhuma nota registrada para este cliente.</div>';

    return `<section class="panel" style="margin-top:24px;">
        <div class="fields panel-content">
            <div class="form-section full">Histórico de atendimento</div>
            <div class="full">${listaNotas}</div>
            ${paginacaoNotas ?`<div class="full">${paginacao({
                base: `/clientes/${cliente.id}/editar`,
                params: { parametroPagina: 'historico', historicoPorPagina: paginacaoNotas.porPagina },
                parametroPorPagina: 'historicoPorPagina',
                pagina: paginacaoNotas.pagina,
                totalPaginas: paginacaoNotas.totalPaginas,
                total: paginacaoNotas.total,
                porPagina: paginacaoNotas.porPagina
            })}</div>` : ''}
        </div>
    </section>`;
}

function secaoAtendimentosCliente(cliente = {}, atendimentos = []) {
    if (!cliente.id) return '';

    const lista = atendimentos.length
        ?`<div class="notes-list">${atendimentos.map(atendimento => `<div class="note-item">
            <span class="note-date">${escapar(formatarDataNota(atendimento.criadoEm))}</span>
            <div><strong>${escapar(rotuloMotivoAtendimento(atendimento.motivo))}</strong> - ${escapar(rotuloStatusAtendimento(atendimento.status))}${atendimento.prioridade === 'urgente' ?' / Urgente' : ''}</div>
            ${atendimento.descricao ?`<div>${escapar(atendimento.descricao)}</div>` : ''}
            ${atendimento.proximoContato ?`<small>Próximo contato: ${escapar(formatarDataHoraCurta(atendimento.proximoContato))}</small>` : ''}
        </div>`).join('')}</div>`
        : '<div class="empty">Nenhum atendimento aberto para este cliente.</div>';

    return `<section class="panel" id="atendimentos" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Atendimentos do cliente</h2>
                <div class="subtitle">Registre problemas, retornos e acompanhamentos em aberto</div>
            </div>
            <a class="button secondary" href="/atendimentos">${icon('atendimento')} Central</a>
        </div>
        <form class="fields" method="post" action="/clientes/${escapar(cliente.id)}/atendimentos" style="padding-top:0;">
            <label>Motivo
                <select name="motivo">
                    ${[
                        ['instalacao', 'Instalação'],
                        ['travamento', 'Travamento'],
                        ['renovacao', 'Renovação'],
                        ['pagamento', 'Pagamento'],
                        ['troca_app', 'Troca de app'],
                        ['whatsapp', 'WhatsApp'],
                        ['outro', 'Outro']
                    ].map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join('')}
                </select>
            </label>
            <label>Prioridade
                <select name="prioridade">
                    <option value="normal">Normal</option>
                    <option value="urgente">Urgente</option>
                </select>
            </label>
            ${campo({ nome: 'proximoContato', label: 'Próximo contato', tipo: 'datetime-local', valor: '' })}
            ${areaTexto({ nome: 'descricao', label: 'Descrição', valor: '' })}
            <div class="actions full"><button class="button" type="submit">${icon('plus')} Abrir atendimento</button></div>
        </form>
        <div class="fields" style="padding-top:0;">
            <div class="full">${lista}</div>
        </div>
    </section>`;
}

function camposNovaNotaAtendimento() {
    return `<div class="form-section full">Nova nota de atendimento</div>
        ${campo({
            nome: 'novaNotaPadrao',
            label: 'Nota padrão',
            attrs: 'id="novaNotaPadraoAtendimento"',
            opcoes: [
                { valor: '', texto: 'Selecione uma nota pronta...' },
                ...NOTAS_ATENDIMENTO_PADRAO.map(nota => ({ valor: nota, texto: nota }))
            ]
        })}
        ${areaTexto({ nome: 'novaNotaTexto', label: 'Nota livre', valor: '' })}
        <div class="actions full">
            <button class="button secondary" type="submit" name="acao" value="adicionarNota">${icon('plus')} Adicionar nota</button>
        </div>
        <script>
            (() => {
                const select = document.getElementById('novaNotaPadraoAtendimento');
                const textarea = document.querySelector('textarea[name="novaNotaTexto"]');

                if (!select || !textarea) return;

                function dataHoraAtual() {
                    const agora = new Date();
                    const partes = new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }).formatToParts(agora);
                    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));

                    return mapa.day + '/' + mapa.month + '/' + mapa.year + ' ' + mapa.hour + ':' + mapa.minute;
                }

                select.addEventListener('change', () => {
                    if (!select.value) return;
                    const nota = dataHoraAtual() + ' - ' + select.value;
                    textarea.value = textarea.value
                        ?textarea.value.trim() + '\\n' + nota
                        : nota;
                    textarea.focus();
                });
            })();
        </script>`;
}

function editorMensagemModelo(valor = '') {
    const grupos = [
        ['Mais usados', ['✅', '📲', '🎁', '📺', '💰', '🔔', '⭐', '📌', '📱', '💬', '👍', '🙏', '🚀', '🔥', '🎯', '📅', '⏰', '💳']],
        ['Atendimento', ['🙋', '🤝', '💬', '🛠️', '⚠️', 'ℹ️', '📞', '📩', '📢', '📋', '📝', '🔎', '🔐', '🔄', '⛔', '✅', '❌']],
        ['IPTV e apps', ['📺', '📱', '💻', '🖥️', '🎬', '▶️', '⏯️', '📡', '🔌', '📶', '🎮', '🧾', '🔑', '🛜', '📲']],
        ['Festas', ['🎂', '🎉', '🎊', '🎁', '🎈', '🥳', '🏆', '💎', '❤️', '🌟', '✨', '👏', '🙌', '🤩']],
        ['Datas e pagamento', ['📅', '⏰', '💳', '💰', '🏦', '🧾', '✅', '❌', '⚠️', '📌', '🔔', '📈']],
        ['Mãos e sinais', ['👍', '👎', '🙏', '🤝', '👏', '🙌', '👌', '👋', '☝️', '👉', '👈', '👇']]
    ];

    return `<label class="full message-editor">Mensagem
        <div class="emoji-toolbar">
            <button class="button secondary" type="button" id="toggleEmojiPicker">?? Adicionar emoji</button>
            <div class="emoji-picker" id="emojiPicker" hidden>
                <input class="emoji-search" id="emojiSearch" type="search" placeholder="Buscar emoji...">
                ${grupos.map(([titulo, emojis]) => `<div class="emoji-title">${escapar(titulo)}</div><div class="emoji-group">${emojis.map(emoji => `<button type="button" data-emoji="${escapar(emoji)}" title="${escapar(emoji)}">${escapar(emoji)}</button>`).join('')}</div>`).join('')}
            </div>
        </div>
        <textarea name="texto" id="modeloTexto">${escapar(valor)}</textarea>
    </label>
    <script>
        (() => {
            const picker = document.getElementById('emojiPicker');
            const toggle = document.getElementById('toggleEmojiPicker');
            const textarea = document.getElementById('modeloTexto');
            const search = document.getElementById('emojiSearch');
            if (!picker || !toggle || !textarea) return;

            const inserirTexto = (texto) => {
                const inicio = textarea.selectionStart ?? textarea.value.length;
                const fim = textarea.selectionEnd ?? textarea.value.length;
                textarea.value = textarea.value.slice(0, inicio) + texto + textarea.value.slice(fim);
                const pos = inicio + texto.length;
                textarea.focus();
                textarea.setSelectionRange(pos, pos);
            };

            toggle.addEventListener('click', () => {
                picker.hidden = !picker.hidden;
                if (!picker.hidden && search) search.focus();
            });

            picker.addEventListener('click', (event) => {
                const botao = event.target.closest('button[data-emoji]');
                if (!botao) return;
                inserirTexto(botao.dataset.emoji || '');
            });

            document.querySelectorAll('button[data-variable-token]').forEach(botao => {
                botao.addEventListener('click', () => inserirTexto(botao.dataset.variableToken || ''));
            });

            if (search) {
                search.addEventListener('input', () => {
                    const termo = search.value.trim().toLowerCase();
                    picker.querySelectorAll('button[data-emoji]').forEach(botao => {
                        const texto = botao.dataset.emoji || '';
                        botao.style.display = !termo || texto.includes(termo) ? '' : 'none';
                    });
                });
            }
        })();
    </script>`;
}

function campoWhatsApp(valor = '', ddiSalvo = '') {
    const numeros = String(valor || '').replace(/\D/g, '');
    let ddi = String(ddiSalvo || '').replace(/\D/g, '') || '55';
    let telefone = numeros;

    if (ddiSalvo) {
        telefone = numeros.startsWith(ddi) && numeros.length > ddi.length + 6
            ? numeros.slice(ddi.length)
            : numeros;
    } else if (numeros.startsWith('55') && numeros.length > 11) {
        telefone = numeros.slice(2);
        while (telefone.startsWith('55') && telefone.length > 11) {
            telefone = telefone.slice(2);
        }
    } else if (numeros.length > 11) {
        const pais = [...PAISES_TELEFONE]
            .sort((a, b) => b.ddi.length - a.ddi.length)
            .find(item => numeros.startsWith(item.ddi) && numeros.length > item.ddi.length + 6);

        if (pais) {
            ddi = pais.ddi;
            telefone = numeros.slice(pais.ddi.length);
        } else {
            ddi = numeros.slice(0, numeros.length - 11) || '55';
            telefone = numeros.slice(-11);
        }
    }

    const opcoes = PAISES_TELEFONE.map(item => {
        const selecionado = item.ddi === ddi ? ' selected' : '';
        return `<option value="${escapar(item.ddi)}" data-placeholder="${escapar(item.exemplo)}"${selecionado}>${escapar(item.pais)} (+${escapar(item.ddi)})</option>`;
    }).join('');

    return `<label>WhatsApp *
        <div class="phone-field">
            <select class="phone-prefix" name="ddiTelefone" aria-label="País do WhatsApp">
                ${opcoes}
            </select>
            <input type="tel" name="telefone" value="${escapar(telefone)}" required placeholder="${escapar(PAISES_TELEFONE.find(item => item.ddi === ddi)?.exemplo || '11999999999')}">
        </div>
    </label>`;
}

function campoWhatsAppComPais(valor = '', ddiSalvo = '', paisSalvo = '') {
    const numeros = String(valor || '').replace(/\D/g, '');
    let ddi = String(ddiSalvo || '').replace(/\D/g, '') || '55';
    let codigoPais = String(paisSalvo || '').trim().toUpperCase();
    let telefone = numeros;
    const paisPorCodigo = PAISES_TELEFONE.find(item => item.codigo === codigoPais);

    if (paisPorCodigo) {
        ddi = paisPorCodigo.ddi;
    }

    if (ddiSalvo || paisPorCodigo) {
        telefone = numeros.startsWith(ddi) && numeros.length > ddi.length + 6
            ? numeros.slice(ddi.length)
            : numeros;
    } else if (numeros.startsWith('55') && numeros.length > 11) {
        telefone = numeros.slice(2);
        while (telefone.startsWith('55') && telefone.length > 11) {
            telefone = telefone.slice(2);
        }
    } else if (numeros.length > 11) {
        const pais = [...PAISES_TELEFONE]
            .sort((a, b) => b.ddi.length - a.ddi.length)
            .find(item => numeros.startsWith(item.ddi) && numeros.length > item.ddi.length + 6);

        if (pais) {
            ddi = pais.ddi;
            codigoPais = pais.codigo;
            telefone = numeros.slice(pais.ddi.length);
        } else {
            ddi = numeros.slice(0, numeros.length - 11) || '55';
            telefone = numeros.slice(-11);
        }
    }

    const paisSelecionado = PAISES_TELEFONE.find(item => item.codigo === codigoPais)
        || PAISES_TELEFONE.find(item => item.ddi === ddi)
        || PAISES_TELEFONE[0];
    ddi = paisSelecionado.ddi;

    const urlBandeira = (codigo) => `https://flagcdn.com/w40/${String(codigo || 'BR').toLowerCase()}.png`;
    const opcoes = PAISES_TELEFONE.map(item => {
        const flag = urlBandeira(item.codigo);
        const selecionado = item.codigo === paisSelecionado.codigo ? ' selected' : '';
        return `<option value="${escapar(item.codigo)}" data-ddi="${escapar(item.ddi)}" data-placeholder="${escapar(item.exemplo)}" data-flag="${escapar(flag)}"${selecionado}>${escapar(item.pais)} (+${escapar(item.ddi)})</option>`;
    }).join('');
    const bandeiraSelecionada = urlBandeira(paisSelecionado.codigo);

    return `<label>WhatsApp *
        <div class="phone-field">
            <div class="phone-country">
                <img class="country-flag" src="${escapar(bandeiraSelecionada)}" alt="" loading="lazy">
                <select class="phone-prefix" name="paisTelefone" aria-label="País do WhatsApp" onchange="const s=this, opt=s.options[s.selectedIndex], box=s.closest('.phone-field'); box.querySelector('input[name=ddiTelefone]').value=opt.dataset.ddi||'55'; box.querySelector('input[name=telefone]').placeholder=opt.dataset.placeholder||'11999999999'; box.querySelector('.country-flag').src=opt.dataset.flag||'https://flagcdn.com/w40/br.png';">
                    ${opcoes}
                </select>
            </div>
            <input type="hidden" name="ddiTelefone" value="${escapar(ddi)}">
            <input type="tel" name="telefone" value="${escapar(telefone)}" required placeholder="${escapar(paisSelecionado.exemplo || '11999999999')}">
        </div>
    </label>`;
}

function lerListaSalva(valor) {
    if (Array.isArray(valor)) return valor.map(String);
    if (!valor) return [];

    try {
        const lista = JSON.parse(valor);
        return Array.isArray(lista) ?lista.map(String) : [];
    } catch (err) {
        return String(valor).split(',').map(item => item.trim()).filter(Boolean);
    }
}

function formatarDataHoraCurta(valor) {
    if (!valor) return '-';
    return formatarDataHoraBrasil(valor);
}

function textoDiasRestantes(valor) {
    return textoTempoRestante(valor);
}

function plural(valor, singular, pluralTexto) {
    return Number(valor) === 1 ?singular : pluralTexto;
}

function textoTempoRestante(valor) {
    const info = infoTempoVencimento(valor);
    if (!info) return '-';

    if (info.totalMinutos <= 0) return info.vencido ?'vencido agora' : 'vence agora';

    if (info.totalMinutos < 60) {
        const unidade = plural(info.totalMinutos, 'minuto', 'minutos');
        const sufixo = plural(info.totalMinutos, 'restante', 'restantes');
        return info.vencido ?`${info.totalMinutos} ${unidade} vencido` : `${info.totalMinutos} ${unidade} ${sufixo}`;
    }

    if (info.totalMinutos < 24 * 60) {
        const horas = Math.floor(info.totalMinutos / 60);
        const minutos = info.totalMinutos % 60;
        const textoHoras = `${horas} ${plural(horas, 'hora', 'horas')}`;

        if (!minutos) {
            const sufixo = plural(horas, 'restante', 'restantes');
            return info.vencido ?`${textoHoras} vencido` : `${textoHoras} ${sufixo}`;
        }

        const textoMinutos = `${minutos} ${plural(minutos, 'minuto', 'minutos')}`;
        return info.vencido ?`${textoHoras} e ${textoMinutos} vencido` : `${textoHoras} e ${textoMinutos} restantes`;
    }

    const textoDias = `${info.diasInteiros} ${plural(info.diasInteiros, 'dia', 'dias')}`;
    const textoHoras = info.horasInteiras ?` e ${info.horasInteiras} ${plural(info.horasInteiras, 'hora', 'horas')}` : '';
    const sufixo = plural(info.diasInteiros, 'restante', 'restantes');
    return info.vencido ?`${textoDias}${textoHoras} vencido` : `${textoDias}${textoHoras} ${sufixo}`;
}

function renderChips(valor, classe) {
    const lista = lerListaSalva(valor);
    if (!lista.length) return '';

    return lista.map(item => `<span class="${classe}">${escapar(item)}</span>`).join('');
}

function rotuloStatus(status) {
    const mapa = {
        ativo: 'Ativo',
        pendente: 'Pendente',
        expirado: 'Expirado',
        suspenso: 'Suspenso',
        cancelado: 'Cancelado',
        teste: 'Teste'
    };

    return mapa[status] || status || '-';
}

function detalhePlanoCliente(cliente = {}) {
    if (clienteEhTeste(cliente)) {
        return cliente.horasTeste || 'Teste grátis';
    }

    return `${cliente.diasContrato || '-'} dias`;
}

function opcoesMulti(nome, label, itens, selecionados, placeholder) {
    const chips = selecionados.length
        ?selecionados.map(item => `<span class="selected-chip" data-value="${escapar(item)}">${escapar(item)} <button type="button" aria-label="Remover ${escapar(item)}">x</button></span>`).join('')
        : '';
    const hiddenInputs = selecionados
        .map(item => `<input type="hidden" name="${nome}" value="${escapar(item)}">`)
        .join('');

    return `<label>${label}
        <div class="multi-picker" data-name="${nome}">
            <div class="multi-chips" data-empty="Nenhum selecionado">
                ${chips}
            </div>
            <div class="multi-hidden">${hiddenInputs}</div>
        </div>
        <select class="multi-select" data-target="${nome}">
            <option value="">${escapar(placeholder)}</option>
            ${itens.map(item => `<option value="${escapar(item.nome)}">${escapar(item.nome)}</option>`).join('')}
        </select>
    </label>`;
}

function lerAcessosApp(cliente = {}) {
    try {
        const acessos = JSON.parse(cliente.acessosApp || '[]');
        if (Array.isArray(acessos)) {
            return acessos
                .map(acesso => ({
                    app: String(acesso.app || ''),
                    dispositivo: String(acesso.dispositivo || ''),
                    painel: String(acesso.painel || ''),
                    usuario: String(acesso.usuario || ''),
                    senha: String(acesso.senha || ''),
                    localInstalacao: String(acesso.localInstalacao || ''),
                    urlAtivarAplicativo: String(acesso.urlAtivarAplicativo || ''),
                    enderecoMac: String(acesso.enderecoMac || ''),
                    idAplicativo: String(acesso.idAplicativo || '')
                }))
                .filter(acesso => acesso.app || acesso.dispositivo || acesso.painel || acesso.usuario || acesso.senha || acesso.localInstalacao || acesso.urlAtivarAplicativo || acesso.enderecoMac || acesso.idAplicativo);
        }
    } catch (err) {
        // Mantem compatibilidade com cadastros antigos.
    }

    if (cliente.enderecoMac || cliente.idAplicativo) {
        return [{
            app: lerListaSalva(cliente.appsInstalados)[0] || '',
            dispositivo: lerListaSalva(cliente.dispositivosSelecionados)[0] || '',
            painel: lerListaSalva(cliente.paineisSelecionados)[0] || '',
            usuario: cliente.usuario || '',
            senha: cliente.senha || '',
            localInstalacao: '',
            urlAtivarAplicativo: '',
            enderecoMac: cliente.enderecoMac || '',
            idAplicativo: cliente.idAplicativo || ''
        }];
    }

    return [];
}

function opcoesSelectLista(itens = [], selecionado = '', placeholder = 'Selecione...') {
    return `<option value="">${escapar(placeholder)}</option>${itens.map(item => {
        const nome = item.nome || item;
        return `<option value="${escapar(nome)}" ${nome === selecionado ?'selected' : ''}>${escapar(nome)}</option>`;
    }).join('')}`;
}

function linhaAcessoApp(acesso = {}, apps = [], dispositivos = [], paineis = []) {
    return `<div class="app-access-row">
        <label>App
            <select name="acessoAppNome">
                ${opcoesSelectLista(apps, acesso.app, 'Selecione o app...')}
            </select>
        </label>
        <label>Dispositivo
            <select name="acessoDispositivo">
                ${opcoesSelectLista(dispositivos, acesso.dispositivo, 'Selecione o dispositivo...')}
            </select>
        </label>
        <label>Painel
            <select name="acessoPainel">
                ${opcoesSelectLista(paineis, acesso.painel, 'Selecione o painel...')}
            </select>
        </label>
        <label>Usuário IPTV
            <input type="text" name="acessoUsuario" value="${escapar(acesso.usuario || '')}" placeholder="Usuário desta conexão">
        </label>
        <label>Senha IPTV
            <input type="text" name="acessoSenha" value="${escapar(acesso.senha || '')}" placeholder="Senha desta conexão">
        </label>
        <label>Endereço MAC
            <input class="mac-field" type="text" name="acessoEnderecoMac" value="${escapar(acesso.enderecoMac || '')}" maxlength="17" placeholder="XX:XX:XX:XX:XX:XX" autocomplete="off">
        </label>
        <label>ID do Aplicativo
            <input type="text" name="acessoIdAplicativo" value="${escapar(acesso.idAplicativo || '')}" placeholder="ID gerado no app">
        </label>
        <label>Onde foi instalado
            <input type="text" name="acessoLocalInstalacao" value="${escapar(acesso.localInstalacao || '')}" list="locaisInstalacaoApp" placeholder="Ex: TV da sala">
        </label>
        <label>URL Ativar Aplicativo
            <input type="url" name="acessoUrlAtivarAplicativo" value="${escapar(acesso.urlAtivarAplicativo || '')}" placeholder="https://...">
        </label>
        <button class="button secondary icon-only remove-app-access" type="button" title="Remover acesso">${icon('trash')}</button>
    </div>`;
}

function listaAcessosApp(cliente = {}, apps = [], dispositivos = [], paineis = []) {
    const acessos = lerAcessosApp(cliente);
    const linhas = acessos.length
        ?acessos.map(acesso => linhaAcessoApp(acesso, apps, dispositivos, paineis)).join('')
        : linhaAcessoApp({}, apps, dispositivos, paineis);

    return `<div class="app-access-list full">
        <datalist id="locaisInstalacaoApp">
            ${LOCAIS_INSTALACAO_APP.map(local => `<option value="${escapar(local)}"></option>`).join('')}
        </datalist>
        <div class="app-access-header">
            <div>
                <strong>Dados por app instalado</strong>
                <span>Cada linha representa uma conexão: app, dispositivo, painel, usuário, senha, MAC e ID quando exigir.</span>
            </div>
            <button class="button secondary" type="button" id="adicionarAcessoApp">${icon('plus')} Adicionar acesso</button>
        </div>
        <div id="listaAcessosApp">${linhas}</div>
    </div>`;
}

function inputDateTime(valor) {
    const partes = partesDataHora(valor);
    if (!partes) return '';
    return `${partes.ano}-${partes.mes}-${partes.dia}T${partes.hora}:${partes.minuto}`;
}

function agoraLocalDateTime() {
    return agoraSaoPauloInput();
}

function valorPrimeiroItem(valor) {
    return lerListaSalva(valor)[0] || '';
}

function primeiroAcessoApp(cliente = {}) {
    return lerAcessosApp(cliente)[0] || {};
}

function escaparCsv(valor) {
    const texto = String(valor ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return `"${texto.replace(/"/g, '""')}"`;
}

function juntarListaCsv(valor) {
    return lerListaSalva(valor).join(', ');
}

function descreverAcessosAppCsv(cliente = {}) {
    return lerAcessosApp(cliente).map((acesso, index) => {
        const partes = [
            acesso.app ?`App: ${acesso.app}` : '',
            acesso.dispositivo ?`Dispositivo: ${acesso.dispositivo}` : '',
            acesso.painel ?`Painel: ${acesso.painel}` : '',
            acesso.usuario ?`Usuário: ${acesso.usuario}` : '',
            acesso.senha ?`Senha: ${acesso.senha}` : '',
            acesso.localInstalacao ?`Onde: ${acesso.localInstalacao}` : '',
            acesso.enderecoMac ?`MAC: ${acesso.enderecoMac}` : '',
            acesso.idAplicativo ?`ID: ${acesso.idAplicativo}` : '',
            acesso.urlAtivarAplicativo ?`URL: ${acesso.urlAtivarAplicativo}` : ''
        ].filter(Boolean);

        return partes.length ?`${index + 1}. ${partes.join(' | ')}` : '';
    }).filter(Boolean).join(' || ');
}

function valoresAcessosAppCsv(cliente = {}, campo) {
    const valores = [
        cliente[campo],
        ...lerAcessosApp(cliente).map(acesso => acesso[campo])
    ]
        .map(valor => String(valor || '').trim())
        .filter(Boolean);

    return [...new Set(valores)].join(', ');
}

function gerarCsvClientes(clientes = []) {
    const cabecalhos = [
        'ID',
        'Nome',
        'WhatsApp',
        'Nascimento',
        'Plano',
        'Detalhe do plano',
        'Valor do plano',
        'Assinatura app',
        'Status',
        'Data/Hora de início',
        'Data/Hora de vencimento',
        'Validade app',
        'Data validade app',
        'Apps instalados',
        'Dispositivos',
        'Painéis',
        'App instalado',
        'Usuário IPTV',
        'Senha IPTV',
        'Endereço MAC',
        'ID do aplicativo',
        'Dados por app instalado',
        'Origem',
        'Indicado por',
        'Tags',
        'Bônus disponíveis',
        'Observações'
    ];

    const linhas = clientes.map(cliente => [
        cliente.id,
        cliente.nome,
        cliente.telefone,
        cliente.nascimento ?formatarAniversario(cliente.nascimento) : '',
        cliente.plano,
        detalhePlanoCliente(cliente),
        cliente.valorPlano,
        cliente.assinaturaApp,
        rotuloStatus(cliente.status),
        formatarDataHoraCurta(cliente.dataInicio),
        formatarDataHoraCurta(cliente.dataVencimento || cliente.vencimento),
        cliente.validadeApp,
        cliente.dataValidadeApp || '',
        juntarListaCsv(cliente.appsInstalados),
        juntarListaCsv(cliente.dispositivosSelecionados),
        juntarListaCsv(cliente.paineisSelecionados),
        cliente.appInstalado ?'Sim' : 'Não',
        valoresAcessosAppCsv(cliente, 'usuario') || cliente.usuario,
        valoresAcessosAppCsv(cliente, 'senha') || cliente.senha,
        valoresAcessosAppCsv(cliente, 'enderecoMac'),
        valoresAcessosAppCsv(cliente, 'idAplicativo'),
        descreverAcessosAppCsv(cliente),
        cliente.origem,
        cliente.indicadoPor,
        juntarListaCsv(cliente.tags || ''),
        cliente.bonusMeses || 0,
        cliente.observacoes
    ]);

    return [cabecalhos, ...linhas]
        .map(linha => linha.map(escaparCsv).join(';'))
        .join('\r\n');
}

function gerarCsvFinanceiro(pagamentos = []) {
    const cabecalhos = [
        'ID',
        'Data do pagamento',
        'Cliente',
        'WhatsApp',
        'Plano',
        'Dias de contrato',
        'Valor do plano',
        'Assinatura app',
        'Valor total',
        'Forma de pagamento',
        'Vencimento anterior',
        'Vencimento novo',
        'Status',
        'Removido em',
        'Mensagem enviada',
        'Erro da mensagem',
        'Observações'
    ];

    const linhas = pagamentos.map(pagamento => [
        pagamento.id,
        formatarDataHoraCurta(pagamento.dataPagamento || pagamento.criadoEm),
        pagamento.clienteNome,
        pagamento.clienteTelefone,
        pagamento.plano,
        pagamento.diasContrato || 0,
        pagamento.valorPlano || '0,00',
        pagamento.assinaturaApp || '0,00',
        pagamento.valorTotal || '0,00',
        pagamento.formaPagamento,
        formatarDataHoraCurta(pagamento.vencimentoAnterior),
        formatarDataHoraCurta(pagamento.vencimentoNovo),
        pagamento.excluidoEm ?'Removido' : 'Válido',
        formatarDataHoraCurta(pagamento.excluidoEm),
        pagamento.mensagemEnviada ?'Sim' : 'Não',
        pagamento.erroMensagem,
        pagamento.observacoes
    ]);

    return [cabecalhos, ...linhas]
        .map(linha => linha.map(escaparCsv).join(';'))
        .join('\r\n');
}

function normalizarCabecalhoCsv(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function dividirLinhaCsv(linha = '', separador = ';') {
    const colunas = [];
    let atual = '';
    let entreAspas = false;

    for (let i = 0; i < linha.length; i += 1) {
        const char = linha[i];
        const proximo = linha[i + 1];

        if (char === '"' && entreAspas && proximo === '"') {
            atual += '"';
            i += 1;
        } else if (char === '"') {
            entreAspas = !entreAspas;
        } else if (char === separador && !entreAspas) {
            colunas.push(atual);
            atual = '';
        } else {
            atual += char;
        }
    }

    colunas.push(atual);
    return colunas.map(valor => valor.trim());
}

function linhasCsv(texto = '') {
    const linhas = [];
    let atual = '';
    let entreAspas = false;
    const conteudo = String(texto || '').replace(/^\uFEFF/, '');

    for (let i = 0; i < conteudo.length; i += 1) {
        const char = conteudo[i];
        const proximo = conteudo[i + 1];

        if (char === '"' && entreAspas && proximo === '"') {
            atual += '""';
            i += 1;
        } else if (char === '"') {
            entreAspas = !entreAspas;
            atual += char;
        } else if ((char === '\n' || char === '\r') && !entreAspas) {
            if (char === '\r' && proximo === '\n') i += 1;
            linhas.push(atual);
            atual = '';
        } else {
            atual += char;
        }
    }

    if (atual || conteudo.endsWith('\n') === false) linhas.push(atual);
    return linhas.filter(linha => linha.trim());
}

function detectarSeparadorCsv(linha = '') {
    const pontoVirgula = dividirLinhaCsv(linha, ';').length;
    const virgula = dividirLinhaCsv(linha, ',').length;
    return pontoVirgula >= virgula ?';' : ',';
}

function parseCsv(texto = '') {
    const todasLinhas = linhasCsv(texto);
    if (!todasLinhas.length) return { cabecalhos: [], registros: [] };

    const separador = detectarSeparadorCsv(todasLinhas[0]);
    const cabecalhos = dividirLinhaCsv(todasLinhas[0], separador).map(normalizarCabecalhoCsv);
    const registros = todasLinhas.slice(1).map((linha, index) => {
        const valores = dividirLinhaCsv(linha, separador);
        const registro = { __linha: index + 2 };

        cabecalhos.forEach((cabecalho, coluna) => {
            registro[cabecalho] = valores[coluna] || '';
        });

        return registro;
    });

    return { cabecalhos, registros };
}

function valorCsv(registro, nomes = []) {
    for (const nome of nomes) {
        const chave = normalizarCabecalhoCsv(nome);
        if (registro[chave] !== undefined && String(registro[chave]).trim() !== '') {
            return String(registro[chave]).trim();
        }
    }

    return '';
}

function listaCsvParaArray(valor = '') {
    return String(valor || '')
        .split(/\s*(?:,|\||;)\s*/)
        .map(item => item.trim())
        .filter(Boolean);
}

function dataCsvParaIso(valor = '', comHora = false) {
    const texto = String(valor || '').trim();
    if (!texto) return '';

    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (iso) {
        const [, ano, mes, dia, hora = '00', minuto = '00'] = iso;
        return comHora ?`${ano}-${mes}-${dia}T${hora}:${minuto}` : `${ano}-${mes}-${dia}`;
    }

    const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (br) {
        const [, diaBruto, mesBruto, anoBruto, horaBruta = '00', minutoBruto = '00'] = br;
        const ano = anoBruto.length === 2 ?`20${anoBruto}` : anoBruto;
        const mes = mesBruto.padStart(2, '0');
        const dia = diaBruto.padStart(2, '0');
        const hora = horaBruta.padStart(2, '0');
        const minuto = minutoBruto.padStart(2, '0');
        return comHora ?`${ano}-${mes}-${dia}T${hora}:${minuto}` : `${ano}-${mes}-${dia}`;
    }

    return '';
}

function statusCsv(valor = '') {
    const texto = normalizarCabecalhoCsv(valor);
    const mapa = {
        ativo: 'ativo',
        teste: 'teste',
        pendente: 'pendente',
        expirado: 'expirado',
        vencido: 'expirado',
        suspenso: 'suspenso',
        cancelado: 'cancelado'
    };

    return mapa[texto] || '';
}

function booleanoCsv(valor = '') {
    const texto = normalizarCabecalhoCsv(valor);
    return ['sim', 's', '1', 'true', 'instalado', 'ativo'].includes(texto);
}

function montarDadosClienteImportado(registro, planos = []) {
    const nome = valorCsv(registro, ['Nome', 'Cliente', 'Nome completo']);
    const telefone = valorCsv(registro, ['WhatsApp', 'Telefone', 'Celular']);
    const plano = valorCsv(registro, ['Plano', 'Tipo do plano']) || 'Mensal';
    const status = statusCsv(valorCsv(registro, ['Status', 'Situação'])) || 'ativo';
    const planoEncontrado = planos.find(item => normalizarCabecalhoCsv(item.nome) === normalizarCabecalhoCsv(plano));
    const isTeste = normalizarCabecalhoCsv(plano).includes('teste') || status === 'teste';
    const diasContrato = valorCsv(registro, ['Dias de contrato', 'Dias contrato', 'Dias']) || planoEncontrado?.dias || (isTeste ?0 : 30);
    const dataInicio = dataCsvParaIso(valorCsv(registro, ['Data/Hora de início', 'Data inicio', 'Início', 'Inicio']), true);
    const dataVencimento = dataCsvParaIso(valorCsv(registro, ['Data/Hora de vencimento', 'Data vencimento', 'Vencimento']), true);
    const nascimento = mesDiaAniversario(valorCsv(registro, ['Nascimento', 'Data de aniversário', 'Data aniversario']));
    const apps = listaCsvParaArray(valorCsv(registro, ['Apps instalados', 'Aplicativos', 'App']));
    const dispositivos = listaCsvParaArray(valorCsv(registro, ['Dispositivos', 'Dispositivo', 'Aparelho']));
    const paineis = listaCsvParaArray(valorCsv(registro, ['Painéis', 'Paineis', 'Painel']));
    const enderecoMac = valorCsv(registro, ['Endereço MAC', 'Endereco MAC', 'MAC']);
    const idAplicativo = valorCsv(registro, ['ID do aplicativo', 'ID aplicativo', 'ID']);

    return {
        nome,
        ddiTelefone: '',
        paisTelefone: '',
        telefone,
        nascimento,
        plano,
        tipoPlanoId: planoEncontrado?.id || '',
        diasContrato,
        valorPlano: valorCsv(registro, ['Valor do plano', 'Valor plano', 'Valor']),
        assinaturaApp: valorCsv(registro, ['Assinatura app', 'Assinatura App']),
        validadeApp: valorCsv(registro, ['Validade app', 'Validade App']),
        dataValidadeApp: dataCsvParaIso(valorCsv(registro, ['Data validade app', 'Data de validade do app', 'Validade do app data']), false),
        horasTeste: valorCsv(registro, ['Horas de teste', 'Horas teste']),
        status,
        dataInicio,
        dataVencimento,
        appsInstalados: apps,
        dispositivosSelecionados: dispositivos,
        paineisSelecionados: paineis,
        appInstalado: booleanoCsv(valorCsv(registro, ['App instalado', 'Instalado'])),
        usuario: valorCsv(registro, ['Usuário IPTV', 'Usuario IPTV', 'Usuário', 'Usuario']),
        senha: valorCsv(registro, ['Senha IPTV', 'Senha']),
        enderecoMac,
        idAplicativo,
        acessoAppNome: apps[0] || '',
        acessoDispositivo: dispositivos[0] || '',
        acessoPainel: paineis[0] || '',
        acessoEnderecoMac: enderecoMac,
        acessoIdAplicativo: idAplicativo,
        acessoLocalInstalacao: valorCsv(registro, ['Onde foi instalado', 'Local de instalação', 'Local instalacao']),
        acessoUrlAtivarAplicativo: valorCsv(registro, ['URL Ativar Aplicativo', 'URL ativação', 'URL ativacao']),
        origem: valorCsv(registro, ['Origem']),
        tags: listaCsvParaArray(valorCsv(registro, ['Tags', 'Categoria', 'Categorias'])),
        bonusMeses: valorCsv(registro, ['Bônus disponíveis', 'Bonus disponiveis', 'Bônus', 'Bonus']),
        observacoes: valorCsv(registro, ['Observações', 'Observacoes', 'Notas'])
    };
}

function validarClienteImportado(dados = {}, registro = {}, planos = []) {
    const erros = [];
    const avisos = [];
    const planoNormalizado = normalizarCabecalhoCsv(dados.plano);
    const planoExiste = planos.some(item => normalizarCabecalhoCsv(item.nome) === planoNormalizado);
    const isTeste = planoNormalizado.includes('teste') || dados.status === 'teste';

    if (!dados.nome) erros.push('Nome obrigatório.');
    if (!normalizarTelefone(dados.telefone)) erros.push('WhatsApp inválido ou vazio.');
    if (!dados.plano) erros.push('Plano obrigatório.');
    if (dados.plano && !planoExiste && !isTeste) erros.push(`Plano não cadastrado: ${dados.plano}.`);
    if (valorCsv(registro, ['Data/Hora de início', 'Data inicio', 'Início', 'Inicio']) && !dados.dataInicio) erros.push('Data/Hora de início inválida.');
    if (valorCsv(registro, ['Data/Hora de vencimento', 'Data vencimento', 'Vencimento']) && !dados.dataVencimento) erros.push('Data/Hora de vencimento inválida.');
    if (valorCsv(registro, ['Nascimento', 'Data de aniversário', 'Data aniversario']) && !dados.nascimento) avisos.push('Nascimento não reconhecido; será importado vazio.');
    if (!dados.dataInicio) avisos.push('Data/Hora de início vazia.');
    if (!dados.dataVencimento) avisos.push('Data/Hora de vencimento vazia.');

    return { erros, avisos };
}

async function prepararImportacaoClientesCsv(textoCsv = '') {
    const planos = await listarTiposPlanos();
    const { registros } = parseCsv(textoCsv);
    const itens = [];
    const telefonesNoCsv = new Set();

    for (const registro of registros) {
        const vazio = Object.entries(registro)
            .filter(([chave]) => chave !== '__linha')
            .every(([, valor]) => !String(valor || '').trim());
        if (vazio) continue;

        const dados = montarDadosClienteImportado(registro, planos);
        const telefoneNormalizado = normalizarTelefone(dados.telefone);
        const existente = telefoneNormalizado ?await buscarClientePorTelefone(telefoneNormalizado) : null;
        const validacao = validarClienteImportado(dados, registro, planos);

        if (telefoneNormalizado && telefonesNoCsv.has(telefoneNormalizado)) {
            validacao.erros.push('WhatsApp repetido dentro do CSV.');
        }

        if (telefoneNormalizado) telefonesNoCsv.add(telefoneNormalizado);

        itens.push({
            linha: registro.__linha,
            acao: validacao.erros.length ?'ignorar' : existente ?'atualizar' : 'criar',
            existenteId: existente?.id || null,
            dados: {
                ...dados,
                telefone: telefoneNormalizado || dados.telefone
            },
            erros: validacao.erros,
            avisos: validacao.avisos
        });
    }

    return {
        criadoEm: new Date().toISOString(),
        total: itens.length,
        criar: itens.filter(item => item.acao === 'criar').length,
        atualizar: itens.filter(item => item.acao === 'atualizar').length,
        ignorar: itens.filter(item => item.acao === 'ignorar').length,
        itens
    };
}

function salvarPreviaImportacao(preview) {
    fs.mkdirSync(IMPORTACOES_DIR, { recursive: true });
    const token = `clientes-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    fs.writeFileSync(path.join(IMPORTACOES_DIR, token), JSON.stringify(preview, null, 2), 'utf8');
    return token;
}

function lerPreviaImportacao(token) {
    const nomeSeguro = path.basename(String(token || ''));
    const caminho = path.join(IMPORTACOES_DIR, nomeSeguro);
    if (!nomeSeguro || !fs.existsSync(caminho)) {
        throw new Error('Pré-visualização da importação não encontrada. Envie o CSV novamente.');
    }

    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
}

function removerPreviaImportacao(token) {
    const nomeSeguro = path.basename(String(token || ''));
    const caminho = path.join(IMPORTACOES_DIR, nomeSeguro);
    if (nomeSeguro && fs.existsSync(caminho)) fs.unlinkSync(caminho);
}

function csvModeloClientes() {
    const linhas = [
        [
            'Nome',
            'WhatsApp',
            'Nascimento',
            'Plano',
            'Dias de contrato',
            'Valor do plano',
            'Assinatura app',
            'Status',
            'Data/Hora de início',
            'Data/Hora de vencimento',
            'Validade app',
            'Apps instalados',
            'Dispositivos',
            'Painéis',
            'App instalado',
            'Usuário IPTV',
            'Senha IPTV',
            'Endereço MAC',
            'ID do aplicativo',
            'Onde foi instalado',
            'URL Ativar Aplicativo',
            'Origem',
            'Tags',
            'Bônus disponíveis',
            'Observações'
        ],
        [
            'Cliente Exemplo',
            '5511999999999',
            '01/03/1990',
            'Mensal',
            '30',
            '35,00',
            '0,00',
            'Ativo',
            '06/06/2026 09:00',
            '06/07/2026 09:00',
            '1 Ano',
            '4K IPTV, WPLAY',
            'TV LG',
            'Painel Wplay',
            'Sim',
            'usuarioiptv',
            'senhaiptv',
            'AA:BB:CC:DD:EE:FF',
            '123456',
            'TV da sala',
            'https://exemplo.com/ativar',
            'WhatsApp',
            'VIP, Bom pagador',
            '0',
            'Cliente importado pelo modelo CSV'
        ]
    ];

    return linhas.map(linha => linha.map(escaparCsv).join(';')).join('\r\n');
}

function montarUrlClienteMensagem(id, mensagem) {
    return `/clientes/${id}/editar?mensagem=${encodeURIComponent(mensagem)}`;
}

function montarUrlListaClientesMensagem(mensagem) {
    return `/clientes/todos?mensagem=${encodeURIComponent(mensagem)}`;
}

function logControleClientes(evento, dados = {}) {
    const req = contextoAuditoria.getStore()?.req;
    const seguros = mascararSegredos(dados);
    const auditoria = { ...seguros, ip: req?.ip || req?.socket?.remoteAddress || '', usuario: req?.usuarioPainel || '' };
    const resumo = Object.entries(auditoria)
        .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
        .map(([chave, valor]) => `${chave}=${valor}`)
        .join(' ');

    console.log(`[controle-clientes] ${evento}${resumo ?` | ${resumo}` : ''}`);
    registrarEventoSistema('auditoria_administrativa', 'info', evento, auditoria).catch(() => {});
}

async function confirmarSenhaAcaoCritica(req, res, next) {
    try {
        if (await confirmarSenhaAtual(req, req.body.senhaConfirmacao)) return next();
        logControleClientes('Acao critica recusada por senha invalida', { rota: req.path });
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent('Confirme sua senha atual para executar esta alteração.')}`);
    } catch (err) { return next(err); }
}

function aguardarComTimeout(promessa, ms, descricao) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${descricao} demorou demais para responder.`)), ms);
        })
    ]);
}

function normalizarTelefoneClienteWhatsApp(clienteOuTelefone = {}) {
    if (typeof clienteOuTelefone !== 'object' || clienteOuTelefone === null) {
        return normalizarTelefone(clienteOuTelefone);
    }

    const telefone = String(clienteOuTelefone.telefone || '').replace(/\D/g, '');
    const paisTelefone = String(clienteOuTelefone.paisTelefone || '').trim().toUpperCase();
    const pais = PAISES_TELEFONE.find(item => item.codigo === paisTelefone);
    const ddi = String(pais?.ddi || clienteOuTelefone.ddiTelefone || '').replace(/\D/g, '');

    if (!telefone) return '';

    if (ddi) {
        const numeroComDdi = telefone.startsWith(ddi) ? telefone : `${ddi}${telefone}`;
        return normalizarTelefone(numeroComDdi);
    }

    return normalizarTelefone(telefone);
}

async function resolverDestinosWhatsApp(client, telefone) {
    const numero = normalizarTelefone(telefone);

    if (!numero || numero.length < 8 || numero.length > 15) {
        throw new Error('Telefone do cliente invalido. Confira o DDD e o numero.');
    }

    const destinoNumero = `${numero}@c.us`;
    const destinos = [];
    const adicionarDestino = (destino) => {
        const valor = String(destino || '').trim();
        if (valor && !destinos.includes(valor)) {
            destinos.push(valor);
        }
    };

    adicionarDestino(destinoNumero);

    if (typeof client.getNumberId === 'function') {
        try {
            const contato = await aguardarComTimeout(
                client.getNumberId(numero),
                15000,
                'Validacao do numero no WhatsApp'
            );

            if (!contato || !contato._serialized) {
                throw new Error(`O numero ${numero} nao foi localizado no WhatsApp.`);
            }

            adicionarDestino(contato._serialized);

            if (String(contato._serialized).endsWith('@lid')) {
                console.log(`[clientes] WhatsApp retornou LID ${contato._serialized}; telefone cadastrado tambem sera tentado ${destinoNumero}.`);
            }
        } catch (err) {
            console.warn(`[clientes] Nao foi possivel validar ${numero} no WhatsApp: ${err.message}. Tentando telefone cadastrado.`);
        }
    }

    return destinos;
}

async function resolverDestinoWhatsApp(client, telefone) {
    const destinos = await resolverDestinosWhatsApp(client, telefone);
    return destinos[0];
}

function obterEnvioWhatsAppRecente(chaveEnvio) {
    const envioRecente = mensagensWhatsAppRecentes.get(chaveEnvio);

    if (!envioRecente) {
        return null;
    }

    if (Date.now() - envioRecente.enviadoEm >= WHATSAPP_ENVIO_DUPLICADO_MS) {
        mensagensWhatsAppRecentes.delete(chaveEnvio);
        return null;
    }

    return envioRecente;
}

function reservarEnvioWhatsApp(chaveEnvio) {
    mensagensWhatsAppRecentes.set(chaveEnvio, {
        enviadoEm: Date.now(),
        mensagemId: '',
        ack: undefined,
        emAndamento: true
    });
}

function confirmarEnvioWhatsApp(chaveEnvio, envio) {
    mensagensWhatsAppRecentes.set(chaveEnvio, {
        enviadoEm: Date.now(),
        mensagemId: envio?.id?._serialized || '',
        ack: envio?.ack,
        emAndamento: false
    });
}

async function enviarMensagemWhatsAppComFallback(client, telefone, mensagem, descricao = 'Envio pelo WhatsApp') {
    const destinos = await resolverDestinosWhatsApp(client, telefone);
    let ultimoErro = null;

    for (const destino of destinos) {
        try {
            const chaveEnvio = `${destino}|${mensagem}`;
            const envioRecente = obterEnvioWhatsAppRecente(chaveEnvio);

            if (envioRecente) {
                console.warn(`[clientes] ${descricao} ignorado: mensagem duplicada recente para ${destino}.`);
                return {
                    destino,
                    mensagemId: envioRecente.mensagemId || '',
                    ack: envioRecente.ack,
                    duplicadoIgnorado: true
                };
            }

            reservarEnvioWhatsApp(chaveEnvio);
            registrarEnvioDoRobo(destino, mensagem);
            const envio = await aguardarComTimeout(
                enfileirarEnvio(
                    () => client.sendMessage(destino, mensagem),
                    descricao,
                    {
                        proativo: true,
                        persistencia: { tipo: 'texto', destino, texto: mensagem }
                    }
                ),
                90000,
                descricao
            );

            if (!envio) {
                console.warn(`[clientes] ${descricao} sem confirmacao do WhatsApp para ${destino}; tratando como enviado para evitar duplicidade.`);
                confirmarEnvioWhatsApp(chaveEnvio, null);

                return {
                    destino,
                    mensagemId: '',
                    ack: undefined,
                    semConfirmacao: true
                };
            }

            registrarMensagemDoRobo(envio);
            confirmarEnvioWhatsApp(chaveEnvio, envio);

            return {
                destino,
                mensagemId: envio.id?._serialized || '',
                ack: envio.ack
            };
        } catch (err) {
            ultimoErro = err;
            console.warn(`[clientes] ${descricao} falhou para ${destino}: ${err.message}`);
        }
    }

    throw ultimoErro || new Error('Nao foi possivel enviar a mensagem pelo WhatsApp.');
}

async function enviarImagemWhatsAppComFallback(client, telefone, arquivoImagem, legenda, descricao = 'Envio de imagem pelo WhatsApp', opcoes = {}) {
    const destinos = await resolverDestinosWhatsApp(client, telefone);
    let ultimoErro = null;

    for (const destino of destinos) {
        try {
            const chaveEnvio = `${destino}|${arquivoImagem}|${legenda}`;
            const envioRecente = obterEnvioWhatsAppRecente(chaveEnvio);

            if (envioRecente) {
                console.warn(`[clientes] ${descricao} ignorado: imagem duplicada recente para ${destino}.`);
                return {
                    destino,
                    mensagemId: envioRecente.mensagemId || '',
                    ack: envioRecente.ack,
                    duplicadoIgnorado: true
                };
            }

            reservarEnvioWhatsApp(chaveEnvio);
            const media = MessageMedia.fromFilePath(arquivoImagem);
            registrarEnvioDoRobo(destino, legenda);
            const envio = await aguardarComTimeout(
                enfileirarEnvio(
                    async () => {
                        if (opcoes.simularDigitacao) {
                            await simularDigitacaoDestino(
                                client,
                                destino,
                                opcoes.digitacaoMinimaMs ?? CAMPANHA_AMIZADE_INTERVALO_CLIENTES_MIN_MS,
                                opcoes.digitacaoMaximaMs ?? CAMPANHA_AMIZADE_INTERVALO_CLIENTES_MAX_MS
                            );
                        }

                        return client.sendMessage(destino, media, { caption: legenda });
                    },
                    descricao,
                    {
                        ...(opcoes.fila || {}),
                        proativo: true,
                        persistencia: {
                            tipo: 'midia',
                            destino,
                            midia: { mimetype: media.mimetype, data: media.data, filename: media.filename },
                            opcoesMensagem: { caption: legenda }
                        }
                    }
                ),
                120000,
                descricao
            );

            if (!envio) {
                console.warn(`[clientes] ${descricao} sem confirmacao do WhatsApp para ${destino}; tratando como enviado para evitar duplicidade.`);
                mensagensWhatsAppRecentes.set(chaveEnvio, {
                    enviadoEm: Date.now(),
                    mensagemId: '',
                    ack: undefined
                });

                return {
                    destino,
                    mensagemId: '',
                    ack: undefined,
                    semConfirmacao: true
                };
            }

            registrarMensagemDoRobo(envio);
            confirmarEnvioWhatsApp(chaveEnvio, envio);

            return {
                destino,
                mensagemId: envio.id?._serialized || '',
                ack: envio.ack
            };
        } catch (err) {
            ultimoErro = err;
            console.warn(`[clientes] ${descricao} falhou para ${destino}: ${err.message}`);
        }
    }

    throw ultimoErro || new Error('Nao foi possivel enviar a imagem pelo WhatsApp.');
}

function caminhoConfigInstalacaoLocal() {
    return path.join(process.cwd(), '.julian-play-install.json');
}

function lerConfigInstalacaoLocal() {
    try {
        const arquivo = caminhoConfigInstalacaoLocal();
        if (!fs.existsSync(arquivo)) return {};
        return JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
    } catch (err) {
        return {};
    }
}

function normalizarNumeroWhatsappRobo(valor) {
    const telefone = normalizarTelefone(valor) || String(valor || '').replace(/\D/g, '');
    if (telefone && telefone.length >= 10 && telefone.length <= 15) return telefone;
    return '';
}

function obterNumeroWhatsappRoboConfigurado(configInformada = null) {
    const configArquivo = lerConfigInstalacaoLocal();
    const config = configInformada || {};
    const candidatos = [
        config.whatsappRoboNumero,
        config.numeroWhatsappRobo,
        configArquivo.whatsappRoboNumero,
        configArquivo.numeroWhatsappRobo,
        config.whatsappTelefone,
        config.whatsappNumero,
        configArquivo.whatsappTelefone,
        configArquivo.whatsappNumero,
        config.licencaTelefone,
        config.telefoneResponsavel
    ];

    for (const candidato of candidatos) {
        const telefone = normalizarNumeroWhatsappRobo(candidato);
        if (telefone) return telefone;
    }

    return '';
}

function validarNumeroWhatsappRobo(valor) {
    const telefone = String(valor || '').replace(/\D/g, '');
    if (telefone.length < 10 || telefone.length > 15) {
        throw new Error('Informe o WhatsApp com DDI, DDD e numero. Exemplo: 5511999999999.');
    }
    return telefone;
}

function salvarNumeroWhatsappRoboConfigurado(numero) {
    const arquivo = caminhoConfigInstalacaoLocal();
    const config = lerConfigInstalacaoLocal();
    config.whatsappRoboNumero = numero;
    config.numeroWhatsappRobo = numero;
    config.whatsappTelefone = numero;
    config.whatsappNumero = numero;
    fs.writeFileSync(arquivo, JSON.stringify(config, null, 4), 'utf8');
    return config;
}

function telefoneCampanhaAmizade(status = {}, config = {}) {
    const candidatos = [
        obterNumeroWhatsappRoboConfigurado(config),
        status.numeroConectado,
        config.licencaTelefone,
        config.telefoneResponsavel,
        config.whatsappTelefone,
        config.whatsappNumero
    ];

    for (const candidato of candidatos) {
        const telefone = normalizarNumeroWhatsappRobo(candidato);
        if (telefone) return telefone;
    }

    return '';
}

function formatarTelefoneCampanha(telefone) {
    return String(telefone || '').replace(/\D/g, '');
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function intervaloAleatorioMs(minimoMs, maximoMs) {
    if (!Number.isFinite(minimoMs) || !Number.isFinite(maximoMs)) return 0;
    if (maximoMs <= minimoMs) return Math.max(0, minimoMs);

    return Math.round(minimoMs + Math.random() * (maximoMs - minimoMs));
}

function textoIntervaloSegundos(ms) {
    const segundos = Math.max(1, Math.round(Number(ms || 0) / 1000));
    if (segundos < 60) return `${segundos}s`;

    const minutos = Math.floor(segundos / 60);
    const resto = segundos % 60;
    return resto ? `${minutos}min ${resto}s` : `${minutos}min`;
}

async function simularDigitacaoDestino(client, destino, minimoMs, maximoMs) {
    const espera = intervaloAleatorioMs(minimoMs, maximoMs);

    try {
        const chat = await client.getChatById(destino);
        await chat.sendStateTyping();
        await esperar(espera);

        if (typeof chat.clearState === 'function') {
            await chat.clearState();
        }
    } catch (err) {
        if (espera > 0) {
            await esperar(espera);
        }
        console.log(`[clientes] Nao foi possivel simular digitacao para ${destino}: ${err.message}`);
    }
}

function limparStatusCampanhaAmizade() {
    Object.assign(campanhaAmizadeExecucao, {
        id: null,
        emAndamento: false,
        pausada: false,
        cancelada: false,
        iniciadaEm: '',
        pausadaEm: '',
        canceladaEm: '',
        finalizadaEm: '',
        enviados: 0,
        ignorados: 0,
        erros: 0,
        jaEnviados: 0,
        total: 0,
        loteAtual: 0,
        totalLotes: 0,
        proximoLoteEm: '',
        mensagem: '',
        erro: '',
        clientesEnviados: [],
        clientesIgnorados: [],
        clientesJaEnviados: []
    });
}

function registrarClienteCampanha(lista, cliente, motivo = '') {
    if (!cliente) return;

    lista.push({
        id: cliente.id,
        nome: cliente.nome || 'Cliente sem nome',
        telefone: cliente.telefone || '',
        motivo
    });
}

function resumoNomesCampanha(lista = [], limite = 8) {
    const nomes = lista.slice(0, limite).map(item => item.nome).filter(Boolean);
    const restante = Math.max(0, lista.length - nomes.length);

    if (!nomes.length) return '';
    return `${nomes.join(', ')}${restante ? ` e mais ${restante}` : ''}`;
}

function clienteDeItemCampanha(item = {}) {
    return {
        ...item,
        id: item.clienteId || item.id,
        nome: item.nome || item.clienteNome || 'Cliente sem nome',
        telefone: item.telefone || '',
        status: item.clienteStatus || item.status || '',
        atualizadoEm: item.clienteAtualizadoEm || item.atualizadoEm || ''
    };
}

function detalhesCampanha(campanha = {}) {
    try {
        return campanha?.detalhes ? JSON.parse(campanha.detalhes) : {};
    } catch (_) {
        return {};
    }
}

async function carregarResumoCampanhaNaMemoria(campanha) {
    if (!campanha) return;

    const detalhes = detalhesCampanha(campanha);
    const totais = await contarItensCampanhaPorStatus(campanha.id);
    const porStatus = Object.fromEntries(totais.map(item => [item.status, Number(item.total || 0)]));

    campanhaAmizadeExecucao.id = campanha.id;
    campanhaAmizadeExecucao.enviados = porStatus.enviado || 0;
    campanhaAmizadeExecucao.ignorados = (porStatus.ignorado || 0) + (porStatus.erro || 0);
    campanhaAmizadeExecucao.erros = porStatus.erro || Number(campanha.erros || 0);
    campanhaAmizadeExecucao.jaEnviados = porStatus.ja_enviado || 0;
    campanhaAmizadeExecucao.total = Number(campanha.total || Object.values(porStatus).reduce((soma, valor) => soma + valor, 0));
    campanhaAmizadeExecucao.loteAtual = Number(campanha.loteAtual || 0);
    campanhaAmizadeExecucao.totalLotes = Number(campanha.totalLotes || 0);
    campanhaAmizadeExecucao.proximoLoteEm = campanha.proximoLoteEm || '';
    campanhaAmizadeExecucao.iniciadaEm = campanha.iniciadaEm || '';
    campanhaAmizadeExecucao.finalizadaEm = campanha.finalizadaEm || '';
    campanhaAmizadeExecucao.mensagem = campanha.mensagem || 'Campanha carregada para retomada.';
    campanhaAmizadeExecucao.erro = detalhes.erro || '';
    campanhaAmizadeExecucao.clientesEnviados = Array.isArray(detalhes.enviados) ? detalhes.enviados : [];
    campanhaAmizadeExecucao.clientesIgnorados = Array.isArray(detalhes.ignorados) ? detalhes.ignorados : [];
    campanhaAmizadeExecucao.clientesJaEnviados = Array.isArray(detalhes.jaEnviados) ? detalhes.jaEnviados : [];
}

async function sincronizarCampanhaAtual(status = 'em_andamento', extras = {}) {
    if (!campanhaAmizadeExecucao.id) return null;
    const erros = Object.prototype.hasOwnProperty.call(extras, 'erros')
        ? Number(extras.erros || 0)
        : Number(campanhaAmizadeExecucao.erros || 0);

    return atualizarCampanha(campanhaAmizadeExecucao.id, {
        status,
        total: campanhaAmizadeExecucao.total,
        enviados: campanhaAmizadeExecucao.enviados,
        ignorados: campanhaAmizadeExecucao.ignorados,
        jaEnviados: campanhaAmizadeExecucao.jaEnviados,
        erros,
        loteAtual: campanhaAmizadeExecucao.loteAtual,
        totalLotes: campanhaAmizadeExecucao.totalLotes,
        proximoLoteEm: campanhaAmizadeExecucao.proximoLoteEm,
        mensagem: campanhaAmizadeExecucao.mensagem,
        detalhes: {
            enviados: campanhaAmizadeExecucao.clientesEnviados,
            ignorados: campanhaAmizadeExecucao.clientesIgnorados,
            jaEnviados: campanhaAmizadeExecucao.clientesJaEnviados,
            erros: campanhaAmizadeExecucao.erros || 0,
            erro: campanhaAmizadeExecucao.erro || '',
            pausada: Boolean(campanhaAmizadeExecucao.pausada),
            cancelada: Boolean(campanhaAmizadeExecucao.cancelada),
            pausadaEm: campanhaAmizadeExecucao.pausadaEm || '',
            canceladaEm: campanhaAmizadeExecucao.canceladaEm || ''
        },
        ...extras
    }).catch((err) => {
        console.log(`[clientes] Nao foi possivel atualizar campanha ${campanhaAmizadeExecucao.id}: ${err.message}`);
        return null;
    });
}

function erroCampanhaCancelada() {
    const err = new Error('Campanha cancelada pelo painel.');
    err.campanhaCancelada = true;
    return err;
}

async function aguardarCampanhaAmizadeLiberada() {
    if (campanhaAmizadeExecucao.cancelada) {
        throw erroCampanhaCancelada();
    }

    while (campanhaAmizadeExecucao.pausada) {
        campanhaAmizadeExecucao.mensagem = 'Campanha pausada. Clique em continuar para retomar os envios.';
        await sincronizarCampanhaAtual('pausada');
        await esperar(5000);

        if (campanhaAmizadeExecucao.cancelada) {
            throw erroCampanhaCancelada();
        }
    }
}

async function aguardarIntervaloCampanhaAmizade(intervaloMs) {
    const fim = Date.now() + intervaloMs;

    while (Date.now() < fim) {
        await aguardarCampanhaAmizadeLiberada();
        await esperar(Math.min(5000, Math.max(250, fim - Date.now())));
    }
}

function executarPowerShell(args) {
    return new Promise((resolve, reject) => {
        execFile('powershell.exe', args, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
                err.message = `${err.message}${stderr ? `\n${stderr}` : ''}`;
                reject(err);
                return;
            }

            resolve(stdout);
        });
    });
}

const SCRIPT_GERAR_CAMPANHA_AMIZADE = `
param(
    [Parameter(Mandatory = $true)][string]$Origem,
    [Parameter(Mandatory = $true)][string]$Destino,
    [Parameter(Mandatory = $true)][string]$Texto
)

Add-Type -AssemblyName System.Drawing
$imagem = [System.Drawing.Image]::FromFile($Origem)
try {
    $bitmap = New-Object System.Drawing.Bitmap $imagem.Width, $imagem.Height
    $grafico = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $grafico.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $grafico.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $grafico.DrawImage($imagem, 0, 0, $imagem.Width, $imagem.Height)
        $fonte = New-Object System.Drawing.Font('Arial', 27, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $pincel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(6, 18, 37))
        try {
            $grafico.DrawString($Texto, $fonte, $pincel, 220, 1157)
            $bitmap.Save($Destino, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $pincel.Dispose()
            $fonte.Dispose()
        }
    } finally {
        $grafico.Dispose()
        $bitmap.Dispose()
    }
} finally {
    $imagem.Dispose()
}

if (-not (Test-Path -LiteralPath $Destino)) {
    throw "Imagem da campanha nao foi gerada: $Destino"
}
`;

async function criarImagemCampanhaAmizade(telefoneInstalacao, config = {}) {
    const origem = obterImagemBaseCampanhaAmizade(config);
    const telefone = formatarTelefoneCampanha(telefoneInstalacao);

    if (!telefone || process.platform !== 'win32') {
        return { arquivo: origem, temporario: false };
    }

    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    const destino = path.join(ASSETS_DIR, `amizade-presente-${telefone}.png`);
    const scriptPath = path.join(ASSETS_DIR, 'gerar-campanha-amizade.ps1');

    fs.writeFileSync(scriptPath, SCRIPT_GERAR_CAMPANHA_AMIZADE, 'utf8');
    await executarPowerShell(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, origem, destino, telefone]);

    if (!fs.existsSync(destino)) {
        throw new Error(`Imagem da campanha nao foi gerada: ${destino}`);
    }

    return { arquivo: destino, temporario: false };
}

async function enviarCampanhaAmizadeParaCliente(client, cliente, imagemCampanha, telefoneInstalacao, descricao = 'Campanha amizade que vale presente') {
    const telefone = normalizarTelefoneClienteWhatsApp(cliente);

    if (!telefone) {
        throw new Error('Cliente sem telefone cadastrado.');
    }

    const legenda = await montarMensagemCampanhaAmizade(cliente, formatarTelefoneCampanha(telefoneInstalacao));
    const envio = await enviarImagemWhatsAppComFallback(
        client,
        telefone,
        imagemCampanha.arquivo,
        legenda,
        descricao,
        {
            simularDigitacao: true,
            fila: {
                intervaloMinimoSegundos: 2,
                intervaloMaximoSegundos: 5
            }
        }
    );

    return {
        ...envio,
        telefone
    };
}

async function enviarCampanhaAmizadeManualPorId(clienteId, descricao = 'Campanha amizade que vale presente manual') {
    const cliente = await buscarClientePorId(clienteId);

    if (!cliente) {
        throw new Error('Cliente nao encontrado.');
    }

    const status = getStatusWhatsApp();
    const client = getClient();
    const config = await obterConfiguracoes();
    const telefoneInstalacao = telefoneCampanhaAmizade(status, config);
    let imagemCampanha = null;

    if (!client || !status.conectado) {
        throw new Error('WhatsApp nao esta conectado.');
    }

    if (!fs.existsSync(obterImagemBaseCampanhaAmizade(config))) {
        throw new Error('Imagem da campanha nao encontrada. Gere o pacote novamente.');
    }

    try {
        imagemCampanha = await criarImagemCampanhaAmizade(telefoneInstalacao, config);
        const envioWhatsApp = await enviarCampanhaAmizadeParaCliente(
            client,
            cliente,
            imagemCampanha,
            telefoneInstalacao,
            descricao
        );

        await adicionarNotaCliente(cliente.id, 'Campanha "Amizade que vale presente" enviada manualmente pelo WhatsApp.');
        logControleClientes('Campanha amizade manual enviada', {
            clienteId: cliente.id,
            destino: envioWhatsApp.destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            telefoneInstalacao: formatarTelefoneCampanha(telefoneInstalacao)
        });

        return { cliente, envioWhatsApp };
    } finally {
        if (imagemCampanha?.temporario) {
            fs.promises.unlink(imagemCampanha.arquivo).catch(() => {});
        }
    }
}

function campanhaDentroHorario(config, data = new Date()) {
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(data);
    const obter = tipo => partes.find(item => item.type === tipo)?.value || '';
    const dia = obter('weekday').toLowerCase();
    const hora = `${obter('hour')}:${obter('minute')}`;
    if (config.campanhaSomenteDiasUteis !== '0' && (dia.startsWith('sáb') || dia.startsWith('dom'))) return false;
    return hora >= (config.campanhaHoraInicio || '09:00') && hora < (config.campanhaHoraFim || '20:00');
}

function textoJanelaCampanha(config = {}) {
    const dias = config.campanhaSomenteDiasUteis !== '0' ? 'somente em dias úteis' : 'todos os dias';
    return `${dias}, das ${config.campanhaHoraInicio || '09:00'} às ${config.campanhaHoraFim || '20:00'}`;
}

function mensagemCampanhaForaHorario(config = {}) {
    return `Envio geral bloqueado pela configuração: campanhas permitidas ${textoJanelaCampanha(config)}. Altere essa regra em Manutenção se quiser enviar agora.`;
}

async function executarCampanhaAmizadeEmLotes(opcoes = {}) {
    const statusInicial = getStatusWhatsApp();
    const client = getClient();
    const config = await obterConfiguracoes();
    const telefoneInstalacao = telefoneCampanhaAmizade(statusInicial, config);
    let imagemCampanha = null;
    const retomar = Boolean(opcoes.retomar);

    if (!campanhaDentroHorario(config)) {
        throw new Error(`Campanhas permitidas somente em dias úteis, entre ${config.campanhaHoraInicio || '09:00'} e ${config.campanhaHoraFim || '20:00'}.`);
    }

    if (!client || !statusInicial.conectado) {
        throw new Error('WhatsApp nao esta conectado.');
    }

    if (!fs.existsSync(obterImagemBaseCampanhaAmizade(config))) {
        throw new Error('Imagem da campanha nao encontrada. Gere o pacote novamente.');
    }

    imagemCampanha = await criarImagemCampanhaAmizade(telefoneInstalacao, config);

    try {
        let clientesElegiveis = [];

        if (retomar) {
            const campanha = await buscarCampanha(campanhaAmizadeExecucao.id);
            await carregarResumoCampanhaNaMemoria(campanha);
            const pendentes = await listarItensCampanhaPorStatus(campanhaAmizadeExecucao.id, 'pendente', 5000);
            clientesElegiveis = pendentes.map((item) => ({
                ...clienteDeItemCampanha(item),
                _campanhaItemId: item.id
            })).filter(cliente => cliente.id);
            campanhaAmizadeExecucao.mensagem = `Campanha retomada: ${clientesElegiveis.length} cliente(s) pendente(s).`;
        } else {
            const todosClientes = await listarClientesAtivosComerciais();
            const limiteDiario = Math.max(1, Number.parseInt(config.campanhaLimiteDiario || 100, 10) || 100);
            const limiteSemanalCliente = Math.max(1, Number.parseInt(config.campanhaLimiteSemanalCliente || 1, 10) || 1);
            const inicioSemana = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();

            campanhaAmizadeExecucao.total = todosClientes.length;
            await sincronizarCampanhaAtual('em_andamento');

            for (const cliente of todosClientes) {
                const telefone = normalizarTelefoneClienteWhatsApp(cliente);

                if (!telefone || clienteEhTeste(cliente)) {
                    const motivo = clienteEhTeste(cliente) ? 'teste' : 'sem telefone';
                    campanhaAmizadeExecucao.ignorados += 1;
                    registrarClienteCampanha(campanhaAmizadeExecucao.clientesIgnorados, cliente, motivo);
                    await registrarItemCampanha(campanhaAmizadeExecucao.id, cliente, {
                        telefone,
                        status: 'ignorado',
                        motivo
                    });
                    continue;
                }

                if (await campanhaAmizadeJaEnviada(cliente.id)) {
                    campanhaAmizadeExecucao.jaEnviados += 1;
                    registrarClienteCampanha(campanhaAmizadeExecucao.clientesJaEnviados, cliente, 'ja enviado');
                    await registrarItemCampanha(campanhaAmizadeExecucao.id, cliente, {
                        telefone,
                        status: 'ja_enviado',
                        motivo: 'ja enviado anteriormente'
                    });
                    continue;
                }

                if (await contarEnviosClienteDesde(cliente.id, inicioSemana) >= limiteSemanalCliente) {
                    campanhaAmizadeExecucao.ignorados += 1;
                    registrarClienteCampanha(campanhaAmizadeExecucao.clientesIgnorados, cliente, 'limite semanal');
                    await registrarItemCampanha(campanhaAmizadeExecucao.id, cliente, {
                        telefone,
                        status: 'ignorado',
                        motivo: `limite semanal de ${limiteSemanalCliente} campanha(s) por cliente`
                    });
                    continue;
                }

                if (clientesElegiveis.length >= limiteDiario) {
                    campanhaAmizadeExecucao.ignorados += 1;
                    registrarClienteCampanha(campanhaAmizadeExecucao.clientesIgnorados, cliente, 'limite diário');
                    await registrarItemCampanha(campanhaAmizadeExecucao.id, cliente, {
                        telefone,
                        status: 'ignorado',
                        motivo: `limite diário de ${limiteDiario} envios`
                    });
                    continue;
                }

                const itemId = await registrarItemCampanha(campanhaAmizadeExecucao.id, cliente, {
                    telefone,
                    status: 'pendente',
                    motivo: 'aguardando envio'
                });
                clientesElegiveis.push({
                    ...cliente,
                    _campanhaItemId: itemId
                });
            }
        }

        const totalElegivel = campanhaAmizadeExecucao.enviados + clientesElegiveis.length;
        campanhaAmizadeExecucao.totalLotes = Math.max(1, Math.ceil(clientesElegiveis.length / CAMPANHA_AMIZADE_LOTE_TAMANHO));
        campanhaAmizadeExecucao.mensagem = `Campanha em andamento: ${campanhaAmizadeExecucao.enviados} de ${totalElegivel} cliente(s) elegivel(is) enviados.`;
        await sincronizarCampanhaAtual('em_andamento');

        for (let indice = 0; indice < clientesElegiveis.length; indice += CAMPANHA_AMIZADE_LOTE_TAMANHO) {
            await aguardarCampanhaAmizadeLiberada();
            if (!campanhaDentroHorario(config)) {
                throw new Error('Campanha pausada automaticamente porque terminou o horário comercial.');
            }
            const statusAtual = getStatusWhatsApp();

            if (!statusAtual.conectado) {
                throw new Error('WhatsApp desconectou durante a campanha. Reconecte e continue depois.');
            }

            const lote = clientesElegiveis.slice(indice, indice + CAMPANHA_AMIZADE_LOTE_TAMANHO);
            campanhaAmizadeExecucao.loteAtual = Math.floor(indice / CAMPANHA_AMIZADE_LOTE_TAMANHO) + 1;
            campanhaAmizadeExecucao.proximoLoteEm = '';
            await sincronizarCampanhaAtual('em_andamento');

            for (const cliente of lote) {
                await aguardarCampanhaAmizadeLiberada();
                const telefone = normalizarTelefoneClienteWhatsApp(cliente);

                try {
                    const legenda = await montarMensagemCampanhaAmizade(cliente, formatarTelefoneCampanha(telefoneInstalacao));
                    const envioCampanha = await enviarImagemWhatsAppComFallback(
                        client,
                        telefone,
                        imagemCampanha.arquivo,
                        legenda,
                        'Campanha amizade que vale presente em lote',
                        {
                            simularDigitacao: true,
                            fila: {
                                intervaloMinimoSegundos: 2,
                                intervaloMaximoSegundos: 5
                            }
                        }
                    );
                    await adicionarNotaCliente(cliente.id, 'Campanha "Amizade que vale presente" enviada pelo WhatsApp.');
                    campanhaAmizadeExecucao.enviados += 1;
                    registrarClienteCampanha(campanhaAmizadeExecucao.clientesEnviados, cliente);
                    await atualizarItemCampanha(cliente._campanhaItemId, {
                        destino: envioCampanha?.destino || telefone,
                        status: 'enviado',
                        motivo: '',
                        enviadoEm: new Date().toISOString()
                    });
                } catch (err) {
                    if (/WhatsApp nao esta conectado|WhatsApp desconectou|detached Frame|Execution context|Protocol|Runtime\.callFunctionOn/i.test(err.message || '')) {
                        throw err;
                    }

                    campanhaAmizadeExecucao.ignorados += 1;
                    campanhaAmizadeExecucao.erros += 1;
                    registrarClienteCampanha(campanhaAmizadeExecucao.clientesIgnorados, cliente, err.message);
                    await atualizarItemCampanha(cliente._campanhaItemId, {
                        status: 'erro',
                        motivo: err.message
                    });
                    logControleClientes('Erro ao enviar campanha amizade em lote', {
                        clienteId: cliente.id,
                        telefone,
                        erro: err.message
                    });
                    const tentativas = campanhaAmizadeExecucao.enviados + campanhaAmizadeExecucao.erros;
                    const minimo = Math.max(1, Number.parseInt(config.campanhaPausaErroMinimo || 5, 10) || 5);
                    const limitePercentual = Math.max(1, Number.parseInt(config.campanhaPausaErroPercentual || 20, 10) || 20);
                    const percentual = tentativas ? (campanhaAmizadeExecucao.erros / tentativas) * 100 : 0;
                    if (!campanhaAmizadeExecucao.pausada && tentativas >= minimo && percentual >= limitePercentual) {
                        campanhaAmizadeExecucao.pausada = true;
                        campanhaAmizadeExecucao.pausadaEm = new Date().toISOString();
                        campanhaAmizadeExecucao.mensagem = `Campanha pausada automaticamente: ${percentual.toFixed(1)}% de falhas em ${tentativas} tentativa(s).`;
                        await sincronizarCampanhaAtual('pausada');
                        await registrarEventoSistema('campanha_pausa_automatica', 'alerta', campanhaAmizadeExecucao.mensagem, {
                            campanhaId: campanhaAmizadeExecucao.id,
                            tentativas,
                            erros: campanhaAmizadeExecucao.erros,
                            percentual
                        });
                        await enviarWebhook(config.alertaWebhookUrl, {
                            tipo: 'campanha_pausa_automatica',
                            nivel: 'alerta',
                            mensagem: campanhaAmizadeExecucao.mensagem,
                            detalhes: { campanhaId: campanhaAmizadeExecucao.id, tentativas, erros: campanhaAmizadeExecucao.erros, percentual }
                        });
                    }
                }

                if (!campanhaAmizadeExecucao.pausada) {
                    campanhaAmizadeExecucao.mensagem = `Campanha em andamento: ${campanhaAmizadeExecucao.enviados} de ${totalElegivel} cliente(s) elegivel(is) enviados.`;
                }
                await sincronizarCampanhaAtual(campanhaAmizadeExecucao.pausada ? 'pausada' : 'em_andamento');
            }

            const aindaTemLote = indice + CAMPANHA_AMIZADE_LOTE_TAMANHO < clientesElegiveis.length;

            if (aindaTemLote) {
                const intervaloLoteMs = intervaloAleatorioMs(
                    CAMPANHA_AMIZADE_INTERVALO_LOTES_MIN_MS,
                    CAMPANHA_AMIZADE_INTERVALO_LOTES_MAX_MS
                );
                campanhaAmizadeExecucao.proximoLoteEm = new Date(Date.now() + intervaloLoteMs).toISOString();
                campanhaAmizadeExecucao.mensagem = `Lote ${campanhaAmizadeExecucao.loteAtual} concluido. Proximo lote em aproximadamente ${textoIntervaloSegundos(intervaloLoteMs)}.`;
                await sincronizarCampanhaAtual('em_andamento');
                await aguardarIntervaloCampanhaAmizade(intervaloLoteMs);
            }
        }

        campanhaAmizadeExecucao.mensagem = `Campanha concluida: ${campanhaAmizadeExecucao.enviados} enviado(s), ${campanhaAmizadeExecucao.ignorados} ignorado(s), ${campanhaAmizadeExecucao.jaEnviados} ja tinham recebido.`;
        await sincronizarCampanhaAtual('concluida', { finalizadaEm: new Date().toISOString() });
        logControleClientes('Campanha amizade que vale presente concluida em lotes', {
            enviados: campanhaAmizadeExecucao.enviados,
            ignorados: campanhaAmizadeExecucao.ignorados,
            jaEnviados: campanhaAmizadeExecucao.jaEnviados,
            total: campanhaAmizadeExecucao.total,
            telefoneInstalacao: formatarTelefoneCampanha(telefoneInstalacao)
        });
    } finally {
        if (imagemCampanha?.temporario) {
            fs.promises.unlink(imagemCampanha.arquivo).catch(() => {});
        }
    }
}

function formatarDataHoraMensagem(valor) {
    if (!valor) return '';

    const data = new Date(String(valor).length <= 10 ?`${valor}T00:00:00` : valor);
    if (Number.isNaN(data.getTime())) return valor;

    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = String(data.getFullYear());
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');

    return `${dia}/${mes}/${ano} às ${hora}:${minuto}`;
}

function montarMensagemTesteLiberado(dados = {}) {
    return `*TESTE GRÁTIS LIBERADO*
--------------------
Seu acesso de teste foi preparado com sucesso.

*Nome:* ${dados.nome}
*Dispositivo:* ${dados.aparelho}
*Aplicativo:* ${dados.aplicativo}
*Painel:* ${dados.painel}
*Usuário:* ${dados.usuario}
*Senha:* ${dados.senha}
*Data/Início:* ${formatarDataHoraMensagem(dados.dataInicio)}
*Válido até:* ${formatarDataHoraMensagem(dados.validade)}

Teste configurado. Para encerrar o atendimento, digite *sair*.`;
}

function montarMensagemBonusAplicado(cliente = {}, resultado = {}) {
    const meses = Number(resultado.meses || 1);
    const textoMeses = meses === 1 ?'1 mês grátis' : `${meses} meses grátis`;
    const saldo = Number(resultado.saldoRestante || 0);

    return `🎁 *BÔNUS APLICADO*
--------------------
Olá, *${cliente.nome || 'cliente'}*!

Foi aplicado em seu cadastro um bônus de *${textoMeses}* no seu plano.

    *Vencimento:* ${formatarDataHoraMensagem(resultado.dataVencimento)}
*Saldo de bônus restante:* ${saldo}

Obrigado pela preferência.`;
}

function montarMensagemRenovacaoConfirmada(cliente = {}, resultado = {}) {
    const valorPlano = resultado.valorPlano || resultado.valorTotal || '0,00';
    const valorApp = numeroMoeda(resultado.assinaturaApp);
    const detalheApp = valorApp > 0
        ? `\n*Assinatura App:* R$ ${resultado.assinaturaApp}`
        : '';

    return `*RENOVAÇÃO CONFIRMADA*
--------------------
Olá, *${cliente.nome || 'cliente'}*!

Sua renovação foi registrada com sucesso.

*Plano:* ${resultado.plano}
*Valor do plano:* R$ ${valorPlano}${detalheApp}
*Forma de pagamento:* ${resultado.formaPagamento}
*Novo vencimento:* ${formatarDataHoraMensagem(resultado.vencimentoNovo)}

Obrigado pela preferência.`;
}

function montarMensagemAssinaturaConfirmada(cliente = {}) {
    const inicio = formatarDataHoraMensagem(cliente.dataInicio);
    const vencimento = formatarDataHoraMensagem(cliente.dataVencimento || cliente.vencimento);

    return `*ASSINATURA ATIVADA*
--------------------
Olá, *${cliente.nome || 'cliente'}*!

Sua assinatura foi cadastrada com sucesso.

*Plano:* ${cliente.plano || '-'}
${inicio ? `*Início:* ${inicio}\n` : ''}*Válida até:* ${vencimento || '-'}

Obrigado pela preferência.`;
}

function clienteEhTeste(cliente = {}) {
    const status = String(cliente.status || '').toLowerCase();
    const plano = String(cliente.plano || '').toLowerCase();

    return status === 'teste' || plano.includes('teste');
}

function clienteTesteExpirado(cliente = {}) {
    const vencimento = cliente.dataVencimento || cliente.vencimento;

    return clienteEhTeste(cliente) && vencimentoExpirou(vencimento);
}

async function obterPlanosRenovacaoManual() {
    try {
        const planos = await listarPlanosComerciais();
        return planos.length ? planos : montarPlanosPadraoComerciais();
    } catch (err) {
        logControleClientes('Falha ao carregar planos para teste expirado', { erro: err.message });
        return montarPlanosPadraoComerciais();
    }
}

async function montarMensagemPlanosTesteExpiradoManual(cliente = {}, planos = []) {
    return montarMensagemTesteExpiradoAssinatura(cliente, menuRenovacao(planos));
}

function clientePodeReceberReativacao(cliente = {}) {
    if (clienteEhTeste(cliente)) return false;

    const status = String(cliente.status || '').toLowerCase();
    const vencimento = cliente.dataVencimento || cliente.vencimento;

    return (
        status === 'expirado' ||
        status === 'inadimplente' ||
        vencimentoExpirou(vencimento)
    );
}

function valorMoedaPix(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function appClienteVencido(cliente = {}) {
    const validade = cliente.dataValidadeApp;
    if (!validade) return false;

    const data = new Date(`${validade}T23:59:59`);
    return !Number.isNaN(data.getTime()) && data < new Date();
}

function prepararPlanoPixCliente(cliente = {}, planoPix = {}) {
    const valorPlano = numeroMoeda(cliente.valorPlano || planoPix.valor);
    const valorApp = numeroMoeda(cliente.assinaturaApp);
    const incluirApp = appClienteVencido(cliente) && valorApp > 0;
    const total = valorPlano + (incluirApp ? valorApp : 0);
    const valorFinal = total || numeroMoeda(planoPix.valor);
    const valorFinalFormatado = valorMoedaPix(valorFinal);
    const valorPlanoFormatado = valorMoedaPix(valorPlano);
    const valorAppFormatado = valorMoedaPix(valorApp);

    return {
        plano: {
            ...planoPix,
            valor: valorFinalFormatado,
            valorNumero: valorFinal,
            valorTotal: valorFinalFormatado,
            total: valorFinalFormatado,
            totalNumero: valorFinal,
            valorPlano: valorPlanoFormatado,
            valorPlanoNumero: valorPlano,
            valorCobranca: valorFinalFormatado,
            valorCobrado: valorFinalFormatado,
            nome: incluirApp ? `${planoPix.nome} + APP` : planoPix.nome
        },
        incluirApp,
        valorPlano: valorPlanoFormatado,
        valorApp: valorAppFormatado,
        total: valorFinalFormatado
    };
}

function prepararPlanoPixDoPlanoCliente(cliente = {}, planoPix = {}) {
    const valorPlano = numeroMoeda(cliente.valorPlano || planoPix.valor);
    const valorFormatado = valorMoedaPix(valorPlano || numeroMoeda(planoPix.valor));

    return {
        ...planoPix,
        nome: cliente.plano || planoPix.nome || 'Plano',
        valor: valorFormatado,
        valorNumero: numeroMoeda(valorFormatado),
        valorTotal: valorFormatado,
        total: valorFormatado,
        totalNumero: numeroMoeda(valorFormatado),
        valorPlano: valorFormatado,
        valorPlanoNumero: numeroMoeda(valorFormatado),
        valorCobranca: valorFormatado,
        valorCobrado: valorFormatado
    };
}

function montarMensagemReativacaoCliente(cliente = {}, pixCliente = null) {
    const vencimento = formatarDataHoraMensagem(cliente.dataVencimento || cliente.vencimento);
    const valorPlano = pixCliente?.valorPlano || cliente.valorPlano || '0,00';
    const assinaturaApp = pixCliente?.valorApp || cliente.assinaturaApp || '0,00';
    const textoApp = pixCliente?.incluirApp
        ?`*Assinatura App:* R$ ${assinaturaApp} (incluída porque a validade do app venceu)`
        : `*Assinatura App:* não incluída neste PIX${cliente.dataValidadeApp ?` (app válido até ${formatarDataHoraCurta(cliente.dataValidadeApp)})` : ''}`;

    return `*REATIVAÇÃO DE PLANO*
--------------------
Olá, *${cliente.nome || 'cliente'}*!

Seu plano *${cliente.plano || 'atual'}* está vencido${vencimento ?` desde *${vencimento}*` : ''}.

Para reativar seu acesso, realize o pagamento pelo QR Code PIX que vou enviar em seguida.

*Plano:* ${cliente.plano || '-'}
*Valor do plano:* R$ ${valorPlano}
${textoApp}
*Total do PIX:* R$ ${pixCliente?.total || valorPlano}

Depois do pagamento, envie o comprovante aqui para confirmar a reativação.`;
}

function dadosTesteLiberadoDoCliente(cliente = {}) {
    const acesso = primeiroAcessoApp(cliente);
    const dispositivo = acesso.dispositivo || valorPrimeiroItem(cliente.dispositivosSelecionados) || cliente.aparelho || '';

    return {
        telefone: cliente.telefone,
        nome: cliente.nome,
        aparelho: dispositivo,
        aplicativo: acesso.app || valorPrimeiroItem(cliente.appsInstalados) || '',
        painel: acesso.painel || valorPrimeiroItem(cliente.paineisSelecionados) || '',
        usuario: acesso.usuario || cliente.usuario,
        senha: acesso.senha || cliente.senha,
        dataInicio: cliente.dataInicio,
        validade: cliente.dataVencimento || cliente.vencimento
    };
}

function camposFaltandoTesteLiberado(dados = {}) {
    const campos = [
        ['nome', 'nome'],
        ['aparelho', 'dispositivo'],
        ['aplicativo', 'aplicativo'],
        ['painel', 'painel'],
        ['usuario', 'usuario'],
        ['senha', 'senha'],
        ['dataInicio', 'data de inicio'],
        ['validade', 'validade']
    ];

    return campos
        .filter(([campo]) => !String(dados[campo] || '').trim())
        .map(([, label]) => label);
}

function secaoPrivacidadeCliente(cliente = {}, exclusaoDefinitiva = {}) {
    if (!cliente.id) return '';
    const anonimizado = Boolean(cliente.anonimizadoEm);
    const possuiFinanceiro = Boolean(exclusaoDefinitiva.possuiFinanceiro);
    const financeiroExclusao = exclusaoDefinitiva.financeiro || {};
    const confirmacaoExclusao = possuiFinanceiro ? 'EXCLUIR TUDO' : 'EXCLUIR';

    return `<section class="panel" id="privacidade" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Privacidade e dados do cliente</h2>
                <div class="subtitle">Exporte os dados do titular ou remova os dados pessoais com trilha de auditoria</div>
            </div>
            ${anonimizado ? '<span class="badge warn">Anonimizado</span>' : '<span class="badge info">Ação protegida</span>'}
        </div>
        <div class="notice ${anonimizado ? 'warn' : ''}">
            ${anonimizado
        ? `Este cadastro foi anonimizado em ${escapar(formatarDataHoraBrasil(cliente.anonimizadoEm))}. Os registros financeiros mínimos continuam preservados.`
        : 'Antes de exportar, confirme a identidade do titular. A anonimização é irreversível e substitui a exclusão direta para não quebrar pagamentos e auditorias.'}
        </div>
        <div class="fields" style="margin-top:16px;">
            <form class="full" method="post" action="/privacidade/clientes/${escapar(cliente.id)}/exportar">
                <div class="fields">
                    <label class="full" style="display:flex;gap:10px;align-items:center;">
                        <input type="checkbox" name="titularConfirmado" value="1" required style="width:auto;">
                        Confirmei a identidade da pessoa que solicitou os dados
                    </label>
                    ${campo({ nome: 'senhaConfirmacao', label: 'Senha atual do painel', valor: '', tipo: 'password', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required` })}
                    <div style="align-self:end;"><button class="button secondary" type="submit">Exportar dados em JSON</button></div>
                </div>
            </form>
            ${anonimizado ? '' : `<form class="full" method="post" action="/privacidade/clientes/${escapar(cliente.id)}/anonimizar" onsubmit="return confirm('Anonimizar definitivamente os dados pessoais deste cliente? Esta operação não pode ser desfeita.');">
                <div class="fields">
                    ${areaTexto({ nome: 'motivo', label: 'Motivo da solicitação de anonimização', valor: '' })}
                    ${campo({ nome: 'confirmacao', label: 'Digite ANONIMIZAR', valor: '', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required pattern="ANONIMIZAR" readonly onfocus="this.removeAttribute('readonly');this.value=''"` })}
                    ${campo({ nome: 'senhaConfirmacao', label: 'Senha atual do painel', valor: '', tipo: 'password', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required readonly onfocus="this.removeAttribute('readonly');this.value=''"` })}
                    <div class="full"><button class="button danger" type="submit">Anonimizar dados pessoais</button></div>
                </div>
            </form>`}
            ${exclusaoDefinitiva.permitida ? `<form class="full danger-zone" method="post" action="/privacidade/clientes/${escapar(cliente.id)}/excluir" onsubmit="return confirm('Excluir definitivamente este cliente? Todos os seus dados serão apagados e a ação não poderá ser desfeita.');">
                <h3>Excluir cliente definitivamente</h3>
                <p class="subtitle">O cliente desaparecerá do sistema junto com seus dados e históricos vinculados.</p>
                ${possuiFinanceiro ? `<div class="notice warn" style="margin:16px 0 0;">Atenção: também serão apagados ${escapar(financeiroExclusao.pagamentos || 0)} pagamento(s), ${escapar(financeiroExclusao.cobrancas || 0)} cobrança(s) e ${escapar(financeiroExclusao.renovacoes || 0)} renovação(ões) de painel.</div>` : '<div class="notice" style="margin:16px 0 0;">Este cadastro não possui histórico financeiro.</div>'}
                <div class="fields" style="padding:0;margin-top:16px;">
                    ${campo({ nome: 'motivo', label: 'Motivo da exclusão', valor: '', attrs: 'required minlength="10" placeholder="Ex.: cliente desistiu antes do pagamento"' })}
                    ${campo({ nome: 'confirmacao', label: `Digite ${confirmacaoExclusao}`, valor: '', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required pattern="${confirmacaoExclusao}" readonly onfocus="this.removeAttribute('readonly');this.value=''"` })}
                    ${campo({ nome: 'senhaConfirmacao', label: 'Senha atual do painel', valor: '', tipo: 'password', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required readonly onfocus="this.removeAttribute('readonly');this.value=''"` })}
                    <div style="align-self:end;"><button class="button danger" type="submit">Excluir definitivamente</button></div>
                </div>
            </form>` : ''}
        </div>
    </section>`;
}

function secaoTesteLiberado(cliente = {}, listas = {}) {
    if (!cliente.id) return '';

    const apps = listas.apps || [];
    const dispositivos = listas.dispositivos || [];
    const paineis = listas.paineis || [];
    const acesso = primeiroAcessoApp(cliente);
    const inicio = inputDateTime(cliente.dataInicio) || agoraLocalDateTime();
    const validade = inputDateTime(cliente.dataVencimento || cliente.vencimento);

    return `<section class="panel" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Teste grátis liberado</h2>
                <div class="subtitle">Preencha os dados e envie a resposta para o cliente pelo WhatsApp</div>
            </div>
        </div>
        <form class="fields client-form" method="post" action="/clientes/${escapar(cliente.id)}/enviar-teste-liberado">
            ${campo({ nome: 'nome', label: 'Nome', valor: cliente.nome, attrs: 'required' })}
            ${campo({
                nome: 'aparelho',
                label: 'Dispositivo',
                valor: acesso.dispositivo || valorPrimeiroItem(cliente.dispositivosSelecionados) || cliente.aparelho,
                attrs: 'required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...dispositivos.map(item => ({ valor: item.nome, texto: item.nome }))
                ]
            })}
            ${campo({
                nome: 'aplicativo',
                label: 'Aplicativo',
                valor: acesso.app || valorPrimeiroItem(cliente.appsInstalados) || '',
                attrs: 'required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...apps.map(item => ({ valor: item.nome, texto: item.nome }))
                ]
            })}
            ${campo({
                nome: 'painel',
                label: 'Painel',
                valor: acesso.painel || valorPrimeiroItem(cliente.paineisSelecionados) || '',
                attrs: 'required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...paineis.map(item => ({ valor: item.nome, texto: item.nome }))
                ]
            })}
            ${campo({ nome: 'usuario', label: 'Usuário', valor: acesso.usuario || cliente.usuario, attrs: 'required' })}
            ${campo({ nome: 'senha', label: 'Senha', valor: acesso.senha || cliente.senha, attrs: 'required' })}
            ${campo({ nome: 'dataInicio', label: 'Data/Início', valor: inicio, tipo: 'datetime-local', attrs: 'required' })}
            ${campo({ nome: 'validade', label: 'Válido até', valor: validade, tipo: 'datetime-local', attrs: 'required' })}
            <div class="actions full">
                <button class="button green" type="submit">${icon('whats')} Enviar teste liberado</button>
            </div>
        </form>
    </section>`;
}

function secaoRenovacaoCliente(cliente = {}, listas = {}, pagamentos = []) {
    if (!cliente.id) return '';

    const planos = (listas.planos || []).filter(plano => {
        const nome = String(plano.nome || '').toLowerCase();
        return Number(plano.dias || 0) > 0 && !nome.includes('teste');
    });
    const planoAtual = '';
    const planoInicial = {};
    const linhasHistorico = pagamentos.length
        ?pagamentos.map(pagamento => `<tr>
            <td>${escapar(formatarDataHoraCurta(pagamento.dataPagamento || pagamento.criadoEm))}</td>
            <td>
                <div class="cell-title">${escapar(pagamento.plano)}</div>
                <div class="cell-muted">${escapar(pagamento.diasContrato)} dias</div>
            </td>
            <td>
                <div class="cell-title">R$ ${escapar(pagamento.valorPlano || pagamento.valorTotal || '0,00')}</div>
                ${numeroMoeda(pagamento.assinaturaApp) > 0 ?`<div class="cell-muted">App: R$ ${escapar(pagamento.assinaturaApp)}</div>` : ''}
            </td>
            <td>${escapar(pagamento.formaPagamento || '-')}</td>
            <td>${escapar(formatarDataHoraCurta(pagamento.vencimentoNovo))}</td>
            <td>
                ${pagamento.mensagemEnviada
                    ?'<span class="badge green">Enviada</span>'
                    : `<div><span class="badge orange">Não enviada</span></div>
                        <form method="post" action="/clientes/${escapar(cliente.id)}/pagamentos/${escapar(pagamento.id)}/mensagem-enviada" style="margin-top:6px;">
                            <button class="button secondary" type="submit">Marcar enviada</button>
                        </form>`}
            </td>
            <td>
                <div class="row-actions">
                    <a class="button icon-only icon-action" href="/clientes/${escapar(cliente.id)}/pagamentos/${escapar(pagamento.id)}/editar" title="Editar pagamento">${icon('edit')}</a>
                    <form method="post" action="/clientes/${escapar(cliente.id)}/pagamentos/${escapar(pagamento.id)}/excluir" onsubmit="return confirm('Apagar este pagamento do histórico?O vencimento atual do cliente não será alterado.');">
                        <button class="button icon-only icon-action" type="submit" title="Apagar pagamento">${icon('trash')}</button>
                    </form>
                </div>
            </td>
        </tr>`).join('')
        : '<tr><td colspan="7" class="empty">Nenhuma renovação registrada ainda.</td></tr>';

    return `<section class="panel" id="renovar" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Renovar cliente</h2>
                <div class="subtitle">Registre o pagamento, atualize o vencimento e envie a confirmação se desejar.</div>
            </div>
            <span class="badge green">Vencimento atual: ${escapar(formatarDataHoraCurta(cliente.dataVencimento || cliente.vencimento))}</span>
        </div>
        <form class="fields client-form" id="formRenovarCliente" method="post" action="/clientes/${escapar(cliente.id)}/renovar">
            ${campo({
                nome: 'tipoPlanoId',
                label: 'Plano da renovação',
                valor: planoAtual,
                attrs: 'id="renovarTipoPlanoId" required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...planos.map(plano => ({ valor: plano.id, texto: `${plano.nome} (${plano.dias} dias)` }))
                ]
            })}
            <input type="hidden" name="plano" id="renovarPlano" value="${escapar(planoInicial.nome || '')}">
            ${campo({ nome: 'diasContrato', label: 'Dias de contrato', valor: '', tipo: 'number', attrs: 'id="renovarDiasContrato" min="1" required' })}
            ${campo({ nome: 'valorPlano', label: 'Valor do Plano (R$)', valor: '', attrs: 'id="renovarValorPlano" inputmode="decimal" class="money-field" placeholder="0,00" required' })}
            ${campo({ nome: 'assinaturaApp', label: 'Assinatura App (R$)', valor: '0,00', attrs: 'id="renovarAssinaturaApp" inputmode="decimal" class="money-field" placeholder="0,00"' })}
            ${campo({
                nome: 'formaPagamento',
                label: 'Forma de pagamento',
                attrs: 'required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    { valor: 'Pix', texto: 'Pix' },
                    { valor: 'Dinheiro', texto: 'Dinheiro' },
                    { valor: 'Cartão de crédito', texto: 'Cartão de crédito' },
                    { valor: 'Cartão de débito', texto: 'Cartão de débito' },
                    { valor: 'Transferência', texto: 'Transferência' },
                    { valor: 'Outro', texto: 'Outro' }
                ]
            })}
            ${campo({ nome: 'dataPagamento', label: 'Data/Hora do pagamento', valor: '', tipo: 'datetime-local', attrs: 'required' })}
            <label class="toggle-line">
                <input type="checkbox" name="enviarMensagem" value="1" checked>
                <span>Enviar confirmação da renovação pelo WhatsApp</span>
            </label>
            <label class="full">Observações do pagamento
                <textarea name="observacoes" rows="3" placeholder="Opcional"></textarea>
            </label>
            <div class="actions full">
                <button class="button green" type="submit">${icon('refresh')} Renovar cliente</button>
            </div>
        </form>
        <div class="form-section full" style="margin-top:22px;">Histórico de pagamentos</div>
        <table class="clients-table compact-table">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Plano</th>
                    <th>Valor</th>
                    <th>Pagamento</th>
                    <th>Novo vencimento</th>
                    <th>Mensagem</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>${linhasHistorico}</tbody>
        </table>
        <script>
            (() => {
                const planosRenovacao = ${JSON.stringify(planos.map(plano => ({
                    id: String(plano.id),
                    nome: plano.nome,
                    dias: plano.dias,
                    valor: plano.valor || ''
                })))};
                const select = document.getElementById('renovarTipoPlanoId');
                const planoNome = document.getElementById('renovarPlano');
                const dias = document.getElementById('renovarDiasContrato');
                const valor = document.getElementById('renovarValorPlano');
                const form = document.getElementById('formRenovarCliente');

                function atualizarPlanoRenovacao() {
                    const plano = planosRenovacao.find(item => String(item.id) === String(select?.value));
                    if (!plano) return;
                    planoNome.value = plano.nome || '';
                    dias.value = plano.dias || '';
                    valor.value = plano.valor || '';
                }

                select?.addEventListener('change', atualizarPlanoRenovacao);
                form?.addEventListener('submit', (event) => {
                    const botao = form.querySelector('button[type="submit"]');
                    if (form.dataset.enviando === '1') {
                        event.preventDefault();
                        return;
                    }
                    form.dataset.enviando = '1';
                    if (botao) {
                        botao.disabled = true;
                        botao.textContent = 'Registrando...';
                    }
                });
            })();
        </script>
    </section>`;
}

function formularioPagamentoCliente(cliente = {}, pagamento = {}) {
    return `<section class="page-title">
        <h1>Editar pagamento</h1>
        <div class="subtitle">${escapar(cliente.nome || '')} - corrija os dados do histórico financeiro</div>
    </section>
    <section class="panel">
        <form class="fields client-form" method="post" action="/clientes/${escapar(cliente.id)}/pagamentos/${escapar(pagamento.id)}/salvar">
            ${campo({ nome: 'plano', label: 'Plano', valor: pagamento.plano || '', attrs: 'required' })}
            ${campo({ nome: 'diasContrato', label: 'Dias de contrato', valor: pagamento.diasContrato || '', tipo: 'number', attrs: 'min="0"' })}
            ${campo({ nome: 'valorPlano', label: 'Valor do Plano (R$)', valor: pagamento.valorPlano || '', attrs: 'inputmode="decimal" class="money-field" placeholder="0,00" required' })}
            ${campo({ nome: 'assinaturaApp', label: 'Assinatura App (R$)', valor: pagamento.assinaturaApp || '0,00', attrs: 'inputmode="decimal" class="money-field" placeholder="0,00"' })}
            ${campo({
                nome: 'formaPagamento',
                label: 'Forma de pagamento',
                valor: pagamento.formaPagamento || '',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    { valor: 'Pix', texto: 'Pix' },
                    { valor: 'Dinheiro', texto: 'Dinheiro' },
                    { valor: 'Cartão de crédito', texto: 'Cartão de crédito' },
                    { valor: 'Cartão de débito', texto: 'Cartão de débito' },
                    { valor: 'Transferência', texto: 'Transferência' },
                    { valor: 'Outro', texto: 'Outro' }
                ]
            })}
            ${campo({ nome: 'dataPagamento', label: 'Data/Hora do pagamento', valor: inputDateTime(pagamento.dataPagamento || pagamento.criadoEm), tipo: 'datetime-local', attrs: 'required' })}
            ${campo({ nome: 'vencimentoNovo', label: 'Novo vencimento registrado', valor: inputDateTime(pagamento.vencimentoNovo), tipo: 'datetime-local' })}
            ${areaTexto({ nome: 'observacoes', label: 'Observações', valor: pagamento.observacoes || '' })}
            <div class="notice full">A edição altera apenas o histórico financeiro. O vencimento atual do cliente não será recalculado automaticamente.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar pagamento</button>
                <a class="button secondary" href="/clientes/${escapar(cliente.id)}/editar#renovar">Cancelar</a>
            </div>
        </form>
    </section>`;
}

function secaoBonusCliente(cliente = {}) {
    if (!cliente.id) return '';

    const saldo = Number.parseInt(cliente.bonusMeses || 0, 10) || 0;
    const aniversarioPendente = clienteAniversarioPendente(cliente);
    const saldoAplicavel = saldo + (aniversarioPendente ? 1 : 0);
    const opcoes = Array.from({ length: Math.max(1, Math.min(12, saldoAplicavel || 1)) }, (_, index) => index + 1)
        .map(valor => `<option value="${valor}">${valor} ${valor === 1 ?'mês' : 'meses'}</option>`)
        .join('');

    return `<section class="panel" id="bonus" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Bônus do cliente</h2>
                <div class="subtitle">Ajuste e salve primeiro a data de vencimento. Este botão apenas aplica o saldo e envia ao cliente a data já cadastrada.</div>
            </div>
            <span class="badge green">${escapar(saldoAplicavel)} disponível(is)</span>
        </div>
        ${aniversarioPendente ?'<div class="notice">🎂 Aniversário hoje: 1 bônus está aguardando sua aprovação manual.</div>' : ''}
        <form class="fields client-form" method="post" action="/clientes/${escapar(cliente.id)}/aplicar-bonus">
            <label>Quantidade de bônus para aplicar
                <select name="quantidade" ${saldoAplicavel <= 0 ?'disabled' : ''}>
                    ${saldoAplicavel > 0 ?opcoes : '<option value="">Sem bônus disponível</option>'}
                </select>
            </label>
            <label class="full">Observação da bonificação
                <textarea name="observacaoBonus" rows="3" placeholder="Opcional: indicação, aniversário ou detalhe da bonificação"></textarea>
            </label>
            <div class="actions full">
                <button class="button green" type="submit" ${saldoAplicavel <= 0 ?'disabled' : ''}>${icon('whats')} Aplicar bônus e avisar cliente</button>
            </div>
        </form>
    </section>`;
}

function secaoConfirmacaoAssinatura(cliente = {}) {
    if (!cliente.id || clienteEhTeste(cliente)) return '';

    const vencimento = formatarDataHoraCurta(cliente.dataVencimento || cliente.vencimento) || 'Não informado';

    return `<section class="panel" id="confirmacao-assinatura" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Confirmação da assinatura</h2>
                <div class="subtitle">Envie manualmente ao cliente a confirmação do plano cadastrado.</div>
            </div>
        </div>
        <div style="padding:28px;">
            <div class="notice success" style="margin-bottom:16px;">
                Plano: <strong>${escapar(cliente.plano || '-')}</strong> &middot;
                Válido até: <strong>${escapar(vencimento)}</strong>
            </div>
            <form method="post" action="/clientes/${escapar(cliente.id)}/enviar-confirmacao-assinatura">
                <button class="button green" type="submit">${icon('whats')} Enviar confirmação da assinatura</button>
            </form>
        </div>
    </section>`;
}

function secaoPixPlanoCliente(cliente = {}) {
    if (!cliente.id) return '';

    return `<section class="panel" id="pix-plano" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">PIX do plano</h2>
                <div class="subtitle">Envie manualmente ao cliente o QR Code PIX com o valor do plano atual.</div>
            </div>
        </div>
        <div style="padding:28px;">
            <div class="notice success" style="margin-bottom:16px;">
                Plano: <strong>${escapar(cliente.plano || '-')}</strong> &middot;
                Valor: <strong>R$ ${escapar(cliente.valorPlano || '0,00')}</strong>
            </div>
            <form method="post" action="/clientes/${escapar(cliente.id)}/enviar-pix-plano" onsubmit="return confirm('Enviar PIX do plano atual para este cliente?');">
                <button class="button green" type="submit">${icon('financeiro')} Enviar PIX do plano</button>
            </form>
        </div>
    </section>`;
}

function secaoHistoricoRobo(cliente = {}, interacoes = [], paginacaoRobo = null) {
    const interacoesVisiveis = paginacaoRobo?.itens || interacoes;
    const itens = interacoesVisiveis.length
        ? interacoesVisiveis.map(item => `<div class="note-item">
            <strong>${escapar(item.titulo || 'Interação do robô')}</strong>
            <span>${escapar(formatarDataHoraCurta(item.criadoEm))} &middot; ${escapar(item.status || 'registrado')}${item.destino ?` &middot; ${escapar(item.destino)}` : ''}</span>
            <p>${escapar(item.resumo || '-')}</p>
        </div>`).join('')
        : '<div class="empty">Nenhuma interação do robô registrada para este cliente.</div>';

    return `<section class="panel" id="historico-robo" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Histórico do robô</h2>
                <div class="subtitle">Últimas mensagens, PIX, renovações e respostas automáticas vinculadas ao WhatsApp do cliente.</div>
            </div>
        </div>
        <div style="padding:20px;">
            ${itens}
            ${paginacaoRobo ?paginacao({
                base: `/clientes/${cliente.id}/editar`,
                params: { parametroPagina: 'robo', roboPorPagina: paginacaoRobo.porPagina },
                parametroPorPagina: 'roboPorPagina',
                pagina: paginacaoRobo.pagina,
                totalPaginas: paginacaoRobo.totalPaginas,
                total: paginacaoRobo.total,
                porPagina: paginacaoRobo.porPagina
            }) : ''}
        </div>
    </section>`;
}

function resumoClienteOperacional(cliente = {}, pagamentos = [], atendimentos = [], interacoesRobo = []) {
    if (!cliente.id) return '';

    const vencimento = cliente.dataVencimento || cliente.vencimento || '';
    const infoVencimento = textoVencimento(cliente);
    const valorPlano = cliente.valorPlano || '0,00';
    const valorPlanoFormatado = numeroMoeda(valorPlano).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const apps = lerListaSalva(cliente.appsInstalados);
    const dispositivos = lerListaSalva(cliente.dispositivosSelecionados);
    const ultimoPagamento = pagamentos[0] || null;
    const ultimaInteracao = interacoesRobo[0] || null;
    const origem = cliente.indicadoPor
        ? `${cliente.origem || 'Indicação'} · ${cliente.indicadoPor}`
        : cliente.origem || '-';
    const abertos = atendimentos.filter(item => item.status !== 'resolvido');
    const classeVencimento = clienteEhTeste(cliente)
        ? 'info'
        : vencimentoExpirou(vencimento)
            ? 'error'
            : vencimentoNoIntervalo(vencimento, new Date(), new Date(Date.now() + 7 * 86400000))
                ? 'warn'
                : 'ok';

    return `<section class="metrics client-summary-metrics" style="margin-bottom:24px;">
        ${metricCard({ label: 'Status', valor: rotuloStatus(cliente.status), nota: clienteEhTeste(cliente) ? 'Cliente em teste' : 'Cliente comercial', tipo: classeVencimento === 'error' ? 'red' : classeVencimento === 'warn' ? 'orange' : 'green', icone: classeVencimento === 'error' ? 'x' : 'check' })}
        ${metricCard({ label: 'Vencimento', valor: formatarDataHoraCurta(vencimento) || '-', nota: infoVencimento || 'Sem data definida', tipo: classeVencimento === 'error' ? 'red' : classeVencimento === 'warn' ? 'orange' : 'info', icone: 'calendario', classe: 'metric-date' })}
        ${metricCard({ label: 'Plano', valor: cliente.plano || '-', nota: `Plano R$ ${valorPlanoFormatado}`, tipo: 'info', icone: 'planos' })}
        ${metricCard({ label: 'Apps', valor: apps.length || 0, nota: apps.slice(0, 2).join(', ') || 'Nenhum app informado', tipo: 'green', icone: 'apps' })}
        ${metricCard({ label: 'Dispositivos', valor: dispositivos.length || 0, nota: dispositivos.slice(0, 2).join(', ') || 'Nenhum dispositivo informado', tipo: 'info', icone: 'dispositivos' })}
        ${metricCard({ label: 'Atendimentos', valor: abertos.length, nota: abertos.length ? 'Abertos para acompanhar' : 'Sem pendências', tipo: abertos.length ? 'orange' : 'green', icone: 'atendimento' })}
        ${metricCard({ label: 'Último pagamento', valor: ultimoPagamento ?`R$ ${ultimoPagamento.valorTotal || ultimoPagamento.valorPlano || '0,00'}` : '-', nota: ultimoPagamento ?formatarDataHoraCurta(ultimoPagamento.dataPagamento || ultimoPagamento.criadoEm) : 'Sem histórico financeiro', tipo: ultimoPagamento ? 'green' : 'orange', icone: 'financeiro' })}
        ${metricCard({ label: 'Origem / indicação', valor: origem, nota: cliente.indicadoPor ? 'Responsável pela indicação' : 'Origem comercial', tipo: cliente.origem || cliente.indicadoPor ? 'info' : 'orange', icone: 'clientes' })}
        ${metricCard({ label: 'Bônus disponível', valor: Math.max(0, Number.parseInt(cliente.bonusMeses || 0, 10) || 0), nota: 'Ciclos mensais disponíveis', tipo: Number(cliente.bonusMeses || 0) > 0 ? 'green' : 'info', icone: 'planos' })}
        ${metricCard({ label: 'Último contato WhatsApp', valor: ultimaInteracao ?formatarDataHoraCurta(ultimaInteracao.criadoEm) : '-', nota: ultimaInteracao ?(ultimaInteracao.titulo || ultimaInteracao.resumo || 'Interação registrada') : 'Sem interação registrada', tipo: ultimaInteracao ? 'green' : 'orange', icone: 'whats', classe: 'metric-date' })}
    </section>`;
}

function rotuloCurto(valor = '', limite = 18) {
    const texto = String(valor || '').trim();
    if (texto.length <= limite) return texto || '-';
    return `${texto.slice(0, limite - 3)}...`;
}

function modeloManualEnviaPix(modelo = {}) {
    const identificacao = [modelo.chave, modelo.titulo]
        .map(valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
        .join(' ');

    return /(venc|renova|cobran|expirad)/.test(identificacao);
}

function acoesRapidasCliente(cliente = {}, config = {}) {
    if (!cliente.id) return '';

    const whatsapp = normalizarTelefone(cliente.telefone);
    const numeroWhatsApp = whatsapp ?(whatsapp.startsWith('55') ? whatsapp : `55${whatsapp}`) : '';
    const linkWhatsApp = numeroWhatsApp ?`https://wa.me/${numeroWhatsApp}` : '';

    return `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Ações rápidas</h2>
                <div class="subtitle">Atalhos para resolver o atendimento sem procurar em outras áreas.</div>
            </div>
        </div>
        <div class="actions" style="padding:20px;gap:10px;flex-wrap:wrap;">
            <form method="post" action="/clientes/${escapar(cliente.id)}/enviar-pix-plano" onsubmit="return confirm('Enviar PIX do plano atual para este cliente?');">
                <button class="button green" type="submit">${icon('financeiro')} Enviar PIX</button>
            </form>
            ${String(config.paypalAtivo) === '1' ?`<form method="post" action="/clientes/${escapar(cliente.id)}/enviar-paypal-plano" onsubmit="return confirm('Gerar e enviar o link PayPal do plano atual para este cliente?');">
                <button class="button green" type="submit">${icon('financeiro')} Enviar PayPal</button>
            </form>` : ''}
            <form method="post" action="/clientes/${escapar(cliente.id)}/enviar-aviso-vencimento" onsubmit="return confirm('Enviar aviso de vencimento próximo para este cliente?');">
                <button class="button green" type="submit">${icon('whats')} Enviar vencimento</button>
            </form>
            <a class="button secondary" href="/clientes/${escapar(cliente.id)}/enviar-modelo">${icon('modelos')} Enviar modelo</a>
            <a class="button" href="#renovar">${icon('refresh')} Renovar</a>
            <a class="button secondary" href="#atendimentos">${icon('atendimento')} Atendimento</a>
            <a class="button secondary" href="#historico-unificado">${icon('info')} Histórico</a>
            ${linkWhatsApp ?`<a class="button secondary" href="${linkWhatsApp}" target="_blank" rel="noopener">${icon('whats')} Abrir WhatsApp</a>` : ''}
            <a class="button secondary" href="/clientes/todos">${icon('clientes')} Lista</a>
        </div>
    </section>`;
}

function telaEnviarModeloCliente({ cliente = {}, modelos = [] }) {
    const clienteId = escapar(cliente.id);
    const nomeCliente = escapar(cliente.nome || 'cliente');
    const opcoes = modelos.map(modelo => {
        const titulo = escapar(modelo.titulo || `Modelo ${modelo.id}`);
        const plano = escapar(modelo.plano || 'padrão');
        const texto = escapar(rotuloCurto(String(modelo.texto || '').replace(/\s+/g, ' '), 210));

        return `<label class="model-choice">
            <input type="radio" name="modeloId" value="${escapar(modelo.id)}" required>
            <span class="model-choice-head">
                <span class="model-choice-title">${titulo}</span>
                <span class="model-choice-plan">${plano}</span>
            </span>
            <span class="model-choice-preview">${texto || 'Modelo sem texto cadastrado.'}</span>
        </label>`;
    }).join('');

    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Enviar modelo</h1>
                <div class="subtitle">Escolha uma mensagem pronta para enviar agora ao cliente ${nomeCliente}</div>
            </div>
            <a class="button secondary" href="/clientes/${clienteId}/editar">${icon('arrow')} Voltar ao cliente</a>
        </div>
    </section>
    <section class="panel">
        <div class="panel-head">
            <div class="model-client-head">
                <span class="model-client-icon">${icon('whats')}</span>
                <div>
                    <h2 class="panel-title">${nomeCliente}</h2>
                    <div class="subtitle">${escapar(cliente.telefone || 'WhatsApp não informado')}</div>
                </div>
            </div>
            <span class="badge ${statusClasse(cliente.status)}">${escapar(rotuloStatus(cliente.status))}</span>
        </div>
        <form method="post" action="/clientes/${clienteId}/enviar-modelo" onsubmit="return confirm('Enviar o modelo escolhido para ${nomeCliente}?');">
            <div class="model-send-body">
                <div class="notice">As variáveis do modelo serão preenchidas automaticamente com os dados deste cliente antes do envio.</div>
                ${modelos.length ?`<div class="model-choice-grid">${opcoes}</div>` : '<div class="empty">Nenhum modelo ativo encontrado. Cadastre ou ative um modelo em Modelos de Mensagem.</div>'}
                <div class="model-send-actions">
                    <a class="button secondary" href="/modelos">${icon('modelos')} Editar modelos</a>
                    <button class="button green" type="submit" ${modelos.length ?'' : 'disabled'}>${icon('whats')} Enviar modelo escolhido</button>
                </div>
            </div>
        </form>
    </section>`;
}

function recomendacoesCliente(cliente = {}, pagamentos = [], atendimentos = []) {
    if (!cliente.id) return '';

    const itens = [];
    const vencimento = cliente.dataVencimento || cliente.vencimento || '';
    const abertos = atendimentos.filter(item => item.status !== 'resolvido');

    if (!String(cliente.telefone || '').trim()) itens.push(['WhatsApp ausente', 'Cadastre o número para enviar cobranças, PIX e avisos pelo robô.']);
    if (!String(cliente.plano || '').trim()) itens.push(['Plano incompleto', 'Escolha o plano para renovar e gerar cobranças corretamente.']);
    if (!String(vencimento || '').trim()) itens.push(['Sem vencimento', 'Informe a data de vencimento para aparecer no painel e nas cobranças.']);
    if (!pagamentos.length && !clienteEhTeste(cliente)) itens.push(['Sem financeiro', 'Envie a confirmação da assinatura ou registre a próxima renovação.']);
    if (vencimentoExpirou(vencimento)) itens.push(['Cliente vencido', 'Enviar cobrança ou registrar renovação.']);
    else if (!clienteEhTeste(cliente) && vencimentoNoIntervalo(vencimento, new Date(), new Date(Date.now() + 7 * 86400000))) itens.push(['Vencimento próximo', 'Enviar aviso de vencimento e PIX do plano.']);
    if (abertos.length) itens.push(['Atendimento aberto', `${abertos.length} atendimento(s) precisam de acompanhamento.`]);

    if (!itens.length) {
        return `<section class="panel" style="margin-bottom:24px;">
            <div class="panel-head">
                <div>
                    <h2 class="panel-title">Ações recomendadas</h2>
                    <div class="subtitle">Tudo certo para este cliente no momento.</div>
                </div>
                <span class="badge green">Sem pendências</span>
            </div>
        </section>`;
    }

    return `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Ações recomendadas</h2>
                <div class="subtitle">Pontos que merecem atenção neste cadastro.</div>
            </div>
            <span class="badge orange">${itens.length} ponto(s)</span>
        </div>
        <div style="padding:20px;display:grid;gap:10px;">
            ${itens.map(([titulo, detalhe]) => `<div class="note-item">
                <strong>${escapar(titulo)}</strong>
                <p>${escapar(detalhe)}</p>
            </div>`).join('')}
        </div>
    </section>`;
}

function montarHistoricoUnificado(cliente = {}, { notas = [], pagamentos = [], atendimentos = [], interacoesRobo = [], auditoria = [] } = {}) {
    const itens = [];

    pagamentos.forEach(item => itens.push({
        data: item.dataPagamento || item.criadoEm,
        tipo: 'Financeiro',
        titulo: `${item.plano || 'Pagamento'} - R$ ${item.valorTotal || item.valorPlano || '0,00'}`,
        detalhe: `${item.formaPagamento || '-'}${item.vencimentoNovo ?` | vencimento ${formatarDataHoraCurta(item.vencimentoNovo)}` : ''}`
    }));

    interacoesRobo.forEach(item => itens.push({
        data: item.criadoEm,
        tipo: 'Robô',
        titulo: item.titulo || 'Interação do robô',
        detalhe: `${item.status || 'registrado'}${item.resumo ?` | ${item.resumo}` : ''}`
    }));

    atendimentos.forEach(item => itens.push({
        data: item.criadoEm,
        tipo: 'Atendimento',
        titulo: `${rotuloMotivoAtendimento(item.motivo)} - ${rotuloStatusAtendimento(item.status)}`,
        detalhe: item.descricao || (item.proximoContato ?`Próximo contato: ${formatarDataHoraCurta(item.proximoContato)}` : '')
    }));

    notas.forEach(item => itens.push({
        data: item.criadoEm,
        tipo: 'Nota',
        titulo: 'Registro manual',
        detalhe: item.texto || ''
    }));

    auditoria.forEach(item => itens.push({
        data: item.criadoEm,
        tipo: 'Alteração',
        titulo: item.campo
            ? `${item.campo}: ${item.valorAnterior || '-'} → ${item.valorNovo || '-'}`
            : item.motivo || item.tipo,
        detalhe: `${item.responsavel || 'sistema'} · ${item.origem || 'painel'}${item.motivo && item.campo ? ` · ${item.motivo}` : ''}`
    }));

    return itens
        .sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0))
        .slice(0, 60);
}

function secaoHistoricoUnificado(cliente = {}, dados = {}, paginacaoHistoricoUnificado = null) {
    if (!cliente.id) return '';

    const itens = paginacaoHistoricoUnificado?.itens || [];
    const conteudo = itens.length
        ? itens.map(item => `<div class="note-item">
            <span class="badge info">${escapar(item.tipo)}</span>
            <strong>${escapar(item.titulo)}</strong>
            <span>${escapar(formatarDataHoraCurta(item.data))}</span>
            ${item.detalhe ?`<p>${escapar(item.detalhe)}</p>` : ''}
        </div>`).join('')
        : '<div class="empty">Nenhum histórico registrado ainda.</div>';

    return `<section class="panel" id="historico-unificado" style="margin-top:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Histórico unificado</h2>
                <div class="subtitle">Financeiro, robô, atendimentos e notas em uma linha do tempo.</div>
            </div>
        </div>
        <div style="padding:20px;">
            ${conteudo}
            ${paginacaoHistoricoUnificado ?paginacao({
                base: `/clientes/${cliente.id}/editar`,
                params: { parametroPagina: 'linha', linhaPorPagina: paginacaoHistoricoUnificado.porPagina },
                parametroPorPagina: 'linhaPorPagina',
                pagina: paginacaoHistoricoUnificado.pagina,
                totalPaginas: paginacaoHistoricoUnificado.totalPaginas,
                total: paginacaoHistoricoUnificado.total,
                porPagina: paginacaoHistoricoUnificado.porPagina
            }) : ''}
        </div>
    </section>`;
}

function clienteAniversarioPendente(cliente = {}) {
    const nascimento = mesDiaAniversario(cliente.nascimento);
    if (!nascimento) return false;
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return nascimento === `${valores.month}-${valores.day}`
        && String(cliente.ultimoAvisoAniversario || '') !== String(valores.year);
}

function formularioCliente(cliente = {}, listas = {}, opcoesFormulario = {}) {
    const planos = listas.planos || [];
    const apps = listas.apps || [];
    const dispositivos = listas.dispositivos || [];
    const paineis = listas.paineis || [];
    const notas = opcoesFormulario.notas || [];
    const pagamentos = opcoesFormulario.pagamentos || [];
    const alertas = opcoesFormulario.alertas || [];
    const atendimentos = opcoesFormulario.atendimentos || [];
    const interacoesRobo = opcoesFormulario.interacoesRobo || [];
    const auditoria = opcoesFormulario.auditoria || [];
    const exclusaoDefinitiva = opcoesFormulario.exclusaoDefinitiva || {};
    const paginaHistorico = paginaAtual(opcoesFormulario.paginaHistorico);
    const paginaLinha = paginaAtual(opcoesFormulario.paginaLinha);
    const historicoPorPagina = quantidadePorPagina(opcoesFormulario.historicoPorPagina, REGISTROS_POR_PAGINA);
    const linhaPorPagina = quantidadePorPagina(opcoesFormulario.linhaPorPagina, REGISTROS_POR_PAGINA);
    const paginacaoNotas = cliente.id ? paginarItens(notas, paginaHistorico, historicoPorPagina) : null;
    const historicoUnificado = cliente.id
        ? montarHistoricoUnificado(cliente, { notas, pagamentos, atendimentos, interacoesRobo, auditoria })
        : [];
    const paginacaoHistoricoUnificado = cliente.id
        ? paginarItens(historicoUnificado, paginaLinha, linhaPorPagina)
        : null;
    const inicio = inputDateTime(cliente.dataInicio) || agoraLocalDateTime();
    const vencimento = inputDateTime(cliente.dataVencimento || cliente.vencimento);
    const appsSelecionados = lerListaSalva(cliente.appsInstalados);
    const dispositivosSelecionados = lerListaSalva(cliente.dispositivosSelecionados);
    const paineisSelecionados = lerListaSalva(cliente.paineisSelecionados);
    const tagsSelecionadas = normalizarTagsTela(cliente.tags);
    const planoAtual = cliente.tipoPlanoId || planos.find(plano => {
        return String(plano.nome || '').toLowerCase() === String(cliente.plano || '').toLowerCase();
    })?.id || '';
    const saldoBonusDisponivel = Math.max(0, Number.parseInt(cliente.bonusMeses || 0, 10) || 0);
    const planoAtualEhBonus = planos.some(plano => String(plano.id) === String(planoAtual)
        && String(plano.nome || '').trim().toLocaleLowerCase('pt-BR') === 'bônus mensal');
    const planosDisponiveis = planos.filter(plano => {
        const ehBonusMensal = String(plano.nome || '').trim().toLocaleLowerCase('pt-BR') === 'bônus mensal';
        return !ehBonusMensal || saldoBonusDisponivel > 0 || planoAtualEhBonus;
    });
    const topoCliente = cliente.id
        ? `${resumoClienteOperacional(cliente, pagamentos, atendimentos, interacoesRobo)}
            ${acoesRapidasCliente(cliente, opcoesFormulario.config)}
            ${recomendacoesCliente(cliente, pagamentos, atendimentos)}`
        : '';

    const formulario = `<section class="page-title">
        <h1>${cliente.id ?'Editar Cliente' : 'Novo Cliente'}</h1>
        <div class="subtitle">Dados pessoais, contrato e acesso ao aplicativo</div>
    </section>
    ${alertaClienteHtml(alertas)}
    <section class="panel">
        <form class="fields client-form" method="post" action="/clientes/salvar">
            ${cliente.id ?`<input type="hidden" name="id" value="${escapar(cliente.id)}">` : ''}
            <div class="form-section full">Dados pessoais</div>
            ${campo({ nome: 'nome', label: 'Nome completo *', valor: cliente.nome, tipo: 'text', attrs: 'id="nomeCliente" required placeholder="Nome do cliente" style="text-transform: capitalize;"' })}
            ${campoWhatsAppComPais(cliente.telefone, cliente.ddiTelefone, cliente.paisTelefone)}
            ${campo({
                nome: 'nascimento',
                label: 'Aniversário (dia/mês)',
                valor: formatarAniversario(cliente.nascimento),
                tipo: 'text',
                attrs: 'inputmode="numeric" maxlength="5" pattern="(?:0[1-9]|[12][0-9]|3[01])/(?:0[1-9]|1[0-2])" placeholder="DD/MM" title="Informe somente dia e mês no formato DD/MM" autocomplete="off" data-lpignore="true" oninput="const n=this.value.replace(/[^0-9]/g,\'\').slice(0,4);this.value=n.length>2?n.slice(0,2)+\'/\'+n.slice(2):n"'
            })}
            ${campo({
                nome: 'origem',
                label: 'Origem do Cliente',
                valor: cliente.origem || '',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...ORIGENS_CLIENTE.map(origem => ({ valor: origem, texto: origem }))
                ]
            })}
            ${campo({
                nome: 'indicadoPor',
                label: 'Indicado por',
                valor: cliente.indicadoPor || '',
                tipo: 'text',
                attrs: 'maxlength="120" placeholder="Nome de quem fez a indicação (opcional)"'
            })}
            ${opcoesMulti('tags', 'Tags/Categorias', TAGS_CLIENTE.map(nome => ({ nome })), tagsSelecionadas, 'Adicionar tag...')}
            ${campo({ nome: 'bonusMeses', label: 'Bônus disponíveis (meses)', valor: cliente.bonusMeses || 0, tipo: 'number', attrs: 'min="0" step="1"' })}
            <label class="toggle-line full">
                <input type="checkbox" name="whatsappMarketingConsentimento" value="1" ${Number(cliente.whatsappMarketingConsentimento || 0) === 1 ?'checked' : ''}>
                <span>Cliente autorizou receber campanhas pelo WhatsApp</span>
            </label>
            <input type="hidden" name="whatsappMarketingConsentidoEm" value="${escapar(cliente.whatsappMarketingConsentidoEm || '')}">
            <input type="hidden" name="whatsappOptOutEm" value="${escapar(cliente.whatsappOptOutEm || '')}">

            <div class="form-section full">Plano</div>
            ${campo({
                nome: 'tipoPlanoId',
                label: 'Tipo do Plano *',
                valor: planoAtual,
                attrs: 'id="tipoPlanoId" required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...planosDisponiveis.map(plano => ({
                        valor: plano.id,
                        texto: plano.dias > 0 ?`${plano.nome} (${plano.dias} dias)` : plano.nome
                    }))
                ]
            })}
            <div class="helper full">${saldoBonusDisponivel > 0
                ?`Este cliente possui <strong>${saldoBonusDisponivel} bônus</strong>. Ao salvar o plano <strong>Bônus Mensal</strong>, será usado 1 bônus, aplicado um ciclo de 30 dias por R$ 0,00 e criado um histórico no Financeiro.`
                : planoAtualEhBonus
                    ?'Este ciclo de Bônus Mensal já foi registrado. Para iniciar outro ciclo, conceda um novo bônus antes de salvar uma nova data de vencimento.'
                    :'O plano Bônus Mensal aparece somente quando o cliente possui bônus disponível.'}</div>
            ${campo({ nome: 'diasContrato', label: 'Dias de Contrato', valor: cliente.diasContrato, tipo: 'number', attrs: 'id="diasContrato" min="0"' })}
            ${campo({ nome: 'valorPlano', label: 'Valor do Plano (R$)', valor: cliente.valorPlano, attrs: 'id="valorPlano" inputmode="decimal" class="money-field" placeholder="99,90"' })}
            ${campo({ nome: 'assinaturaApp', label: 'Assinatura App (R$)', valor: cliente.assinaturaApp, attrs: 'id="assinaturaApp" inputmode="decimal" class="money-field" placeholder="0,00"' })}
            ${campo({
                nome: 'validadeApp',
                label: 'Validade App',
                valor: cliente.validadeApp || '',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    { valor: '1 Ano', texto: '1 Ano' },
                    { valor: 'Vitalicio', texto: 'Vitalício' }
                ]
            })}
            ${campo({ nome: 'dataValidadeApp', label: 'Data de validade do app', valor: cliente.dataValidadeApp || '', tipo: 'date' })}
            ${campo({
                nome: 'status',
                label: 'Status',
                valor: cliente.status || 'ativo',
                attrs: 'id="statusCliente"',
                opcoes: [
                    { valor: 'ativo', texto: 'Ativo' },
                    { valor: 'teste', texto: 'Teste' },
                    { valor: 'pendente', texto: 'Pendente' },
                    { valor: 'expirado', texto: 'Expirado' },
                    { valor: 'suspenso', texto: 'Suspenso' },
                    { valor: 'cancelado', texto: 'Cancelado' }
                ]
            })}
            ${campo({
                nome: 'horasTeste',
                label: 'Horas de Teste',
                valor: cliente.horasTeste || '',
                attrs: 'id="horasTeste"',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    { valor: '30 minutos', texto: '30 minutos' },
                    { valor: '01 hora', texto: '01 hora' },
                    { valor: '02 horas', texto: '02 horas' },
                    { valor: '03 horas', texto: '03 horas' },
                    { valor: '04 horas', texto: '04 horas' },
                    { valor: '06 horas', texto: '06 horas' },
                    { valor: '12 horas', texto: '12 horas' },
                    { valor: '15 horas', texto: '15 horas' },
                    { valor: '24 horas', texto: '24 horas' }
                ]
            })}
            ${campo({ nome: 'dataInicio', label: 'Data/Hora de Início *', valor: inicio, tipo: 'datetime-local', attrs: 'id="dataInicio" required' })}
            <label>Data/Hora de Vencimento *
                <div class="inline-field">
                    <input type="datetime-local" name="dataVencimento" id="dataVencimento" value="${escapar(vencimento)}" required>
                    <button class="button secondary icon-only" type="button" id="recalcularVencimento" title="Recalcular vencimento">${icon('refresh')}</button>
                </div>
                <span class="helper">Clique em recalcular para usar início + dias</span>
            </label>

            <div class="form-section full">Acesso ao aplicativo</div>
            ${campo({ nome: 'conexoesPainel', label: 'Conexões do Painel', valor: cliente.conexoesPainel || '', tipo: 'number', attrs: 'id="conexoesPainel" min="0" step="1" placeholder="Quantidade de conexões"' })}
            ${opcoesMulti('appsInstalados', 'Apps Instalados', apps, appsSelecionados, 'Adicionar app...')}
            ${opcoesMulti('dispositivosSelecionados', 'Dispositivos', dispositivos, dispositivosSelecionados, 'Adicionar dispositivo...')}
            ${opcoesMulti('paineisSelecionados', 'Painéis', paineis, paineisSelecionados, 'Adicionar painel...')}
            <input type="hidden" name="paineisSelecionadosPresentes" value="1">
            <label class="toggle-line">
                <input type="checkbox" name="appInstalado" value="1" ${cliente.appInstalado ?'checked' : ''}>
                <span>App instalado no dispositivo</span>
            </label>
            ${campo({ nome: 'usuario', label: 'Usuário IPTV', valor: cliente.usuario })}
            ${campo({ nome: 'senha', label: 'Senha IPTV', valor: cliente.senha })}
            ${listaAcessosApp(cliente, apps, dispositivos, paineis)}
            <input type="hidden" name="plano" id="planoLegado" value="${escapar(cliente.plano || '')}">
            ${areaTexto({ nome: 'observacoes', label: 'Observações', valor: cliente.observacoes })}
            ${cliente.id ?camposNovaNotaAtendimento() : ''}
            ${cliente.id ? campo({ nome: 'motivoAlteracao', label: 'Motivo da alteração (opcional)', valor: '', attrs: 'maxlength="500" placeholder="Ex.: renovação solicitada pelo cliente"' }) : ''}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar cliente</button>
                <a class="button secondary" href="/clientes/todos">Cancelar</a>
            </div>
        </form>
    </section>
    <script>
        const planos = ${JSON.stringify(planosDisponiveis.map(plano => ({
            id: String(plano.id),
            nome: plano.nome,
            dias: plano.dias,
            valor: plano.valor || ''
        })))};
        const tipoPlano = document.getElementById('tipoPlanoId');
        const diasContrato = document.getElementById('diasContrato');
        const valorPlano = document.getElementById('valorPlano');
        const planoLegado = document.getElementById('planoLegado');
        const dataInicio = document.getElementById('dataInicio');
        const dataVencimento = document.getElementById('dataVencimento');
        const recalcular = document.getElementById('recalcularVencimento');
        const statusCliente = document.getElementById('statusCliente');
        const horasTeste = document.getElementById('horasTeste');
        const nomeCliente = document.getElementById('nomeCliente');
        const camposMoeda = document.querySelectorAll('.money-field');
        const listaAcessosApp = document.getElementById('listaAcessosApp');
        const adicionarAcessoApp = document.getElementById('adicionarAcessoApp');
        const opcoesApps = ${JSON.stringify(apps.map(item => item.nome))};
        const opcoesDispositivos = ${JSON.stringify(dispositivos.map(item => item.nome))};
        const opcoesPaineis = ${JSON.stringify(paineis.map(item => item.nome))};

        function formatarMoedaCampo(valor) {
            const texto = String(valor || '').replace(/[^\\d,.-]/g, '');
            if (!texto) return '';
            const numero = texto.includes(',')
                ?Number(texto.replace(/\\./g, '').replace(',', '.'))
                : Number(texto);

            if (!Number.isFinite(numero)) return '';
            return numero.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        function formatarMac(valor) {
            const limpo = String(valor || '')
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase()
                .slice(0, 12);
            return (limpo.match(/.{1,2}/g) || []).join(':');
        }

        function atualizarPlano() {
            const plano = planos.find(item => item.id === tipoPlano.value);
            if (!plano) return;
            diasContrato.value = plano.dias || '';
            valorPlano.value = formatarMoedaCampo(plano.valor || valorPlano.value || '');
            planoLegado.value = plano.nome || '';
            if ((plano.nome || '').toLowerCase().includes('teste')) {
                statusCliente.value = 'teste';
                if (!horasTeste.value) horasTeste.value = '24 horas';
                atualizarHorasTeste();
            }
            calcularVencimento();
        }

        function horasTesteEmMinutos(valor) {
            const texto = String(valor || '').toLowerCase();
            const numero = Number((texto.match(/\\d+/) || [0])[0]);

            if (!numero) return 0;
            if (texto.includes('minuto')) return numero;
            return numero * 60;
        }

        function calcularVencimento() {
            const dias = Number(diasContrato.value || 0);
            const plano = planos.find(item => item.id === tipoPlano.value);
            const ehTeste = statusCliente?.value === 'teste';

            if (!dataInicio.value) return;
            const data = new Date(dataInicio.value);

            if (ehTeste) {
                const minutos = horasTesteEmMinutos(horasTeste.value);
                if (!minutos) return;
                data.setMinutes(data.getMinutes() + minutos);
            } else {
                if (!dias) return;
                const mesesPorDias = {
                    30: 1,
                    90: 3,
                    180: 6,
                    365: 12
                };
                const meses = mesesPorDias[dias] || 0;

                if (meses) {
                    const diaOriginal = data.getDate();
                    data.setMonth(data.getMonth() + meses);

                    if (data.getDate() !== diaOriginal) {
                        data.setDate(0);
                    }
                } else {
                    data.setDate(data.getDate() + dias);
                }
            }

            dataVencimento.value = new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }

        tipoPlano?.addEventListener('change', atualizarPlano);
        diasContrato?.addEventListener('input', calcularVencimento);
        dataInicio?.addEventListener('change', calcularVencimento);
        recalcular?.addEventListener('click', calcularVencimento);

        if (!dataVencimento.value && dataInicio.value && diasContrato.value) {
            calcularVencimento();
        }

        function atualizarHorasTeste() {
            if (!statusCliente || !horasTeste) return;
            const habilitado = statusCliente.value === 'teste';
            horasTeste.disabled = !habilitado;
            horasTeste.closest('label').style.opacity = habilitado ?'1' : '.55';
            if (!habilitado) horasTeste.value = '';
        }

        statusCliente?.addEventListener('change', atualizarHorasTeste);
        horasTeste?.addEventListener('change', calcularVencimento);
        atualizarHorasTeste();

        function capitalizarNome(valor) {
            return valor
                .toLowerCase()
                .replace(/(^|\\s)(\\S)/g, (trecho) => trecho.toUpperCase());
        }

        nomeCliente?.addEventListener('blur', () => {
            nomeCliente.value = capitalizarNome(nomeCliente.value);
        });

        function opcoesHtml(lista, placeholder) {
            function escaparHtml(valor) {
                return String(valor || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            return '<option value="">' + placeholder + '</option>' + lista
                .map(item => '<option value="' + escaparHtml(item) + '">' + escaparHtml(item) + '</option>')
                .join('');
        }

        function novaLinhaAcessoApp() {
            const linha = document.createElement('div');
            linha.className = 'app-access-row';
            linha.innerHTML = ''
                + '<label>App'
                + '<select name="acessoAppNome">' + opcoesHtml(opcoesApps, 'Selecione o app...') + '</select>'
                + '</label>'
                + '<label>Dispositivo'
                + '<select name="acessoDispositivo">' + opcoesHtml(opcoesDispositivos, 'Selecione o dispositivo...') + '</select>'
                + '</label>'
                + '<label>Painel'
                + '<select name="acessoPainel">' + opcoesHtml(opcoesPaineis, 'Selecione o painel...') + '</select>'
                + '</label>'
                + '<label>Usuário IPTV'
                + '<input type="text" name="acessoUsuario" placeholder="Usuário desta conexão">'
                + '</label>'
                + '<label>Senha IPTV'
                + '<input type="text" name="acessoSenha" placeholder="Senha desta conexão">'
                + '</label>'
                + '<label>Endereço MAC'
                + '<input class="mac-field" type="text" name="acessoEnderecoMac" maxlength="17" placeholder="XX:XX:XX:XX:XX:XX" autocomplete="off">'
                + '</label>'
                + '<label>ID do Aplicativo'
                + '<input type="text" name="acessoIdAplicativo" placeholder="ID gerado no app">'
                + '</label>'
                + '<label>Onde foi instalado'
                + '<input type="text" name="acessoLocalInstalacao" list="locaisInstalacaoApp" placeholder="Ex: TV da sala">'
                + '</label>'
                + '<label>URL Ativar Aplicativo'
                + '<input type="url" name="acessoUrlAtivarAplicativo" placeholder="https://...">'
                + '</label>'
                + '<button class="button secondary icon-only remove-app-access" type="button" title="Remover acesso">${icon('trash')}</button>';
            return linha;
        }

        function formatarMacsDaTela() {
            document.querySelectorAll('.mac-field').forEach((campoMac) => {
                campoMac.value = formatarMac(campoMac.value);
            });
        }

        document.addEventListener('input', (event) => {
            if (!event.target.matches('.mac-field')) return;
            event.target.value = formatarMac(event.target.value);
        });

        adicionarAcessoApp?.addEventListener('click', () => {
            listaAcessosApp?.appendChild(novaLinhaAcessoApp());
        });

        document.addEventListener('click', (event) => {
            const remover = event.target.closest('.remove-app-access');
            if (!remover) return;

            const linha = remover.closest('.app-access-row');
            if (!linha) return;

            const total = listaAcessosApp?.querySelectorAll('.app-access-row').length || 0;
            if (total <= 1) {
                linha.querySelectorAll('input, select').forEach(campo => {
                    campo.value = '';
                });
                return;
            }

            linha.remove();
        });

        formatarMacsDaTela();

        camposMoeda.forEach((campoMoeda) => {
            campoMoeda.value = formatarMoedaCampo(campoMoeda.value);
            campoMoeda.addEventListener('blur', () => {
                campoMoeda.value = formatarMoedaCampo(campoMoeda.value);
            });
        });

        document.querySelectorAll('.multi-select').forEach((select) => {
            select.addEventListener('change', () => {
                if (!select.value) return;

                const target = select.dataset.target;
                const picker = document.querySelector('.multi-picker[data-name="' + target + '"]');
                const chips = picker?.querySelector('.multi-chips');
                const hidden = picker?.querySelector('.multi-hidden');
                const exists = Array.from(hidden?.querySelectorAll('input') || [])
                    .some(input => input.value === select.value);

                if (!picker || !chips || !hidden || exists) {
                    select.value = '';
                    return;
                }

                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = target;
                input.value = select.value;
                hidden.appendChild(input);

                const chip = document.createElement('span');
                chip.className = 'selected-chip';
                chip.dataset.value = select.value;
                chip.textContent = select.value + ' ';

                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = 'x';
                button.setAttribute('aria-label', 'Remover ' + select.value);
                chip.appendChild(button);
                chips.appendChild(chip);

                select.value = '';
            });
        });

        document.addEventListener('click', (event) => {
            const button = event.target.closest('.selected-chip button');
            if (!button) return;

            const chip = button.closest('.selected-chip');
            const picker = chip.closest('.multi-picker');
            const hidden = picker.querySelector('.multi-hidden');
            const value = chip.dataset.value;
            const input = Array.from(hidden.querySelectorAll('input'))
                .find(item => item.value === value);

            input?.remove();
            chip.remove();

            if (picker.dataset.name === 'paineisSelecionados') {
                document.querySelectorAll('select[name="acessoPainel"]').forEach(campo => {
                    if (campo.value === value) campo.value = '';
                });
            }
        });
    </script>`;

    const extras = [
        secaoConfirmacaoAssinatura(cliente),
        secaoPixPlanoCliente(cliente),
        secaoRenovacaoCliente(cliente, listas, pagamentos),
        secaoBonusCliente(cliente),
        cliente.id && clienteEhTeste(cliente) ?secaoTesteLiberado(cliente, listas) : '',
        cliente.id ?secaoHistoricoUnificado(cliente, {}, paginacaoHistoricoUnificado) : '',
        secaoAtendimentosCliente(cliente, atendimentos),
        secaoNotasCliente(cliente, notas, paginacaoNotas),
        secaoPrivacidadeCliente(cliente, exclusaoDefinitiva)
    ].filter(Boolean).join('');

    return `${topoCliente}${formulario}${extras}`;
}

function metricCard({ label, valor, nota = '', tipo, icone, classe = '' }) {
    return `<div class="metric ${escapar(classe)}">
        <div>
            <span class="metric-label">${escapar(label)}</span>
            <strong class="metric-value">${escapar(valor)}</strong>
            ${nota ?`<span class="metric-note">${escapar(nota)}</span>` : ''}
        </div>
        <span class="metric-icon ${tipo}">${icon(icone)}</span>
    </div>`;
}

function rotuloMotivoAtendimento(motivo = '') {
    const mapa = {
        instalacao: 'Instalação',
        travamento: 'Travamento',
        renovacao: 'Renovação',
        pagamento: 'Pagamento',
        troca_app: 'Troca de app',
        whatsapp: 'WhatsApp',
        outro: 'Outro'
    };

    return mapa[motivo] || 'Outro';
}

function rotuloStatusAtendimento(status = '') {
    const mapa = {
        aberto: 'Aberto',
        em_andamento: 'Em andamento',
        resolvido: 'Resolvido'
    };

    return mapa[status] || 'Aberto';
}

function classeStatusAtendimento(status = '', prioridade = '') {
    if (status === 'resolvido') return 'ok';
    if (prioridade === 'urgente') return 'error';
    if (status === 'em_andamento') return 'warn';
    return 'info';
}

function mensagemAtendimentoPadrao(atendimento = {}) {
    return `Olá, ${atendimento.clienteNome || 'tudo bem'}!

Estou acompanhando seu atendimento de ${rotuloMotivoAtendimento(atendimento.motivo).toLowerCase()}.

Vou verificar e retorno por aqui.`;
}

function telaAtendimentos({ atendimentos = [], clientes = [], filtros = {}, resumo = {} }) {
    const statusAtual = filtros.status || 'abertos';
    const busca = filtros.busca || '';

    return `<section class="page-title">
        <h1>Central de Suporte</h1>
        <div class="subtitle">Organize solicitações, prioridades e retornos dos clientes</div>
    </section>
    <section class="metrics" style="margin-bottom:24px;">
        ${metricCard({ label: 'Abertos', valor: resumo.abertos || 0, nota: 'Aguardando ação', tipo: resumo.abertos ?'orange' : 'green', icone: 'atendimento' })}
        ${metricCard({ label: 'Em andamento', valor: resumo.emAndamento || 0, nota: 'Em tratativa', tipo: resumo.emAndamento ?'info' : 'green', icone: 'refresh' })}
        ${metricCard({ label: 'Urgentes', valor: resumo.urgentes || 0, nota: 'Prioridade alta', tipo: resumo.urgentes ?'red' : 'green', icone: 'alert' })}
        ${metricCard({ label: 'Resolvidos', valor: resumo.resolvidos || 0, nota: 'Histórico', tipo: 'green', icone: 'check' })}
    </section>
    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Abrir atendimento</h2>
                <div class="subtitle">Registre uma solicitação para acompanhar até resolver</div>
            </div>
        </div>
        <form class="fields" method="post" action="/atendimentos" style="padding-top:0;">
            <label>Cliente
                <select name="clienteId" required>
                    <option value="">Selecione o cliente...</option>
                    ${clientes.map(cliente => `<option value="${escapar(cliente.id)}">${escapar(cliente.nome)} - ${escapar(cliente.telefone || '')}</option>`).join('')}
                </select>
            </label>
            <label>Motivo
                <select name="motivo">
                    ${[
                        ['instalacao', 'Instalação'],
                        ['travamento', 'Travamento'],
                        ['renovacao', 'Renovação'],
                        ['pagamento', 'Pagamento'],
                        ['troca_app', 'Troca de app'],
                        ['whatsapp', 'WhatsApp'],
                        ['outro', 'Outro']
                    ].map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join('')}
                </select>
            </label>
            <label>Prioridade
                <select name="prioridade">
                    <option value="normal">Normal</option>
                    <option value="urgente">Urgente</option>
                </select>
            </label>
            ${campo({ nome: 'proximoContato', label: 'Próximo contato', tipo: 'datetime-local', valor: '' })}
            ${areaTexto({ nome: 'descricao', label: 'Descrição', valor: '' })}
            <div class="actions full"><button class="button" type="submit">${icon('plus')} Abrir atendimento</button></div>
        </form>
    </section>

    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Atendimentos</h2>
                <div class="subtitle">${atendimentos.length} registro(s) no filtro atual</div>
            </div>
            <form class="atendimentos-filters" method="get" action="/atendimentos">
                <input name="busca" aria-label="Buscar cliente ou motivo" value="${escapar(busca)}" placeholder="Buscar cliente ou motivo" style="padding:10px;border:1px solid var(--line);border-radius:8px;">
                <select name="status" aria-label="Filtrar atendimentos por status" onchange="this.form.submit()">
                    ${[
                        ['abertos', 'Abertos'],
                        ['aberto', 'Somente abertos'],
                        ['em_andamento', 'Em andamento'],
                        ['resolvido', 'Resolvidos'],
                        ['todos', 'Todos']
                    ].map(([valor, texto]) => `<option value="${valor}" ${valor === statusAtual ?'selected' : ''}>${texto}</option>`).join('')}
                </select>
                <button class="button secondary" type="submit">${icon('search')} Filtrar</button>
            </form>
        </div>
        ${atendimentos.length ?`<table>
            <thead><tr><th>Cliente</th><th>Atendimento</th><th>Status</th><th>Próximo contato</th><th>Ações</th></tr></thead>
            <tbody>
                ${atendimentos.map(atendimento => `<tr>
                    <td><strong>${escapar(atendimento.clienteNome)}</strong><div class="cell-muted">${escapar(atendimento.clienteTelefone || '')}</div></td>
                    <td><strong>${escapar(rotuloMotivoAtendimento(atendimento.motivo))}</strong><div class="cell-muted">${escapar(atendimento.descricao || '-')}</div><div class="cell-muted">Aberto em ${escapar(formatarDataHoraCurta(atendimento.criadoEm))}</div></td>
                    <td><span class="badge ${classeStatusAtendimento(atendimento.status, atendimento.prioridade)}">${escapar(rotuloStatusAtendimento(atendimento.status))}</span>${atendimento.prioridade === 'urgente' ?'<div class="cell-muted">Urgente</div>' : ''}</td>
                    <td>${atendimento.proximoContato ?escapar(formatarDataHoraCurta(atendimento.proximoContato)) : '-'}</td>
                    <td>
                        <div class="row-actions">
                            <a class="button icon-only icon-action whats" href="https://wa.me/${escapar(String(atendimento.clienteTelefone || '').replace(/\\D/g, ''))}" title="WhatsApp">${icon('whats')}</a>
                            <form method="post" action="/atendimentos/${escapar(atendimento.id)}/enviar" onsubmit="return confirm('Enviar mensagem de acompanhamento para este cliente?');"><button class="button icon-only icon-action green" type="submit" title="Enviar acompanhamento">${icon('atendimento')}</button></form>
                            ${atendimento.status !== 'em_andamento' && atendimento.status !== 'resolvido' ?`<form method="post" action="/atendimentos/${escapar(atendimento.id)}/status"><input type="hidden" name="status" value="em_andamento"><button class="button icon-only icon-action refresh" type="submit" title="Marcar em andamento">${icon('refresh')}</button></form>` : ''}
                            ${atendimento.status !== 'resolvido' ?`<form method="post" action="/atendimentos/${escapar(atendimento.id)}/status"><input type="hidden" name="status" value="resolvido"><button class="button icon-only icon-action green" type="submit" title="Resolver">${icon('check')}</button></form>` : ''}
                            <a class="button icon-only icon-action" href="/clientes/${escapar(atendimento.clienteId)}/editar#atendimentos" title="Abrir cliente">${icon('edit')}</a>
                            <form method="post" action="/atendimentos/${escapar(atendimento.id)}/excluir" onsubmit="return confirm('Apagar este atendimento?');"><button class="button icon-only icon-action" type="submit" title="Apagar">${icon('trash')}</button></form>
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>` : '<div class="empty">Nenhum atendimento encontrado.</div>'}
    </section>`;
}

function rotuloStatusLead(status = '') {
    const mapa = {
        novo: 'Novo',
        em_conversa: 'Em conversa',
        teste_liberado: 'Teste liberado',
        aguardando_pagamento: 'Aguardando pagamento',
        ganho: 'Cliente ganho',
        perdido: 'Perdido'
    };

    return mapa[status] || 'Novo';
}

function classeStatusLead(status = '', prioridade = '') {
    if (status === 'ganho') return 'ok';
    if (status === 'perdido') return 'error';
    if (prioridade === 'urgente') return 'warn';
    if (status === 'aguardando_pagamento') return 'warn';
    if (status === 'teste_liberado') return 'info';
    return 'muted';
}

function opcoesStatusLead(statusAtual = '') {
    return [
        ['novo', 'Novo'],
        ['em_conversa', 'Em conversa'],
        ['teste_liberado', 'Teste liberado'],
        ['aguardando_pagamento', 'Aguardando pagamento'],
        ['ganho', 'Cliente ganho'],
        ['perdido', 'Perdido']
    ].map(([valor, texto]) => `<option value="${valor}" ${valor === statusAtual ?'selected' : ''}>${texto}</option>`).join('');
}

function mensagemLeadPadrao(lead = {}, config = {}, planos = []) {
    const nomeEmpresa = String(config.nomeEmpresaRobo || 'Julian Play').trim();
    const interesse = String(lead.interesse || '').trim();
    const listaPlanos = planos.length
        ? planos.map((plano, index) => {
            const valor = plano.valorConfigurado === false ? 'valor a consultar' : `R$ ${plano.valor}`;
            return `*${index + 1}* - ${plano.nome} (${valor})`;
        }).join('\n')
        : '*Planos e valores disponíveis com nosso atendimento*';

    return `Olá, *${lead.nome || 'tudo bem'}*! 👋

Aqui é da *${nomeEmpresa}*.
${interesse ? `Vi que você demonstrou interesse no plano *${interesse}*.` : 'Estou passando para acompanhar seu atendimento.'}

Estas são as opções disponíveis:

${listaPlanos}

Responda com o *número do plano* que deseja conhecer. Se preferir ajuda para escolher, responda *atendente*.`;
}

function cardsFunilCrm(resumo = {}) {
    return `<section class="metrics" style="margin-bottom:24px;">
        ${metricCard({ label: 'Leads ativos', valor: resumo.ativos || 0, nota: `${resumo.urgentes || 0} urgente(s)`, tipo: resumo.ativos ?'info' : 'green', icone: 'crm' })}
        ${metricCard({ label: 'Testes liberados', valor: resumo.testes || 0, nota: 'Em avaliação', tipo: 'info', icone: 'apps' })}
        ${metricCard({ label: 'Aguardando pagamento', valor: resumo.aguardandoPagamento || 0, nota: 'Prontos para fechar', tipo: resumo.aguardandoPagamento ?'orange' : 'green', icone: 'financeiro' })}
        ${metricCard({ label: 'Retornos até amanhã', valor: resumo.retornosHoje || 0, nota: 'Agenda comercial', tipo: resumo.retornosHoje ?'orange' : 'green', icone: 'alert' })}
        ${metricCard({ label: 'Ganhos', valor: resumo.ganhos || 0, nota: 'Convertidos', tipo: 'green', icone: 'check' })}
        ${metricCard({ label: 'Perdidos', valor: resumo.perdidos || 0, nota: 'Aprendizado', tipo: 'red', icone: 'close' })}
    </section>`;
}

function formularioLead(lead = {}, planos = []) {
    const interesseAtual = String(lead.interesse || '').trim();
    const opcoesPlanos = planos.map(plano => ({
        valor: plano.nome,
        texto: `${plano.nome} (${plano.dias} dias - ${plano.valorConfigurado === false ? 'valor a consultar' : `R$ ${plano.valor}`})`
    }));
    if (interesseAtual && !opcoesPlanos.some(plano => plano.valor === interesseAtual)) {
        opcoesPlanos.unshift({ valor: interesseAtual, texto: `${interesseAtual} (interesse já cadastrado)` });
    }

    return `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">${lead.id ?'Editar lead' : 'Novo lead'}</h2>
                <div class="subtitle">Registre interessados antes de virarem clientes</div>
            </div>
        </div>
        <form class="fields" method="post" action="/crm/salvar" style="padding-top:0;">
            ${lead.id ?`<input type="hidden" name="id" value="${escapar(lead.id)}">` : ''}
            ${campo({ nome: 'nome', label: 'Nome *', valor: lead.nome || '', attrs: 'required placeholder="Nome do interessado"' })}
            ${campo({ nome: 'telefone', label: 'WhatsApp', valor: lead.telefone || '', attrs: 'inputmode="tel" placeholder="5511999999999"' })}
            ${campo({
                nome: 'origem',
                label: 'Origem',
                valor: lead.origem || '',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...ORIGENS_CLIENTE.map(origem => ({ valor: origem, texto: origem }))
                ]
            })}
            ${campo({
                nome: 'interesse',
                label: 'Plano de interesse',
                valor: interesseAtual,
                opcoes: [
                    { valor: '', texto: 'Escolha um plano...' },
                    ...opcoesPlanos
                ]
            })}
            <label>Status
                <select name="status">${opcoesStatusLead(lead.status || 'novo')}</select>
            </label>
            <label>Prioridade
                <select name="prioridade">
                    <option value="normal" ${lead.prioridade !== 'urgente' ?'selected' : ''}>Normal</option>
                    <option value="urgente" ${lead.prioridade === 'urgente' ?'selected' : ''}>Urgente</option>
                </select>
            </label>
            ${campo({ nome: 'valorEstimado', label: 'Valor estimado (R$)', valor: lead.valorEstimado || '', attrs: 'inputmode="decimal" placeholder="35,00"' })}
            ${campo({ nome: 'proximoContato', label: 'Próximo contato', tipo: 'datetime-local', valor: inputDateTime(lead.proximoContato) })}
            ${campo({ nome: 'motivoPerda', label: 'Motivo de perda', valor: lead.motivoPerda || '', attrs: 'placeholder="Preencher quando perder a venda"' })}
            ${areaTexto({ nome: 'observacoes', label: 'Observações', valor: lead.observacoes || '' })}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar lead</button>
                <a class="button secondary" href="/crm">Cancelar</a>
            </div>
        </form>
    </section>`;
}

function historicoLeadHtml(lead = {}, historico = []) {
    if (!lead.id) return '';
    const itens = historico.length
        ?historico.map(item => `<div class="note-item">
            <span class="note-date">${escapar(formatarDataNota(item.criadoEm))}</span>
            <div>${escapar(item.texto)}</div>
        </div>`).join('')
        : '<div class="empty">Nenhum histórico comercial registrado.</div>';

    return `<section class="panel">
        <div class="fields">
            <div class="form-section full">Histórico comercial</div>
            <form class="full" method="post" action="/crm/${escapar(lead.id)}/historico">
                ${areaTexto({ nome: 'texto', label: 'Nova anotação', valor: '' })}
                <div class="actions"><button class="button secondary" type="submit">${icon('plus')} Adicionar anotação</button></div>
            </form>
            <div class="full"><div class="notes-list">${itens}</div></div>
        </div>
    </section>`;
}

function tabelaLeads(leads = [], clientes = []) {
    if (!leads.length) return '<div class="empty">Nenhum lead encontrado.</div>';
    const opcoesClientes = clientes
        .map(cliente => `<option value="${escapar(cliente.id)}">${escapar(cliente.nome)} - ${escapar(cliente.telefone || '')}</option>`)
        .join('');

    return `<div class="crm-table-scroll"><table class="crm-table">
        <colgroup><col style="width:22%"><col style="width:17%"><col style="width:16%"><col style="width:19%"><col style="width:26%"></colgroup>
        <thead><tr><th>Lead</th><th>Funil</th><th>Agenda</th><th>Histórico</th><th>Ações</th></tr></thead>
        <tbody>
            ${leads.map(lead => `<tr>
                <td data-label="Lead">
                    <strong>${escapar(lead.nome)}</strong>
                    <div class="cell-muted">${escapar(lead.telefone || '')}</div>
                    ${lead.origem ?`<div class="cell-muted">Origem: ${escapar(lead.origem)}</div>` : ''}
                    ${lead.interesse ?`<div class="cell-muted">Interesse: ${escapar(lead.interesse)}</div>` : ''}
                </td>
                <td data-label="Funil">
                    <span class="badge ${classeStatusLead(lead.status, lead.prioridade)}">${escapar(rotuloStatusLead(lead.status))}</span>
                    ${lead.prioridade === 'urgente' ?'<div class="cell-muted">Urgente</div>' : ''}
                    ${lead.valorEstimado ?`<div class="cell-muted">Estimado: R$ ${escapar(lead.valorEstimado)}</div>` : ''}
                </td>
                <td data-label="Agenda">
                    ${lead.proximoContato ?`<div>${escapar(formatarDataHoraCurta(lead.proximoContato))}</div>` : '-'}
                    ${lead.ultimoContato ?`<div class="cell-muted">Último: ${escapar(formatarDataHoraCurta(lead.ultimoContato))}</div>` : ''}
                </td>
                <td data-label="Histórico">
                    ${lead.observacoes ?`<div class="cell-muted">${escapar(lead.observacoes)}</div>` : '-'}
                    ${lead.clienteNome ?`<div class="cell-muted">Cliente: ${escapar(lead.clienteNome)}</div>` : ''}
                </td>
                <td data-label="Ações">
                    <div class="row-actions">
                        <a class="button icon-only icon-action whats" href="https://wa.me/${escapar(String(lead.telefone || '').replace(/\\D/g, ''))}" title="WhatsApp">${icon('whats')}</a>
                        <form method="post" action="/crm/${escapar(lead.id)}/enviar" onsubmit="return confirm('Enviar mensagem comercial para este lead?');"><button class="button icon-only icon-action green" type="submit" title="Enviar acompanhamento">${icon('atendimento')}</button></form>
                        <form method="post" action="/crm/${escapar(lead.id)}/status"><input type="hidden" name="status" value="teste_liberado"><button class="button icon-only icon-action refresh" type="submit" title="Marcar teste liberado">${icon('apps')}</button></form>
                        <form method="post" action="/crm/${escapar(lead.id)}/status"><input type="hidden" name="status" value="aguardando_pagamento"><button class="button icon-only icon-action green" type="submit" title="Aguardando pagamento">${icon('financeiro')}</button></form>
                        <form method="post" action="/crm/${escapar(lead.id)}/criar-cliente" onsubmit="return confirm('Criar cliente a partir deste lead?');"><button class="button icon-only icon-action green" type="submit" title="Criar cliente">${icon('user')}</button></form>
                        <a class="button icon-only icon-action" href="/crm/${escapar(lead.id)}/editar" title="Editar">${icon('edit')}</a>
                        <form method="post" action="/crm/${escapar(lead.id)}/excluir" onsubmit="return confirm('Apagar este lead?');"><button class="button icon-only icon-action" type="submit" title="Apagar">${icon('trash')}</button></form>
                    </div>
                    <form class="crm-converter" method="post" action="/crm/${escapar(lead.id)}/converter">
                        <select name="clienteId" aria-label="Cliente para vincular a ${escapar(lead.nome)}" required>
                            <option value="">Converter para cliente...</option>
                            ${opcoesClientes}
                        </select>
                        <button class="button secondary" type="submit">${icon('check')} Vincular</button>
                    </form>
                </td>
            </tr>`).join('')}
        </tbody>
    </table></div>`;
}

function telaCrm({ leads = [], clientes = [], planos = [], filtros = {}, resumo = {}, relatorio = {} }) {
    const statusAtual = filtros.status || 'ativos';
    const busca = filtros.busca || '';

    return `<style>
        .crm-report-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; padding:0 28px 24px; }
        .crm-report-grid h3 { margin:0 0 10px; color:var(--muted); font-size:14px; }
        .crm-report-row { display:flex; justify-content:space-between; align-items:baseline; gap:16px; padding:10px 0; border-bottom:1px solid var(--line); }
        .crm-report-row strong { overflow-wrap:anywhere; }
        .crm-report-row span { white-space:nowrap; color:var(--muted); }
        .crm-report-grid .empty { padding:12px 0; text-align:left; }
        .crm-filters { display:flex; align-items:center; flex-wrap:wrap; gap:8px; flex:1; max-width:720px; }
        .crm-filters input { flex:2 1 220px; min-width:0; }
        .crm-filters select { flex:1 1 180px; width:auto; min-width:0; }
        .crm-table-scroll { overflow-x:auto; }
        .crm-table { table-layout:fixed; min-width:900px; }
        .crm-table td { vertical-align:top; overflow-wrap:anywhere; padding:18px 16px; }
        .crm-table th { padding:14px 16px; }
        .crm-table .row-actions { justify-content:flex-start; flex-wrap:wrap; gap:6px; }
        .crm-table .badge { white-space:normal; }
        .crm-converter { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
        .crm-converter select { width:100%; min-width:0; }
        @media(max-width:640px) {
            .crm-report-grid { grid-template-columns:1fr; gap:20px; padding:0 20px 20px; }
            .crm-filters { width:100%; }
            .crm-filters input,.crm-filters select { flex-basis:100%; width:100%; }
            .crm-table { min-width:0; }
            .crm-table colgroup { display:none; }
            .crm-table td { padding:8px 20px; }
        }
    </style><section class="page-title">
        <h1>CRM de vendas</h1>
        <div class="subtitle">Funil comercial, retornos e conversão de interessados em clientes</div>
    </section>
    ${cardsFunilCrm(resumo)}
    ${formularioLead({}, planos)}
    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Relatório comercial</h2>
                <div class="subtitle">${relatorio.conversoesMes || 0} conversão(ões) neste mês</div>
            </div>
        </div>
        <div class="crm-report-grid">
            <div>
                <h3>Por status</h3>
                ${(relatorio.porStatus || []).map(item => `<div class="crm-report-row"><strong>${escapar(rotuloStatusLead(item.nome))}</strong><span>${escapar(item.quantidade)} lead(s)</span></div>`).join('') || '<div class="empty">Sem dados.</div>'}
            </div>
            <div>
                <h3>Por origem</h3>
                ${(relatorio.porOrigem || []).map(item => `<div class="crm-report-row"><strong>${escapar(item.nome)}</strong><span>${escapar(item.quantidade)} lead(s)</span></div>`).join('') || '<div class="empty">Sem dados.</div>'}
            </div>
        </div>
    </section>
    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Funil de leads</h2>
                <div class="subtitle">${leads.length} lead(s) no filtro atual</div>
            </div>
            <form class="crm-filters" method="get" action="/crm">
                <input name="busca" aria-label="Buscar leads" value="${escapar(busca)}" placeholder="Buscar lead, telefone ou origem" style="padding:10px;border:1px solid var(--line);border-radius:8px;">
                <select name="status" aria-label="Filtrar por status" onchange="this.form.submit()">
                    ${[
                        ['ativos', 'Ativos'],
                        ['novo', 'Novo'],
                        ['em_conversa', 'Em conversa'],
                        ['teste_liberado', 'Teste liberado'],
                        ['aguardando_pagamento', 'Aguardando pagamento'],
                        ['ganho', 'Ganhos'],
                        ['perdido', 'Perdidos'],
                        ['todos', 'Todos']
                    ].map(([valor, texto]) => `<option value="${valor}" ${valor === statusAtual ?'selected' : ''}>${texto}</option>`).join('')}
                </select>
                <button class="button secondary" type="submit">${icon('search')} Filtrar</button>
            </form>
        </div>
        ${tabelaLeads(leads, clientes)}
    </section>`;
}

function telaEditarLead({ lead = {}, historico = [], planos = [] }) {
    return `<section class="page-title">
        <h1>Lead comercial</h1>
        <div class="subtitle">${escapar(lead.nome || '')}</div>
    </section>
    ${formularioLead(lead, planos)}
    ${historicoLeadHtml(lead, historico)}`;
}

function itemPreparacao({ pronto, titulo, detalhe, acao, acaoPronto, href }) {
    return `<tr>
        <td data-label="Status"><span class="badge ${pronto ?'ok' : 'warn'}">${pronto ?'Pronto' : 'Pendente'}</span></td>
        <td data-label="Item">
            <div class="cell-title">${escapar(titulo)}</div>
            <div class="cell-muted">${escapar(detalhe)}</div>
        </td>
        <td data-label="Ação">
            <a class="button secondary" href="${escapar(href)}">${icon(pronto ?'check' : 'arrow')} ${escapar(pronto && acaoPronto ?acaoPronto : acao)}</a>
        </td>
    </tr>`;
}

function resumoPreparacaoComercial({ config = {}, clientes = [], planos = [], apps = [], dispositivos = [], paineis = [], modelos = [], pagamentos = [], whatsapp = {} }) {
    const licenca = calcularEstadoLicenca(config);
    const nomeSistema = String(config.nomeSistema || '').trim();
    const pixConfigurado = Boolean(String(config.pixChave || '').trim() && String(config.pixNome || '').trim());
    const temLogo = Boolean(String(config.logoUrl || '').trim());
    const temClientes = clientes.length > 0;
    const temClientesPagantes = clientes.some(cliente => !clienteEhTeste(cliente) && ['ativo', 'pendente'].includes(String(cliente.status || '').toLowerCase()));
    const temFinanceiro = pagamentos.some(pagamento => !pagamento.excluidoEm);
    const temCatalogo = planos.length > 0 && apps.length > 0 && dispositivos.length > 0 && paineis.length > 0;
    const modelosAtivos = modelos.filter(modelo => Number(modelo.ativo) !== 0);
    const backupAtivo = String(config.backupAutomaticoAtivo || '0') === '1';

    const itens = [
        {
            pronto: Boolean(nomeSistema && nomeSistema !== 'Controle de Cliente IPTV e P2P' && temLogo),
            titulo: 'Marca da instalação',
            detalhe: temLogo ? `Nome exibido: ${nomeSistema || 'não informado'}` : 'Defina nome comercial e logo antes de apresentar.',
            acao: 'Ajustar marca',
            acaoPronto: 'Revisar marca',
            href: '/modelos'
        },
        {
            pronto: Boolean(whatsapp.conectado),
            titulo: 'WhatsApp conectado',
            detalhe: whatsapp.conectado ? `Conectado${whatsapp.numeroConectado ? ` em ${whatsapp.numeroConectado}` : ''}.` : 'Conecte pelo QR Code para demonstrar envio e atendimento.',
            acao: 'Abrir QR Code',
            acaoPronto: 'Ver WhatsApp',
            href: '/qr'
        },
        {
            pronto: pixConfigurado,
            titulo: 'PIX de recebimento',
            detalhe: pixConfigurado ? `Recebedor: ${config.pixNome || '-'}` : 'Configure chave, nome e cidade para gerar cobranças.',
            acao: 'Configurar PIX',
            acaoPronto: 'Ver PIX',
            href: '/manutencao'
        },
        {
            pronto: temCatalogo,
            titulo: 'Catálogo operacional',
            detalhe: `${planos.length} plano(s), ${apps.length} app(s), ${dispositivos.length} dispositivo(s), ${paineis.length} painel(is).`,
            acao: 'Revisar planos',
            acaoPronto: 'Conferir catálogo',
            href: '/planos'
        },
        {
            pronto: modelosAtivos.length >= 5,
            titulo: 'Mensagens automáticas',
            detalhe: `${modelosAtivos.length} modelo(s) ativo(s) para renovação, cobrança e aniversário.`,
            acao: 'Editar modelos',
            acaoPronto: 'Conferir modelos',
            href: '/modelos'
        },
        {
            pronto: temClientes,
            titulo: 'Base para demonstração',
            detalhe: temClientes ? `${clientes.length} cliente(s) cadastrados para mostrar o painel.` : 'Use dados reais ou rode o modo demo para não vender com tela vazia.',
            acao: 'Cadastrar cliente',
            acaoPronto: 'Ver clientes',
            href: '/clientes/novo'
        },
        {
            pronto: temClientesPagantes && temFinanceiro,
            titulo: 'Prova financeira',
            detalhe: temFinanceiro ? `${pagamentos.length} registro(s) financeiro(s) encontrados.` : 'Registre pagamentos para demonstrar receita e inadimplência.',
            acao: 'Abrir financeiro',
            acaoPronto: 'Conferir financeiro',
            href: '/financeiro'
        },
        {
            pronto: backupAtivo,
            titulo: 'Backup automático',
            detalhe: backupAtivo ? `Ativo às ${config.backupAutomaticoHora || '03:00'}, retenção de ${config.backupRetencaoDias || 30} dia(s).` : 'Ative backup automático para reduzir risco na entrega.',
            acao: 'Ver manutenção',
            acaoPronto: 'Conferir backup',
            href: '/manutencao'
        },
        {
            pronto: Boolean(licenca.bloqueioAtivo && licenca.permitida),
            titulo: 'Licença comercial',
            detalhe: licenca.rotulo ? `${licenca.rotulo}${licenca.vencimento ? ` até ${formatarData(licenca.vencimento)}` : ''}.` : 'Configure avaliação, assinatura ou licença vitalícia.',
            acao: 'Ver licença',
            acaoPronto: 'Conferir licença',
            href: '/licenca'
        }
    ];
    const prontos = itens.filter(item => item.pronto).length;
    const percentual = Math.round((prontos / itens.length) * 100);

    return { itens, prontos, total: itens.length, percentual };
}

function telaPreparacaoComercial(dados = {}) {
    const resumo = resumoPreparacaoComercial(dados);
    const pendentes = resumo.total - resumo.prontos;
    const classe = resumo.percentual >= 80 ? 'green' : resumo.percentual >= 55 ? 'orange' : 'red';
    const linhas = resumo.itens.map(itemPreparacao).join('');

    return `<section class="page-title">
        <h1>Preparação comercial</h1>
        <div class="subtitle">Checklist para deixar a instalação pronta para demonstração, venda e entrega</div>
    </section>

    <section class="metrics">
        ${metricCard({ label: 'Prontidão', valor: `${resumo.percentual}%`, nota: `${resumo.prontos} de ${resumo.total} item(ns)`, tipo: classe, icone: 'trend' })}
        ${metricCard({ label: 'Pendências', valor: pendentes, nota: pendentes ? 'Revise antes de vender' : 'Pronto para apresentar', tipo: pendentes ? 'orange' : 'green', icone: pendentes ? 'alert' : 'check' })}
        ${metricCard({ label: 'Clientes', valor: dados.clientes.length, nota: 'Base atual do painel', tipo: 'info', icone: 'clientes' })}
        ${metricCard({ label: 'Financeiro', valor: dados.pagamentos.length, nota: 'Pagamentos no histórico', tipo: 'green', icone: 'financeiro' })}
    </section>

    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Checklist de venda</h2>
                <div class="subtitle">Complete os pontos abaixo antes de mostrar o sistema para um cliente novo</div>
            </div>
            <div class="actions">
                <a class="button" href="/clientes">${icon('painel')} Ver painel</a>
                <a class="button secondary" href="/manutencao">${icon('manutencao')} Manutenção</a>
            </div>
        </div>
        <table>
            <thead>
                <tr><th>Status</th><th>Item</th><th>Ação</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    </section>

    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Modo demonstração</h2>
                <div class="subtitle">Para uma reunião de venda, use dados fictícios e mostre fluxo completo: clientes, vencimentos, cobrança e financeiro</div>
            </div>
            <span class="badge info">Comando local</span>
        </div>
        <div style="padding:22px 28px;">
            <div class="notice warn">Antes de apresentar uma instalação nova, rode <strong>npm run demo:seed</strong> para preencher exemplos sem apagar dados existentes.</div>
            <div class="actions">
                <a class="button secondary" href="/clientes/todos">${icon('clientes')} Conferir clientes</a>
                <a class="button secondary" href="/financeiro">${icon('financeiro')} Conferir financeiro</a>
            </div>
        </div>
    </section>`;
}

function pluralCliente(total) {
    return Number(total) === 1 ?'cliente' : 'clientes';
}

function paginacao({ base, params = {}, pagina, totalPaginas, total, porPagina, parametroPorPagina = 'porPagina', mostrarQuantidade = true }) {
    if (totalPaginas <= 1) return '';

    const inicio = total ?((pagina - 1) * porPagina) + 1 : 0;
    const fim = Math.min(total, pagina * porPagina);
    const paginas = [];
    const primeira = Math.max(1, pagina - 2);
    const ultima = Math.min(totalPaginas, pagina + 2);

    for (let numero = primeira; numero <= ultima; numero += 1) {
        paginas.push(`<a class="page-link ${numero === pagina ?'active' : ''}" href="${escapar(montarUrlPaginacao(base, params, numero))}">${numero}</a>`);
    }

    const parametroPagina = String(params.parametroPagina || 'pagina');
    const parametrosQuantidade = { ...params };
    delete parametrosQuantidade.parametroPagina;
    delete parametrosQuantidade[parametroPorPagina];
    const opcoesQuantidade = OPCOES_POR_PAGINA.map(quantidade => {
        const destino = montarUrlPaginacao(base, {
            ...parametrosQuantidade,
            parametroPagina,
            [parametroPorPagina]: quantidade
        }, 1);
        return `<option value="${escapar(destino)}" ${quantidade === porPagina ? 'selected' : ''}>${quantidade}</option>`;
    }).join('');

    return `<nav class="pagination" aria-label="Paginação">
        <span class="pagination-info">${escapar(inicio)}-${escapar(fim)} de ${escapar(total)}</span>
        ${mostrarQuantidade ? `<label class="pagination-size">Por página
            <select aria-label="Quantidade por página" onchange="window.location.href=this.value">${opcoesQuantidade}</select>
        </label>` : ''}
        <a class="page-link ${pagina <= 1 ?'disabled' : ''}" href="${escapar(montarUrlPaginacao(base, params, pagina - 1))}">Anterior</a>
        ${paginas.join('')}
        <a class="page-link ${pagina >= totalPaginas ?'disabled' : ''}" href="${escapar(montarUrlPaginacao(base, params, pagina + 1))}">Próxima</a>
    </nav>`;
}

function classeStatusCampanha(status) {
    const valor = String(status || '').toLowerCase();

    if (['concluida', 'sucesso'].includes(valor)) return 'green';
    if (['erro', 'interrompida', 'cancelada'].includes(valor)) return 'red';
    if (['em_andamento', 'preparando', 'pausada', 'cancelando'].includes(valor)) return 'orange';
    return 'blue';
}

function textoStatusCampanha(status) {
    const mapa = {
        em_andamento: 'Em andamento',
        preparando: 'Preparando',
        pausada: 'Pausada',
        cancelando: 'Cancelando',
        cancelada: 'Cancelada',
        concluida: 'Concluida',
        erro: 'Erro',
        rascunho: 'Rascunho'
    };

    return mapa[String(status || '').toLowerCase()] || (status || '-');
}

function controlesCampanhaAmizadeHtml(retorno = '/campanhas') {
    const acao = campanhaAmizadeExecucao.pausada ? 'continuar' : 'pausar';
    const texto = campanhaAmizadeExecucao.pausada ? 'Continuar campanha' : 'Pausar campanha';
    const classe = campanhaAmizadeExecucao.pausada ? 'green' : 'secondary';

    return `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
        <form method="post" action="/campanhas/amizade/${acao}">
            <input type="hidden" name="retorno" value="${escapar(retorno)}">
            <button class="button ${classe}" type="submit">${texto}</button>
        </form>
        <form method="post" action="/campanhas/amizade/cancelar" onsubmit="return confirm('Cancelar a campanha em andamento? Os clientes ainda nao enviados ficarao pendentes.');">
            <input type="hidden" name="retorno" value="${escapar(retorno)}">
            <button class="button danger" type="submit">Cancelar campanha</button>
        </form>
    </div>`;
}

function telaCampanhas({ campanhas = [], campanha = null, itens = [], itensReclamacao = [], paginacaoItens = null, campanhaRetomavel = null, clientes = [], totalElegiveis = 0, config = {} }) {
    const ativa = campanhaAmizadeExecucao.emAndamento ? campanhaAmizadeExecucao : null;
    const retomavel = !ativa && campanhaRetomavel ? campanhaRetomavel : null;
    const totalAtivas = campanhas.filter(item => ['em_andamento', 'pausada', 'cancelando'].includes(String(item.status || ''))).length;
    const totalEnviados = campanhas.reduce((soma, item) => soma + Number(item.enviados || 0), 0);
    const totalErros = campanhas.reduce((soma, item) => soma + Number(item.erros || 0), 0);
    const totalIgnorados = campanhas.reduce((soma, item) => soma + Number(item.ignorados || 0), 0);
    const campanhaSelecionada = campanha || campanhas[0] || null;
    const envioGeralLiberado = campanhaDentroHorario(config);
    const opcoesClientesCampanha = clientes
        .filter(cliente => normalizarTelefone(cliente.telefone))
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
        .map(cliente => `<option value="${escapar(cliente.id)}">${escapar(cliente.nome || 'Cliente sem nome')}${clienteEhTeste(cliente) ? ' (teste)' : ''}</option>`)
        .join('');
    const opcoesReclamacaoCampanha = itensReclamacao
        .filter(item => Number(item.clienteId || 0) > 0 && String(item.status || '') === 'enviado')
        .sort((a, b) => String(a.clienteNome || '').localeCompare(String(b.clienteNome || ''), 'pt-BR'))
        .map(item => `<option value="${escapar(item.id)}">${escapar(item.clienteNome || 'Cliente sem nome')} — ${escapar(item.telefone || 'sem telefone')}</option>`)
        .join('');

    return `<section class="page-title">
        <h1>Campanhas</h1>
        <div class="subtitle">Acompanhe envios, lotes, clientes enviados e erros de campanha.</div>
    </section>
    <section class="metrics dashboard-metrics">
        ${metricCard({ label: 'Em andamento', valor: totalAtivas, nota: ativa ? `Lote ${ativa.loteAtual || 0} de ${ativa.totalLotes || 0}` : 'Nenhuma fila ativa', tipo: ativa ? 'orange' : 'green', icone: 'whats' })}
        ${metricCard({ label: 'Enviadas', valor: totalEnviados, nota: 'Total historico', tipo: 'green', icone: 'check' })}
        ${metricCard({ label: 'Ignoradas', valor: totalIgnorados, nota: 'Teste, sem telefone ou ja enviado', tipo: totalIgnorados ? 'orange' : 'info', icone: 'alert' })}
        ${metricCard({ label: 'Erros', valor: totalErros, nota: 'Falhas registradas', tipo: totalErros ? 'red' : 'green', icone: 'close' })}
    </section>
    <section class="panel" id="campanhas-disponiveis" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Campanhas disponíveis</h2>
                <div class="subtitle">Inicie um novo envio aqui. O histórico das execuções aparece separadamente abaixo.</div>
            </div>
            <span class="badge ${totalElegiveis ? 'green' : 'orange'}">${escapar(totalElegiveis)} cliente(s) elegível(is)</span>
        </div>
        <div class="mini-card" style="margin-top:14px;">
            <strong>Amizade que vale presente</strong>
            <div class="helper">Envia para clientes ativos com consentimento. Testes, repetições e contatos sem telefone são ignorados automaticamente.</div>
            ${envioGeralLiberado
                ? `<div class="notice success" style="margin-top:12px;">Envio geral liberado agora (${escapar(textoJanelaCampanha(config))}).</div>`
                : `<div class="notice warn" style="margin-top:12px;">${escapar(mensagemCampanhaForaHorario(config))}</div>`}
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:14px;">
                <form method="post" action="/clientes/disparar-amizade-presente-cliente" onsubmit="return confirm('Enviar a campanha somente para o cliente selecionado?');" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <input type="hidden" name="retorno" value="/campanhas">
                    <select name="clienteId" required style="min-width:220px;">
                        <option value="">Enviar teste para 1 cliente...</option>
                        ${opcoesClientesCampanha}
                    </select>
                    <button class="button secondary" type="submit">${icon('whats')} Testar envio</button>
                </form>
                <form method="post" action="/clientes/disparar-amizade-presente" onsubmit="return confirm('Enviar a campanha Amizade que vale presente para todos os clientes elegiveis?');">
                    <input type="hidden" name="retorno" value="/campanhas">
                    <button class="button green" type="submit" ${ativa || retomavel || !totalElegiveis || !envioGeralLiberado ? 'disabled' : ''}>${icon('whats')} ${ativa ? 'Campanha em andamento' : retomavel ? 'Retome a campanha pendente' : !envioGeralLiberado ? 'Fora do horário permitido' : 'Disparar campanha'}</button>
                </form>
            </div>
        </div>
    </section>
    ${ativa ? `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Campanha em execucao</h2>
                <div class="subtitle">${escapar(ativa.mensagem || 'Envio em andamento.')}</div>
                ${ativa.proximoLoteEm ? `<div class="helper">Proximo lote: ${escapar(formatarDataHoraCurta(ativa.proximoLoteEm))}</div>` : ''}
            </div>
            <span class="badge orange">Nao iniciar outro envio</span>
        </div>
        <div class="notice warn">O processo esta sendo executado. O botao de disparo fica bloqueado ate o fim para evitar duplicidade.</div>
        ${controlesCampanhaAmizadeHtml('/campanhas')}
        <div class="helper" style="margin-top:10px;">
            Enviados: ${escapar(resumoNomesCampanha(ativa.clientesEnviados) || '-')}<br>
            Ignorados: ${escapar(resumoNomesCampanha(ativa.clientesIgnorados) || '-')}<br>
            Ja tinham recebido: ${escapar(resumoNomesCampanha(ativa.clientesJaEnviados) || '-')}
        </div>
    </section>` : ''}
    ${retomavel ? `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Campanha pendente encontrada</h2>
                <div class="subtitle">Existe uma campanha interrompida com clientes ainda pendentes. Retome para continuar sem reenviar para quem ja recebeu.</div>
                <div class="helper">Campanha #${escapar(retomavel.id)} - ${escapar(textoStatusCampanha(retomavel.status))}</div>
            </div>
            <span class="badge orange">Pendente</span>
        </div>
        <div class="notice warn">Use retomar campanha antes de iniciar outro disparo. O sistema usa a fila salva no banco e continua apenas os pendentes.</div>
        <form method="post" action="/campanhas/amizade/retomar" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
            <input type="hidden" name="campanhaId" value="${escapar(retomavel.id)}">
            <input type="hidden" name="retorno" value="/campanhas">
            <button class="button green" type="submit" ${envioGeralLiberado ? '' : 'disabled'}>${icon('refresh')} ${envioGeralLiberado ? 'Retomar campanha' : 'Fora do horário permitido'}</button>
        </form>
    </section>` : ''}
    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Campanhas registradas</h2>
                <div class="subtitle">${campanhas.length} campanha(s) no historico.</div>
            </div>
            <a class="button secondary" href="/clientes/todos">${icon('clientes')} Ver clientes</a>
        </div>
        ${campanhas.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Campanha</th><th>Status</th><th>Inicio</th><th>Resultado</th><th>Proximo lote</th><th>Acoes</th></tr></thead>
            <tbody>${campanhas.map(item => `<tr>
                <td><strong>${escapar(item.nome)}</strong><div class="helper">Execução #${escapar(item.id)}${item.publico ? ` • ${escapar(item.publico)}` : ''}</div></td>
                <td><span class="badge ${classeStatusCampanha(item.status)}">${escapar(textoStatusCampanha(item.status))}</span></td>
                <td>${escapar(formatarDataHoraCurta(item.iniciadaEm || item.criadoEm))}</td>
                <td>${Number(item.enviados || 0)} enviado(s), ${Number(item.ignorados || 0)} ignorado(s), ${Number(item.jaEnviados || 0)} repetido(s), ${Number(item.erros || 0)} erro(s)</td>
                <td>${item.proximoLoteEm ? escapar(formatarDataHoraCurta(item.proximoLoteEm)) : '-'}</td>
                <td><a class="button secondary" href="/campanhas?id=${escapar(item.id)}">Ver execução</a></td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<div class="empty">Nenhuma campanha registrada ainda.</div>'}
    </section>
    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Clientes da campanha</h2>
                <div class="subtitle">${campanhaSelecionada
                    ? `${escapar(campanhaSelecionada.nome)} • Execução #${escapar(campanhaSelecionada.id)} • ${escapar(formatarDataHoraCurta(campanhaSelecionada.iniciadaEm || campanhaSelecionada.criadoEm))}`
                    : 'Selecione uma campanha para ver os clientes.'}</div>
            </div>
            ${campanhaSelecionada ? `<span class="badge ${classeStatusCampanha(campanhaSelecionada.status)}">${escapar(textoStatusCampanha(campanhaSelecionada.status))}</span>` : ''}
        </div>
        ${campanhaSelecionada && itens.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Cliente</th><th>Telefone</th><th>Status</th><th>Destino</th><th>Data</th><th>Motivo</th></tr></thead>
            <tbody>${itens.map(item => `<tr>
                <td><strong>${escapar(item.clienteNome || '-')}</strong></td>
                <td>${escapar(item.telefone || '-')}</td>
                <td><span class="badge ${item.status === 'enviado' ? 'green' : item.status === 'erro' ? 'red' : 'orange'}">${escapar(item.status || '-')}</span></td>
                <td>${escapar(item.destino || '-')}</td>
                <td>${escapar(formatarDataHoraCurta(item.enviadoEm || item.criadoEm))}</td>
                <td>${escapar(item.motivo || '-')}</td>
            </tr>`).join('')}</tbody>
        </table></div>${paginacaoItens ? paginacao({
            base: '/campanhas',
            params: { id: campanhaSelecionada.id, parametroPagina: 'paginaClientes', porPaginaClientes: paginacaoItens.porPagina },
            parametroPorPagina: 'porPaginaClientes',
            pagina: paginacaoItens.pagina,
            totalPaginas: paginacaoItens.totalPaginas,
            total: paginacaoItens.total,
            porPagina: paginacaoItens.porPagina
        }) : ''}` : '<div class="empty">Nenhum cliente registrado para esta campanha.</div>'}
        ${campanhaSelecionada ? `<form method="post" action="/campanhas/reclamacoes" class="form-grid" style="margin-top:18px;" onsubmit="return confirm('Registrar reclamação e bloquear novas campanhas para este cliente?');">
            <input type="hidden" name="campanhaId" value="${escapar(campanhaSelecionada.id)}">
            <input type="hidden" name="retorno" value="/campanhas?id=${escapar(campanhaSelecionada.id)}&paginaClientes=${escapar(paginacaoItens?.pagina || 1)}">
            <label>Cliente que reclamou
                <select name="campanhaItemId" required ${opcoesReclamacaoCampanha ? '' : 'disabled'}>
                    <option value="">Selecione pelo nome ou telefone</option>
                    ${opcoesReclamacaoCampanha}
                </select>
            </label>
            ${campo({ nome: 'motivo', label: 'Motivo da reclamação', valor: '', tipo: 'text', attrs: 'maxlength="500" required' })}
            ${opcoesReclamacaoCampanha
                ? '<div class="notice full">A lista contém somente clientes que receberam esta campanha. Ao registrar, o marketing será bloqueado imediatamente para o cliente escolhido.</div>'
                : '<div class="notice warn full">Esta campanha ainda não possui clientes com envio confirmado para selecionar.</div>'}
            <div class="actions full"><button class="button danger" type="submit" ${opcoesReclamacaoCampanha ? '' : 'disabled'}>Registrar reclamação e bloquear marketing</button></div>
        </form>` : ''}
    </section>
    ${autoAtualizarPaginaScript(DASHBOARD_AUTO_REFRESH_MS)}`;
}

function receitaMensalCard(receita) {
    const maiorValor = Math.max(...receita.itens.map(item => item.total), 1);
    const linhas = receita.itens.length
        ?receita.itens.map((item) => {
            const largura = Math.max(8, Math.round((item.total / maiorValor) * 100));

            return `<div class="revenue-row">
                <div class="revenue-plan">${escapar(item.plano)}</div>
                <div class="revenue-count">(${escapar(item.clientes)} ${pluralCliente(item.clientes)})</div>
                <div class="revenue-bar" aria-hidden="true"><span style="--bar-width:${largura}%"></span></div>
                <div class="revenue-value">${escapar(formatarMoeda(item.total))}</div>
            </div>`;
        }).join('')
        : '<div class="empty">Nenhuma receita mensal recorrente encontrada.</div>';

    return `<section class="panel revenue-card">
        <div class="revenue-head">
            <div>
                <div class="revenue-title">Receita Mensal Recorrente</div>
                <strong class="revenue-total">${escapar(formatarMoeda(receita.total))}</strong>
                <span class="revenue-note">Baseada nos pagamentos válidos e nos clientes ativos sem histórico financeiro</span>
            </div>
            <span class="revenue-icon">${icon('trend')}</span>
        </div>
        <div class="revenue-list">${linhas}</div>
    </section>`;
}

function cardVencimento(cliente) {
    const vencimento = vencimentoCliente(cliente);
    const dias = calcularDiasRestantes(vencimento);
    const classeVencimento = dias < 0 || vencimentoExpirou(vencimento) ?'expired' : '';
    const marcadorTeste = clienteEhTeste(cliente) ?'<span class="badge info">Teste gr&aacute;tis</span>' : '';

    return `<div class="client-row">
        <div class="avatar">${escapar(iniciais(cliente.nome))}</div>
        <div>
            <div class="client-name">${escapar(cliente.nome)} ${marcadorTeste}</div>
            <div class="helper">${escapar(cliente.telefone || '')}</div>
        </div>
        <div>
            <div class="due ${classeVencimento}" data-vencimento-restante="${escapar(vencimento)}" data-prefixo="dashboard">${escapar(textoVencimento(cliente))}</div>
            <div class="due-date">${escapar(formatarDataHoraCurta(vencimento))}</div>
        </div>
        <span class="badge ${statusClasse(cliente.status)}">${escapar(cliente.status || '-')}</span>
        <form method="post" action="/clientes/${escapar(cliente.id)}/enviar-aviso-vencimento" onsubmit="return confirm('Enviar aviso de vencimento próximo para este cliente?');">
            <button class="button secondary icon-only" type="submit" title="Enviar aviso de vencimento">${icon('whats')}</button>
        </form>
    </div>`;
}

function ajustarPaginacaoVencimentosScript(total, porPagina) {
    return `<script>
        (() => {
            if (!window.matchMedia('(min-width: 981px)').matches) return;

            const lista = document.querySelector('[data-dashboard-due-list]');
            const primeiraLinha = lista?.querySelector('.client-row');
            if (!lista || !primeiraLinha) return;

            const url = new URL(window.location.href);
            const espacoAteRodape = Math.max(0, window.innerHeight - lista.getBoundingClientRect().top - 44);
            const alturaLinha = Math.max(1, primeiraLinha.getBoundingClientRect().height);
            const quantidade = Math.max(1, Math.min(${DASHBOARD_VENCIMENTOS_POR_PAGINA}, Math.floor(espacoAteRodape / alturaLinha)));
            const atual = ${Number(porPagina)};
            const total = ${Number(total)};

            if (total > 0 && quantidade !== atual) {
                url.searchParams.set('porPagina', String(quantidade));
                url.searchParams.set('pagina', '1');
                window.location.replace(url.toString());
            }
        })();
    </script>`;
}

function dashboard(clientes, pagina = 1, porPagina = DASHBOARD_VENCIMENTOS_POR_PAGINA, receitaBase = clientes, aniversariantes = [], resumoSuporte = {}, resumoComercial = {}) {
    const resumo = calcularResumo(clientes);
    const receita = calcularReceitaMensal(receitaBase);
    const proximos = clientesComVencimentoProximo(clientes);
    const proximosPaginados = paginarItens(proximos, pagina, porPagina);
    const suporteAberto = Number(resumoSuporte.abertos || 0) + Number(resumoSuporte.emAndamento || 0);
    const opcoesClientesCampanha = clientes
        .filter(cliente => normalizarTelefone(cliente.telefone))
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
        .map(cliente => `<option value="${escapar(cliente.id)}">${escapar(cliente.nome || 'Cliente sem nome')}${clienteEhTeste(cliente) ? ' (teste)' : ''}</option>`)
        .join('');
    const campanhaStatus = campanhaAmizadeExecucao;
    const campanhaEmAndamento = Boolean(campanhaStatus.emAndamento);
    const mensagemCampanhaStatus = campanhaStatus.mensagem || '';
    const detalheCampanhaStatus = [
        campanhaStatus.clientesEnviados?.length ? `Enviados: ${resumoNomesCampanha(campanhaStatus.clientesEnviados)}` : '',
        campanhaStatus.clientesIgnorados?.length ? `Ignorados: ${resumoNomesCampanha(campanhaStatus.clientesIgnorados)}` : '',
        campanhaStatus.clientesJaEnviados?.length ? `Ja tinham recebido: ${resumoNomesCampanha(campanhaStatus.clientesJaEnviados)}` : '',
        campanhaStatus.proximoLoteEm ? `Proximo lote: ${formatarDataHoraCurta(campanhaStatus.proximoLoteEm)}` : '',
        campanhaStatus.erro ? `Erro: ${campanhaStatus.erro}` : ''
    ].filter(Boolean).join(' | ');
    return `<section class="page-title">
        <h1>Painel de Controle</h1>
        <div class="subtitle">Visão geral dos seus clientes</div>
    </section>
    <section class="metrics dashboard-metrics">
        ${metricCard({ label: 'Total de Clientes', valor: resumo.total, tipo: 'blue', icone: 'clientes' })}
        ${metricCard({ label: 'Em Teste', valor: resumo.testes, nota: 'Teste grátis', tipo: 'info', icone: 'apps' })}
        ${metricCard({ label: 'Ativos', valor: resumo.ativos, tipo: 'green', icone: 'check' })}
        ${metricCard({ label: 'Vencidos', valor: resumo.vencidos, tipo: 'red', icone: 'close' })}
        ${metricCard({ label: `Próximos ${DIAS_DASHBOARD} dias`, valor: resumo.vencendo, nota: 'Precisam de atenção', tipo: 'orange', icone: 'alert' })}
        ${metricCard({ label: 'Vencem este mês', valor: resumo.vencemMes, nota: 'Ainda este mês', tipo: 'orange', icone: 'alert' })}
        ${metricCard({ label: 'Atendimentos', valor: suporteAberto, nota: `${Number(resumoSuporte.urgentes || 0)} urgente(s)`, tipo: suporteAberto ?'orange' : 'green', icone: 'atendimento' })}
        ${metricCard({ label: 'CRM', valor: Number(resumoComercial.ativos || 0), nota: `${Number(resumoComercial.retornosHoje || 0)} retorno(s)`, tipo: resumoComercial.ativos ?'info' : 'green', icone: 'crm' })}
    </section>
    <section class="panel dashboard-campaign" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Campanha de indicação</h2>
                <div class="subtitle">Dispare a arte "Amizade que vale presente" para clientes ativos, exceto testes.</div>
                ${mensagemCampanhaStatus ? `<div class="notice ${campanhaEmAndamento ? 'warn' : ''}" style="margin-top:10px;">${escapar(mensagemCampanhaStatus)}${detalheCampanhaStatus ? `<br><span class="helper">${escapar(detalheCampanhaStatus)}</span>` : ''}</div>` : ''}
                ${campanhaEmAndamento ? controlesCampanhaAmizadeHtml('/clientes') : ''}
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                <a class="button secondary" href="/campanhas">Ver campanhas</a>
                <form method="post" action="/clientes/disparar-amizade-presente-cliente" onsubmit="return confirm('Enviar a campanha somente para o cliente selecionado?');" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <select name="clienteId" required style="min-width:220px;">
                        <option value="">Enviar para 1 cliente...</option>
                        ${opcoesClientesCampanha}
                    </select>
                    <button class="button secondary" type="submit">${icon('whats')} Testar envio</button>
                </form>
                <form method="post" action="/clientes/disparar-amizade-presente" onsubmit="return confirm('Enviar a campanha Amizade que vale presente para todos os clientes ativos, exceto testes?');">
                    <button class="button green" type="submit" ${campanhaEmAndamento ? 'disabled title="Campanha em andamento. Aguarde finalizar."' : ''}>${icon('whats')} ${campanhaEmAndamento ? 'Campanha em andamento' : 'Disparar campanha'}</button>
                </form>
            </div>
        </div>
    </section>
    ${receitaMensalCard(receita)}
    ${aniversariantes.length ? `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Aniversariantes com bônus pendente</h2>
                <div class="subtitle">Revise e salve o vencimento antes de aplicar e avisar o cliente.</div>
            </div>
            <span class="badge orange">${aniversariantes.length} pendente(s)</span>
        </div>
        ${aniversariantes.map(cliente => `<div class="client-row">
            <div class="avatar">${escapar(iniciais(cliente.nome))}</div>
            <div><div class="client-name">${escapar(cliente.nome)}</div><div class="helper">${escapar(cliente.telefone || '')}</div></div>
            <div><div class="client-name">Vencimento atual</div><div class="helper">${escapar(formatarDataHoraCurta(cliente.dataVencimento || cliente.vencimento))}</div></div>
            <span class="badge orange">Bônus aguardando aprovação</span>
            <a class="button secondary" href="/clientes/${escapar(cliente.id)}/editar#bonus">Revisar e aplicar</a>
        </div>`).join('')}
    </section>` : ''}
    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Clientes com Vencimento Próximo</h2>
                <div class="subtitle">Clientes que vencem nos próximos ${DIAS_DASHBOARD} dias corridos</div>
            </div>
            <div class="actions">
                <form method="post" action="/clientes/verificar-renovacoes">
                    <button class="button green" type="submit">${icon('whats')} Disparar Avisos (${proximos.length})</button>
                </form>
                <a class="button secondary" href="/clientes/todos">Ver todos ${icon('arrow')}</a>
            </div>
        </div>
        <div data-dashboard-due-list>${proximosPaginados.itens.length ?proximosPaginados.itens.map(cardVencimento).join('') : '<div class="empty">Nenhum cliente vencendo nos próximos dias.</div>'}</div>
        ${paginacao({
            base: '/clientes',
            params: { porPagina },
            pagina: proximosPaginados.pagina,
            totalPaginas: proximosPaginados.totalPaginas,
            total: proximosPaginados.total,
            porPagina: proximosPaginados.porPagina,
            mostrarQuantidade: false
        })}
    </section>
    ${ajustarPaginacaoVencimentosScript(proximosPaginados.total, proximosPaginados.porPagina)}
    ${autoAtualizarPaginaScript(DASHBOARD_AUTO_REFRESH_MS)}`;
}

function tabelaClientes(clientes) {
    if (!clientes.length) {
        return '<div class="empty">Nenhum cliente encontrado.</div>';
    }

    const linhas = clientes.map(cliente => {
        const bandeira = imagemBandeiraPaisTelefone(cliente);

        return `<tr>
        <td data-label="Cliente">
            <div class="cell-title">${bandeira}${escapar(cliente.nome)}</div>
            <div class="cell-muted">${escapar(cliente.telefone || '')}</div>
            ${cliente.origem ?`<div class="cell-muted">Origem: ${escapar(cliente.origem)}</div>` : ''}
            ${cliente.indicadoPor ?`<div class="cell-muted">Indicado por: ${escapar(cliente.indicadoPor)}</div>` : ''}
            ${cliente.nascimento ?`<div class="cell-muted">🎂 ${escapar(formatarAniversario(cliente.nascimento))}</div>` : ''}
            ${Number(cliente.bonusMeses || 0) > 0 ?`<div class="cell-muted">🎁 ${escapar(cliente.bonusMeses)} bônus</div>` : ''}
            ${renderTagsCliente(cliente.tags)}
        </td>
        <td data-label="Plano">
            <div class="cell-title">${escapar(cliente.plano || '-')}</div>
            <div class="cell-muted">${escapar(detalhePlanoCliente(cliente))}</div>
            <div class="cell-muted">${cliente.valorPlano ?`R$ ${escapar(cliente.valorPlano)}` : ''}</div>
        </td>
        <td data-label="Início">${escapar(formatarDataHoraCurta(cliente.dataInicio))}</td>
        <td data-label="Vencimento">
            <div class="cell-title">${escapar(formatarDataHoraCurta(cliente.dataVencimento || cliente.vencimento))}</div>
            <div class="cell-muted" data-vencimento-restante="${escapar(cliente.dataVencimento || cliente.vencimento)}">${escapar(textoDiasRestantes(cliente.dataVencimento || cliente.vencimento))}</div>
        </td>
        <td data-label="Aplicativos">
            ${renderChips(cliente.appsInstalados, 'app-chip')}
            ${cliente.validadeApp ?`<div class="cell-muted">Validade: ${escapar(cliente.validadeApp)}</div>` : ''}
            ${cliente.dataValidadeApp ?`<div class="cell-muted">App vence: ${escapar(formatarDataHoraCurta(cliente.dataValidadeApp))}</div>` : ''}
            ${cliente.appInstalado ?'<span class="installed-chip">Instalado</span>' : ''}
        </td>
        <td data-label="Dispositivos">
            ${renderChips(cliente.dispositivosSelecionados, 'device-chip')}
        </td>
        <td data-label="Status"><span class="badge ${statusClasse(cliente.status)}">${escapar(rotuloStatus(cliente.status))}</span></td>
        <td data-label="Ações">
            <div class="row-actions">
                <a class="button icon-only icon-action whats" href="https://wa.me/${escapar(String(cliente.telefone || '').replace(/\\D/g, ''))}" title="WhatsApp">${icon('whats')}</a>
                <form method="post" action="/clientes/${escapar(cliente.id)}/enviar-aviso-vencimento" onsubmit="return confirm('Enviar aviso de vencimento próximo para este cliente?');">
                    <button class="button icon-only icon-action green" type="submit" title="Enviar vencimento próximo">${icon('alert')}</button>
                </form>
                <form method="post" action="/clientes/${escapar(cliente.id)}/enviar-campanha-amizade" onsubmit="return confirm('Enviar a campanha Amizade que vale presente somente para este cliente?');">
                    <button class="button icon-only icon-action green" type="submit" title="Enviar campanha de indicação">${icon('whats')}</button>
                </form>
                <a class="button icon-only icon-action" href="/clientes/${escapar(cliente.id)}/enviar-modelo" title="Enviar modelo">${icon('modelos')}</a>
                ${clienteTesteExpirado(cliente) ?`<form method="post" action="/clientes/${escapar(cliente.id)}/enviar-planos-teste-expirado" onsubmit="return confirm('Enviar a tela de planos para este teste expirado? Esta acao so deve ser usada uma vez.');">
                    <button class="button icon-only icon-action green" type="submit" title="Enviar planos do teste expirado">${icon('planos')}</button>
                </form>` : ''}
                ${clientePodeReceberReativacao(cliente) ?`<form method="post" action="/clientes/${escapar(cliente.id)}/enviar-reativacao" onsubmit="return confirm('Enviar mensagem de reativação com QR Code para este cliente?');">
                    <button class="button icon-only icon-action green" type="submit" title="Enviar reativação com QR Code">${icon('financeiro')}</button>
                </form>` : ''}
                <form method="post" action="/clientes/verificar-renovacoes">
                    <button class="button icon-only icon-action refresh" type="submit" title="Enviar aviso">${icon('refresh')}</button>
                </form>
                <a class="button icon-only icon-action refresh" href="/clientes/${cliente.id}/editar#renovar" title="Renovar cliente">${icon('planos')}</a>
                <a class="button icon-only icon-action" href="/clientes/${cliente.id}/editar#atendimentos" title="Abrir atendimento">${icon('atendimento')}</a>
                <a class="button icon-only icon-action" href="/clientes/${cliente.id}/editar" title="Editar">${icon('edit')}</a>
                <a class="button icon-only icon-action" href="/clientes/${cliente.id}/editar#privacidade" title="Privacidade e anonimização">${icon('trash')}</a>
            </div>
        </td>
    </tr>`;
    }).join('');

    return `<table class="clients-table">
        <thead>
            <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Início</th>
                <th>Vencimento</th>
                <th>Aplicativos</th>
                <th>Dispositivos</th>
                <th>Status</th>
                <th>Ações</th>
            </tr>
        </thead>
        <tbody>${linhas}</tbody>
    </table>`;
}

function autoAtualizarPaginaScript(intervaloMs = CLIENTES_AUTO_REFRESH_MS) {
    return `<script>
        (() => {
            const intervalo = ${Number(intervaloMs)};
            if (!intervalo || intervalo < 15000) return;

            let ultimaInteracao = Date.now();
            const eventos = ['input', 'change', 'keydown', 'pointerdown', 'focusin'];

            eventos.forEach((evento) => {
                document.addEventListener(evento, () => {
                    ultimaInteracao = Date.now();
                }, { passive: true });
            });

            function estaEditando() {
                const ativo = document.activeElement;
                return ativo && ['INPUT', 'SELECT', 'TEXTAREA'].includes(ativo.tagName);
            }

            function plural(valor, singular, pluralTexto) {
                return Number(valor) === 1 ?singular : pluralTexto;
            }

            function textoTempoRestante(valor, prefixo) {
                if (!valor) return '-';

                const data = new Date(String(valor).length <= 10 ?String(valor) + 'T23:59:59' : valor);
                if (Number.isNaN(data.getTime())) return '-';

                const minuto = 60 * 1000;
                const hora = 60 * minuto;
                const dia = 24 * hora;
                const diff = data - new Date();
                const vencido = diff < 0;
                const totalMinutos = Math.ceil(Math.abs(diff) / minuto);

                if (totalMinutos <= 0) return vencido ?'vencido agora' : 'vence agora';

                let texto = '';

                if (totalMinutos < 60) {
                    const unidade = plural(totalMinutos, 'minuto', 'minutos');
                    const sufixo = plural(totalMinutos, 'restante', 'restantes');
                    texto = vencido ?totalMinutos + ' ' + unidade + ' vencido' : totalMinutos + ' ' + unidade + ' ' + sufixo;
                } else if (totalMinutos < 24 * 60) {
                    const horas = Math.floor(totalMinutos / 60);
                    const minutos = totalMinutos % 60;
                    const textoHoras = horas + ' ' + plural(horas, 'hora', 'horas');

                    if (!minutos) {
                        const sufixo = plural(horas, 'restante', 'restantes');
                        texto = vencido ?textoHoras + ' vencido' : textoHoras + ' ' + sufixo;
                    } else {
                        const textoMinutos = minutos + ' ' + plural(minutos, 'minuto', 'minutos');
                        texto = vencido ?textoHoras + ' e ' + textoMinutos + ' vencido' : textoHoras + ' e ' + textoMinutos + ' restantes';
                    }
                } else {
                    const dias = Math.floor(Math.abs(diff) / dia);
                    const horas = Math.floor((Math.abs(diff) % dia) / hora);
                    const textoDias = dias + ' ' + plural(dias, 'dia', 'dias');
                    const textoHoras = horas ?' e ' + horas + ' ' + plural(horas, 'hora', 'horas') : '';
                    const sufixo = plural(dias, 'restante', 'restantes');
                    texto = vencido ?textoDias + textoHoras + ' vencido' : textoDias + textoHoras + ' ' + sufixo;
                }

                if (prefixo === 'dashboard' && !vencido && texto !== '-') {
                    return 'Vence em ' + texto.replace(/ restantes?$/, '');
                }

                if (prefixo === 'dashboard' && vencido) {
                    return texto.includes('vencido agora') ?'Vencido agora' : texto.replace(' vencido', ' vencido');
                }

                return texto;
            }

            function atualizarVencimentos() {
                document.querySelectorAll('[data-vencimento-restante]').forEach((elemento) => {
                    const texto = textoTempoRestante(elemento.dataset.vencimentoRestante, elemento.dataset.prefixo || '');
                    if (texto && texto !== '-') elemento.textContent = texto;
                    const data = new Date(String(elemento.dataset.vencimentoRestante || '').length <= 10
                        ?String(elemento.dataset.vencimentoRestante || '') + 'T23:59:59'
                        : elemento.dataset.vencimentoRestante);
                    if (!Number.isNaN(data.getTime()) && elemento.classList.contains('due')) {
                        elemento.classList.toggle('expired', data < new Date());
                    }
                });
            }

            atualizarVencimentos();
            setInterval(atualizarVencimentos, 60000);

            setInterval(() => {
                if (document.hidden) return;
                if (estaEditando()) return;
                if (Date.now() - ultimaInteracao < 15000) return;

                const url = new URL(window.location.href);
                url.searchParams.set('_atualizado', Date.now().toString());
                window.location.replace(url.toString());
            }, intervalo);
        })();
    </script>`;
}

function listaClientes({ clientes, busca, status, origem, tag, renovacao, porPagina, paginacaoClientes }) {
    const totalClientes = paginacaoClientes?.total ?? clientes.length;
    const urlExportar = montarUrlComFiltros('/clientes/exportar.csv', { busca, status, origem, tag, renovacao });

    return `<section class="page-title">
        <h1>Clientes</h1>
        <div class="subtitle">${totalClientes} clientes cadastrados</div>
    </section>
    <form class="clients-toolbar" method="get" action="/clientes/todos">
        <input type="hidden" name="porPagina" value="${escapar(porPagina || CLIENTES_POR_PAGINA)}">
        <div class="clients-search">
            ${icon('search')}
            <input name="busca" value="${escapar(busca)}" placeholder="Nome, telefone, MAC, usuário, dispositivo ou painel...">
        </div>
        <select name="status" onchange="this.form.submit()">
            ${[
                ['', 'Todos'],
                ['ativo', 'Ativo'],
                ['teste', 'Teste'],
                ['pendente', 'Pendente'],
                ['expirado', 'Expirado'],
                ['inadimplente', 'Inadimplentes'],
                ['suspenso', 'Suspenso'],
                ['cancelado', 'Cancelado']
            ].map(([valor, texto]) => `<option value="${valor}" ${valor === status ?'selected' : ''}>${texto}</option>`).join('')}
        </select>
        <select name="origem" onchange="this.form.submit()">
            ${[
                ['', 'Todas as origens'],
                ...ORIGENS_CLIENTE.map(item => [item, item])
            ].map(([valor, texto]) => `<option value="${escapar(valor)}" ${valor === origem ?'selected' : ''}>${escapar(texto)}</option>`).join('')}
        </select>
        <select name="tag" onchange="this.form.submit()">
            ${[
                ['', 'Todas as tags'],
                ...TAGS_CLIENTE.map(item => [item, item])
            ].map(([valor, texto]) => `<option value="${escapar(valor)}" ${valor === tag ?'selected' : ''}>${escapar(texto)}</option>`).join('')}
        </select>
        <select name="renovacao" onchange="this.form.submit()">
            ${[
                ['', 'Todos os vencimentos'],
                ['hoje', 'Vence hoje'],
                ['tres_dias', 'Vence em até 3 dias'],
                ['teste_vencido', 'Teste vencido']
            ].map(([valor, texto]) => `<option value="${valor}" ${valor === renovacao ? 'selected' : ''}>${texto}</option>`).join('')}
        </select>
    </form>
    <div class="toolbar">
        <span></span>
        <div class="actions">
            <a class="button secondary" href="${escapar(urlExportar)}">${icon('planos')} Exportar CSV</a>
            <form method="post" action="/clientes/verificar-renovacoes">
                <button class="button green" type="submit">${icon('whats')} Enviar vencimentos</button>
            </form>
            <a class="button" href="/clientes/novo">${icon('plus')} Novo Cliente</a>
        </div>
    </div>
    <section class="clients-panel">
        ${tabelaClientes(clientes)}
        ${paginacaoClientes ?paginacao({
            base: '/clientes/todos',
            params: { busca, status, origem, tag, renovacao, porPagina },
            pagina: paginacaoClientes.pagina,
            totalPaginas: paginacaoClientes.totalPaginas,
            total: paginacaoClientes.total,
            porPagina: paginacaoClientes.porPagina
        }) : ''}
    </section>
    ${autoAtualizarPaginaScript(CLIENTES_AUTO_REFRESH_MS)}`;
}

function mesAtualInput() {
    const data = new Date();
    data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
    return data.toISOString().slice(0, 7);
}

function resumoFinanceiro(pagamentos = []) {
    return pagamentos.reduce((resumo, pagamento) => {
        const removido = Boolean(pagamento.excluidoEm);
        const valor = valorPrincipalPagamento(pagamento);

        resumo.totalRegistros += 1;

        if (removido) {
            resumo.removidos += 1;
            resumo.totalRemovido += valor;
        } else {
            resumo.validos += 1;
            resumo.totalValido += valor;
        }

        return resumo;
    }, {
        totalRegistros: 0,
        validos: 0,
        removidos: 0,
        totalValido: 0,
        totalRemovido: 0
    });
}

function agruparFinanceiro(pagamentos = [], campo, fallback = 'Não informado') {
    const grupos = pagamentos
        .filter(pagamento => !pagamento.excluidoEm)
        .reduce((mapa, pagamento) => {
            const chave = String(pagamento[campo] || fallback).trim() || fallback;
            const atual = mapa.get(chave) || { nome: chave, quantidade: 0, total: 0 };

            atual.quantidade += 1;
            atual.total += valorPrincipalPagamento(pagamento);
            mapa.set(chave, atual);

            return mapa;
        }, new Map());

    return [...grupos.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

function financeiroBreakdownCard({ titulo, nota, itens = [], icone = 'financeiro' }) {
    const maiorValor = Math.max(...itens.map(item => item.total), 1);
    const linhas = itens.length
        ?itens.map(item => {
            const largura = Math.max(8, Math.round((item.total / maiorValor) * 100));

            return `<div class="revenue-row">
                <div class="revenue-plan">${escapar(item.nome)}</div>
                <div class="revenue-count">(${escapar(item.quantidade)} pagamento(s))</div>
                <div class="revenue-bar" aria-hidden="true"><span style="--bar-width:${largura}%"></span></div>
                <div class="revenue-value">${escapar(formatarMoeda(item.total))}</div>
            </div>`;
        }).join('')
        : '<div class="empty">Nenhum pagamento válido encontrado neste filtro.</div>';

    return `<section class="panel revenue-card">
        <div class="revenue-head">
            <div>
                <div class="revenue-title">${escapar(titulo)}</div>
                <span class="revenue-note">${escapar(nota)}</span>
            </div>
            <span class="revenue-icon">${icon(icone)}</span>
        </div>
        <div class="revenue-list">${linhas}</div>
    </section>`;
}

function resumoInadimplentes(clientes = []) {
    const vencidos = clientes
        .filter(cliente => !clienteEhTeste(cliente))
        .filter(cliente => {
            const vencimento = vencimentoCliente(cliente);
            return vencimento && (vencimento.slice(0, 10) < hojeISO() || vencimentoExpirou(vencimento));
        })
        .sort((a, b) => String(vencimentoCliente(a)).localeCompare(String(vencimentoCliente(b))));

    const valorMensal = vencidos.reduce((total, cliente) => {
        const dias = diasPlanoCliente(cliente);
        const valorPlano = numeroMoeda(cliente.valorPlano);
        const assinaturaApp = numeroMoeda(cliente.assinaturaApp);
        const mensalPlano = dias > 0 ?(valorPlano / dias) * 30 : valorPlano;
        return total + mensalPlano + assinaturaApp;
    }, 0);

    return {
        clientes: vencidos,
        quantidade: vencidos.length,
        valorMensal
    };
}

function painelInadimplentesFinanceiro(inadimplentes = {}) {
    const clientes = inadimplentes.clientes || [];
    const linhas = clientes.slice(0, 8).map(cliente => {
        const vencimento = vencimentoCliente(cliente);
        const telefone = String(cliente.telefone || '').replace(/\D/g, '');
        const linkWhats = telefone ?`https://wa.me/${telefone}` : '';

        return `<tr>
            <td data-label="Cliente">
                <div class="cell-title">${escapar(cliente.nome || '-')}</div>
                <div class="cell-muted">${escapar(cliente.telefone || '')}</div>
            </td>
            <td data-label="Plano">
                <div class="cell-title">${escapar(cliente.plano || '-')}</div>
                <div class="cell-muted">R$ ${escapar(cliente.valorPlano || '0,00')} | App: R$ ${escapar(cliente.assinaturaApp || '0,00')}</div>
            </td>
            <td data-label="Vencimento">
                <div class="cell-title">${escapar(formatarDataHoraCurta(vencimento))}</div>
                <div class="cell-muted">${escapar(textoTempoRestante(vencimento))}</div>
            </td>
            <td data-label="Ações">
                <div class="actions">
                    ${linkWhats ?`<a class="button secondary icon-only" href="${escapar(linkWhats)}" target="_blank" rel="noopener" title="Chamar no WhatsApp">${icon('whats')}</a>` : ''}
                    <a class="button secondary icon-only" href="/clientes/${escapar(cliente.id)}/editar#renovar" title="Abrir cliente">${icon('edit')}</a>
                </div>
            </td>
        </tr>`;
    }).join('');

    return `<section class="panel" style="margin-bottom:28px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Vencidos e Inadimplentes</h2>
                <div class="subtitle">${escapar(inadimplentes.quantidade || 0)} cliente(s), estimativa mensal ${escapar(formatarMoeda(inadimplentes.valorMensal || 0))}</div>
            </div>
            <div class="actions">
                <form method="post" action="/clientes/cobrar-vencidos" onsubmit="return confirm('Enviar cobrança para clientes vencidos que ainda não receberam cobrança deste vencimento?');">
                    <button class="button green" type="submit">${icon('whats')} Cobrar vencidos</button>
                </form>
                <a class="button secondary" href="/clientes/todos?status=inadimplente">Ver todos ${icon('arrow')}</a>
            </div>
        </div>
        <table class="clients-table">
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Plano</th>
                    <th>Vencimento</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>${linhas || '<tr><td colspan="4" class="empty">Nenhum cliente vencido encontrado.</td></tr>'}</tbody>
        </table>
    </section>`;
}

function telaFinanceiro({ pagamentos = [], filtros = {}, paginacaoFinanceiro, clientes = [] }) {
    const resumo = resumoFinanceiro(pagamentos);
    const urlExportar = montarUrlComFiltros('/financeiro/exportar.csv', filtros);
    const porPagamento = agruparFinanceiro(pagamentos, 'formaPagamento', 'Não informado');
    const porPlano = agruparFinanceiro(pagamentos, 'plano', 'Sem plano');
    const inadimplentes = resumoInadimplentes(clientes);
    const linhas = paginacaoFinanceiro.itens.length
        ?paginacaoFinanceiro.itens.map(pagamento => `<tr>
            <td data-label="Data">${escapar(formatarDataHoraCurta(pagamento.dataPagamento || pagamento.criadoEm))}</td>
            <td data-label="Cliente">
                <div class="cell-title">${escapar(pagamento.clienteNome || '-')}</div>
                <div class="cell-muted">${escapar(pagamento.clienteTelefone || '')}</div>
            </td>
            <td data-label="Plano">
                <div class="cell-title">${escapar(pagamento.plano || '-')}</div>
                <div class="cell-muted">${escapar(pagamento.diasContrato || 0)} dias</div>
            </td>
            <td data-label="Valor">
                <div class="cell-title">R$ ${escapar(pagamento.valorPlano || pagamento.valorTotal || '0,00')}</div>
                <div class="cell-muted">${numeroMoeda(pagamento.assinaturaApp) > 0 ?`App: R$ ${escapar(pagamento.assinaturaApp)} | Total pago: R$ ${escapar(pagamento.valorTotal || '0,00')}` : 'Plano'}</div>
            </td>
            <td data-label="Pagamento">${escapar(pagamento.formaPagamento || '-')}</td>
            <td data-label="Vencimento">${escapar(formatarDataHoraCurta(pagamento.vencimentoNovo))}</td>
            <td data-label="Status">
                ${pagamento.excluidoEm ?'<span class="badge red">Removido</span>' : '<span class="badge green">Válido</span>'}
                ${pagamento.excluidoEm ?`<div class="cell-muted">${escapar(formatarDataHoraCurta(pagamento.excluidoEm))}</div>` : ''}
            </td>
            <td data-label="Ações">
                <a class="button secondary icon-only" href="/clientes/${escapar(pagamento.clienteId)}/editar#renovar" title="Abrir cliente">${icon('edit')}</a>
            </td>
        </tr>`).join('')
        : '<tr><td colspan="8" class="empty">Nenhum pagamento encontrado.</td></tr>';

    return `<section class="page-title">
        <h1>Financeiro</h1>
        <div class="subtitle">Pagamentos recebidos, removidos e conferência da receita</div>
    </section>

    <section class="metrics">
        ${metricCard({ label: 'Recebido válido', valor: formatarMoeda(resumo.totalValido), nota: `${resumo.validos} pagamento(s)`, tipo: 'green', icone: 'financeiro' })}
        ${metricCard({ label: 'Removido', valor: formatarMoeda(resumo.totalRemovido), nota: `${resumo.removidos} pagamento(s)`, tipo: 'red', icone: 'trash' })}
        ${metricCard({ label: 'Registros', valor: resumo.totalRegistros, nota: 'No filtro atual', tipo: 'info', icone: 'info' })}
        ${metricCard({ label: 'Inadimplentes', valor: inadimplentes.quantidade, nota: formatarMoeda(inadimplentes.valorMensal), tipo: 'orange', icone: 'alert' })}
    </section>

    <section class="clients-panel">
        <div class="panel-head"><div><h2 class="panel-title">Conferência manual</h2><div class="subtitle">Comprovantes PayPal, confirmação auditada e estornos.</div></div>
        <a class="button secondary" href="/pagamentos-manuais">Abrir pagamentos pendentes</a></div>
    </section>

    <section class="finance-breakdown-grid">
        ${financeiroBreakdownCard({
            titulo: 'Por forma de pagamento',
            nota: 'Somente pagamentos válidos no filtro atual',
            itens: porPagamento,
            icone: 'financeiro'
        })}
        ${financeiroBreakdownCard({
            titulo: 'Por plano',
            nota: 'Somente pagamentos válidos no filtro atual',
            itens: porPlano,
            icone: 'planos'
        })}
    </section>

    <form class="clients-toolbar" method="get" action="/financeiro">
        <input type="hidden" name="porPagina" value="${escapar(filtros.porPagina || FINANCEIRO_POR_PAGINA)}">
        <div class="clients-search">
            ${icon('search')}
            <input name="busca" value="${escapar(filtros.busca || '')}" placeholder="Buscar por cliente, telefone, plano ou pagamento...">
        </div>
        <input type="month" name="mes" value="${escapar(filtros.mes || '')}" onchange="this.form.submit()">
        <input type="date" name="dataInicio" value="${escapar(filtros.dataInicio || '')}" title="Data inicial">
        <input type="date" name="dataFim" value="${escapar(filtros.dataFim || '')}" title="Data final">
        <select name="status" onchange="this.form.submit()">
            ${[
                ['validos', 'Válidos'],
                ['removidos', 'Removidos'],
                ['todos', 'Todos']
            ].map(([valor, texto]) => `<option value="${valor}" ${valor === filtros.status ?'selected' : ''}>${texto}</option>`).join('')}
        </select>
        <button class="button secondary" type="submit">${icon('search')} Filtrar</button>
        <a class="button secondary" href="${escapar(urlExportar)}">${icon('planos')} Exportar CSV</a>
    </form>

    ${painelInadimplentesFinanceiro(inadimplentes)}

    <section class="clients-panel">
        <table class="clients-table">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Plano</th>
                    <th>Valor</th>
                    <th>Pagamento</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
        ${paginacao({
            base: '/financeiro',
            params: filtros,
            pagina: paginacaoFinanceiro.pagina,
            totalPaginas: paginacaoFinanceiro.totalPaginas,
            total: paginacaoFinanceiro.total,
            porPagina: paginacaoFinanceiro.porPagina
        })}
    </section>`;
}

function planoCard(plano) {
    return `<article class="device-card">
        <span class="device-icon">${icon('planos')}</span>
        <div>
            <div class="device-name">${escapar(plano.nome)}</div>
            <div class="helper">${escapar(plano.dias)} dias${plano.valor ?` - R$ ${escapar(plano.valor)}` : ''}</div>
        </div>
        <div class="model-actions">
            <a class="button secondary icon-only" href="/planos/${plano.id}/editar" title="Editar plano">${icon('edit')}</a>
            <form method="post" action="/planos/${plano.id}/excluir" onsubmit="return confirm('Excluir este tipo de plano?');">
                <button class="button secondary icon-only" type="submit" title="Excluir plano">${icon('trash')}</button>
            </form>
        </div>
    </article>`;
}

function telaPlanos(planos) {
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Tipos de Plano</h1>
                <div class="subtitle">${planos.length} tipos de plano cadastrados</div>
            </div>
            <a class="button" href="/planos/novo">${icon('plus')} Novo Plano</a>
        </div>
    </section>
    <section class="device-grid">
        ${planos.length ?planos.map(planoCard).join('') : '<div class="empty">Nenhum tipo de plano cadastrado.</div>'}
    </section>`;
}

function formularioPlano(plano = {}) {
    return `<section class="page-title">
        <h1>${plano.id ?'Editar Tipo de Plano' : 'Novo Tipo de Plano'}</h1>
        <div class="subtitle">Exemplo: Mensal com 30 dias de duração</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/planos/salvar">
            ${plano.id ?`<input type="hidden" name="id" value="${escapar(plano.id)}">` : ''}
            ${campo({ nome: 'nome', label: 'Nome do plano', valor: plano.nome })}
            ${campo({ nome: 'dias', label: 'Quantidade de dias', valor: plano.dias, tipo: 'number' })}
            ${campo({ nome: 'valor', label: 'Valor opcional', valor: plano.valor })}
            ${campo({
                nome: 'ativo',
                label: 'Status',
                valor: String(plano.ativo ?? 1),
                opcoes: [
                    { valor: '1', texto: 'Ativo' },
                    { valor: '0', texto: 'Inativo' }
                ]
            })}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar plano</button>
                <a class="button secondary" href="/planos">Cancelar</a>
            </div>
        </form>
    </section>`;
}

function variaveisDisponiveis(clicavel = false) {
    const variaveis = [
        ['{{nome}}', 'Primeiro nome do cliente'],
        ['{{plano}}', 'Tipo do plano'],
        ['{{vencimento}}', 'Data de vencimento'],
        ['{{dias}}', 'Dias restantes ou vencidos'],
        ['{{valor}}', 'Valor do plano'],
        ['{{planos}}', 'Lista de planos e valores; usada no modelo de teste grátis encerrado'],
        ['{{telefoneWhatsApp}}', 'WhatsApp da instalação usado em campanhas']
    ];

    return `<section class="panel" style="margin-bottom: 24px;">
        <div class="vars">
            <strong style="display:inline-flex;align-items:center;gap:8px;">${icon('info')} Variáveis disponíveis</strong>
            ${variaveis.map(([token, descricao]) => {
                const tokenHtml = clicavel
                    ? `<button class="var-token" type="button" data-variable-token="${escapar(token)}" title="Inserir ${escapar(token)} no texto">${escapar(token)}</button>`
                    : `<span class="var-token">${escapar(token)}</span>`;
                return `<span>${tokenHtml} <span class="helper">- ${escapar(descricao)}</span></span>`;
            }).join('')}
        </div>
    </section>`;
}

function chipPlano(modelo) {
    const label = modelo.plano === 'padrao'
        ? 'Padrão (todos os planos)'
        : modelo.plano === 'campanha'
            ? 'Campanha'
            : modelo.plano === 'teste_expirado'
                ? 'Teste grátis encerrado'
                : modelo.plano;
    return `<span class="chip ${escapar(modelo.cor || 'blue')}">${escapar(label)}</span>`;
}

function cardModelo(modelo) {
    return `<article class="model-card">
        <div class="model-top">
            <div>
                ${chipPlano(modelo)}
                <h2 class="panel-title" style="margin-top:12px;">${escapar(modelo.titulo)}</h2>
            </div>
            <div class="model-actions">
                <a class="button secondary icon-only" href="/modelos/${modelo.id}/editar" title="Editar modelo">${icon('edit')}</a>
                <form method="post" action="/modelos/${modelo.id}/excluir" onsubmit="return confirm('Excluir este modelo?');">
                    <button class="button secondary icon-only" type="submit" title="Excluir modelo">${icon('trash')}</button>
                </form>
            </div>
        </div>
        <div class="model-preview">${escapar(modelo.texto)}</div>
    </article>`;
}

function telaModelos({ modelos, config }) {
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Modelos de Mensagem</h1>
                <div class="subtitle">Configure textos personalizados por tipo de plano para envio via WhatsApp</div>
            </div>
            <a class="button" href="/modelos/novo">${icon('plus')} Novo Modelo</a>
        </div>
    </section>
    ${variaveisDisponiveis()}
    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Marca do Painel</h2>
                <div class="subtitle">Nome exibido no topo e logo opcional</div>
            </div>
        </div>
        <form method="post" action="/configuracoes/logo" enctype="multipart/form-data">
            <div class="logo-preview">
                <label class="logo-click" title="Clique para trocar a logo">
                    <button type="button" onclick="this.parentElement.querySelector('input[type=file]').click()">
                        ${config.logoUrl ?`<img class="brand-logo" src="${escapar(config.logoUrl)}" alt="Logo atual">` : `<span class="brand-icon">${icon('image')}</span>`}
                    </button>
                    <span class="helper">Clique na logo para substituir</span>
                    <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onchange="this.form.submit()">
                </label>
            </div>
        </form>
        <form class="logo-config" method="post" action="/configuracoes/painel">
            ${campo({ nome: 'nomeSistema', label: 'Nome do sistema', valor: config.nomeSistema || 'Controle de Cliente IPTV e P2P' })}
            ${campo({ nome: 'logoUrl', label: 'URL ou caminho do logo', valor: config.logoUrl || '', tipo: 'text' })}
            <button class="button" type="submit">${icon('image')} Salvar marca</button>
        </form>
        <form class="logo-config" method="post" action="/configuracoes/logo" enctype="multipart/form-data" style="padding-top:0;">
            <label class="logo-upload">
                Escolher logo no computador
                <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onchange="this.form.submit()">
                <span class="button secondary" style="margin-top:7px;">${icon('image')} Procurar logo</span>
            </label>
        </form>
    </section>
    <section class="model-grid">
        ${modelos.length ?modelos.map(cardModelo).join('') : '<div class="empty">Nenhum modelo cadastrado.</div>'}
    </section>`;
}

function formularioModelo(modelo = {}) {
    return `<section class="page-title">
        <h1>${modelo.id ?'Editar Modelo' : 'Novo Modelo'}</h1>
        <div class="subtitle">Use variáveis para personalizar cada mensagem enviada</div>
    </section>
    ${variaveisDisponiveis(true)}
    <section class="panel">
        <form class="fields" method="post" action="/modelos/salvar">
            ${modelo.id ?`<input type="hidden" name="id" value="${escapar(modelo.id)}">` : ''}
            ${campo({ nome: 'titulo', label: 'Título', valor: modelo.titulo })}
            ${campo({
                nome: 'plano',
                label: 'Plano',
                valor: modelo.plano || 'padrao',
                opcoes: [
                    { valor: 'padrao', texto: 'Padrão (todos os planos)' },
                    { valor: 'teste_expirado', texto: 'Teste grátis encerrado' },
                    { valor: 'campanha', texto: 'Campanha' },
                    { valor: 'mensal', texto: 'Mensal' },
                    { valor: 'trimestral', texto: 'Trimestral' },
                    { valor: 'semestral', texto: 'Semestral' },
                    { valor: 'anual', texto: 'Anual' },
                    { valor: 'aniversario', texto: 'Aniversário' },
                    { valor: 'cobranca', texto: 'Cobrança' }
                ]
            })}
            ${campo({
                nome: 'cor',
                label: 'Cor da etiqueta',
                valor: modelo.cor || 'blue',
                opcoes: [
                    { valor: 'blue', texto: 'Azul' },
                    { valor: 'green', texto: 'Verde' },
                    { valor: 'orange', texto: 'Laranja' },
                    { valor: 'purple', texto: 'Roxo' },
                    { valor: 'red', texto: 'Vermelho' }
                ]
            })}
            ${campo({
                nome: 'ativo',
                label: 'Status',
                valor: String(modelo.ativo ?? 1),
                opcoes: [
                    { valor: '1', texto: 'Ativo' },
                    { valor: '0', texto: 'Inativo' }
                ]
            })}
            ${editorMensagemModelo(modelo.texto)}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar modelo</button>
                <a class="button secondary" href="/modelos">Cancelar</a>
            </div>
        </form>
    </section>`;
}

function appRow(app) {
    return `<div class="catalog-row">
        <span class="catalog-icon">${icon('apps')}</span>
        <div>
            <div class="catalog-name">${escapar(app.nome)}</div>
            <div class="catalog-desc">${escapar(app.descricao || '')}</div>
        </div>
        <div class="model-actions">
            <a class="button secondary icon-only" href="/apps/${app.id}/editar" title="Editar app">${icon('edit')}</a>
            <form method="post" action="/apps/${app.id}/excluir" onsubmit="return confirm('Excluir este app?');">
                <button class="button secondary icon-only" type="submit" title="Excluir app">${icon('trash')}</button>
            </form>
        </div>
    </div>`;
}

function telaApps(apps, paginacaoApps = null) {
    const appsVisiveis = paginacaoApps?.itens || apps;
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Aplicativos</h1>
                <div class="subtitle">${paginacaoApps?.total ?? apps.length} app(s) cadastrados para clientes</div>
            </div>
            <a class="button" href="/apps/novo">${icon('plus')} Novo App</a>
        </div>
    </section>
    <section class="panel catalog-panel">
        ${appsVisiveis.length ?appsVisiveis.map(appRow).join('') : '<div class="empty">Nenhum app cadastrado.</div>'}
        ${paginacaoApps ?paginacao({
            base: '/apps',
            params: { porPagina: paginacaoApps.porPagina },
            pagina: paginacaoApps.pagina,
            totalPaginas: paginacaoApps.totalPaginas,
            total: paginacaoApps.total,
            porPagina: paginacaoApps.porPagina
        }) : ''}
    </section>`;
}

function formularioApp(app = {}) {
    return `<section class="page-title">
        <h1>${app.id ?'Editar App' : 'Novo App'}</h1>
        <div class="subtitle">Informe o app e onde ele pode ser usado</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/apps/salvar">
            ${app.id ?`<input type="hidden" name="id" value="${escapar(app.id)}">` : ''}
            ${campo({ nome: 'nome', label: 'Nome do app', valor: app.nome })}
            ${campo({
                nome: 'ativo',
                label: 'Status',
                valor: String(app.ativo ?? 1),
                opcoes: [
                    { valor: '1', texto: 'Ativo' },
                    { valor: '0', texto: 'Inativo' }
                ]
            })}
            ${areaTexto({ nome: 'descricao', label: 'Descrição / painéis e dispositivos compatíveis', valor: app.descricao })}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar app</button>
                <a class="button secondary" href="/apps">Cancelar</a>
            </div>
        </form>
    </section>`;
}

function deviceCard(dispositivo) {
    return `<article class="device-card">
        <span class="device-icon">${icon('apps')}</span>
        <div class="device-name">${escapar(dispositivo.nome)}</div>
        <div class="model-actions">
            <a class="button secondary icon-only" href="/dispositivos/${dispositivo.id}/editar" title="Editar dispositivo">${icon('edit')}</a>
            <form method="post" action="/dispositivos/${dispositivo.id}/excluir" onsubmit="return confirm('Excluir este dispositivo?');">
                <button class="button secondary icon-only" type="submit" title="Excluir dispositivo">${icon('trash')}</button>
            </form>
        </div>
    </article>`;
}

function telaDispositivos(dispositivos, paginacaoDispositivos = null) {
    const dispositivosVisiveis = paginacaoDispositivos?.itens || dispositivos;
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Dispositivos</h1>
                <div class="subtitle">${paginacaoDispositivos?.total ?? dispositivos.length} dispositivos cadastrados</div>
            </div>
            <a class="button" href="/dispositivos/novo">${icon('plus')} Novo Dispositivo</a>
        </div>
    </section>
    <section class="device-grid">
        ${dispositivosVisiveis.length ?dispositivosVisiveis.map(deviceCard).join('') : '<div class="empty">Nenhum dispositivo cadastrado.</div>'}
    </section>
    ${paginacaoDispositivos ?paginacao({
        base: '/dispositivos',
        params: { porPagina: paginacaoDispositivos.porPagina },
        pagina: paginacaoDispositivos.pagina,
        totalPaginas: paginacaoDispositivos.totalPaginas,
        total: paginacaoDispositivos.total,
        porPagina: paginacaoDispositivos.porPagina
    }) : ''}`;
}

function formularioDispositivo(dispositivo = {}) {
    return `<section class="page-title">
        <h1>${dispositivo.id ?'Editar Dispositivo' : 'Novo Dispositivo'}</h1>
        <div class="subtitle">Cadastre os aparelhos usados pelos clientes</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/dispositivos/salvar">
            ${dispositivo.id ?`<input type="hidden" name="id" value="${escapar(dispositivo.id)}">` : ''}
            ${campo({ nome: 'nome', label: 'Nome do dispositivo', valor: dispositivo.nome })}
            ${campo({
                nome: 'ativo',
                label: 'Status',
                valor: String(dispositivo.ativo ?? 1),
                opcoes: [
                    { valor: '1', texto: 'Ativo' },
                    { valor: '0', texto: 'Inativo' }
                ]
            })}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar dispositivo</button>
                <a class="button secondary" href="/dispositivos">Cancelar</a>
            </div>
        </form>
    </section>`;
}

function panelCard(painel) {
    return `<article class="device-card">
        <span class="device-icon">${icon('paineis')}</span>
        <div>
            <div class="device-name">${escapar(painel.nome)}</div>
            <div class="subtitle">${painel.renovacaoAutomatica ?'Renovação automática ativa' : 'Renovação automática desligada'}${painel.apiUrl ?` · ${escapar(painel.tipoIntegracao || 'REST JSON')}` : ' · API não configurada'}</div>
        </div>
        <div class="model-actions">
            <a class="button secondary icon-only" href="/paineis/${painel.id}/editar" title="Editar painel">${icon('edit')}</a>
            <form method="post" action="/paineis/${painel.id}/excluir" onsubmit="return confirm('Excluir este painel?');">
                <button class="button secondary icon-only" type="submit" title="Excluir painel">${icon('trash')}</button>
            </form>
        </div>
    </article>`;
}

function telaPaineis(paineis, paginacaoPaineis = null) {
    const paineisVisiveis = paginacaoPaineis?.itens || paineis;
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Painéis</h1>
                <div class="subtitle">${paginacaoPaineis?.total ?? paineis.length} painéis cadastrados</div>
            </div>
            <a class="button" href="/paineis/novo">${icon('plus')} Novo Painel</a>
        </div>
    </section>
    <section class="device-grid">
        ${paineisVisiveis.length ?paineisVisiveis.map(panelCard).join('') : '<div class="empty">Nenhum painel cadastrado.</div>'}
    </section>
    ${paginacaoPaineis ?paginacao({
        base: '/paineis',
        params: { porPagina: paginacaoPaineis.porPagina },
        pagina: paginacaoPaineis.pagina,
        totalPaginas: paginacaoPaineis.totalPaginas,
        total: paginacaoPaineis.total,
        porPagina: paginacaoPaineis.porPagina
    }) : ''}`;
}

function formatarUptime(segundos = 0) {
    const total = Number(segundos || 0);
    const dias = Math.floor(total / 86400);
    const horas = Math.floor((total % 86400) / 3600);
    const minutos = Math.floor((total % 3600) / 60);

    if (dias) return `${dias}d ${horas}h ${minutos}min`;
    if (horas) return `${horas}h ${minutos}min`;
    return `${minutos}min`;
}

function painelSaudeRobo(status = {}) {
    const whatsapp = status.whatsapp || {};
    const saudeRobo = status.saudeRobo || {};
    const fila = status.filaMensagens || {};
    const filaPersistente = fila.persistente || {};
    const risco = status.riscoWhatsApp || {};
    const verificacaoSaude = status.verificacaoSaudeWhatsApp || {};
    const recuperacaoWhatsApp = status.recuperacaoWhatsApp || {};
    const atendimentosHumanos = status.atendimentosHumanos || [];
    const numeroRoboConfigurado = obterNumeroWhatsappRoboConfigurado();
    const numeroRoboExibido = numeroRoboConfigurado || normalizarNumeroWhatsappRobo(saudeRobo.numeroConectado || '') || '';
    const classeRisco = risco.nivel === 'alto' ? 'red' : risco.nivel === 'atenção' ? 'orange' : 'green';
    const pausas = atendimentosHumanos.length
        ? atendimentosHumanos.slice(0, 6).map(item => `<div class="note-item">
            <strong>${escapar(item.nome || item.telefone)}</strong>
            <span>${escapar(item.telefone)} &middot; pausado até ${escapar(formatarDataHoraCurta(item.pausaAte))}${item.expirada ?' &middot; pausa expirada' : ''}</span>
        </div>`).join('')
        : '<div class="empty">Nenhum atendimento manual pausado agora.</div>';

    return `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Saúde do robô</h2>
                <div class="subtitle">Sinais rápidos para saber se o atendimento automático está recebendo e respondendo mensagens</div>
            </div>
            <div class="actions">
                <a class="button secondary" href="/qr">${icon('whats')} WhatsApp</a>
                <form method="post" action="/manutencao/whatsapp/reconectar" onsubmit="return confirm('O sistema vai tentar reconectar o WhatsApp usando a sessão atual. Nenhum QR Code, banco, configuração ou conversa será apagado. Continuar?')">
                    <button class="button secondary" type="submit">${icon('refresh')} Corrigir conexão</button>
                </form>
                <form method="post" action="/manutencao/whatsapp/novo-qr" onsubmit="return confirm('Isso vai encerrar a sessão atual do WhatsApp e gerar um novo QR Code. Os clientes, licença e configurações serão mantidos. Continuar?')">
                    <button class="button secondary" type="submit">${icon('refresh')} Gerar novo QR Code</button>
                </form>
            </div>
        </div>
        <table>
            <tbody>
                <tr><td><strong>WhatsApp</strong></td><td>${whatsapp.conectado ?'Conectado' : 'Desconectado'}${saudeRobo.numeroConectado ?` em ${escapar(saudeRobo.numeroConectado)}` : ''}</td></tr>
                <tr><td><strong>Risco do WhatsApp</strong></td><td><span class="badge ${classeRisco}">${escapar(risco.nivel || 'baixo')}</span> ${escapar(risco.recomendacao || 'Operação normal.')}</td></tr>
                <tr><td><strong>Diagnóstico da sessão</strong></td><td>${verificacaoSaude.verificadoEm ?`${verificacaoSaude.ok ?'Saudável' : 'Atenção'} (${escapar(verificacaoSaude.estado || '-')}) em ${escapar(formatarDataHoraCurta(verificacaoSaude.verificadoEm))}${verificacaoSaude.erro ?` &middot; ${escapar(verificacaoSaude.erro)}` : ''}` : 'Ainda não verificado pelo monitor'}</td></tr>
                <tr><td><strong>Recuperação automática</strong></td><td>${recuperacaoWhatsApp.iniciadoEm ?`${escapar(recuperacaoWhatsApp.tipo || '-')}: ${escapar(recuperacaoWhatsApp.status || '-')}, ${escapar(formatarDataHoraCurta(recuperacaoWhatsApp.iniciadoEm))}${recuperacaoWhatsApp.motivo ?` &middot; ${escapar(recuperacaoWhatsApp.motivo)}` : ''}${recuperacaoWhatsApp.erro ?` &middot; erro: ${escapar(recuperacaoWhatsApp.erro)}` : ''}` : 'Nenhuma recuperação automática executada'}</td></tr>
                <tr><td><strong>Fila de mensagens</strong></td><td>${escapar(fila.pendentes || 0)} em memória &middot; ${escapar(filaPersistente.pendentes || 0)} aguardando retomada &middot; ${escapar(filaPersistente.incertos || 0)} exige(m) revisão &middot; ${escapar(filaPersistente.falhas || 0)} falha(s)${fila.ultimoEnvioEm ?`, último envio ${escapar(formatarDataHoraCurta(fila.ultimoEnvioEm))}` : ''}${fila.ultimoErro ?` &middot; erro: ${escapar(fila.ultimoErro)}` : ''}</td></tr>
                <tr><td><strong>Última mensagem recebida</strong></td><td>${saudeRobo.ultimaMensagemRecebidaEm ?`${escapar(formatarDataHoraCurta(saudeRobo.ultimaMensagemRecebidaEm))}${saudeRobo.ultimaMensagemRecebidaDe ?` de ${escapar(saudeRobo.ultimaMensagemRecebidaDe)}` : ''}` : 'Nenhuma desde o último início'}</td></tr>
                <tr><td><strong>Última resposta do robô</strong></td><td>${saudeRobo.ultimoEnvioRoboEm ?`${escapar(formatarDataHoraCurta(saudeRobo.ultimoEnvioRoboEm))}${saudeRobo.ultimoEnvioRoboPara ?` para ${escapar(saudeRobo.ultimoEnvioRoboPara)}` : ''}` : 'Nenhuma desde o último início'}</td></tr>
                <tr><td><strong>Mensagens recebidas</strong></td><td>${escapar(saudeRobo.mensagensRecebidasTotal || 0)} desde o último início</td></tr>
                <tr><td><strong>Eventos ignorados</strong></td><td>${escapar(saudeRobo.eventosIgnoradosTotal || 0)} (${escapar(saudeRobo.eventosInternosIgnoradosTotal || 0)} internos, ${escapar(saudeRobo.conversasNaoIndividuaisIgnoradasTotal || 0)} grupos/newsletters)</td></tr>
                <tr><td><strong>Memória do processo</strong></td><td>${escapar(status.memoria?.rssFormatado || '-')} em uso, heap ${escapar(status.memoria?.heapUsadoFormatado || '-')} de ${escapar(status.memoria?.heapTotalFormatado || '-')}</td></tr>
            </tbody>
        </table>
        ${!instalacaoAdministrador() ?`<div style="padding:18px 20px 0;border-top:1px solid #eef2f7;">
            <form method="post" action="/manutencao/whatsapp/numero" onsubmit="return confirm('Ao trocar o número, a sessão atual será encerrada e um novo QR Code será gerado. Continuar?')" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;align-items:end;">
                <label style="display:grid;gap:6px;font-weight:700;">WhatsApp do robô
                    <input type="text" name="numeroWhatsappRobo" value="${escapar(numeroRoboExibido)}" placeholder="5511999999999" inputmode="numeric" required>
                </label>
                <div class="subtitle" style="align-self:center;">Use DDI + DDD + número. Exemplo: 5511999999999. Ao salvar, o sistema abre um novo QR Code.</div>
                <button class="button primary" type="submit">${icon('refresh')} Salvar número e gerar QR Code</button>
            </form>
        </div>` : ''}
        ${risco.pontos?.length ?`<div class="notice" style="margin:16px 20px 0;">${risco.pontos.map(escapar).join(' ')}</div>` : ''}
        <div style="padding:18px 20px 20px;">
            <h3 style="margin:0 0 10px;">Atendimentos humanos pausados</h3>
            ${pausas}
        </div>
    </section>`;
}

function resumoImportacaoClientes(importacao = {}) {
    if (!importacao.preview) return '';

    const preview = importacao.preview;
    const token = importacao.token || '';
    const itens = preview.itens || [];
    const amostra = itens.slice(0, 12);
    const validos = Number(preview.criar || 0) + Number(preview.atualizar || 0);
    const podeConfirmar = validos > 0;
    const avisoConfirmacao = podeConfirmar
        ? `<div class="notice" style="border-color:#fde68a;background:#fffbeb;color:#92400e;">Atenção: nesta etapa os clientes ainda não foram gravados. Clique em Confirmar importação para salvar ${validos} cliente(s) válido(s) no sistema.${preview.ignorar ?` ${preview.ignorar} linha(s) com erro serão ignoradas.` : ''}</div>`
        : '';

    return `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Pré-visualização da importação</h2>
                <div class="subtitle">${preview.total} linha(s): ${preview.criar} criar, ${preview.atualizar} atualizar, ${preview.ignorar} ignorar</div>
            </div>
            ${podeConfirmar ?`<form method="post" action="/manutencao/importar-clientes/confirmar" onsubmit="return confirm('Confirmar importação?Um backup automático será criado antes de gravar.');">
                <input type="hidden" name="token" value="${escapar(token)}">
                <button class="button green" type="submit">${icon('check')} Confirmar importação</button>
            </form>` : ''}
        </div>
        ${preview.ignorar ?'<div class="notice">Existem linhas com erro. Você pode confirmar para importar somente os clientes válidos ou corrigir o CSV e validar novamente.</div>' : '<div class="notice">Tudo certo para importar. O sistema criará um backup antes de gravar.</div>'}
        ${avisoConfirmacao}
        <table>
            <thead>
                <tr>
                    <th>Linha</th>
                    <th>Ação</th>
                    <th>Cliente</th>
                    <th>WhatsApp</th>
                    <th>Plano</th>
                    <th>Mensagens</th>
                </tr>
            </thead>
            <tbody>
                ${amostra.map(item => `<tr>
                    <td>${escapar(item.linha)}</td>
                    <td><span class="badge ${item.acao === 'ignorar' ?'red' : item.acao === 'atualizar' ?'orange' : 'green'}">${escapar(item.acao)}</span></td>
                    <td>${escapar(item.dados.nome || '-')}</td>
                    <td>${escapar(item.dados.telefone || '-')}</td>
                    <td>${escapar(item.dados.plano || '-')}</td>
                    <td>${escapar([...(item.erros || []), ...(item.avisos || [])].join(' | ') || '-')}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        ${itens.length > amostra.length ?`<div class="subtitle" style="padding:12px 0 0;">Mostrando ${amostra.length} de ${itens.length} linha(s).</div>` : ''}
    </section>`;
}

function telaSimuladorRobo({ nome = 'Cliente Teste', intencao = 'menu', resultado = null } = {}) {
    const cenarios = {
        menu: [
            ['Cliente', 'oi'],
            ['Robô', 'Boas-vindas com opções: cliente, teste grátis ou planos.']
        ],
        teste: [
            ['Cliente', 'quero teste'],
            ['Robô', 'Pergunta o nome e depois o dispositivo.'],
            ['Cliente', 'Amanda'],
            ['Robô', 'Mostra opções de Smart TV, TV Box, Android, iPhone ou computador.']
        ],
        pix: [
            ['Cliente', 'me manda o pix'],
            ['Robô', 'Identifica intenção de pagamento e direciona para planos/renovação.']
        ],
        suporte: [
            ['Cliente', 'não está funcionando'],
            ['Robô', 'Pausa o atendimento automático e orienta aguardar um atendente.']
        ],
        renovacao: [
            ['Cliente', 'quero renovar'],
            ['Robô', 'Inicia renovação e pede o usuário do painel para localizar o cadastro.']
        ]
    };
    const passos = resultado || cenarios[intencao] || cenarios.menu;

    return `<section class="page-title">
        <h1>Simular conversa do robô</h1>
        <div class="subtitle">Demonstração interna: nada é enviado pelo WhatsApp.</div>
    </section>
    <section class="panel" style="margin-bottom:24px;">
        <form class="fields" method="post" action="/manutencao/simular-robo">
            ${campo({ nome: 'nome', label: 'Nome do cliente teste', valor: nome, attrs: 'placeholder="Ex: Amanda"' })}
            <label>Fluxo
                <select name="intencao">
                    ${[
                        ['menu', 'Boas-vindas'],
                        ['teste', 'Teste grátis'],
                        ['pix', 'Pedido de PIX'],
                        ['suporte', 'Problema/suporte'],
                        ['renovacao', 'Renovação']
                    ].map(([valor, texto]) => `<option value="${valor}" ${intencao === valor ?'selected' : ''}>${texto}</option>`).join('')}
                </select>
            </label>
            <div class="actions full">
                <button class="button" type="submit">${icon('refresh')} Simular conversa</button>
                <a class="button secondary" href="/manutencao">Voltar</a>
            </div>
        </form>
    </section>
    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Resultado da simulação</h2>
                <div class="subtitle">Fluxo que você pode mostrar em venda ou treinamento.</div>
            </div>
        </div>
        <div style="padding:20px;display:grid;gap:10px;">
            ${passos.map(([quem, texto]) => `<div class="note-item">
                <strong>${escapar(quem)}</strong>
                <p>${escapar(String(texto).replace('Cliente Teste', nome))}</p>
            </div>`).join('')}
        </div>
    </section>`;
}

function telaManutencao(status = {}, opcoes = {}) {
    const whatsapp = status.whatsapp || {};
    const backups = status.backups || [];
    const eventos = status.eventos || [];
    const licenca = status.licenca || {};
    const diagnostico = status.diagnostico || null;
    const saudeRobo = status.saudeRobo || {};
    const ultimoBackup = status.ultimoBackup
        ?`${status.ultimoBackup.nome} (${status.ultimoBackup.tamanhoFormatado})`
        : 'Nenhum backup gerado';
    const notaLicenca = licenca.vitalicia && licenca.status === 'ativa'
        ?'Licença vitalícia, sem data de vencimento'
        : licenca.status === 'ativa'
            ?`${licenca.diasRestantes} dia(s) restantes`
        : licenca.status === 'vencendo'
            ?`Vence em ${licenca.diasRestantes} dia(s)`
            : licenca.status === 'vencida'
                ?`Vencida há ${Math.abs(licenca.diasRestantes)} dia(s)`
                : 'Informe a licença';

    const manutencaoRestrita = manutencaoRestritaCliente();
    const podeControlarRoboLocal = instalacaoLocal();

    return `<section class="page-title">
        <h1>Manutenção</h1>
        <div class="subtitle">Status, backup e preparação para instalação comercial individual</div>
    </section>

    <section class="metrics" style="margin-bottom:24px;">
        ${metricCard({ label: 'Versão', valor: status.versao || '-', nota: status.nome || 'Sistema', tipo: 'info', icone: 'info' })}
        ${metricCard({ label: 'WhatsApp', valor: whatsapp.conectado ?'Conectado' : 'Desconectado', nota: whatsapp.status || '-', tipo: whatsapp.conectado ?'green' : 'red', icone: 'whats' })}
        ${metricCard({ label: 'Banco de dados', valor: status.bancoTamanhoFormatado || '-', nota: status.bancoExiste ?'Encontrado' : 'Não encontrado', tipo: status.bancoExiste ?'green' : 'red', icone: 'planos' })}
        ${metricCard({ label: 'Tempo online', valor: formatarUptime(status.uptimeSegundos), nota: 'Desde o último início', tipo: 'orange', icone: 'refresh' })}
    </section>

    ${painelSaudeRobo(status)}

    ${podeControlarRoboLocal ?`<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Controle do robô local</h2>
                <div class="subtitle">Reinicie ou pare somente o processo desta instalação neste computador</div>
            </div>
            <div class="actions">
                <form method="post" action="/manutencao/robo/reiniciar" onsubmit="return confirm('Reiniciar o robô desta instalação local?');">
                    <button class="button" type="submit">${icon('refresh')} Reiniciar robô</button>
                </form>
                <form method="post" action="/manutencao/robo/parar" onsubmit="return confirm('Parar o robô local? O painel ficará indisponível até o processo ser iniciado novamente.');">
                    <button class="button warning" type="submit" style="background:#ff8614;">${icon('alert')} Parar robô</button>
                </form>
            </div>
        </div>
    </section>` : ''}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Diagnóstico do sistema</h2>
                <div class="subtitle">Verifique os serviços essenciais antes de abrir um chamado de suporte</div>
            </div>
            <form method="post" action="/manutencao/diagnostico">
                <button class="button" type="submit">${icon('manutencao')} Executar diagnóstico</button>
            </form>
        </div>
        ${diagnostico?.verificacoes?.length ?`<table>
            <thead>
                <tr><th>Verificação</th><th>Resultado</th><th>Detalhes</th></tr>
            </thead>
            <tbody>
                ${diagnostico.verificacoes.map(item => `<tr>
                    <td>${escapar(item.nome)}</td>
                    <td><span class="badge ${item.status === 'ok' ?'ok' : item.status === 'atencao' ?'warn' : 'error'}">${item.status === 'ok' ?'Saudável' : item.status === 'atencao' ?'Atenção' : 'Erro'}</span></td>
                    <td>${escapar(item.mensagem)}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        <div class="notice">${escapar(diagnostico.mensagem || '')} Executado em ${escapar(formatarDataHoraCurta(diagnostico.criadoEm))}.</div>` : '<div class="empty">O diagnóstico ainda não foi executado.</div>'}
    </section>`}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Acesso ao painel</h2>
                <div class="subtitle">Salve o usuário e a senha no banco para não perder ao reiniciar o PM2</div>
            </div>
        </div>
        <form class="fields" method="post" action="/manutencao/acesso" autocomplete="off" data-form-type="other" style="padding-top:0;">
            ${campo({ nome: 'painelUsuario', label: 'Usuário do painel', valor: status.config?.painelUsuario || 'admin', attrs: 'required autocomplete="off" data-1p-ignore="true" data-bwignore="true"' })}
            ${campo({ nome: 'painelSenha', label: 'Nova senha', valor: '', tipo: 'password', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} placeholder="Deixe em branco para manter a atual"` })}
            ${campo({ nome: 'painelConfirmarSenha', label: 'Confirmar nova senha', valor: '', tipo: 'password', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} placeholder="Repita a nova senha"` })}
            ${campo({ nome: 'senhaConfirmacao', label: 'Senha atual para confirmar a alteração', valor: '', tipo: 'password', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required` })}
            <div class="notice full">Depois de alterar, faça login novamente com o novo acesso.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar acesso</button>
            </div>
        </form>
    </section>`}

    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Proteção do WhatsApp</h2>
                <div class="subtitle">Interrompe campanhas, cobranças e avisos proativos sem apagar a sessão nem impedir respostas aos clientes</div>
            </div>
            <span class="badge ${String(status.config?.whatsappProtecaoAtiva || '0') === '1' ?'red' : 'green'}">${String(status.config?.whatsappProtecaoAtiva || '0') === '1' ?'Proteção ativa' : 'Operação normal'}</span>
        </div>
        <form class="fields" method="post" action="/manutencao/whatsapp/protecao" style="padding-top:0;">
            <label class="toggle-line"><input type="checkbox" name="whatsappProtecaoAtiva" value="1" ${String(status.config?.whatsappProtecaoAtiva || '0') === '1' ?'checked' : ''}><span>Pausar todos os envios proativos</span></label>
            <label class="toggle-line"><input type="checkbox" name="whatsappBloquearNovoQrAutomatico" value="1" ${String(status.config?.whatsappBloquearNovoQrAutomatico ?? '1') === '1' ?'checked' : ''}><span>Nunca apagar a sessão para gerar QR Code automaticamente</span></label>
            ${campo({ nome: 'whatsappProtecaoMotivo', label: 'Motivo / observação', valor: status.config?.whatsappProtecaoMotivo || '', attrs: 'maxlength="240" placeholder="Ex: conta temporariamente restringida pelo WhatsApp"' })}
            <div class="notice full">Com a proteção ativa, respostas a mensagens recebidas continuam funcionando. Campanhas, modelos enviados pelo painel, avisos de vencimento, cobranças e PIX enviados junto desses avisos ficam bloqueados. Um novo QR Code continua disponível somente por ação manual.</div>
            <div class="actions full"><button class="button" type="submit">${icon('check')} Salvar proteção</button></div>
        </form>
    </section>

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Configuração do robô</h2>
                <div class="subtitle">Identidade, gatilhos, imagens e atalhos usados nas respostas automáticas desta instalação</div>
            </div>
        </div>
        <form class="fields" method="post" action="/manutencao/robo" style="padding-top:0;">
            <label>Robô responder mensagens recebidas
                <select name="roboResponderMensagensAtivo">
                    <option value="1" ${String(status.config?.roboResponderMensagensAtivo ?? '1') === '1' ?'selected' : ''}>Ligado</option>
                    <option value="0" ${String(status.config?.roboResponderMensagensAtivo ?? '1') === '0' ?'selected' : ''}>Desligado</option>
                </select>
            </label>
            <label>Robô enviar mensagens do painel e avisos automáticos
                <select name="roboEnviarMensagensPainelAtivo">
                    <option value="1" ${String(status.config?.roboEnviarMensagensPainelAtivo ?? '1') === '1' ?'selected' : ''}>Ligado</option>
                    <option value="0" ${String(status.config?.roboEnviarMensagensPainelAtivo ?? '1') === '0' ?'selected' : ''}>Desligado</option>
                </select>
            </label>
            ${campo({ nome: 'nomeEmpresaRobo', label: 'Nome da empresa nas mensagens', valor: status.config?.nomeEmpresaRobo || '', attrs: 'required placeholder="Ex: Minha IPTV"' })}
            ${campo({ nome: 'roboPalavrasChave', label: 'Palavras que iniciam o robô', valor: status.config?.roboPalavrasChave || 'oi, ola, olá, menu, Planos, planos, Plano, plano, preço, preco, teste, grátis, gratis', attrs: 'placeholder="Ex: oi, menu, Planos, plano, preço, teste"' })}
            ${campo({ nome: 'roboAtendimentoHumanoMinutos', label: 'Minutos em atendimento humano', valor: status.config?.roboAtendimentoHumanoMinutos || '30', tipo: 'number', attrs: 'min="1" max="1440" required' })}
            <label>Resposta humanizada
                <select name="roboRespostaHumanizadaAtiva">
                    <option value="1" ${String(status.config?.roboRespostaHumanizadaAtiva ?? '1') === '1' ?'selected' : ''}>Ligada</option>
                    <option value="0" ${String(status.config?.roboRespostaHumanizadaAtiva ?? '1') === '0' ?'selected' : ''}>Desligada</option>
                </select>
            </label>
            ${campo({ nome: 'roboRespostaTempoMinimoSegundos', label: 'Tempo mínimo para responder (segundos)', valor: status.config?.roboRespostaTempoMinimoSegundos || '3', tipo: 'number', attrs: 'min="0" max="60" required' })}
            ${campo({ nome: 'roboRespostaTempoMaximoSegundos', label: 'Tempo máximo para responder (segundos)', valor: status.config?.roboRespostaTempoMaximoSegundos || '8', tipo: 'number', attrs: 'min="0" max="60" required' })}
            <label>Fila de mensagens do WhatsApp
                <select name="roboFilaMensagensAtiva">
                    <option value="1" ${String(status.config?.roboFilaMensagensAtiva ?? '1') === '1' ?'selected' : ''}>Ligada</option>
                    <option value="0" ${String(status.config?.roboFilaMensagensAtiva ?? '1') === '0' ?'selected' : ''}>Desligada</option>
                </select>
            </label>
            ${campo({ nome: 'roboFilaIntervaloMinimoSegundos', label: 'Intervalo mínimo entre envios (segundos)', valor: status.config?.roboFilaIntervaloMinimoSegundos || '2', tipo: 'number', attrs: 'min="0" max="120" required' })}
            ${campo({ nome: 'roboFilaIntervaloMaximoSegundos', label: 'Intervalo máximo entre envios (segundos)', valor: status.config?.roboFilaIntervaloMaximoSegundos || '5', tipo: 'number', attrs: 'min="0" max="180" required' })}
            ${areaTexto({ nome: 'roboMensagemDesconhecida', label: 'Mensagem interna quando não houver palavra-chave', valor: status.config?.roboMensagemDesconhecida || 'Mensagem ignorada sem palavra-chave para iniciar atendimento.' })}
            <div class="notice full">Cada atividade pode ser ligada separadamente. Com as duas opções desligadas, o WhatsApp permanece conectado, mas o robô fica dormindo: não responde clientes nem envia campanhas, cobranças, avisos ou mensagens iniciadas pelo painel. A fila evita envios duplicados e deixa as respostas com ritmo mais natural.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar configuração do robô</button>
                <a class="button secondary" href="/modelos">${icon('modelos')} Editar modelos</a>
                <a class="button secondary" href="/planos">${icon('planos')} Editar planos</a>
                <a class="button secondary" href="/qr">${icon('whats')} Ver WhatsApp</a>
                <a class="button secondary" href="/manutencao/simular-robo">${icon('refresh')} Simular conversa</a>
            </div>
        </form>
        <div class="notice" style="margin:0 20px 18px;">Envie imagens leves, preferencialmente JPG ou PNG em 1080x1080 para cards e 1200x628 para banners. O envio ao WhatsApp aguarda até 30 segundos.</div>
        <div class="cards-grid" style="display:grid;gap:12px;padding:0 20px 20px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));">
            ${campoImagemRobo(status.config, 'imagemRoboMenu', 'Boas-vindas / menu')}
            ${campoImagemRobo(status.config, 'imagemRoboPlanos', 'Planos e valores')}
            ${campoImagemRobo(status.config, 'imagemRoboTeste', 'Teste grátis')}
            ${campoImagemRobo(status.config, 'imagemRoboTesteLiberado', 'Teste liberado')}
            ${campoImagemRobo(status.config, 'imagemRoboRenovacao', 'Renovação')}
            ${campoImagemRobo(status.config, 'imagemRoboAtivacao', 'Ativação')}
            ${campoImagemRobo(status.config, 'imagemRoboErro', 'Erros e opções inválidas')}
            ${campoImagemRobo(status.config, 'imagemRoboEncerramento', 'Encerramento')}
            ${campoImagemRobo(status.config, CHAVE_IMAGEM_CAMPANHA_AMIZADE, 'Campanha de indicação')}
        </div>
    </section>`}

    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Licença da instalação</h2>
                <div class="subtitle">Controle comercial da instalação individual deste cliente</div>
            </div>
            <span class="badge ${licenca.status === 'vencida' ?'red' : licenca.status === 'vencendo' ?'orange' : licenca.status === 'ativa' ?'green' : ''}">${escapar(licenca.rotulo || 'Não configurada')}</span>
        </div>
        <table><tbody>
            <tr><th>Cliente / Empresa</th><td>${escapar(licenca.cliente || '-')}</td></tr>
            <tr><th>Tipo</th><td>${escapar(licenca.rotulo || '-')}</td></tr>
            <tr><th>Ativação</th><td>${escapar(licenca.ativacao || '-')}</td></tr>
            <tr><th>Vencimento</th><td>${escapar(licenca.vitalicia ?'Sem vencimento' : licenca.vencimento || '-')}</td></tr>
            <tr><th>Instalação</th><td>${escapar(licenca.instalacaoId || '-')}</td></tr>
        </tbody></table>
        <div class="actions" style="padding:18px 20px;">
            ${instalacaoAdministrador()
                ?`<a class="button" href="/licenca">${icon('check')} Gerenciar licença</a>`
                : `<a class="button secondary" href="/licenca">${icon('check')} Ver licença</a>`}
            <span class="notice">${escapar(notaLicenca)}</span>
        </div>
    </section>

    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">PIX de recebimento</h2>
                <div class="subtitle">Dados usados para gerar o QR Code bancário enviado aos clientes</div>
            </div>
        </div>
        <form class="fields" method="post" action="/manutencao/pix" style="padding-top:0;">
            ${campo({ nome: 'pixChave', label: 'Chave PIX recebedora', valor: status.config?.pixChave || '', attrs: 'required placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"' })}
            ${campo({ nome: 'pixNome', label: 'Nome do recebedor', valor: status.config?.pixNome || '', attrs: 'required maxlength="25" placeholder="Nome que aparece no banco"' })}
            ${campo({ nome: 'pixCidade', label: 'Cidade do recebedor', valor: status.config?.pixCidade || '', attrs: 'required maxlength="15" placeholder="Cidade"' })}
            ${campo({ nome: 'pixTxid', label: 'Identificação do PIX', valor: status.config?.pixTxid || '', attrs: 'maxlength="25" placeholder="Ex: MINHAIPTV"' })}
            ${campo({ nome: 'senhaConfirmacao', label: 'Confirme sua senha atual', valor: '', tipo: 'password', attrs: 'autocomplete="current-password" required' })}
            <div class="notice full">O QR Code será gerado automaticamente com estes dados e o valor do plano enviado ao cliente.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar PIX</button>
            </div>
        </form>
    </section>

    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div><h2 class="panel-title">Confirmação automática do PIX</h2><div class="subtitle">Cada instalação escolhe seu próprio provedor; o PIX manual continua disponível</div></div>
            <span class="badge ${status.config?.pixProvedor === 'mercado_pago' ?'green' : ''}">${status.config?.pixProvedor === 'mercado_pago' ?'Mercado Pago ativo' : 'Modo manual'}</span>
        </div>
        <form class="fields" method="post" action="/manutencao/pix-provedor" style="padding-top:0;">
            <label>Provedor de confirmação<select name="pixProvedor"><option value="manual" ${status.config?.pixProvedor !== 'mercado_pago' ?'selected' : ''}>PIX manual / outro banco</option><option value="mercado_pago" ${status.config?.pixProvedor === 'mercado_pago' ?'selected' : ''}>Mercado Pago</option></select></label>
            ${campo({ nome: 'mercadoPagoAccessToken', label: 'Access Token do Mercado Pago', valor: '', tipo: 'password', attrs: `autocomplete="new-password" placeholder="${status.config?.mercadoPagoAccessToken ?'Configurado — deixe vazio para manter' : 'APP_USR-...'}"` })}
            ${campo({ nome: 'mercadoPagoWebhookSecret', label: 'Assinatura secreta do webhook (opcional)', valor: '', tipo: 'password', attrs: `autocomplete="new-password" placeholder="${status.config?.mercadoPagoWebhookSecret ?'Configurada — deixe vazio para manter' : 'Copie em Suas integrações > Webhooks'}"` })}
            ${campo({ nome: 'mercadoPagoWebhookUrl', label: 'URL HTTPS do webhook (opcional)', valor: status.config?.mercadoPagoWebhookUrl || '', tipo: 'url', attrs: 'placeholder="https://seu-dominio/webhooks/mercado-pago"' })}
            ${campo({ nome: 'mercadoPagoEmailPagador', label: 'E-mail padrão do pagador', valor: status.config?.mercadoPagoEmailPagador || '', tipo: 'email', attrs: 'placeholder="pagamentos@suaempresa.com.br"' })}
            ${campo({ nome: 'mercadoPagoWhatsappControle', label: 'WhatsApp para comprovantes de PIX e PayPal (opcional)', valor: status.config?.mercadoPagoWhatsappControle || '', tipo: 'tel', attrs: 'placeholder="5511999999999"' })}
            ${campo({ nome: 'senhaConfirmacao', label: 'Confirme sua senha atual', valor: '', tipo: 'password', attrs: 'autocomplete="current-password" required' })}
            <div class="notice full">Use DDI + DDD + número no WhatsApp de controle. Quando o PIX for aprovado, o cliente será renovado, receberá a confirmação e este número também receberá um resumo. A confirmação fica registrada em <strong>Eventos do sistema</strong>. No servidor, configure o evento <strong>Pagamentos</strong> e a URL do webhook. Em instalação local, a URL pode ficar vazia: o painel consulta as cobranças pendentes automaticamente a cada minuto.</div>
            <div class="actions full"><button class="button" type="submit">${icon('check')} Salvar provedor PIX</button></div>
        </form>
    </section>

    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div><h2 class="panel-title">Recebimento internacional com PayPal</h2><div class="subtitle">Cobra o mesmo valor do plano em reais e envia um link PayPal durante a renovação</div></div>
            <span class="badge ${String(status.config?.paypalAtivo) === '1' ?'green' : ''}">${String(status.config?.paypalAtivo) === '1' ?'PayPal ativo' : 'PayPal desligado'}</span>
        </div>
        <form class="fields" method="post" action="/manutencao/paypal" style="padding-top:0;">
            <label class="toggle-line full"><input type="checkbox" name="paypalAtivo" value="1" ${String(status.config?.paypalAtivo) === '1' ?'checked' : ''}><span>Oferecer PayPal nas renovações pelo WhatsApp</span></label>
            <label>Modo de recebimento<select name="paypalModo"><option value="manual" ${status.config?.paypalModo === 'manual' ?'selected' : ''}>Manual — conta pessoal, sem CNPJ</option><option value="api" ${status.config?.paypalModo !== 'manual' ?'selected' : ''}>Automático — API Business</option></select></label>
            ${campo({ nome: 'paypalLinkManual', label: 'Link de recebimento PayPal pessoal', valor: status.config?.paypalLinkManual || '', tipo: 'url', attrs: 'placeholder="https://paypal.me/seuusuario"' })}
            ${campo({ nome: 'paypalEmailManual', label: 'E-mail da conta PayPal pessoal', valor: status.config?.paypalEmailManual || '', tipo: 'email', attrs: 'placeholder="seuemail@exemplo.com"' })}
            <label>Ambiente<select name="paypalAmbiente"><option value="sandbox" ${status.config?.paypalAmbiente !== 'live' ?'selected' : ''}>Sandbox (testes)</option><option value="live" ${status.config?.paypalAmbiente === 'live' ?'selected' : ''}>Produção</option></select></label>
            ${campo({ nome: 'paypalClientId', label: 'Client ID do PayPal', valor: '', tipo: 'password', attrs: `autocomplete="new-password" placeholder="${status.config?.paypalClientId ?'Configurado — deixe vazio para manter' : 'Client ID da aplicação REST'}"` })}
            ${campo({ nome: 'paypalClientSecret', label: 'Client Secret do PayPal', valor: '', tipo: 'password', attrs: `autocomplete="new-password" placeholder="${status.config?.paypalClientSecret ?'Configurado — deixe vazio para manter' : 'Client Secret da aplicação REST'}"` })}
            ${campo({ nome: 'paypalRetornoUrl', label: 'URL pública desta instalação', valor: status.config?.paypalRetornoUrl || '', tipo: 'url', attrs: 'placeholder="https://amplaytv.julianplay.com.br"' })}
            ${campo({ nome: 'paypalWebhookId', label: 'Webhook ID do PayPal (recomendado)', valor: '', tipo: 'password', attrs: `autocomplete="new-password" placeholder="${status.config?.paypalWebhookId ?'Configurado — deixe vazio para manter' : 'ID do webhook cadastrado no PayPal'}"` })}
            ${campo({ nome: 'senhaConfirmacao', label: 'Confirme sua senha atual', valor: '', tipo: 'password', attrs: 'autocomplete="current-password" required' })}
            <div class="notice full"><strong>Modo manual:</strong> informe o link da sua conta pessoal. O cliente envia o comprovante e você confirma a renovação no cadastro dele. Não há webhook nem liberação automática. <strong>Modo API:</strong> exige conta Business e usa o webhook <strong>https://seu-dominio/webhooks/paypal</strong>.</div>
            <div class="actions full"><button class="button" type="submit">${icon('check')} Salvar PayPal</button></div>
        </form>
    </section>

    ${monitoramentoOperacionalPermitido() ?`<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Monitoramento comercial</h2>
                <div class="subtitle">Backup automático, retenção e alerta quando o WhatsApp ficar desconectado</div>
            </div>
        </div>
        <form class="fields" method="post" action="/manutencao/monitoramento" style="padding-top:0;">
            <label class="toggle-line">
                <input type="checkbox" name="alertaSaudeOperacionalAtivo" value="1" ${String(status.config?.alertaSaudeOperacionalAtivo ?? '1') === '1' ?'checked' : ''}>
                <span>Ativar alertas preventivos de disco e memória</span>
            </label>
            <label class="toggle-line">
                <input type="checkbox" name="backupAutomaticoAtivo" value="1" ${String(status.config?.backupAutomaticoAtivo) === '1' ?'checked' : ''}>
                <span>Ativar backup automático diário</span>
            </label>
            ${campo({ nome: 'backupAutomaticoHora', label: 'Horário do backup', valor: status.config?.backupAutomaticoHora || '03:00', tipo: 'time', attrs: 'required' })}
            ${campo({ nome: 'backupRetencaoDias', label: 'Reter backups automáticos por dias', valor: status.config?.backupRetencaoDias || '30', tipo: 'number', attrs: 'min="1" max="365" required' })}
            ${campo({ nome: 'backupRetencaoSemanas', label: 'Reter cópias semanais', valor: status.config?.backupRetencaoSemanas || '12', tipo: 'number', attrs: 'min="1" max="104" required' })}
            ${campo({ nome: 'backupRetencaoMeses', label: 'Reter cópias mensais', valor: status.config?.backupRetencaoMeses || '12', tipo: 'number', attrs: 'min="1" max="120" required' })}
            <label class="check">
                <input type="checkbox" name="backupTesteRestauracaoMensalAtivo" value="1" ${String(status.config?.backupTesteRestauracaoMensalAtivo ?? '1') === '1' ? 'checked' : ''}>
                <span>Executar exercício real de restauração mensal</span>
            </label>
            <label class="toggle-line">
                <input type="checkbox" name="backupExternoAtivo" value="1" ${String(status.config?.backupExternoAtivo) === '1' ?'checked' : ''}>
                <span>Copiar cada backup para outro disco ou compartilhamento</span>
            </label>
            ${campo({ nome: 'backupExternoPasta', label: 'Pasta externa de backup', valor: status.config?.backupExternoPasta || '', tipo: 'text', attrs: 'placeholder="C:\\BackupsJulianPlay ou \\\\servidor\\backups"' })}
            ${campo({ nome: 'backupExternoMaximo', label: 'Máximo de backups na cópia externa / Google Drive', valor: status.config?.backupExternoMaximo || '5', tipo: 'number', attrs: 'min="1" max="100" required' })}
            <label class="check full">
                <input type="checkbox" name="backupExternoForaComputador" value="1" ${String(status.config?.backupExternoForaComputador) === '1' ? 'checked' : ''}>
                <span>Confirmo que esta pasta é sincronizada ou copiada para fora deste computador</span>
            </label>
            ${campo({ nome: 'campanhaLimiteDiario', label: 'Máximo de clientes por campanha', valor: status.config?.campanhaLimiteDiario || '100', tipo: 'number', attrs: 'min="1" max="1000" required' })}
            ${campo({ nome: 'campanhaLimiteSemanalCliente', label: 'Máximo semanal por cliente', valor: status.config?.campanhaLimiteSemanalCliente || '1', tipo: 'number', attrs: 'min="1" max="20" required' })}
            ${campo({ nome: 'campanhaHoraInicio', label: 'Início do horário de campanhas', valor: status.config?.campanhaHoraInicio || '09:00', tipo: 'time', attrs: 'required' })}
            ${campo({ nome: 'campanhaHoraFim', label: 'Fim do horário de campanhas', valor: status.config?.campanhaHoraFim || '20:00', tipo: 'time', attrs: 'required' })}
            ${campo({ nome: 'campanhaPausaErroPercentual', label: 'Pausar campanha com taxa de erros (%)', valor: status.config?.campanhaPausaErroPercentual || '20', tipo: 'number', attrs: 'min="1" max="100" required' })}
            ${campo({ nome: 'campanhaPausaErroMinimo', label: 'Mínimo de tentativas antes da pausa automática', valor: status.config?.campanhaPausaErroMinimo || '5', tipo: 'number', attrs: 'min="1" max="100" required' })}
            <label class="check"><input type="checkbox" name="campanhaSomenteDiasUteis" ${status.config?.campanhaSomenteDiasUteis !== '0' ? 'checked' : ''}> Enviar campanhas somente em dias úteis</label>
            ${campo({ nome: 'alertaWhatsAppMinutos', label: 'Alertar após desconectado por minutos', valor: status.config?.alertaWhatsAppMinutos || '5', tipo: 'number', attrs: 'min="1" max="1440" required' })}
            ${campo({ nome: 'alertaWebhookUrl', label: 'Webhook HTTPS para alertas (opcional)', valor: status.config?.alertaWebhookUrl || '', tipo: 'url', attrs: 'placeholder="https://..."' })}
            ${campo({ nome: 'alertaWhatsappControle', label: 'WhatsApp de controle para alertas (opcional)', valor: status.config?.alertaWhatsappControle || '', tipo: 'tel', attrs: `${status.config?.alertaWhatsappControle ? 'autocomplete="off" data-1p-ignore="true" data-bwignore="true"' : ATRIBUTOS_CAMPO_SEMPRE_VAZIO} inputmode="numeric" placeholder="5511999999999"` })}
            ${campo({ nome: 'senhaConfirmacao', label: 'Confirme sua senha atual', valor: '', tipo: 'password', attrs: `${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required` })}
            ${campo({ nome: 'alertaDiscoAtencaoGb', label: 'Disco em atenção abaixo de (GB)', valor: status.config?.alertaDiscoAtencaoGb || '8', tipo: 'number', attrs: 'min="2" max="100" step="0.5" required' })}
            ${campo({ nome: 'alertaDiscoCriticoGb', label: 'Disco crítico abaixo de (GB)', valor: status.config?.alertaDiscoCriticoGb || '5', tipo: 'number', attrs: 'min="1" max="100" step="0.5" required' })}
            ${campo({ nome: 'alertaMemoriaAtencaoMb', label: 'Memória em atenção abaixo de (MB)', valor: status.config?.alertaMemoriaAtencaoMb || '1024', tipo: 'number', attrs: 'min="256" max="32768" required' })}
            ${campo({ nome: 'alertaMemoriaCriticaMb', label: 'Memória crítica abaixo de (MB)', valor: status.config?.alertaMemoriaCriticaMb || '512', tipo: 'number', attrs: 'min="128" max="32768" required' })}
            <div class="notice full"><strong>Situação:</strong> ${status.backupExterno?.protegidaContraPerdaDoComputador ? 'cópia fora do computador confirmada' : status.backupExterno?.volumeDiferente ? 'cópia em outro volume local; ainda falta confirmar sincronização externa' : 'sem proteção confirmada fora do computador'}. A cópia é validada novamente por SHA-256 e por abertura real do SQLite. Somente os backups mais recentes definidos acima são mantidos nesse destino; a retenção longa do disco de dados continua independente.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar monitoramento</button>
                <button class="button secondary" type="submit" formaction="/manutencao/monitoramento/testar" formmethod="post">${icon('alert')} Enviar alerta de teste</button>
            </div>
        </form>
    </section>` : ''}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Backup dos dados</h2>
                <div class="subtitle">Gere uma cópia verificada; quando o armazenamento externo estiver ativo, ele também será atualizado</div>
            </div>
            <form method="post" action="/manutencao/backup">
                <button class="button" type="submit">${icon('planos')} Gerar backup agora</button>
            </form>
            <form method="post" action="/manutencao/backups/testar-restauracao" autocomplete="off" data-form-type="other">
                <input type="password" name="senhaConfirmacao" ${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required placeholder="Senha atual">
                <button class="button secondary" type="submit">Testar restauração agora</button>
            </form>
        </div>
        <table>
            <tbody>
                <tr><th>Pasta dos dados</th><td>${escapar(status.dataDir || '-')}</td></tr>
                <tr><th>Banco atual</th><td>${escapar(status.dbPath || '-')}</td></tr>
                <tr><th>Pasta de backups</th><td>${escapar(status.backupDir || '-')}</td></tr>
                <tr><th>Último backup</th><td>${escapar(ultimoBackup)}</td></tr>
                <tr><th>Último backup recuperável</th><td>${status.ultimoBackupRecuperavel ? `${escapar(status.ultimoBackupRecuperavel.backup)} · teste aprovado em ${escapar(formatarDataHoraCurta(status.ultimoBackupRecuperavel.concluidoEm))}` : 'Nenhum exercício mensal concluído'}</td></tr>
                <tr><th>Versão do banco</th><td>${status.migracoes?.ultima ? `${escapar(status.migracoes.ultima.versao)} · ${escapar(status.migracoes.total)} migração(ões)` : 'Migração formal ainda não registrada'}</td></tr>
            </tbody>
        </table>
    </section>`}

    <section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Importar clientes CSV</h2>
                <div class="subtitle">Baixe o modelo, envie a planilha para validar e confirme somente depois da pré-visualização</div>
            </div>
            <a class="button secondary" href="/manutencao/clientes-modelo.csv">${icon('planos')} Baixar modelo CSV</a>
        </div>
        <form class="fields" method="post" action="/manutencao/importar-clientes" enctype="multipart/form-data" style="padding-top:0;">
            <label class="full">Arquivo CSV
                <input type="file" name="arquivo" accept=".csv,text/csv" required>
            </label>
            <div class="notice full">A importação atualiza clientes com o mesmo WhatsApp e cria os que ainda não existem. Antes de gravar, o sistema mostra uma prévia e cria backup automático.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('search')} Validar CSV</button>
            </div>
        </form>
    </section>

    ${resumoImportacaoClientes(opcoes.importacao)}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Backups recentes</h2>
                <div class="subtitle">${status.totalBackups || 0} backup(s) encontrado(s)</div>
            </div>
        </div>
        ${status.backupRecente ?'' : '<div class="notice" style="margin:0 20px 18px;background:#fff2dc;color:#a76100;">Atenção: não existe backup verificado nas últimas 36 horas.</div>'}
        ${backups.length ?`<table>
            <thead>
                <tr>
                    <th>Arquivo</th>
                    <th>Tamanho</th>
                    <th>Data</th>
                    ${manutencaoRestrita ?'' : '<th>Ações</th>'}
                </tr>
            </thead>
            <tbody>
                ${backups.map(backup => `<tr>
                    <td>${escapar(backup.nome)}</td>
                    <td>${escapar(backup.tamanhoFormatado)}</td>
                    <td>${escapar(formatarDataHoraCurta(backup.criadoEm.toISOString()))}</td>
                    ${manutencaoRestrita ?'' : `<td>
                        <form method="post" action="/manutencao/restaurar" autocomplete="off" data-form-type="other" onsubmit="return confirm('Restaurar este backup?O sistema criará uma cópia do banco atual antes de restaurar. Depois reinicie o PM2.');">
                            <input type="hidden" name="backup" value="${escapar(backup.nome)}">
                            <input type="password" name="senhaConfirmacao" ${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required placeholder="Senha atual" style="max-width:180px;">
                            <button class="button secondary" type="submit">${icon('refresh')} Restaurar</button>
                        </form>
                        <div class="subtitle" style="margin-top:8px;">Integridade: ${escapar(backup.integridade)} · teste: ${escapar(backup.restauracaoTeste)}${backup.hashSha256 ?` · SHA-256 ${escapar(backup.hashSha256.slice(0,12))}…`:''}</div>
                        <form method="post" action="/manutencao/backups/exportar" autocomplete="off" data-form-type="other" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                            <input type="hidden" name="backup" value="${escapar(backup.nome)}"><input type="password" name="senhaExportacao" ${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} minlength="10" required placeholder="Senha exclusiva do kit"><input type="password" name="senhaConfirmacao" ${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required placeholder="Senha atual"><button class="button secondary" type="submit">Exportar kit de recuperação</button>
                        </form>
                        <form method="post" action="/manutencao/backups/copiar" autocomplete="off" data-form-type="other" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                            <input type="hidden" name="backup" value="${escapar(backup.nome)}"><input name="pastaExterna" ${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required placeholder="D:\Backups ou unidade de rede"><input type="password" name="senhaConfirmacao" ${ATRIBUTOS_CAMPO_SEMPRE_VAZIO} required placeholder="Senha atual"><button class="button secondary" type="submit">Copiar externamente</button>
                        </form>
                    </td>`}
                </tr>`).join('')}
            </tbody>
        </table>` : '<div class="empty">Nenhum backup gerado ainda.</div>'}
    </section>`}

    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Eventos do sistema</h2>
                <div class="subtitle">Últimos PIX confirmados, backups, alertas e recuperações registrados</div>
            </div>
        </div>
        ${eventos.length ?`<table>
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Nível</th>
                    <th>Mensagem</th>
                </tr>
            </thead>
            <tbody>
                ${eventos.map(evento => `<tr>
                    <td>${escapar(formatarDataHoraCurta(evento.criadoEm))}</td>
                    <td>${escapar(evento.tipo)}</td>
                    <td><span class="badge ${evento.nivel === 'erro' ?'red' : evento.nivel === 'alerta' ?'orange' : 'green'}">${escapar(evento.nivel)}</span></td>
                    <td>${escapar(evento.mensagem)}</td>
                </tr>`).join('')}
            </tbody>
        </table>` : '<div class="empty">Nenhum evento registrado ainda.</div>'}
    </section>`;
}

function formularioPainel(painel = {}, historico = []) {
    return `<section class="page-title">
        <h1>${painel.id ?'Editar Painel' : 'Novo Painel'}</h1>
        <div class="subtitle">Cadastre os painéis usados no controle dos clientes</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/paineis/salvar">
            ${painel.id ?`<input type="hidden" name="id" value="${escapar(painel.id)}">` : ''}
            ${campo({ nome: 'nome', label: 'Nome do painel', valor: painel.nome })}
            ${campo({ nome: 'tipoIntegracao', label: 'Tipo da integração', valor: painel.tipoIntegracao || 'rest_json', opcoes: [
                { valor: 'rest_json', texto: 'API REST / JSON genérica' },
                { valor: 'p2p_rest', texto: 'Painel P2P via REST' },
                { valor: 'iptv_rest', texto: 'Painel IPTV via REST' }
            ] })}
            ${campo({ nome: 'apiUrl', label: 'Endereço exato da API', valor: painel.apiUrl || '', tipo: 'url', attrs: 'placeholder="https://painel.exemplo.com/api/renew"' })}
            ${campo({ nome: 'apiUsuario', label: 'Usuário da API (opcional)', valor: painel.apiUsuario || '' })}
            ${campo({ nome: 'apiToken', label: 'Token da API', valor: '', tipo: 'password', attrs: `autocomplete="new-password" placeholder="${painel.apiToken ?'Configurado — deixe vazio para manter' : 'Token Bearer'}"` })}
            ${campo({ nome: 'produtoPadrao', label: 'Produto correspondente', valor: painel.produtoPadrao || '', attrs: 'placeholder="Código ou nome do produto no painel"' })}
            ${campo({ nome: 'renovacaoAutomatica', label: 'Renovação automática', valor: String(painel.renovacaoAutomatica || 0), opcoes: [
                { valor: '0', texto: 'Desligada' }, { valor: '1', texto: 'Ligada após confirmação do PIX' }
            ] })}
            ${campo({ nome: 'timeoutSegundos', label: 'Tempo limite da API (segundos)', valor: painel.timeoutSegundos || 15, tipo: 'number', attrs: 'min="3" max="60"' })}
            ${campo({ nome: 'maxTentativas', label: 'Máximo de tentativas', valor: painel.maxTentativas || 5, tipo: 'number', attrs: 'min="1" max="10"' })}
            ${campo({ nome: 'senhaConfirmacao', label: 'Confirme sua senha atual', valor: '', tipo: 'password', attrs: 'autocomplete="current-password" required' })}
            ${campo({
                nome: 'ativo',
                label: 'Status',
                valor: String(painel.ativo ?? 1),
                opcoes: [
                    { valor: '1', texto: 'Ativo' },
                    { valor: '0', texto: 'Inativo' }
                ]
            })}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar painel</button>
                ${painel.id ?`<button class="button secondary" type="submit" formaction="/paineis/${painel.id}/testar">${icon('refresh')} Testar API</button>` : ''}
                <a class="button secondary" href="/paineis">Cancelar</a>
            </div>
        </form>
        <div class="notice full" style="margin:18px;">A API receberá POST JSON com ação, protocolo único, usuário do cliente, produto, plano, dias, pagamento e valor. Em falhas temporárias, a fila tentará novamente sem duplicar a renovação.</div>
    </section>
    ${painel.id ?`<section class="panel" style="margin-top:20px;"><div class="panel-head"><div><h2 class="panel-title">Histórico de renovações</h2><div class="subtitle">Protocolos e tentativas deste painel</div></div></div>
        ${historico.length ?`<table><thead><tr><th>Protocolo</th><th>Cliente</th><th>Status</th><th>Tentativas</th><th>Erro</th><th>Atualização</th><th>Ação</th></tr></thead><tbody>${historico.map(item=>`<tr><td>${escapar(item.protocolo)}</td><td>${escapar(item.clienteNome)}</td><td><span class="badge ${item.status==='concluida'?'green':item.status==='falha'?'red':'orange'}">${escapar(item.status)}</span></td><td>${escapar(item.tentativas)}</td><td>${escapar(item.erro || '-')}</td><td>${escapar(formatarDataHoraCurta(item.atualizadoEm))}</td><td>${item.status==='falha'?`<form method="post" action="/paineis/${painel.id}/renovacoes/${item.id}/tentar"><button class="button secondary" type="submit">Tentar novamente</button></form>`:'-'}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhuma solicitação registrada.</div>'}
    </section>`:''}`;
}

router.get('/clientes', async (req, res) => {
    desativarCache(res);
    const anoAtual = Number(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric'
    }).format(new Date()));
    const [clientes, receitaBase, aniversariantes, resumoSuporte, resumoComercial] = await Promise.all([
        listarClientes(),
        listarReceitaMensalFinanceira(),
        listarClientesAniversarioHoje(anoAtual),
        resumoAtendimentos(),
        resumoCrm()
    ]);
    const mensagem = req.query.mensagem || '';
    const pagina = paginaAtual(req.query.pagina);
    const porPagina = quantidadeVencimentosDashboard(req.query.porPagina);

    await renderizar(res, {
        titulo: 'Painel',
        conteudo: dashboard(clientes, pagina, porPagina, receitaBase, aniversariantes, resumoSuporte, resumoComercial),
        mensagem,
        ativo: 'painel'
    });
});

async function renderizarPaginaCampanhas(req, res) {
    desativarCache(res);
    const campanhas = await listarCampanhas(40);
    const idSelecionado = req.query.id || campanhas[0]?.id;
    const campanha = idSelecionado ? await buscarCampanha(idSelecionado) : null;
    const todosItens = campanha ? await listarItensCampanha(campanha.id, 5000) : [];
    const porPaginaClientes = quantidadePorPagina(req.query.porPaginaClientes);
    const paginacaoItensCampanha = paginarItens(todosItens, paginaAtual(req.query.paginaClientes), porPaginaClientes);
    const campanhaRetomavel = campanhaAmizadeExecucao.emAndamento ? null : await buscarCampanhaRetomavel();
    const [clientes, clientesElegiveis, config] = await Promise.all([
        listarClientes(),
        listarClientesAtivosComerciais(),
        obterConfiguracoes()
    ]);

    await renderizar(res, {
        titulo: 'Campanhas',
        conteudo: telaCampanhas({
            campanhas,
            campanha,
            itens: paginacaoItensCampanha.itens,
            itensReclamacao: todosItens,
            paginacaoItens: paginacaoItensCampanha,
            campanhaRetomavel,
            clientes,
            totalElegiveis: clientesElegiveis.filter(cliente => !clienteEhTeste(cliente) && normalizarTelefone(cliente.telefone)).length,
            config
        }),
        mensagem: req.query.mensagem || '',
        ativo: 'campanhas'
    });
}

router.get('/clientes/todos', async (req, res) => {
    desativarCache(res);
    const { busca, status, origem, tag, renovacao, porPagina } = filtrosClientesQuery(req.query);
    const pagina = paginaAtual(req.query.pagina);
    const todosClientes = await listarClientes({ busca, status, origem, tag, renovacao });
    const paginacaoClientes = paginarItens(todosClientes, pagina, porPagina || CLIENTES_POR_PAGINA);
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Clientes',
        conteudo: listaClientes({
            clientes: paginacaoClientes.itens,
            busca,
            status,
            origem,
            tag,
            renovacao,
            porPagina,
            paginacaoClientes
        }),
        mensagem,
        ativo: 'clientes'
    });
});

router.get('/atendimentos', async (req, res) => {
    desativarCache(res);
    const filtros = {
        status: String(req.query.status || 'abertos'),
        busca: String(req.query.busca || '').trim()
    };
    const [atendimentos, clientes, resumo] = await Promise.all([
        listarAtendimentos(filtros),
        listarClientes(),
        resumoAtendimentos()
    ]);

    await renderizar(res, {
        titulo: 'Atendimentos',
        conteudo: telaAtendimentos({ atendimentos, clientes, filtros, resumo }),
        mensagem: req.query.mensagem || '',
        ativo: 'atendimentos'
    });
});

router.get('/crm', async (req, res) => {
    desativarCache(res);
    const filtros = {
        status: String(req.query.status || 'ativos'),
        busca: String(req.query.busca || '').trim()
    };
    const [leads, clientes, planos, resumo, relatorio] = await Promise.all([
        listarLeads(filtros),
        listarClientes(),
        listarPlanosComerciais(),
        resumoCrm(),
        relatorioComercial()
    ]);

    await renderizar(res, {
        titulo: 'CRM',
        conteudo: telaCrm({ leads, clientes, planos, filtros, resumo, relatorio }),
        mensagem: req.query.mensagem || '',
        ativo: 'crm'
    });
});

router.get('/crm/:id/editar', async (req, res) => {
    const [lead, historico, planos] = await Promise.all([
        buscarLeadPorId(req.params.id),
        listarHistoricoLead(req.params.id),
        listarPlanosComerciais()
    ]);

    if (!lead) {
        return res.redirect('/crm?mensagem=Lead nao encontrado.');
    }

    await renderizar(res, {
        titulo: 'Editar lead',
        conteudo: telaEditarLead({ lead, historico, planos }),
        mensagem: req.query.mensagem || '',
        ativo: 'crm'
    });
});

router.post('/crm/salvar', async (req, res) => {
    try {
        const lead = await salvarLead(req.body);
        return res.redirect(`/crm/${lead.id}/editar?mensagem=${encodeURIComponent('Lead salvo com sucesso.')}`);
    } catch (err) {
        return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/crm/:id/historico', async (req, res) => {
    try {
        await adicionarHistoricoLead(req.params.id, req.body.texto || '', 'nota');
        return res.redirect(`/crm/${req.params.id}/editar?mensagem=${encodeURIComponent('Histórico atualizado.')}`);
    } catch (err) {
        return res.redirect(`/crm/${req.params.id}/editar?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/crm/:id/status', async (req, res) => {
    try {
        await atualizarStatusLead(req.params.id, req.body.status, `Status alterado para ${rotuloStatusLead(req.body.status)}.`);
        return res.redirect('/crm?mensagem=Lead atualizado.');
    } catch (err) {
        return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/crm/:id/converter', async (req, res) => {
    try {
        const lead = await vincularLeadAoCliente(req.params.id, req.body.clienteId);
        await adicionarNotaCliente(req.body.clienteId, `Lead convertido no CRM: ${lead.nome}${lead.telefone ?` (${lead.telefone})` : ''}.`);
        return res.redirect('/crm?mensagem=Lead convertido e vinculado ao cliente.');
    } catch (err) {
        return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/crm/:id/criar-cliente', async (req, res) => {
    try {
        const lead = await buscarLeadPorId(req.params.id);
        if (!lead) {
            return res.redirect('/crm?mensagem=Lead nao encontrado.');
        }

        const cliente = await salvarCliente({
            nome: lead.nome,
            telefone: lead.telefone,
            origem: lead.origem,
            plano: lead.interesse || 'Lead comercial',
            dataInicio: agoraLocalDateTime(),
            dataVencimento: '',
            observacoes: `Criado a partir do CRM.${lead.observacoes ?`\n${lead.observacoes}` : ''}`,
            tags: 'Acompanhar',
            status: lead.status === 'teste_liberado' ? 'teste' : 'pendente'
        });

        await vincularLeadAoCliente(lead.id, cliente.id);
        await adicionarNotaCliente(cliente.id, `Cliente criado a partir do lead ${lead.nome}.`);
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'Cliente criado a partir do CRM.'));
    } catch (err) {
        return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/crm/:id/excluir', async (req, res) => {
    try {
        await removerLead(req.params.id);
        return res.redirect('/crm?mensagem=Lead removido.');
    } catch (err) {
        return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/crm/:id/enviar', async (req, res) => {
    try {
        const lead = await buscarLeadPorId(req.params.id);
        if (!lead) {
            return res.redirect('/crm?mensagem=Lead nao encontrado.');
        }

        const status = getStatusWhatsApp();
        const client = getClient();

        if (!client || !status.conectado) {
            return res.redirect('/crm?mensagem=WhatsApp nao esta conectado.');
        }

        const [config, planos] = await Promise.all([
            obterConfiguracoes(),
            listarPlanosComerciais()
        ]);
        const envio = await enviarMensagemWhatsAppComFallback(
            client,
            lead.telefone,
            mensagemLeadPadrao(lead, config, planos),
            'Envio comercial para lead'
        );

        await adicionarHistoricoLead(lead.id, `Mensagem comercial enviada pelo WhatsApp para ${envio.destino}.`, 'whatsapp');
        return res.redirect('/crm?mensagem=Mensagem comercial enviada.');
    } catch (err) {
        return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/atendimentos', async (req, res) => {
    try {
        const atendimento = await criarAtendimento(req.body);
        await adicionarNotaCliente(atendimento.clienteId, `Atendimento aberto: ${rotuloMotivoAtendimento(atendimento.motivo)}${atendimento.descricao ?` - ${atendimento.descricao}` : ''}`);
        return res.redirect('/atendimentos?mensagem=Atendimento aberto com sucesso.');
    } catch (err) {
        return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/clientes/:id/atendimentos', async (req, res) => {
    try {
        const atendimento = await criarAtendimento({
            ...req.body,
            clienteId: req.params.id
        });
        await adicionarNotaCliente(atendimento.clienteId, `Atendimento aberto: ${rotuloMotivoAtendimento(atendimento.motivo)}${atendimento.descricao ?` - ${atendimento.descricao}` : ''}`);
        return res.redirect(`${montarUrlClienteMensagem(req.params.id, 'Atendimento aberto com sucesso.')}#atendimentos`);
    } catch (err) {
        return res.redirect(`${montarUrlClienteMensagem(req.params.id, err.message)}#atendimentos`);
    }
});

router.post('/atendimentos/:id/status', async (req, res) => {
    try {
        const atendimento = await atualizarStatusAtendimento(req.params.id, req.body.status);
        await adicionarNotaCliente(atendimento.clienteId, `Atendimento atualizado para ${rotuloStatusAtendimento(atendimento.status)}: ${rotuloMotivoAtendimento(atendimento.motivo)}.`);
        return res.redirect('/atendimentos?mensagem=Atendimento atualizado.');
    } catch (err) {
        return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/atendimentos/:id/excluir', async (req, res) => {
    try {
        const atendimento = await buscarAtendimentoPorId(req.params.id);
        await removerAtendimento(req.params.id);
        if (atendimento?.clienteId) {
            await adicionarNotaCliente(atendimento.clienteId, `Atendimento removido: ${rotuloMotivoAtendimento(atendimento.motivo)}.`);
        }
        return res.redirect('/atendimentos?mensagem=Atendimento removido.');
    } catch (err) {
        return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/atendimentos/:id/enviar', async (req, res) => {
    try {
        const atendimento = await buscarAtendimentoPorId(req.params.id);
        if (!atendimento) {
            return res.redirect('/atendimentos?mensagem=Atendimento nao encontrado.');
        }

        const status = getStatusWhatsApp();
        const client = getClient();

        if (!client || !status.conectado) {
            return res.redirect('/atendimentos?mensagem=WhatsApp nao esta conectado.');
        }

        const envio = await enviarMensagemWhatsAppComFallback(
            client,
            atendimento.clienteTelefone,
            mensagemAtendimentoPadrao(atendimento),
            'Envio de acompanhamento de atendimento'
        );

        await adicionarNotaCliente(atendimento.clienteId, `Acompanhamento de atendimento enviado pelo WhatsApp para ${envio.destino}.`);
        return res.redirect('/atendimentos?mensagem=Acompanhamento enviado ao cliente.');
    } catch (err) {
        return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.get('/financeiro', async (req, res) => {
    desativarCache(res);
    const filtros = filtrosFinanceiroQuery(req.query);
    const pagina = paginaAtual(req.query.pagina);
    const [pagamentos, clientes] = await Promise.all([
        listarPagamentosFinanceiro(filtros),
        listarClientes()
    ]);
    const paginacaoFinanceiro = paginarItens(pagamentos, pagina, filtros.porPagina || FINANCEIRO_POR_PAGINA);

    await renderizar(res, {
        titulo: 'Financeiro',
        conteudo: telaFinanceiro({ pagamentos, filtros, paginacaoFinanceiro, clientes }),
        mensagem: req.query.mensagem || '',
        ativo: 'financeiro'
    });
});

router.get('/financeiro/exportar.csv', async (req, res) => {
    desativarCache(res);
    const filtros = filtrosFinanceiroQuery(req.query);
    const pagamentos = await listarPagamentosFinanceiro(filtros);
    const agora = new Date();
    const carimbo = [
        agora.getFullYear(),
        String(agora.getMonth() + 1).padStart(2, '0'),
        String(agora.getDate()).padStart(2, '0'),
        '-',
        String(agora.getHours()).padStart(2, '0'),
        String(agora.getMinutes()).padStart(2, '0')
    ].join('');
    const csv = gerarCsvFinanceiro(pagamentos);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="financeiro-${carimbo}.csv"`);
    res.send(`\uFEFF${csv}`);
});

router.get('/preparacao-comercial', async (req, res) => {
    desativarCache(res);
    const mes = mesAtualInput();
    const [config, clientes, planos, apps, dispositivos, paineis, modelos, pagamentos] = await Promise.all([
        obterConfiguracoes(),
        listarClientes(),
        listarTiposPlanos(),
        listarApps(),
        listarDispositivos(),
        listarPaineis(),
        listarModelos(),
        listarPagamentosFinanceiro({ mes, status: 'validos' })
    ]);

    await renderizar(res, {
        titulo: 'Preparação comercial',
        conteudo: telaPreparacaoComercial({
            config,
            clientes,
            planos,
            apps,
            dispositivos,
            paineis,
            modelos,
            pagamentos,
            whatsapp: getStatusWhatsApp()
        }),
        mensagem: req.query.mensagem || '',
        ativo: 'preparacao'
    });
});

router.get('/clientes/exportar.csv', async (req, res) => {
    desativarCache(res);
    const filtros = filtrosClientesQuery(req.query);
    const clientes = await listarClientes(filtros);
    const agora = new Date();
    const carimbo = [
        agora.getFullYear(),
        String(agora.getMonth() + 1).padStart(2, '0'),
        String(agora.getDate()).padStart(2, '0'),
        '-',
        String(agora.getHours()).padStart(2, '0'),
        String(agora.getMinutes()).padStart(2, '0')
    ].join('');
    const csv = gerarCsvClientes(clientes);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clientes-${carimbo}.csv"`);
    res.send(`\uFEFF${csv}`);
});

router.get('/clientes/novo', async (req, res) => {
    const listas = await obterListasCliente();

    await renderizar(res, {
        titulo: 'Novo cliente',
        conteudo: formularioCliente({ status: 'ativo' }, listas),
        ativo: 'clientes'
    });
});

router.get('/clientes/:id/enviar-modelo', async (req, res) => {
    const [cliente, modelos] = await Promise.all([
        buscarClientePorId(req.params.id),
        listarModelos()
    ]);

    if (!cliente) {
        return res.redirect('/clientes?mensagem=Cliente não encontrado');
    }

    const modelosAtivos = modelos.filter(modelo => (
        Number(modelo.ativo) !== 0 && modelo.chave !== CHAVE_MODELO_TESTE_EXPIRADO_ASSINATURA
    ));

    await renderizar(res, {
        titulo: 'Enviar modelo',
        conteudo: telaEnviarModeloCliente({ cliente, modelos: modelosAtivos }),
        mensagem: req.query.mensagem || '',
        ativo: 'clientes'
    });
});

router.get('/clientes/:id/editar', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes?mensagem=Cliente não encontrado');
    }

    const [listas, notas, pagamentos, alertas, atendimentos, interacoesRobo, auditoria, exclusaoDefinitiva, config] = await Promise.all([
        obterListasCliente(),
        listarNotasCliente(cliente.id),
        listarPagamentosCliente(cliente.id),
        buscarAlertasCadastroCliente(cliente),
        listarAtendimentosCliente(cliente.id),
        listarInteracoesCliente(cliente, 60),
        listarAuditoriaCliente(cliente.id, 100),
        verificarExclusaoDefinitivaCliente(cliente.id),
        obterConfiguracoes()
    ]);

    await renderizar(res, {
        titulo: 'Editar cliente',
        conteudo: formularioCliente(cliente, listas, {
            notas,
            pagamentos,
            alertas,
            atendimentos,
            interacoesRobo,
            auditoria,
            exclusaoDefinitiva,
            config,
            paginaHistorico: req.query.historico || req.query.pagina,
            paginaLinha: req.query.linha,
            historicoPorPagina: req.query.historicoPorPagina,
            linhaPorPagina: req.query.linhaPorPagina
        }),
        mensagem: req.query.mensagem || '',
        ativo: 'clientes'
    });
});

router.get('/clientes/:id/pagamentos/:pagamentoId/editar', async (req, res) => {
    const [cliente, pagamento] = await Promise.all([
        buscarClientePorId(req.params.id),
        buscarPagamentoCliente(req.params.id, req.params.pagamentoId)
    ]);

    if (!cliente || !pagamento) {
        return res.redirect(montarUrlClienteMensagem(req.params.id, 'Pagamento não encontrado para edição.'));
    }

    await renderizar(res, {
        titulo: 'Editar pagamento',
        conteudo: formularioPagamentoCliente(cliente, pagamento),
        mensagem: req.query.mensagem || '',
        ativo: 'clientes'
    });
});

router.post('/clientes/salvar', async (req, res) => {
    try {
        const novoCadastro = !req.body.id;
        const alertas = await buscarAlertasCadastroCliente(req.body);
        const clienteSalvo = await salvarCliente(req.body, {
            responsavel: req.usuarioPainel || 'sistema',
            origem: 'painel_cliente',
            motivo: req.body.motivoAlteracao || ''
        });
        const novaNota = String(req.body.novaNotaTexto || req.body.novaNotaPadrao || '').trim();
        const adicionandoNota = req.body.acao === 'adicionarNota';

        if (clienteSalvo?.id && novaNota) {
            await adicionarNotaCliente(clienteSalvo.id, novaNota);
            logControleClientes('Nota adicionada no salvamento', {
                clienteId: clienteSalvo.id,
                nome: clienteSalvo.nome
            });
        }

        logControleClientes(req.body.id ?'Cliente editado' : 'Cliente cadastrado', {
            id: clienteSalvo?.id,
            nome: clienteSalvo?.nome,
            telefone: clienteSalvo?.telefone,
            plano: clienteSalvo?.plano,
            status: clienteSalvo?.status
        });

        const mensagemAlerta = alertas.length
            ?'Cliente salvo. Atenção: existe histórico problemático para nome ou telefone parecido.'
            : 'Cliente salvo com sucesso';

        if (adicionandoNota && clienteSalvo?.id) {
            return res.redirect(montarUrlClienteMensagem(clienteSalvo.id, novaNota
                ?'Nota adicionada ao histórico e cliente salvo'
                : 'Cliente salvo. Nenhuma nota foi informada.'));
        }

        if (clienteEhTeste(clienteSalvo) && clienteSalvo?.id) {
            return res.redirect(montarUrlListaClientesMensagem(alertas.length
                ?mensagemAlerta
                : 'Cliente teste salvo com sucesso. O teste liberado nao foi reenviado.'));
        }

        if (novoCadastro && clienteSalvo?.id) {
            const mensagemNovoCliente = alertas.length
                ? `${mensagemAlerta} Use o botão abaixo para enviar a confirmação da assinatura.`
                : 'Cliente cadastrado com sucesso. Use o botão abaixo para enviar a confirmação da assinatura.';
            return res.redirect(`${montarUrlClienteMensagem(clienteSalvo.id, mensagemNovoCliente)}#confirmacao-assinatura`);
        }

        if (alertas.length && clienteSalvo?.id) {
            return res.redirect(montarUrlClienteMensagem(clienteSalvo.id, mensagemAlerta));
        }

        res.redirect(`/clientes/todos?mensagem=${encodeURIComponent(mensagemAlerta)}`);
    } catch (err) {
        logControleClientes('Erro ao salvar cliente', {
            erro: err.message,
            nome: req.body?.nome
        });
        res.status(400);
        const listas = await obterListasCliente();
        await renderizar(res, {
            titulo: 'Salvar cliente',
            conteudo: `${formularioCliente(req.body, listas)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'clientes'
        });
    }
});

router.post('/clientes/:id/enviar-confirmacao-assinatura', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente não encontrado.'));
    }

    if (clienteEhTeste(cliente)) {
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'A confirmação de assinatura não é usada para clientes de teste grátis.'));
    }

    const faltando = [];
    if (!String(cliente.nome || '').trim()) faltando.push('nome');
    if (!String(cliente.telefone || '').trim()) faltando.push('WhatsApp');
    if (!String(cliente.plano || '').trim()) faltando.push('plano');
    if (!String(cliente.dataVencimento || cliente.vencimento || '').trim()) faltando.push('data de vencimento');

    if (faltando.length) {
        return res.redirect(montarUrlClienteMensagem(
            cliente.id,
            `Preencha antes de enviar a confirmação: ${faltando.join(', ')}.`
        ));
    }

    const valorAssinatura = numeroMoeda(cliente.valorPlano) + numeroMoeda(cliente.assinaturaApp);
    if (valorAssinatura <= 0) {
        return res.redirect(montarUrlClienteMensagem(
            cliente.id,
            'Informe o valor do plano ou da assinatura app antes de enviar a confirmacao e registrar no financeiro.'
        ));
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        logControleClientes('Confirmacao de assinatura nao enviada', {
            clienteId: cliente.id,
            motivo: 'WhatsApp desconectado'
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado. A confirmação não foi enviada.'));
    }

    try {
        const mensagem = montarMensagemAssinaturaConfirmada(cliente);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(client, cliente.telefone, mensagem, 'Envio da confirmacao da assinatura');
        const destino = envioWhatsApp.destino;
        // Envio registrado pelo fallback de WhatsApp.
        const envio = await aguardarComTimeout(
            Promise.resolve({ id: { _serialized: envioWhatsApp.mensagemId }, ack: envioWhatsApp.ack }),
            90000,
            'Envio da confirmacao da assinatura'
        );

        if (!envio) {
            throw new Error('O WhatsApp não confirmou o envio da mensagem.');
        }

        // Mensagem registrada pelo fallback de WhatsApp.

        let pagamentoFinanceiro = null;
        try {
            pagamentoFinanceiro = await registrarPagamentoAssinaturaInicial(cliente.id);
        } catch (erroFinanceiro) {
            logControleClientes('Confirmacao enviada sem registrar financeiro', {
                clienteId: cliente.id,
                erro: erroFinanceiro.message
            });
            return res.redirect(montarUrlClienteMensagem(
                cliente.id,
                `Confirmacao enviada, mas nao foi possivel registrar no financeiro: ${erroFinanceiro.message}`
            ));
        }
        logControleClientes('Confirmacao de assinatura enviada', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: cliente.plano,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            pagamentoId: pagamentoFinanceiro?.pagamentoId,
            financeiroCriado: pagamentoFinanceiro?.criado
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'Confirmação da assinatura enviada ao cliente com sucesso.'));
    } catch (err) {
        logControleClientes('Erro ao enviar confirmacao de assinatura', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Não foi possível enviar a confirmação: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-pix-plano', async (req, res) => {
    try {
        const cliente = await buscarClientePorId(req.params.id);

        if (!cliente) {
            return res.redirect(montarUrlClienteMensagem(req.params.id, 'Cliente não encontrado.'));
        }

        const status = getStatusWhatsApp();
        const client = getClient();

        if (!client || !status.conectado) {
            return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado para enviar o PIX do plano.'));
        }

        const planoBase = buscarPlanoPorNome(cliente.plano) || {
            nome: cliente.plano || 'Plano',
            valor: cliente.valorPlano || '0,00'
        };
        const planoPix = prepararPlanoPixDoPlanoCliente(cliente, planoBase);
        const destino = await resolverDestinoWhatsApp(client, cliente.telefone);

        const enviado = await enviarQRCodePIXParaDestino(client, destino, planoPix, {
            tipo: 'renovacao',
            nomeCliente: cliente.nome || 'cliente',
            clienteId: cliente.id,
            plano: cliente.plano,
            tipoPlanoId: cliente.tipoPlanoId,
            diasContrato: cliente.diasContrato,
            valorPlano: cliente.valorPlano,
            assinaturaApp: '0,00'
        });

        if (!enviado) {
            throw new Error('Não foi possível enviar o QR Code PIX.');
        }

        await adicionarNotaCliente(
            cliente.id,
            `PIX do plano enviado manualmente: ${planoPix.nome}, R$ ${planoPix.valor}.`
        );
        logControleClientes('PIX do plano enviado ao cliente', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: planoPix.nome,
            valor: planoPix.valor,
            destino
        });

        return res.redirect(montarUrlClienteMensagem(cliente.id, 'PIX do plano enviado ao cliente.'));
    } catch (err) {
        logControleClientes('Erro ao enviar PIX do plano', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, `Não foi possível enviar o PIX do plano: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-paypal-plano', async (req, res) => {
    try {
        const cliente = await buscarClientePorId(req.params.id);
        if (!cliente) {
            return res.redirect(montarUrlClienteMensagem(req.params.id, 'Cliente não encontrado.'));
        }

        const status = getStatusWhatsApp();
        const client = getClient();
        if (!client || !status.conectado) {
            return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado para enviar o PayPal do plano.'));
        }

        const planoBase = buscarPlanoPorNome(cliente.plano) || {
            nome: cliente.plano || 'Plano',
            valor: cliente.valorPlano || '0,00'
        };
        const plano = prepararPlanoPixDoPlanoCliente(cliente, planoBase);
        if (numeroMoeda(plano.valor) <= 0) {
            throw new Error('O plano atual está sem valor de cobrança.');
        }

        const cobranca = await criarCobrancaPayPal(plano, {
            tipo: 'renovacao',
            nomeCliente: cliente.nome || 'cliente',
            clienteId: cliente.id,
            plano: cliente.plano,
            tipoPlanoId: cliente.tipoPlanoId,
            diasContrato: cliente.diasContrato,
            valorPlano: cliente.valorPlano,
            assinaturaApp: '0,00'
        });
        const mensagem = `💳 *PAYPAL - RENOVAÇÃO ${plano.nome}*
--------------------
👤 *Cliente:* ${cliente.nome || 'cliente'}
💰 *Valor:* R$ ${plano.valor}

${cobranca.link
    ? `Abra o link abaixo e conclua o pagamento pelo PayPal:\n${cobranca.link}`
    : `No aplicativo ou site do PayPal, escolha *Enviar pagamento* e envie para:\n📧 *${cobranca.email}*`}

${cobranca.manual
    ? `⚠️ Após pagar, envie o comprovante neste WhatsApp. A renovação será liberada depois da conferência.
🔖 *Referência:* ${cobranca.referencia}`
    : '✅ A confirmação é automática. Não é necessário enviar comprovante.'}`;
        const envio = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio manual do link PayPal'
        );

        await adicionarNotaCliente(
            cliente.id,
            `Link PayPal do plano enviado manualmente: ${plano.nome}, R$ ${plano.valor}.`
        );
        logControleClientes('PayPal do plano enviado ao cliente', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: plano.nome,
            valor: plano.valor,
            destino: envio.destino,
            ordemPayPal: cobranca.ordemId
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'Link PayPal do plano enviado ao cliente.'));
    } catch (err) {
        logControleClientes('Erro ao enviar PayPal do plano', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(
            req.params.id,
            `Não foi possível enviar o PayPal do plano: ${err.message}`
        ));
    }
});

router.post('/clientes/:id/renovar', async (req, res) => {
    const chaveRenovacao = [
        req.params.id,
        req.body.tipoPlanoId || '',
        req.body.plano || '',
        req.body.diasContrato || '',
        req.body.valorPlano || '',
        req.body.assinaturaApp || '',
        req.body.formaPagamento || '',
        req.body.dataPagamento || ''
    ].join('|');

    try {
        const agora = Date.now();
        const renovacaoRecente = renovacoesRecentes.get(chaveRenovacao);

        if (renovacaoRecente && agora - renovacaoRecente < RENOVACAO_SUBMISSAO_DUPLICADA_MS) {
            return res.redirect(montarUrlClienteMensagem(req.params.id, 'Renovação já estava sendo registrada. O envio duplicado foi ignorado.'));
        }

        renovacoesRecentes.set(chaveRenovacao, agora);

        const resultado = await renovarCliente({
            ...req.body,
            clienteId: req.params.id
        });
        const clienteAtualizado = resultado.cliente;
        await registrarEventoCliente(clienteAtualizado.id, 'renovacao', `Renovação registrada: ${resultado.plano}; vencimento ${resultado.vencimentoNovo}; valor ${resultado.valorTotal}.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'painel_cliente'
        });
        const deveEnviar = Boolean(req.body.enviarMensagem);
        let mensagemRetorno = 'Renovação registrada com sucesso';

        logControleClientes('Renovação registrada', {
            clienteId: clienteAtualizado?.id,
            nome: clienteAtualizado?.nome,
            plano: resultado.plano,
            valor: resultado.valorTotal,
            vencimento: resultado.vencimentoNovo
        });

        if (deveEnviar) {
            const status = getStatusWhatsApp();
            const client = getClient();

            if (!client || !status.conectado) {
                await marcarPagamentoMensagem(resultado.pagamentoId, false, 'WhatsApp desconectado');
                mensagemRetorno = 'Renovação registrada, mas o WhatsApp não está conectado para enviar a confirmação.';
            } else {
                try {
                    const mensagem = montarMensagemRenovacaoConfirmada(clienteAtualizado, resultado);
                    const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
                        client,
                        clienteAtualizado.telefone,
                        mensagem,
                        'Envio de renovação confirmada'
                    );

                    await marcarPagamentoMensagem(resultado.pagamentoId, true);
                    mensagemRetorno = 'Renovação registrada e confirmação enviada ao cliente.';
                    logControleClientes('Renovacao enviada ao cliente', {
                        clienteId: clienteAtualizado.id,
                        destino: envioWhatsApp.destino,
                        mensagemId: envioWhatsApp.mensagemId,
                        ack: envioWhatsApp.ack
                    });
                } catch (erroEnvio) {
                    await marcarPagamentoMensagem(resultado.pagamentoId, false, erroEnvio.message);
                    mensagemRetorno = `Renovação registrada, mas não foi possível enviar a confirmação: ${erroEnvio.message}`;
                    logControleClientes('Erro ao enviar renovação', {
                        clienteId: clienteAtualizado.id,
                        erro: erroEnvio.message
                    });
                }
            }
        }

        return res.redirect(montarUrlClienteMensagem(clienteAtualizado.id, mensagemRetorno));
    } catch (err) {
        renovacoesRecentes.delete(chaveRenovacao);
        logControleClientes('Erro ao renovar cliente', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/enviar-reativacao', async (req, res) => {
    try {
        const cliente = await buscarClientePorId(req.params.id);

        if (!cliente) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('Cliente não encontrado.')}`);
        }

        if (!clientePodeReceberReativacao(cliente)) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('Este cliente não está vencido para receber reativação.')}`);
        }

        const planoPix = buscarPlanoPorNome(cliente.plano);

        if (!planoPix) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('O plano deste cliente não possui QR Code configurado para reativação.')}`);
        }

        const pixCliente = prepararPlanoPixCliente(cliente, planoPix);
        const status = getStatusWhatsApp();
        const client = getClient();

        if (!client || !status.conectado) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('WhatsApp não está conectado para enviar a reativação.')}`);
        }

        const mensagem = montarMensagemReativacaoCliente(cliente, pixCliente);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio de reativacao'
        );
        const destino = envioWhatsApp.destino;

        const qrEnviado = await enviarQRCodePIXParaDestino(client, destino, pixCliente.plano, {
            tipo: 'renovacao',
            nomeCliente: cliente.nome,
            clienteId: cliente.id,
            plano: cliente.plano,
            tipoPlanoId: cliente.tipoPlanoId,
            diasContrato: cliente.diasContrato,
            valorPlano: pixCliente.valorPlano,
            assinaturaApp: pixCliente.incluirApp ? pixCliente.valorApp : '0,00'
        });

        if (!qrEnviado) {
            throw new Error('A mensagem foi enviada, mas não foi possível enviar o QR Code PIX.');
        }

        await adicionarNotaCliente(cliente.id, `Mensagem de reativação com QR Code enviada para o plano ${cliente.plano}.`);
        logControleClientes('Reativacao enviada ao cliente', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: cliente.plano,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack
        });

        return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('Mensagem de reativação com QR Code enviada ao cliente.')}`);
    } catch (err) {
        logControleClientes('Erro ao enviar reativacao', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent(`Erro ao enviar reativação: ${err.message}`)}`);
    }
});

router.post('/clientes/:id/pagamentos/:pagamentoId/excluir', async (req, res) => {
    try {
        const pagamento = await removerPagamentoCliente(req.params.id, req.params.pagamentoId);
        await registrarEventoCliente(req.params.id, 'pagamento_removido', `Pagamento ${req.params.pagamentoId} removido do histórico financeiro.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'financeiro'
        });
        logControleClientes('Pagamento removido do historico', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            valor: pagamento.valorTotal
        });

        return res.redirect(montarUrlClienteMensagem(req.params.id, 'Pagamento removido do histórico financeiro.'));
    } catch (err) {
        logControleClientes('Erro ao remover pagamento', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/pagamentos/:pagamentoId/salvar', async (req, res) => {
    try {
        const pagamento = await atualizarPagamentoCliente(req.params.id, req.params.pagamentoId, req.body);
        await registrarEventoCliente(req.params.id, 'pagamento_alterado', `Pagamento ${req.params.pagamentoId} atualizado no histórico financeiro.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'financeiro'
        });
        logControleClientes('Pagamento editado no historico', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            valor: pagamento.valorTotal
        });

        return res.redirect(montarUrlClienteMensagem(req.params.id, 'Pagamento atualizado no histórico financeiro.'));
    } catch (err) {
        logControleClientes('Erro ao editar pagamento', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/pagamentos/:pagamentoId/mensagem-enviada', async (req, res) => {
    try {
        await marcarPagamentoMensagem(req.params.pagamentoId, true);
        await adicionarNotaCliente(req.params.id, 'Confirmação de renovação marcada manualmente como enviada.');

        return res.redirect(`${montarUrlClienteMensagem(req.params.id, 'Mensagem marcada como enviada no histórico.')}#renovar`);
    } catch (err) {
        logControleClientes('Erro ao marcar mensagem de pagamento como enviada', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/notas', async (req, res) => {
    try {
        await adicionarNotaCliente(req.params.id, req.body.texto || req.body.notaPadrao);
        logControleClientes('Nota adicionada', { clienteId: req.params.id });
        res.redirect(montarUrlClienteMensagem(req.params.id, 'Nota adicionada ao histórico do cliente'));
    } catch (err) {
        logControleClientes('Erro ao adicionar nota', {
            clienteId: req.params.id,
            erro: err.message
        });
        res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/aplicar-bonus', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes/todos?mensagem=Cliente não encontrado');
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado. Bônus não aplicado.'));
    }

    try {
        const meses = Number.parseInt(req.body.quantidade || 1, 10);
        const aniversarioPendente = clienteAniversarioPendente(cliente);
        const saldoAplicavel = (Number.parseInt(cliente.bonusMeses || 0, 10) || 0) + (aniversarioPendente ? 1 : 0);
        if (!Number.isInteger(meses) || meses < 1 || meses > saldoAplicavel) {
            throw new Error(`Saldo de bônus insuficiente. Disponível: ${saldoAplicavel}.`);
        }

        const resultadoEnvio = {
            meses,
            saldoRestante: saldoAplicavel - meses,
            dataVencimento: cliente.dataVencimento || cliente.vencimento
        };
        const mensagem = montarMensagemBonusAplicado(cliente, resultadoEnvio);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio de bonus aplicado'
        );
        const destino = envioWhatsApp.destino;
        if (aniversarioPendente) {
            const anoAtual = Number(new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo', year: 'numeric'
            }).format(new Date()));
            await registrarBonusAniversario(cliente.id, anoAtual);
        }

        const resultado = await aplicarBonusCliente(cliente.id, meses);
        const clienteAtualizado = resultado.cliente;
        await registrarEventoCliente(cliente.id, 'bonus_aplicado', `${meses} bônus aplicado(s); saldo atual ${resultado.saldoRestante}.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'painel_cliente', motivo: req.body.observacaoBonus || ''
        });

        if (String(req.body.observacaoBonus || '').trim()) {
            await adicionarNotaCliente(cliente.id, `Observação da bonificação: ${req.body.observacaoBonus}`);
        }

        logControleClientes('Bonus aplicado e enviado ao cliente', {
            clienteId: clienteAtualizado.id,
            nome: clienteAtualizado.nome,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            meses: resultado.meses,
            saldoRestante: resultado.saldoRestante,
            vencimento: resultado.dataVencimento
        });

        return res.redirect(montarUrlClienteMensagem(cliente.id, `Bônus aplicado: ${resultado.meses} mês(es). Mensagem enviada ao cliente.`));
    } catch (err) {
        logControleClientes('Erro ao aplicar bonus', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, err.message));
    }
});

router.get('/planos', async (req, res) => {
    const planos = await listarTiposPlanos();
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Planos',
        conteudo: telaPlanos(planos),
        mensagem,
        ativo: 'planos'
    });
});

router.get('/planos/novo', async (req, res) => {
    await renderizar(res, {
        titulo: 'Novo plano',
        conteudo: formularioPlano({ nome: 'Mensal', dias: 30, ativo: 1 }),
        ativo: 'planos'
    });
});

router.get('/planos/:id/editar', async (req, res) => {
    const plano = await buscarTipoPlanoPorId(req.params.id);

    if (!plano) {
        return res.redirect('/planos?mensagem=Plano não encontrado');
    }

    await renderizar(res, {
        titulo: 'Editar plano',
        conteudo: formularioPlano(plano),
        ativo: 'planos'
    });
});

router.post('/planos/salvar', async (req, res) => {
    try {
        await salvarTipoPlano(req.body);
        res.redirect('/planos?mensagem=Plano salvo com sucesso');
    } catch (err) {
        res.status(400);
        await renderizar(res, {
            titulo: 'Salvar plano',
            conteudo: `${formularioPlano(req.body)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'planos'
        });
    }
});

router.post('/planos/:id/excluir', async (req, res) => {
    try {
        await removerTipoPlano(req.params.id);
        res.redirect('/planos?mensagem=Plano excluído');
    } catch (err) {
        res.redirect(`/planos?mensagem=${encodeURIComponent(`Erro ao excluir plano: ${err.message}`)}`);
    }
});

router.get('/apps', async (req, res) => {
    const apps = await listarApps();
    const pagina = paginaAtual(req.query.pagina);
    const paginacaoApps = paginarItens(apps, pagina, quantidadePorPagina(req.query.porPagina, REGISTROS_POR_PAGINA));
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Apps',
        conteudo: telaApps(apps, paginacaoApps),
        mensagem,
        ativo: 'apps'
    });
});

router.get('/apps/novo', async (req, res) => {
    await renderizar(res, {
        titulo: 'Novo app',
        conteudo: formularioApp({ ativo: 1 }),
        ativo: 'apps'
    });
});

router.get('/apps/:id/editar', async (req, res) => {
    const app = await buscarAppPorId(req.params.id);

    if (!app) {
        return res.redirect('/apps?mensagem=App não encontrado');
    }

    await renderizar(res, {
        titulo: 'Editar app',
        conteudo: formularioApp(app),
        ativo: 'apps'
    });
});

router.post('/apps/salvar', async (req, res) => {
    try {
        await salvarApp(req.body);
        res.redirect('/apps?mensagem=App salvo com sucesso');
    } catch (err) {
        res.status(400);
        await renderizar(res, {
            titulo: 'Salvar app',
            conteudo: `${formularioApp(req.body)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'apps'
        });
    }
});

router.post('/apps/:id/excluir', async (req, res) => {
    try {
        await removerApp(req.params.id);
        res.redirect('/apps?mensagem=App excluído');
    } catch (err) {
        res.redirect(`/apps?mensagem=${encodeURIComponent(`Erro ao excluir app: ${err.message}`)}`);
    }
});

router.get('/dispositivos', async (req, res) => {
    const dispositivos = await listarDispositivos();
    const pagina = paginaAtual(req.query.pagina);
    const paginacaoDispositivos = paginarItens(dispositivos, pagina, quantidadePorPagina(req.query.porPagina, REGISTROS_POR_PAGINA));
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Dispositivos',
        conteudo: telaDispositivos(dispositivos, paginacaoDispositivos),
        mensagem,
        ativo: 'dispositivos'
    });
});

router.get('/dispositivos/novo', async (req, res) => {
    await renderizar(res, {
        titulo: 'Novo dispositivo',
        conteudo: formularioDispositivo({ ativo: 1 }),
        ativo: 'dispositivos'
    });
});

router.get('/dispositivos/:id/editar', async (req, res) => {
    const dispositivo = await buscarDispositivoPorId(req.params.id);

    if (!dispositivo) {
        return res.redirect('/dispositivos?mensagem=Dispositivo não encontrado');
    }

    await renderizar(res, {
        titulo: 'Editar dispositivo',
        conteudo: formularioDispositivo(dispositivo),
        ativo: 'dispositivos'
    });
});

router.post('/dispositivos/salvar', async (req, res) => {
    try {
        await salvarDispositivo(req.body);
        res.redirect('/dispositivos?mensagem=Dispositivo salvo com sucesso');
    } catch (err) {
        res.status(400);
        await renderizar(res, {
            titulo: 'Salvar dispositivo',
            conteudo: `${formularioDispositivo(req.body)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'dispositivos'
        });
    }
});

router.post('/dispositivos/:id/excluir', async (req, res) => {
    try {
        await removerDispositivo(req.params.id);
        res.redirect('/dispositivos?mensagem=Dispositivo excluído');
    } catch (err) {
        res.redirect(`/dispositivos?mensagem=${encodeURIComponent(`Erro ao excluir dispositivo: ${err.message}`)}`);
    }
});

router.get('/paineis', async (req, res) => {
    const paineis = await listarPaineis();
    const pagina = paginaAtual(req.query.pagina);
    const paginacaoPaineis = paginarItens(paineis, pagina, quantidadePorPagina(req.query.porPagina, REGISTROS_POR_PAGINA));
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Painéis',
        conteudo: telaPaineis(paineis, paginacaoPaineis),
        mensagem,
        ativo: 'paineis'
    });
});

router.get('/paineis/novo', async (req, res) => {
    await renderizar(res, {
        titulo: 'Novo painel',
        conteudo: formularioPainel({ ativo: 1 }),
        ativo: 'paineis'
    });
});

router.get('/paineis/:id/editar', async (req, res) => {
    const painel = await buscarPainelPorId(req.params.id);

    if (!painel) {
        return res.redirect('/paineis?mensagem=Painel não encontrado');
    }

    const historico = await listarHistoricoRenovacoes(painel.id);
    await renderizar(res, {
        titulo: 'Editar painel',
        conteudo: formularioPainel(painel, historico),
        mensagem: req.query.mensagem || '',
        ativo: 'paineis'
    });
});

router.post('/paineis/:id/testar', confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        await salvarPainel({ ...req.body, id: req.params.id });
        const resultado = await testarIntegracaoPainel(req.params.id);
        res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(`API respondeu com HTTP ${resultado.status}.`)}`);
    } catch (err) {
        res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(`Falha no teste da API: ${err.message}`)}`);
    }
});

router.post('/paineis/:id/renovacoes/:filaId/tentar', async (req, res) => {
    try {
        await reagendarRenovacao(req.params.filaId);
        res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent('Nova tentativa agendada.')}`);
    } catch (err) {
        res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/paineis/salvar', confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        await salvarPainel(req.body);
        logControleClientes('Configuracao de painel IPTV/P2P atualizada', { painelId: req.body.id || 'novo', nome: req.body.nome, api: req.body.apiUrl ?'configurada':'vazia', token: req.body.apiToken ?'atualizado':'mantido', renovacaoAutomatica: req.body.renovacaoAutomatica });
        res.redirect('/paineis?mensagem=Painel salvo com sucesso');
    } catch (err) {
        res.status(400);
        await renderizar(res, {
            titulo: 'Salvar painel',
            conteudo: `${formularioPainel(req.body)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'paineis'
        });
    }
});

router.post('/paineis/:id/excluir', async (req, res) => {
    try {
        await removerPainel(req.params.id);
        res.redirect('/paineis?mensagem=Painel excluído');
    } catch (err) {
        res.redirect(`/paineis?mensagem=${encodeURIComponent(`Erro ao excluir painel: ${err.message}`)}`);
    }
});

router.get('/manutencao', async (req, res) => {
    const status = await obterStatusSistema(getStatusWhatsApp());

    await renderizar(res, {
        titulo: 'Manutenção',
        conteudo: telaManutencao(status),
        mensagem: req.query.mensagem || '',
        ativo: 'manutencao'
    });
});

router.get('/manutencao/simular-robo', async (req, res) => {
    await renderizar(res, {
        titulo: 'Simular conversa do robô',
        conteudo: telaSimuladorRobo(),
        ativo: 'manutencao'
    });
});

router.post('/manutencao/simular-robo', async (req, res) => {
    await renderizar(res, {
        titulo: 'Simular conversa do robô',
        conteudo: telaSimuladorRobo({
            nome: req.body.nome || 'Cliente Teste',
            intencao: req.body.intencao || 'menu'
        }),
        mensagem: 'Simulação gerada sem enviar mensagem real.',
        ativo: 'manutencao'
    });
});

router.post('/manutencao/backup', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const config = await obterConfiguracoes();
        const resultado = await criarBackupManualComCopiaExterna(config);
        const backup = resultado.backup;
        logControleClientes('Backup manual criado', {
            arquivo: backup.nome,
            copiaExterna: resultado.copiaExterna || '',
            erroCopiaExterna: resultado.erroCopiaExterna || ''
        });
        let mensagem = `Backup criado: ${backup.nome}`;
        if (resultado.copiaExterna) {
            mensagem += `; cópia externa criada em ${resultado.copiaExterna}`;
        } else if (resultado.erroCopiaExterna) {
            mensagem += `; o backup local está preservado, mas a cópia externa falhou: ${resultado.erroCopiaExterna}`;
        }
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        logControleClientes('Erro ao criar backup manual', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao criar backup: ${err.message}`)}`);
    }
});

router.post('/manutencao/backups/testar-restauracao', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        const resultado = await executarExercicioRestauracaoMensal();
        logControleClientes('Exercício de restauração concluído', resultado);
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Restauração de teste aprovada: ${resultado.backup}`)}`);
    } catch (err) {
        logControleClientes('Erro no exercício de restauração', { erro: err.message });
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro no teste de restauração: ${err.message}`)}`);
    }
});

router.post('/manutencao/diagnostico', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const resultado = await executarDiagnosticoSistema(getStatusWhatsApp(), testarWebhookAlertas);
        logControleClientes('Diagnóstico do sistema executado', { status: resultado.status });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(resultado.mensagem)}`);
    } catch (err) {
        logControleClientes('Erro ao executar diagnóstico do sistema', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao executar diagnóstico: ${err.message}`)}`);
    }
});

router.post('/manutencao/robo/reiniciar', bloquearControleRoboLocal, (req, res) => {
    try {
        agendarControleProcessoLocal('restart');
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent('Reinício do robô local solicitado. Aguarde alguns segundos e atualize a página.')}`);
    } catch (err) {
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Não foi possível reiniciar o robô: ${err.message}`)}`);
    }
});

router.post('/manutencao/robo/parar', bloquearControleRoboLocal, (req, res) => {
    try {
        agendarControleProcessoLocal('stop');
        return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Robô parado</title></head><body style="font-family:Arial,sans-serif;padding:40px"><h1>Parada solicitada</h1><p>O robô local será parado em alguns segundos.</p><p>Para iniciá-lo novamente, abra o <strong>INSTALAR.exe</strong> e escolha <strong>Abrir painel</strong> ou execute <code>pm2.cmd restart ${escapar(String(process.env.JULIAN_PLAY_APP_NAME || 'julian-play-cliente'))}</code>.</p></body></html>`);
    } catch (err) {
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Não foi possível parar o robô: ${err.message}`)}`);
    }
});

router.get('/manutencao/clientes-modelo.csv', (req, res) => {
    desativarCache(res);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-clientes.csv"');
    res.send(`\uFEFF${csvModeloClientes()}`);
});

router.post('/manutencao/importar-clientes', async (req, res) => {
    try {
        const upload = await lerUploadMultipart(req, { campo: 'arquivo' });
        const preview = await prepararImportacaoClientesCsv(upload.buffer.toString('utf8'));
        const token = salvarPreviaImportacao(preview);
        const status = await obterStatusSistema(getStatusWhatsApp());

        logControleClientes('CSV de clientes validado', {
            arquivo: upload.filename,
            linhas: preview.total,
            criar: preview.criar,
            atualizar: preview.atualizar,
            ignorar: preview.ignorar,
            token
        });

        await renderizar(res, {
            titulo: 'Manutenção',
            conteudo: telaManutencao(status, { importacao: { preview, token } }),
            mensagem: `CSV validado: ${preview.criar} criar, ${preview.atualizar} atualizar, ${preview.ignorar} ignorar`,
            ativo: 'manutencao'
        });
    } catch (err) {
        logControleClientes('Erro ao validar CSV de clientes', {
            erro: err.message
        });

        const status = await obterStatusSistema(getStatusWhatsApp());

        await renderizar(res, {
            titulo: 'Manutenção',
            conteudo: telaManutencao(status),
            mensagem: err.message || 'Não foi possível validar o CSV.',
            ativo: 'manutencao'
        });
    }
});

router.post('/manutencao/importar-clientes/confirmar', async (req, res) => {
    try {
        const preview = lerPreviaImportacao(req.body.token);
        const itens = preview.itens || [];
        const itensValidos = itens.filter(item => item.acao !== 'ignorar');

        logControleClientes('Confirmacao de importacao CSV recebida', {
            token: req.body.token,
            linhas: preview.total,
            validos: itensValidos.length,
            ignorar: preview.ignorar
        });

        if (!itensValidos.length) {
            throw new Error('Não há clientes válidos para importar.');
        }

        const backup = await criarBackupManual();
        let criados = 0;
        let atualizados = 0;

        for (const item of itensValidos) {
            const dados = item.acao === 'atualizar' && item.existenteId
                ?{ ...item.dados, id: item.existenteId }
                : item.dados;

            await salvarCliente(dados);
            if (item.acao === 'atualizar') atualizados += 1;
            if (item.acao === 'criar') criados += 1;
        }

        removerPreviaImportacao(req.body.token);
        logControleClientes('Clientes importados via CSV', {
            criados,
            atualizados,
            backup: backup.nome
        });

        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Importação concluída: ${criados} criado(s), ${atualizados} atualizado(s). Backup: ${backup.nome}`)}`);
    } catch (err) {
        logControleClientes('Erro ao importar clientes via CSV', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(err.message || 'Não foi possível importar os clientes.')}`);
    }
});

router.post('/manutencao/restaurar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        const resultado = await restaurarBackup(req.body.backup);
        logControleClientes('Backup restaurado', {
            backup: resultado.restaurado,
            backupAnterior: resultado.backupAnterior
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Backup restaurado: ${resultado.restaurado}. Foi criada uma cópia do banco anterior: ${resultado.backupAnterior}. Reinicie o PM2 para recarregar tudo.`)}`);
    } catch (err) {
        logControleClientes('Erro ao restaurar backup', {
            backup: req.body.backup,
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao restaurar backup: ${err.message}`)}`);
    }
});

router.post('/manutencao/backups/exportar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        const arquivo = await exportarBackupCriptografado(req.body.backup, req.body.senhaExportacao);
        logControleClientes('Backup criptografado exportado', { backup:req.body.backup });
        return res.download(arquivo, path.basename(arquivo));
    } catch (err) { return res.redirect(`/manutencao?mensagem=${encodeURIComponent(err.message)}`); }
});

router.post('/manutencao/backups/copiar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        const destino = await copiarBackupExterno(req.body.backup, req.body.pastaExterna);
        logControleClientes('Backup copiado para armazenamento externo', { backup:req.body.backup, destino });
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Backup copiado para ${destino}`)}`);
    } catch (err) { return res.redirect(`/manutencao?mensagem=${encodeURIComponent(err.message)}`); }
});

router.post('/manutencao/licenca', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        await atualizarLicencaComercial(req.body);
        logControleClientes('Licença da instalação atualizada', {
            cliente: req.body.licencaCliente,
            vencimento: req.body.licencaVencimento,
            tipo: req.body.licencaTipo
        });
        res.redirect('/manutencao?mensagem=Licença salva com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar licença da instalação', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar licença: ${err.message}`)}`);
    }
});

router.post('/manutencao/robo', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        await salvarConfiguracoesRobo(req.body);
        logControleClientes('Configuracao do robo atualizada', {
            nomeEmpresa: req.body.nomeEmpresaRobo,
            responderMensagens: String(req.body.roboResponderMensagensAtivo || '') === '1',
            enviarMensagensPainel: String(req.body.roboEnviarMensagensPainelAtivo || '') === '1'
        });
        res.redirect('/manutencao?mensagem=Configuração do robô salva com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar configuração do robô', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar configuração do robô: ${err.message}`)}`);
    }
});

router.post('/manutencao/robo/imagem/:chave', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const upload = await lerUploadMultipart(req, { campo: 'imagem' });

        if (!extensaoLogoPermitida(upload.filename)) {
            return res.redirect('/manutencao?mensagem=Use uma imagem PNG, JPG, WEBP, GIF ou SVG');
        }

        validarImagemUpload(upload.filename, upload.buffer);

        fs.mkdirSync(ASSETS_DIR, { recursive: true });

        const extensao = path.extname(upload.filename).toLowerCase();
        const chave = String(req.params.chave || '');

        if (chave === CHAVE_IMAGEM_CAMPANHA_AMIZADE && !['.png', '.jpg', '.jpeg'].includes(extensao)) {
            return res.redirect('/manutencao?mensagem=Para campanha, use imagem PNG ou JPG');
        }

        const configAnterior = await obterConfiguracoes();
        const arquivoAnterior = configAnterior[chave] || '';
        const nomeArquivo = `${chave}-${Date.now()}${extensao}`;
        const destino = path.join(ASSETS_DIR, nomeArquivo);

        fs.writeFileSync(destino, upload.buffer);
        await salvarImagemRobo(chave, nomeArquivo);
        if (arquivoAnterior && arquivoAnterior !== nomeArquivo) {
            removerArquivoImagemTenant(arquivoAnterior);
        }

        logControleClientes('Imagem do robo atualizada', {
            chave,
            arquivo: nomeArquivo
        });
        res.redirect('/manutencao?mensagem=Imagem do robô atualizada com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar imagem do robo', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar imagem do robô: ${err.message}`)}`);
    }
});

router.post('/manutencao/robo/imagem/:chave/limpar', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const chave = String(req.params.chave || '');
        const config = await obterConfiguracoes();
        const arquivoAnterior = config[chave] || '';

        await salvarImagemRobo(chave, '');
        const arquivoRemovido = removerArquivoImagemTenant(arquivoAnterior);

        logControleClientes('Imagem do robo removida', {
            chave,
            arquivo: arquivoAnterior,
            arquivoRemovido
        });
        res.redirect('/manutencao?mensagem=Imagem removida das mensagens do robô');
    } catch (err) {
        logControleClientes('Erro ao remover imagem do robo', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao remover imagem do robô: ${err.message}`)}`);
    }
});

router.post('/manutencao/pix', confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        await salvarConfiguracoesPix(req.body);
        logControleClientes('Configuracao PIX atualizada', {
            camposAlterados: 'pixChave,pixNome,pixCidade,pixTxid'
        });
        res.redirect('/manutencao?mensagem=PIX salvo com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar PIX', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar PIX: ${err.message}`)}`);
    }
});

router.post('/manutencao/pix-provedor', confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        await salvarConfiguracoesProvedorPix(req.body);
        logControleClientes('Provedor de confirmacao PIX atualizado', { provedor: req.body.pixProvedor, credenciais: req.body.mercadoPagoAccessToken ?'atualizadas':'mantidas', webhook: req.body.mercadoPagoWebhookUrl ?'configurado':'vazio' });
        res.redirect('/manutencao?mensagem=Provedor PIX salvo com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar provedor PIX', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar provedor PIX: ${err.message}`)}`);
    }
});

router.post('/manutencao/paypal', confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        await salvarConfiguracoesPayPal(req.body);
        logControleClientes('Configuracao PayPal atualizada', {
            ativo: String(req.body.paypalAtivo || '') === '1',
            ambiente: req.body.paypalAmbiente,
            credenciais: req.body.paypalClientId || req.body.paypalClientSecret ?'atualizadas':'mantidas'
        });
        res.redirect('/manutencao?mensagem=PayPal salvo com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar PayPal', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar PayPal: ${err.message}`)}`);
    }
});

router.post('/manutencao/whatsapp/protecao', async (req, res) => {
    try {
        const protecao = await salvarProtecaoWhatsapp({
            whatsappProtecaoAtiva: String(req.body.whatsappProtecaoAtiva || '') === '1',
            whatsappBloquearNovoQrAutomatico: String(req.body.whatsappBloquearNovoQrAutomatico || '') === '1',
            whatsappProtecaoMotivo: req.body.whatsappProtecaoMotivo
        });
        logControleClientes('Protecao do WhatsApp atualizada', {
            ativa: protecao.ativa,
            bloquearNovoQrAutomatico: protecao.bloquearNovoQrAutomatico,
            motivo: protecao.motivo
        });
        const mensagem = protecao.ativa
            ? 'Protecao ativada. Envios proativos foram pausados; respostas aos clientes continuam liberadas.'
            : 'Protecao desativada. Envios proativos voltaram a ser permitidos.';
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        logControleClientes('Erro ao salvar protecao do WhatsApp', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar protecao: ${err.message}`)}`);
    }
});

router.post('/manutencao/monitoramento', bloquearMonitoramentoOperacional, confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        await salvarConfiguracoesMonitoramento(req.body);
        logControleClientes('Monitoramento comercial atualizado', {
            backupAtivo: Boolean(req.body.backupAutomaticoAtivo),
            horario: req.body.backupAutomaticoHora,
            retencao: req.body.backupRetencaoDias,
            backupExternoAtivo: Boolean(req.body.backupExternoAtivo),
            backupExternoMaximo: req.body.backupExternoMaximo,
            alertaMinutos: req.body.alertaWhatsAppMinutos
        });
        res.redirect('/manutencao?mensagem=Monitoramento salvo com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar monitoramento comercial', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar monitoramento: ${err.message}`)}`);
    }
});

router.post('/manutencao/monitoramento/testar', bloquearMonitoramentoOperacional, async (req, res) => {
    try {
        const canais = [];
        if (String(req.body.alertaWebhookUrl || '').trim()) {
            await testarWebhookAlertas(req.body.alertaWebhookUrl);
            canais.push('webhook');
        }
        const numero = String(req.body.alertaWhatsappControle || '').replace(/\D/g, '');
        if (numero) {
            const { exigirEnvioPainelPermitido } = require('../services/controleOperacaoRoboService');
            await exigirEnvioPainelPermitido('teste da Central de Saúde');
            const client = getClient();
            const status = getStatusWhatsApp();
            if (!client || !status.conectado) throw new Error('WhatsApp nao esta conectado para enviar o alerta de teste.');
            await client.sendMessage(`${numero}@c.us`, '✅ *TESTE DA CENTRAL DE SAÚDE*\n\nOs alertas operacionais por WhatsApp estão configurados corretamente.');
            canais.push('WhatsApp');
        }
        if (!canais.length) throw new Error('Informe um webhook ou WhatsApp de controle para testar.');
        logControleClientes('Alerta operacional de teste enviado', { canais });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Alerta de teste enviado por ${canais.join(' e ')}.`)}`);
    } catch (err) {
        logControleClientes('Erro ao testar webhook de alertas', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao enviar teste: ${err.message}`)}`);
    }
});

router.post('/manutencao/acesso', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
    try {
        await salvarConfiguracoesAcesso(req.body);
        logControleClientes('Acesso ao painel atualizado', {
            usuario: req.body.painelUsuario
        });
        res.redirect('/logout');
    } catch (err) {
        logControleClientes('Erro ao salvar acesso ao painel', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar acesso: ${err.message}`)}`);
    }
});

router.get('/modelos', async (req, res) => {
    const modelos = await listarModelos();
    const config = await obterConfiguracoes();
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Modelos',
        conteudo: telaModelos({ modelos, config }),
        mensagem,
        ativo: 'modelos'
    });
});

router.get('/modelos/novo', async (req, res) => {
    await renderizar(res, {
        titulo: 'Novo modelo',
        conteudo: formularioModelo({
            plano: 'padrao',
            cor: 'blue',
            ativo: 1,
            texto: 'Olá, *{{nome}}!*\n\nSeu plano *{{plano}}* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nEntre em contato para renovar.'
        }),
        ativo: 'modelos'
    });
});

router.get('/modelos/:id/editar', async (req, res) => {
    const modelo = await buscarModeloPorId(req.params.id);

    if (!modelo) {
        return res.redirect('/modelos?mensagem=Modelo não encontrado');
    }

    await renderizar(res, {
        titulo: 'Editar modelo',
        conteudo: formularioModelo(modelo),
        ativo: 'modelos'
    });
});

router.post('/modelos/salvar', async (req, res) => {
    try {
        await salvarModelo(req.body);
        res.redirect('/modelos?mensagem=Modelo salvo com sucesso');
    } catch (err) {
        res.status(400);
        await renderizar(res, {
            titulo: 'Salvar modelo',
            conteudo: `${formularioModelo(req.body)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'modelos'
        });
    }
});

router.post('/modelos/:id/excluir', async (req, res) => {
    await removerModelo(req.params.id);
    res.redirect('/modelos?mensagem=Modelo excluído');
});

router.post('/configuracoes/painel', async (req, res) => {
    await salvarConfiguracoesPainel(req.body);
    res.redirect('/modelos?mensagem=Marca do painel salva');
});

router.post('/configuracoes/logo', async (req, res) => {
    try {
        const upload = await lerUploadMultipart(req, { campo: 'logo' });

        if (!extensaoLogoPermitida(upload.filename)) {
            return res.redirect('/modelos?mensagem=Use uma imagem PNG, JPG, WEBP, GIF ou SVG');
        }

        validarImagemUpload(upload.filename, upload.buffer);

        fs.mkdirSync(ASSETS_DIR, { recursive: true });

        const extensao = path.extname(upload.filename).toLowerCase();
        const nomeArquivo = `logo-painel${extensao}`;
        const destino = path.join(ASSETS_DIR, nomeArquivo);

        fs.writeFileSync(destino, upload.buffer);

        const config = await obterConfiguracoes();
        await salvarConfiguracoesPainel({
            nomeSistema: config.nomeSistema,
            logoUrl: `/tenant-assets/${nomeArquivo}?v=${Date.now()}`
        });

        res.redirect('/modelos?mensagem=Logo atualizada com sucesso');
    } catch (err) {
        res.redirect(`/modelos?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/clientes/:id/enviar-teste-liberado', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes/todos?mensagem=Cliente não encontrado');
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        logControleClientes('Teste liberado nao enviado', {
            clienteId: cliente.id,
            motivo: 'WhatsApp desconectado'
        });
        return res.redirect(`/clientes/${cliente.id}/editar?mensagem=WhatsApp não está conectado`);
    }

    const acesso = primeiroAcessoApp(cliente);
    const dados = {
        telefone: cliente.telefone,
        nome: req.body.nome || cliente.nome,
        aparelho: req.body.aparelho || acesso.dispositivo || cliente.aparelho,
        aplicativo: req.body.aplicativo || acesso.app || valorPrimeiroItem(cliente.appsInstalados) || '',
        painel: req.body.painel || acesso.painel || valorPrimeiroItem(cliente.paineisSelecionados) || '',
        usuario: req.body.usuario || cliente.usuario,
        senha: req.body.senha || cliente.senha,
        dataInicio: req.body.dataInicio || cliente.dataInicio,
        validade: req.body.validade || cliente.dataVencimento || cliente.vencimento
    };
    const faltando = camposFaltandoTesteLiberado(dados);

    if (faltando.length) {
        logControleClientes('Teste liberado nao enviado', {
            clienteId: cliente.id,
            nome: cliente.nome,
            faltando: faltando.join(', ')
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Preencha antes de enviar: ${faltando.join(', ')}.`));
    }

    try {
        const acessosAtuais = lerAcessosApp(cliente);
        const acessoTeste = {
            ...(acessosAtuais[0] || {}),
            app: dados.aplicativo,
            dispositivo: dados.aparelho,
            painel: dados.painel,
            usuario: dados.usuario,
            senha: dados.senha
        };
        const acessosAtualizados = [acessoTeste, ...acessosAtuais.slice(1)];

        const clienteAtualizado = await salvarCliente({
            ...cliente,
            id: Number(cliente.id),
            nome: dados.nome,
            telefone: cliente.telefone,
            usuario: dados.usuario,
            senha: dados.senha,
            aparelho: dados.aparelho,
            dataInicio: dados.dataInicio,
            dataVencimento: dados.validade,
            vencimento: dados.validade,
            appsInstalados: lerListaSalva(cliente.appsInstalados),
            dispositivosSelecionados: lerListaSalva(cliente.dispositivosSelecionados),
            paineisSelecionados: lerListaSalva(cliente.paineisSelecionados),
            acessoAppNome: acessosAtualizados.map(item => item.app || ''),
            acessoDispositivo: acessosAtualizados.map(item => item.dispositivo || ''),
            acessoPainel: acessosAtualizados.map(item => item.painel || ''),
            acessoUsuario: acessosAtualizados.map(item => item.usuario || ''),
            acessoSenha: acessosAtualizados.map(item => item.senha || ''),
            acessoLocalInstalacao: acessosAtualizados.map(item => item.localInstalacao || ''),
            acessoUrlAtivarAplicativo: acessosAtualizados.map(item => item.urlAtivarAplicativo || ''),
            acessoEnderecoMac: acessosAtualizados.map(item => item.enderecoMac || ''),
            acessoIdAplicativo: acessosAtualizados.map(item => item.idAplicativo || ''),
            appInstalado: cliente.appInstalado || Boolean(dados.aplicativo),
            status: 'teste'
        });
        logControleClientes('Teste liberado atualizou cliente existente', {
            id: clienteAtualizado?.id,
            nome: clienteAtualizado?.nome,
            telefone: clienteAtualizado?.telefone
        });
        const dadosAtualizados = dadosTesteLiberadoDoCliente(clienteAtualizado);
        const mensagem = montarMensagemTesteLiberado(dadosAtualizados);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            clienteAtualizado.telefone,
            mensagem,
            'Envio do teste liberado'
        );
        const destino = envioWhatsApp.destino;
        console.log(`[clientes] Teste liberado enviado para ${destino}. id=${envioWhatsApp.mensagemId || 'sem-id'}`);
        logControleClientes('Teste liberado enviado', {
            clienteId: clienteAtualizado.id,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack
        });
        agendarEncerramentoTeste(client, destino);
        return res.redirect(montarUrlListaClientesMensagem('Teste gratis liberado enviado e cadastro atualizado'));
    } catch (err) {
        console.error(`[clientes] Falha ao enviar teste liberado para cliente ${cliente.id}: ${err.message}`);
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Erro ao enviar teste: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-planos-teste-expirado', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes/todos?mensagem=Cliente nao encontrado');
    }

    if (!clienteTesteExpirado(cliente)) {
        return res.redirect(montarUrlListaClientesMensagem('Este cliente nao e um teste gratis expirado.'));
    }

    const vencimento = cliente.dataVencimento || cliente.vencimento || '';
    const jaEnviado = await avisoRenovacaoProgramadoExiste(
        cliente.id,
        vencimento,
        CODIGO_TESTE_EXPIRADO_PLANOS_MANUAL
    );

    if (jaEnviado) {
        return res.redirect(montarUrlListaClientesMensagem('A tela de planos deste teste expirado ja foi enviada uma vez.'));
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        logControleClientes('Planos de teste expirado nao enviados', {
            clienteId: cliente.id,
            motivo: 'WhatsApp desconectado'
        });
        return res.redirect(montarUrlListaClientesMensagem('WhatsApp nao esta conectado.'));
    }

    try {
        const planos = await obterPlanosRenovacaoManual();
        const mensagem = await montarMensagemPlanosTesteExpiradoManual(cliente, planos);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio dos planos do teste expirado'
        );
        const destino = envioWhatsApp.destino;

        await registrarAvisoRenovacaoProgramado(cliente.id, vencimento, CODIGO_TESTE_EXPIRADO_PLANOS_MANUAL);
        await adicionarNotaCliente(cliente.id, 'Tela de planos para teste expirado enviada manualmente pelo WhatsApp.');
        logControleClientes('Planos de teste expirado enviados', {
            clienteId: cliente.id,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack
        });

        return res.redirect(montarUrlListaClientesMensagem('Tela de planos enviada para o teste expirado.'));
    } catch (err) {
        logControleClientes('Erro ao enviar planos de teste expirado', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlListaClientesMensagem(`Erro ao enviar planos: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-modelo', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente nao encontrado.'));
    }

    const modeloId = String(req.body?.modeloId || '').trim();
    if (!modeloId) {
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('Escolha um modelo para enviar.')}`);
    }

    const modelo = await buscarModeloPorId(modeloId);
    if (!modelo || Number(modelo.ativo) === 0) {
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('Modelo nao encontrado ou inativo.')}`);
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('WhatsApp nao esta conectado.')}`);
    }

    try {
        const config = await obterConfiguracoes();
        const vencimento = cliente.dataVencimento || cliente.vencimento || '';
        const dias = vencimento ? calcularDiasRestantes(vencimento) : '';
        const telefoneInstalacao = telefoneCampanhaAmizade(status, config);
        const mensagem = await montarMensagemModeloManual(cliente, modelo, {
            dias,
            telefoneWhatsApp: formatarTelefoneCampanha(telefoneInstalacao)
        });

        if (!String(mensagem || '').trim()) {
            return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('Este modelo esta sem mensagem cadastrada.')}`);
        }

        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            `Envio manual do modelo ${modelo.titulo || modelo.id}`
        );

        let pixEnviado = null;
        let erroPix = '';
        if (modeloManualEnviaPix(modelo)) {
            try {
                const planoPix = await prepararPlanoPixPlanoAtual(cliente);
                pixEnviado = planoPix?.valorNumero > 0
                    ? await enviarQRCodePIXParaDestino(client, envioWhatsApp.destino, planoPix, {
                        tipo: 'renovacao',
                        nomeCliente: cliente.nome || 'cliente',
                        clienteId: cliente.id,
                        plano: cliente.plano,
                        tipoPlanoId: cliente.tipoPlanoId,
                        diasContrato: cliente.diasContrato,
                        valorPlano: planoPix.valor,
                        assinaturaApp: '0,00'
                    })
                    : false;
                if (!pixEnviado) erroPix = 'Plano sem valor ou falha no envio do QR Code.';
            } catch (err) {
                pixEnviado = false;
                erroPix = err.message;
            }
        }

        await adicionarNotaCliente(
            cliente.id,
            `Modelo "${modelo.titulo || modelo.id}" enviado manualmente pelo WhatsApp.${pixEnviado === true ?' PIX do plano enviado em seguida.' : pixEnviado === false ?` PIX não enviado: ${erroPix}` : ''}`
        );
        logControleClientes('Modelo manual enviado ao cliente', {
            clienteId: cliente.id,
            modeloId: modelo.id,
            modeloTitulo: modelo.titulo,
            destino: envioWhatsApp.destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            pixEnviado,
            erroPix
        });

        const mensagemRetorno = pixEnviado === true
            ? `Modelo "${modelo.titulo || modelo.id}" e PIX do plano enviados para ${cliente.nome}.`
            : pixEnviado === false
                ? `Modelo enviado para ${cliente.nome}, mas não foi possível enviar o PIX do plano.`
                : `Modelo "${modelo.titulo || modelo.id}" enviado para ${cliente.nome}.`;
        return res.redirect(montarUrlClienteMensagem(cliente.id, mensagemRetorno));
    } catch (err) {
        logControleClientes('Erro ao enviar modelo manual', {
            clienteId: cliente.id,
            modeloId: modelo.id,
            erro: err.message
        });
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent(`Erro ao enviar modelo: ${err.message}`)}`);
    }
});

router.post('/clientes/acoes-lote', async (req, res) => {
    const idsRecebidos = Array.isArray(req.body.clienteIds) ? req.body.clienteIds : [req.body.clienteIds];
    const ids = [...new Set(idsRecebidos.map(valor => Number.parseInt(valor, 10)).filter(Number.isFinite))].slice(0, 50);
    const acao = req.body.acao === 'cobranca' ? 'cobranca' : 'aviso';
    const retornoInformado = String(req.body.retorno || '');
    const retorno = retornoInformado.startsWith('/clientes/todos') ? retornoInformado : '/clientes/todos';

    if (!ids.length) return res.redirect(`${retorno}${retorno.includes('?') ? '&' : '?'}mensagem=${encodeURIComponent('Selecione ao menos um cliente.')}`);

    const statusWhatsapp = getStatusWhatsApp();
    const client = getClient();
    if (!client || !statusWhatsapp.conectado) {
        return res.redirect(`${retorno}${retorno.includes('?') ? '&' : '?'}mensagem=${encodeURIComponent('WhatsApp não está conectado.')}`);
    }

    const planosTeste = acao === 'aviso' ? await obterPlanosRenovacaoManual() : [];
    let enviados = 0;
    let ignorados = 0;

    for (const id of ids) {
        const cliente = await buscarClientePorId(id);
        const vencimento = cliente?.dataVencimento || cliente?.vencimento || '';
        if (!cliente || !normalizarTelefone(cliente.telefone) || !vencimento) {
            ignorados += 1;
            continue;
        }

        const expirado = vencimentoExpirou(vencimento);
        if ((acao === 'cobranca' && !expirado) || (acao === 'aviso' && expirado && !clienteTesteExpirado(cliente))) {
            ignorados += 1;
            continue;
        }

        try {
            const mensagem = acao === 'cobranca'
                ? await montarMensagemCobrancaVencido(cliente)
                : clienteTesteExpirado(cliente)
                    ? await montarMensagemPlanosTesteExpiradoManual(cliente, planosTeste)
                    : await montarMensagemPorModelo(cliente, Math.max(0, calcularDiasRestantes(vencimento) || 0));
            await enviarMensagemWhatsAppComFallback(client, cliente.telefone, mensagem, `Ação em lote: ${acao}`);
            await adicionarNotaCliente(cliente.id, `${acao === 'cobranca' ? 'Cobrança' : 'Aviso de renovação'} enviado em lote pelo WhatsApp.`);
            await registrarEventoCliente(cliente.id, `envio_${acao}_lote`, `${acao === 'cobranca' ? 'Cobrança' : 'Aviso de renovação'} enviado em lote.`, {
                responsavel: req.usuarioPainel || 'sistema', origem: 'painel_clientes'
            });
            enviados += 1;
        } catch (err) {
            ignorados += 1;
            logControleClientes('Falha em ação de renovação em lote', { clienteId: cliente.id, acao, erro: err.message });
        }
    }

    logControleClientes('Ação de renovação em lote concluída', { acao, selecionados: ids.length, enviados, ignorados });
    const separador = retorno.includes('?') ? '&' : '?';
    return res.redirect(`${retorno}${separador}mensagem=${encodeURIComponent(`${enviados} envio(s) concluído(s); ${ignorados} ignorado(s).`)}`);
});

router.post('/clientes/:id/enviar-aviso-vencimento', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente nao encontrado.'));
    }

    const vencimento = cliente.dataVencimento || cliente.vencimento || '';
    if (!vencimento) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente sem data de vencimento cadastrada.'));
    }

    if (vencimentoExpirou(vencimento)) {
        return res.redirect(montarUrlListaClientesMensagem('Este cliente ja esta vencido. Use a cobranca de vencido no financeiro.'));
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        return res.redirect(montarUrlListaClientesMensagem('WhatsApp nao esta conectado.'));
    }

    try {
        const dias = Math.max(0, calcularDiasRestantes(vencimento) || 0);
        const mensagem = await montarMensagemPorModelo(cliente, dias);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio manual de vencimento proximo'
        );

        const planoPix = await prepararPlanoPixPlanoAtual(cliente);
        const pixEnviado = planoPix?.valorNumero > 0
            ? await enviarQRCodePIXParaDestino(client, envioWhatsApp.destino, planoPix, {
                tipo: 'renovacao',
                nomeCliente: cliente.nome || 'cliente',
                clienteId: cliente.id,
                plano: cliente.plano,
                tipoPlanoId: cliente.tipoPlanoId,
                diasContrato: cliente.diasContrato,
                valorPlano: planoPix.valor,
                assinaturaApp: '0,00'
            })
            : false;

        await adicionarNotaCliente(cliente.id, `Aviso manual de vencimento proximo enviado pelo WhatsApp para ${vencimento}.${pixEnviado ?' PIX do plano enviado em seguida.' : ' PIX não enviado; verifique o valor e a configuração PIX.'}`);
        logControleClientes('Aviso manual de vencimento enviado', {
            clienteId: cliente.id,
            destino: envioWhatsApp.destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            pixEnviado
        });

        return res.redirect(montarUrlListaClientesMensagem(pixEnviado
            ? `Aviso de vencimento e PIX do plano enviados para ${cliente.nome}.`
            : `Aviso enviado para ${cliente.nome}, mas não foi possível enviar o PIX do plano.`));
    } catch (err) {
        logControleClientes('Erro ao enviar aviso manual de vencimento', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlListaClientesMensagem(`Erro ao enviar aviso: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-campanha-amizade', async (req, res) => {
    try {
        const { cliente } = await enviarCampanhaAmizadeManualPorId(
            req.params.id,
            'Campanha amizade que vale presente manual'
        );

        return res.redirect(montarUrlListaClientesMensagem(`Campanha enviada para ${cliente.nome}.`));
    } catch (err) {
        logControleClientes('Erro ao enviar campanha amizade manual', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlListaClientesMensagem(`Erro ao enviar campanha: ${err.message}`));
    }
});

router.post('/clientes/disparar-amizade-presente-cliente', async (req, res) => {
    const clienteId = req.body?.clienteId;
    const retorno = retornoCampanha(req);

    if (!clienteId) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Selecione um cliente para testar a campanha.')}`);
    }

    try {
        const { cliente } = await enviarCampanhaAmizadeManualPorId(
            clienteId,
            'Campanha amizade que vale presente teste individual'
        );

        return res.redirect(`${retorno}?mensagem=${encodeURIComponent(`Campanha de teste enviada para ${cliente.nome}.`)}`);
    } catch (err) {
        logControleClientes('Erro ao enviar campanha amizade teste individual', {
            clienteId,
            erro: err.message
        });
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent(`Erro ao testar campanha: ${err.message}`)}`);
    }
});

router.post('/manutencao/whatsapp/novo-qr', async (req, res) => {
    try {
        const resultado = await gerarNovoQrCodeWhatsApp({ motivo: 'Solicitado pelo painel de manutencao' });
        logControleClientes('Sessao do WhatsApp reiniciada para gerar novo QR Code', {
            status: resultado.status,
            authDataPath: resultado.authDataPath
        });
        res.redirect('/qr');
    } catch (err) {
        logControleClientes('Erro ao reiniciar sessao do WhatsApp para novo QR Code', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao gerar novo QR Code: ${err.message}`)}`);
    }
});

router.post('/manutencao/whatsapp/reconectar', async (req, res) => {
    try {
        const resultado = await recuperarWhatsAppAutomaticamente({
            limparSessao: false,
            motivo: 'Recuperacao segura solicitada pelo painel de manutencao'
        });

        logControleClientes('Recuperacao segura do WhatsApp solicitada pelo painel de manutencao', {
            status: resultado.status,
            motivo: resultado.motivo || ''
        });

        const mensagem = resultado.status === 'ignorado'
            ? 'A recuperacao do WhatsApp ja esta em andamento. Aguarde alguns segundos e atualize esta pagina.'
            : 'Reconexao segura iniciada. A sessao atual foi preservada; aguarde alguns segundos e confira o status do WhatsApp.';
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        logControleClientes('Erro na recuperacao segura do WhatsApp pelo painel de manutencao', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao tentar reconectar o WhatsApp: ${err.message}`)}`);
    }
});

router.post('/manutencao/whatsapp/numero', async (req, res) => {
    if (instalacaoAdministrador()) {
        return res.redirect(`/manutencao?mensagem=${encodeURIComponent('A troca do WhatsApp desta instalacao deve ser feita pelo Painel Mestre.')}`);
    }

    try {
        const numero = validarNumeroWhatsappRobo(req.body.numeroWhatsappRobo);
        salvarNumeroWhatsappRoboConfigurado(numero);
        const resultado = await gerarNovoQrCodeWhatsApp({ motivo: `Numero do WhatsApp do robo alterado para ${numero} pelo painel de manutencao` });

        logControleClientes('Numero do WhatsApp do robo alterado', {
            numero,
            status: resultado.status,
            authDataPath: resultado.authDataPath
        });

        res.redirect('/qr');
    } catch (err) {
        logControleClientes('Erro ao alterar numero do WhatsApp do robo', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao alterar WhatsApp do robo: ${err.message}`)}`);
    }
});

router.post('/clientes/:id/excluir', async (req, res) => {
    res.redirect(montarUrlClienteMensagem(
        req.params.id,
        'A exclusao direta foi desativada. Use a area Privacidade para exportar ou anonimizar os dados com seguranca.'
    ));
});

router.post('/clientes/verificar-renovacoes', async (req, res) => {
    try {
        const diasAviso = Number(process.env.RENOVACAO_DIAS_AVISO || 3);
        console.log('[dashboard] Disparo manual de avisos solicitado.');
        logControleClientes('Disparo manual de avisos solicitado');

        const resultado = await verificarRenovacoes({ getClient, getStatusWhatsApp, diasAviso });
        const resultadoUmaHora = await verificarClientesVencendoUmaHora({ getClient, getStatusWhatsApp });
        const resultadoVencidosDias = await verificarClientesVencidosPorDias({ getClient, getStatusWhatsApp });

        if (resultado.erro) {
            console.log(`[dashboard] Disparo manual de avisos falhou: ${resultado.erro}`);
            logControleClientes('Disparo manual de avisos falhou', { erro: resultado.erro });
            return res.redirect(`/clientes?mensagem=${encodeURIComponent(resultado.erro)}`);
        }

        const enviados = Number(resultado.enviados || 0);
        const aniversarios = Number(resultado.aniversarios || 0);
        const ignorados = Number(resultado.ignorados || 0);
        const enviadosUmaHora = Number(resultadoUmaHora.enviados || 0);
        const ignoradosUmaHora = Number(resultadoUmaHora.ignorados || 0);
        const enviadosVencidosDias = Number(resultadoVencidosDias.enviados || 0);
        const ignoradosVencidosDias = Number(resultadoVencidosDias.ignorados || 0);
        const totalEnviados = enviados + aniversarios + enviadosUmaHora + enviadosVencidosDias;
        const totalIgnorados = ignorados + ignoradosUmaHora + ignoradosVencidosDias;
        const mensagem = totalEnviados
            ?`${enviados} aviso(s) de renovação, ${enviadosUmaHora} aviso(s) de 1 hora, ${enviadosVencidosDias} aviso(s) de vencidos 2/5 dias e ${aniversarios} aniversário(s) enviado(s).`
            : 'Nenhum aviso novo para enviar agora. Os avisos podem já ter sido enviados para este vencimento.';

        console.log(`[dashboard] Disparo manual concluído: renovacao=${enviados}, umaHora=${enviadosUmaHora}, vencidosDias=${enviadosVencidosDias}, aniversarios=${aniversarios}, ignorados=${totalIgnorados}.`);
        logControleClientes('Disparo manual de avisos concluido', {
            renovacao: enviados,
            umaHora: enviadosUmaHora,
            vencidosDias: enviadosVencidosDias,
            aniversarios,
            ignorados: totalIgnorados
        });

        res.redirect(`/clientes?mensagem=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        console.error(`[dashboard] Erro no disparo manual de avisos: ${err.message}`);
        logControleClientes('Erro no disparo manual de avisos', { erro: err.message });
        res.redirect(`/clientes?mensagem=${encodeURIComponent(`Erro ao disparar avisos: ${err.message}`)}`);
    }
});

function retornoCampanha(req) {
    const retorno = String(req.body?.retorno || '').trim();
    return retorno === '/clientes' ? '/clientes' : '/campanhas';
}

function iniciarExecucaoCampanhaAmizade(config, opcoes = {}) {
    setImmediate(() => {
        executarCampanhaAmizadeEmLotes(opcoes)
            .catch((err) => {
                if (err.campanhaCancelada) {
                    campanhaAmizadeExecucao.cancelada = true;
                    campanhaAmizadeExecucao.canceladaEm = campanhaAmizadeExecucao.canceladaEm || new Date().toISOString();
                    campanhaAmizadeExecucao.mensagem = `Campanha cancelada: ${campanhaAmizadeExecucao.enviados} enviado(s), ${campanhaAmizadeExecucao.ignorados} ignorado(s), ${campanhaAmizadeExecucao.jaEnviados} ja tinham recebido.`;
                    sincronizarCampanhaAtual('cancelada', {
                        finalizadaEm: new Date().toISOString()
                    });
                    logControleClientes('Campanha amizade cancelada pelo painel', {
                        enviados: campanhaAmizadeExecucao.enviados,
                        ignorados: campanhaAmizadeExecucao.ignorados,
                        jaEnviados: campanhaAmizadeExecucao.jaEnviados
                    });
                    return;
                }

                campanhaAmizadeExecucao.erro = err.message;
                campanhaAmizadeExecucao.erros = Math.max(1, Number(campanhaAmizadeExecucao.erros || 0));
                const bloqueioHorario = /dias úteis|horário comercial|campanhas permitidas/i.test(String(err.message || ''));
                const orientacao = bloqueioHorario
                    ? `Aguarde a janela permitida (${textoJanelaCampanha(config)}) ou altere a regra em Manutenção.`
                    : 'Retome depois que o WhatsApp estabilizar.';
                campanhaAmizadeExecucao.mensagem = `Campanha interrompida: ${err.message}. ${orientacao}`;
                sincronizarCampanhaAtual('interrompida', {
                    erros: campanhaAmizadeExecucao.erros
                });
                logControleClientes('Campanha amizade interrompida', { erro: err.message });
            })
            .finally(() => {
                campanhaAmizadeExecucao.emAndamento = false;
                campanhaAmizadeExecucao.pausada = false;
                campanhaAmizadeExecucao.finalizadaEm = new Date().toISOString();
                campanhaAmizadeExecucao.proximoLoteEm = '';
                const statusFinal = campanhaAmizadeExecucao.cancelada ? 'cancelada' : campanhaAmizadeExecucao.erro ? 'interrompida' : 'concluida';
                sincronizarCampanhaAtual(statusFinal, {
                    finalizadaEm: campanhaAmizadeExecucao.finalizadaEm
                });
                enviarWebhook(config.alertaWebhookUrl, {
                    tipo: campanhaAmizadeExecucao.cancelada ? 'campanha_cancelada' : campanhaAmizadeExecucao.erro ? 'campanha_interrompida' : 'campanha_concluida',
                    nivel: campanhaAmizadeExecucao.cancelada ? 'aviso' : campanhaAmizadeExecucao.erro ? 'erro' : 'sucesso',
                    mensagem: campanhaAmizadeExecucao.mensagem,
                    data: campanhaAmizadeExecucao.finalizadaEm,
                    detalhes: {
                        campanhaId: campanhaAmizadeExecucao.id,
                        enviados: campanhaAmizadeExecucao.enviados,
                        ignorados: campanhaAmizadeExecucao.ignorados,
                        jaEnviados: campanhaAmizadeExecucao.jaEnviados,
                        erro: campanhaAmizadeExecucao.erro || ''
                    }
                });
            });
    });
}

router.post('/campanhas/amizade/retomar', async (req, res) => {
    const retorno = retornoCampanha(req);

    if (campanhaAmizadeExecucao.emAndamento) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Campanha ja esta em andamento. Aguarde finalizar antes de retomar outra.')}`);
    }

    const status = getStatusWhatsApp();
    const client = getClient();
    const config = await obterConfiguracoes();

    if (!campanhaDentroHorario(config)) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent(mensagemCampanhaForaHorario(config))}`);
    }

    if (!client || !status.conectado) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('WhatsApp nao esta conectado. Reconecte antes de retomar a campanha.')}`);
    }

    if (!fs.existsSync(obterImagemBaseCampanhaAmizade(config))) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Imagem da campanha nao encontrada. Gere o pacote novamente.')}`);
    }

    const campanhaId = Number(req.body?.campanhaId || 0);
    const campanha = await buscarCampanhaRetomavel(campanhaId || null);

    if (!campanha) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Nenhuma campanha pendente encontrada para retomar.')}`);
    }

    limparStatusCampanhaAmizade();
    await carregarResumoCampanhaNaMemoria(campanha);
    campanhaAmizadeExecucao.emAndamento = true;
    campanhaAmizadeExecucao.pausada = false;
    campanhaAmizadeExecucao.cancelada = false;
    campanhaAmizadeExecucao.erro = '';
    campanhaAmizadeExecucao.finalizadaEm = '';
    campanhaAmizadeExecucao.mensagem = 'Campanha retomada. O sistema vai enviar somente os clientes pendentes.';
    await sincronizarCampanhaAtual('em_andamento');
    await enviarWebhook(config.alertaWebhookUrl, {
        tipo: 'campanha_retomada_apos_reinicio',
        nivel: 'info',
        mensagem: campanhaAmizadeExecucao.mensagem,
        data: new Date().toISOString(),
        detalhes: {
            campanhaId: campanhaAmizadeExecucao.id,
            enviados: campanhaAmizadeExecucao.enviados,
            ignorados: campanhaAmizadeExecucao.ignorados,
            jaEnviados: campanhaAmizadeExecucao.jaEnviados
        }
    });

    iniciarExecucaoCampanhaAmizade(config, { retomar: true });

    return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Campanha retomada. O envio continuara apenas para clientes pendentes.')}`);
});

router.post('/campanhas/amizade/pausar', async (req, res) => {
    if (!campanhaAmizadeExecucao.emAndamento) {
        return res.redirect(`${retornoCampanha(req)}?mensagem=${encodeURIComponent('Nenhuma campanha em andamento para pausar.')}`);
    }

    const config = await obterConfiguracoes();
    campanhaAmizadeExecucao.pausada = true;
    campanhaAmizadeExecucao.pausadaEm = new Date().toISOString();
    campanhaAmizadeExecucao.mensagem = 'Campanha pausada. Clique em continuar para retomar os envios.';
    await sincronizarCampanhaAtual('pausada');
    await enviarWebhook(config.alertaWebhookUrl, {
        tipo: 'campanha_pausada',
        nivel: 'aviso',
        mensagem: campanhaAmizadeExecucao.mensagem,
        data: campanhaAmizadeExecucao.pausadaEm,
        detalhes: {
            campanhaId: campanhaAmizadeExecucao.id,
            enviados: campanhaAmizadeExecucao.enviados,
            ignorados: campanhaAmizadeExecucao.ignorados,
            jaEnviados: campanhaAmizadeExecucao.jaEnviados,
            loteAtual: campanhaAmizadeExecucao.loteAtual,
            totalLotes: campanhaAmizadeExecucao.totalLotes
        }
    });

    return res.redirect(`${retornoCampanha(req)}?mensagem=${encodeURIComponent('Campanha pausada. Os envios restantes ficam aguardando continuidade.')}`);
});

router.post('/campanhas/amizade/continuar', async (req, res) => {
    if (!campanhaAmizadeExecucao.emAndamento) {
        return res.redirect(`${retornoCampanha(req)}?mensagem=${encodeURIComponent('Nenhuma campanha em andamento para continuar.')}`);
    }

    const config = await obterConfiguracoes();
    campanhaAmizadeExecucao.pausada = false;
    campanhaAmizadeExecucao.mensagem = 'Campanha retomada. Os proximos envios continuam respeitando os lotes e intervalos.';
    await sincronizarCampanhaAtual('em_andamento');
    await enviarWebhook(config.alertaWebhookUrl, {
        tipo: 'campanha_retomada',
        nivel: 'info',
        mensagem: campanhaAmizadeExecucao.mensagem,
        data: new Date().toISOString(),
        detalhes: {
            campanhaId: campanhaAmizadeExecucao.id,
            enviados: campanhaAmizadeExecucao.enviados,
            ignorados: campanhaAmizadeExecucao.ignorados,
            jaEnviados: campanhaAmizadeExecucao.jaEnviados,
            loteAtual: campanhaAmizadeExecucao.loteAtual,
            totalLotes: campanhaAmizadeExecucao.totalLotes
        }
    });

    return res.redirect(`${retornoCampanha(req)}?mensagem=${encodeURIComponent('Campanha retomada.')}`);
});

router.post('/campanhas/amizade/cancelar', async (req, res) => {
    if (!campanhaAmizadeExecucao.emAndamento) {
        return res.redirect(`${retornoCampanha(req)}?mensagem=${encodeURIComponent('Nenhuma campanha em andamento para cancelar.')}`);
    }

    const config = await obterConfiguracoes();
    campanhaAmizadeExecucao.cancelada = true;
    campanhaAmizadeExecucao.pausada = false;
    campanhaAmizadeExecucao.canceladaEm = new Date().toISOString();
    campanhaAmizadeExecucao.mensagem = 'Cancelamento solicitado. O envio sera encerrado no proximo ponto seguro.';
    await sincronizarCampanhaAtual('cancelando');
    await enviarWebhook(config.alertaWebhookUrl, {
        tipo: 'campanha_cancelamento_solicitado',
        nivel: 'aviso',
        mensagem: campanhaAmizadeExecucao.mensagem,
        data: campanhaAmizadeExecucao.canceladaEm,
        detalhes: {
            campanhaId: campanhaAmizadeExecucao.id,
            enviados: campanhaAmizadeExecucao.enviados,
            ignorados: campanhaAmizadeExecucao.ignorados,
            jaEnviados: campanhaAmizadeExecucao.jaEnviados,
            loteAtual: campanhaAmizadeExecucao.loteAtual,
            totalLotes: campanhaAmizadeExecucao.totalLotes
        }
    });

    return res.redirect(`${retornoCampanha(req)}?mensagem=${encodeURIComponent('Cancelamento solicitado. Aguarde o encerramento seguro da campanha.')}`);
});

router.post('/clientes/disparar-amizade-presente', async (req, res) => {
    const status = getStatusWhatsApp();
    const client = getClient();
    const config = await obterConfiguracoes();
    const retorno = retornoCampanha(req);

    if (!campanhaDentroHorario(config)) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent(mensagemCampanhaForaHorario(config))}`);
    }

    if (!client || !status.conectado) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('WhatsApp nao esta conectado.')}`);
    }

    if (!fs.existsSync(obterImagemBaseCampanhaAmizade(config))) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Imagem da campanha nao encontrada. Gere o pacote novamente.')}`);
    }

    if (campanhaAmizadeExecucao.emAndamento) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Campanha ja esta em andamento. Aguarde finalizar para iniciar outro envio.')}`);
    }

    try {
        limparStatusCampanhaAmizade();
        const campanha = await criarCampanha({
            nome: 'Amizade que vale presente',
            modeloChave: 'campanha_amizade_presente',
            publico: 'Clientes ativos, exceto testes',
            imagem: path.basename(obterImagemBaseCampanhaAmizade(config)),
            status: 'em_andamento',
            iniciadaEm: new Date().toISOString(),
            mensagem: 'Campanha iniciada. Enviando em lotes de 10 clientes, com intervalo aleatorio entre 150 e 210 segundos.'
        });

        campanhaAmizadeExecucao.id = campanha?.id || null;
        campanhaAmizadeExecucao.emAndamento = true;
        campanhaAmizadeExecucao.pausada = false;
        campanhaAmizadeExecucao.cancelada = false;
        campanhaAmizadeExecucao.iniciadaEm = new Date().toISOString();
        campanhaAmizadeExecucao.mensagem = 'Campanha iniciada. Enviando em lotes de 10 clientes, com intervalo aleatorio entre 150 e 210 segundos.';
        await enviarWebhook(config.alertaWebhookUrl, {
            tipo: 'campanha_iniciada',
            nivel: 'info',
            mensagem: campanhaAmizadeExecucao.mensagem,
            data: campanhaAmizadeExecucao.iniciadaEm,
            detalhes: {
                campanhaId: campanhaAmizadeExecucao.id,
                nome: 'Amizade que vale presente',
                loteTamanho: CAMPANHA_AMIZADE_LOTE_TAMANHO,
                intervaloLotesSegundos: [150, 210]
            }
        });

        iniciarExecucaoCampanhaAmizade(config);
    } catch (err) {
        logControleClientes('Erro ao preparar campanha amizade', { erro: err.message });
        campanhaAmizadeExecucao.emAndamento = false;
        campanhaAmizadeExecucao.erro = err.message;
        await sincronizarCampanhaAtual('erro', {
            erros: 1,
            finalizadaEm: new Date().toISOString()
        });
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent(`Erro ao preparar campanha: ${err.message}`)}`);
    }

    return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Campanha iniciada. O envio sera feito em lotes de 10 clientes, com intervalo aleatorio entre 150 e 210 segundos. Aguarde finalizar antes de iniciar outra campanha.')}`);
});

router.post('/clientes/cobrar-vencidos', async (req, res) => {
    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        return res.redirect(`/financeiro?mensagem=${encodeURIComponent('WhatsApp não está conectado.')}`);
    }

    const clientes = await listarClientesVencidosParaCobranca(CODIGO_COBRANCA_VENCIDO);
    let enviados = 0;
    let ignorados = 0;

    for (const cliente of clientes) {
        const telefone = normalizarTelefone(cliente.telefone);
        const vencimento = cliente.vencimentoEfetivo || cliente.dataVencimento || cliente.vencimento;

        if (!telefone || !vencimento) {
            ignorados += 1;
            continue;
        }

        const mensagem = await montarMensagemCobrancaVencido(cliente);
        try {
            const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
                client,
                telefone,
                mensagem,
                'Envio de cobranca de vencido'
            );
            enviados += 1;
            await registrarAvisoRenovacaoProgramado(cliente.id, vencimento, CODIGO_COBRANCA_VENCIDO);
            await adicionarNotaCliente(cliente.id, `Cobrança de vencido enviada pelo WhatsApp para o vencimento ${vencimento}.`);
            logControleClientes('Cobranca de vencido enviada', {
                clienteId: cliente.id,
                destino: envioWhatsApp.destino,
                mensagemId: envioWhatsApp.mensagemId,
                ack: envioWhatsApp.ack
            });
        } catch (erroEnvio) {
            ignorados += 1;
            logControleClientes('Erro ao enviar cobranca de vencido', {
                clienteId: cliente.id,
                erro: erroEnvio.message
            });
        }
    }

    res.redirect(`/financeiro?mensagem=${encodeURIComponent(`${enviados} cobrança(s) enviada(s), ${ignorados} ignorada(s).`)}`);
});

router.renderizarPaginaCampanhas = renderizarPaginaCampanhas;
module.exports = router;
