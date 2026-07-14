const express = require('express');
const fs = require('fs');
const path = require('path');
const {
    listarClientes,
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
    removerCliente,
    normalizarTelefone,
    listarNotasCliente,
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
const { getClient, getStatusWhatsApp } = require('../config/whatsapp');
const {
    listarModelos,
    buscarModeloPorId,
    salvarModelo,
    removerModelo,
    montarMensagemCobrancaVencido
} = require('../services/modelosMensagem');
const {
    obterConfiguracoes,
    salvarConfiguracoesPainel,
    salvarConfiguracoesRobo,
    salvarImagemRobo,
    salvarConfiguracoesPix,
    salvarConfiguracoesMonitoramento,
    salvarConfiguracoesAcesso
} = require('../services/configuracoesPainel');
const { atualizarLicencaComercial, calcularEstadoLicenca, instalacaoAdministrador } = require('../services/licencaService');
const {
    criarBackupManual,
    restaurarBackup,
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
    enviarQRCodePIXParaDestino,
    listarPlanosComerciais,
    montarPlanosPadraoComerciais
} = require('../services/pixService');
const { testarWebhookAlertas } = require('../services/monitoramentoComercial');
const menuRenovacao = require('../menus/renovacao');
const { agoraSaoPauloInput, formatarDataHoraBrasil, partesDataHora } = require('../utils/dataHora');

const router = express.Router();
const DIAS_DASHBOARD = 7;
const CODIGO_COBRANCA_VENCIDO = -90;
const CODIGO_TESTE_EXPIRADO_PLANOS_MANUAL = -33;
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ?'/var/data' : path.join(__dirname, '..'));
const ASSETS_DIR = path.join(DATA_DIR, 'assets');
const CLIENTES_AUTO_REFRESH_MS = Number(process.env.CLIENTES_AUTO_REFRESH_MS || 30000);
const DASHBOARD_AUTO_REFRESH_MS = Number(process.env.DASHBOARD_AUTO_REFRESH_MS || 30000);
const CLIENTES_POR_PAGINA = 6;
const FINANCEIRO_POR_PAGINA = 10;
const DASHBOARD_VENCIMENTOS_POR_PAGINA = 4;
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

function paginarItens(itens = [], pagina = 1, porPagina = 10) {
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

    Object.entries(params).forEach(([chave, valor]) => {
        if (valor !== undefined && valor !== null && String(valor) !== '') {
            query.set(chave, String(valor));
        }
    });

    query.set('pagina', String(pagina));
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
        tag: query.tag || ''
    };
}

function filtrosFinanceiroQuery(query = {}) {
    const status = String(query.status || '');

    return {
        busca: String(query.busca || '').trim(),
        mes: String(query.mes || mesAtualInput()).slice(0, 7),
        dataInicio: String(query.dataInicio || '').slice(0, 10),
        dataFim: String(query.dataFim || '').slice(0, 10),
        status: ['validos', 'removidos', 'todos'].includes(status) ?status : 'validos'
    };
}

function lerUploadMultipart(req) {
    return new Promise((resolve, reject) => {
        const tipo = req.headers['content-type'] || '';
        const match = tipo.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

        if (!match) {
            reject(new Error('Formulario de upload invalido.'));
            return;
        }

        const boundary = `--${match[1] || match[2]}`;
        const partes = [];

        req.on('data', parte => partes.push(parte));
        req.on('error', reject);
        req.on('end', () => {
            const buffer = Buffer.concat(partes);
            const conteudo = buffer.toString('binary');
            const inicioCabecalho = conteudo.indexOf('\r\n\r\n');
            const filenameMatch = conteudo.match(/filename="([^"]+)"/i);

            if (!filenameMatch || inicioCabecalho < 0) {
                reject(new Error('Selecione um arquivo de logo.'));
                return;
            }

            const inicioArquivo = inicioCabecalho + 4;
            const fimMarcador = Buffer.from(`\r\n${boundary}`, 'binary');
            const fimArquivo = buffer.indexOf(fimMarcador, inicioArquivo);

            if (fimArquivo < 0) {
                reject(new Error('Não foi possível ler o arquivo enviado.'));
                return;
            }

            resolve({
                filename: path.basename(filenameMatch[1]),
                buffer: buffer.slice(inicioArquivo, fimArquivo)
            });
        });
    });
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
    if (!vencimento) return null;

    const hoje = new Date(`${hojeSaoPauloISO()}T00:00:00`);
    const dataVencimento = new Date(`${String(vencimento).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(dataVencimento.getTime())) return null;

    const umDia = 24 * 60 * 60 * 1000;

    return Math.round((dataVencimento - hoje) / umDia);
}

function calcularResumo(clientes) {
    const hoje = hojeISO();
    const limiteISO = adicionarDiasISO(DIAS_DASHBOARD);
    const fimMesISO = fimMesSaoPauloISO();

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
            const data = vencimento.slice(0, 10);
            return vencimento && !vencimentoExpirou(vencimento) && data >= hoje && data <= limiteISO;
        }).length,
        vencemMes: clientes.filter(cliente => {
            const vencimento = vencimentoCliente(cliente);
            const data = vencimento.slice(0, 10);
            return !clienteEhTeste(cliente) && vencimento && !vencimentoExpirou(vencimento) && data >= hoje && data <= fimMesISO;
        }).length
    };
}

function clientesComVencimentoProximo(clientes) {
    const limiteISO = adicionarDiasISO(DIAS_DASHBOARD);

    return clientes
        .filter(cliente => {
            const vencimento = vencimentoCliente(cliente).slice(0, 10);
            return vencimento && vencimento <= limiteISO;
        })
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
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
        modelos: '<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
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
    const licenca = calcularEstadoLicenca(config);
    const avisoAvaliacao = licenca.bloqueioAtivo && licenca.tipo === 'avaliacao' && licenca.permitida
        ?`Período de avaliação: ${Math.max(0, licenca.diasRestantes)} dia(s) restante(s).`
        : '';

    return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
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
            --green: #16a76a;
            --green-soft: #dff8ee;
            --red: #ef4444;
            --red-soft: #ffe5e7;
            --orange: #f08a12;
            --orange-soft: #fff2dc;
            --shadow: 0 1px 2px rgba(15, 23, 42, .08), 0 10px 24px rgba(15, 23, 42, .04);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            background: var(--bg);
            color: var(--ink);
            font-family: var(--font-inter);
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
            background: rgba(255,255,255,.94);
            border-bottom: 1px solid var(--line);
            position: sticky;
            top: 0;
            z-index: 10;
            backdrop-filter: blur(10px);
        }

        .topbar, main {
            width: min(1500px, calc(100% - 28px));
            margin: 0 auto;
        }

        .topbar {
            min-height: 76px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 22px;
        }

        .brand {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            font-size: 18px;
            font-weight: 800;
        }

        .brand form {
            margin: 0;
        }

        .brand-text {
            font-weight: 800;
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
            background: #fff;
            border: 1px solid var(--line);
        }

        nav {
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--muted);
            font-weight: 700;
        }

        .navlink {
            min-height: 42px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 0 16px;
            border-radius: 12px;
            white-space: nowrap;
        }

        .navlink.active {
            background: var(--blue);
            color: #fff;
            box-shadow: 0 8px 16px rgba(67, 104, 232, .25);
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

        .metric, .panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 14px;
            box-shadow: var(--shadow);
        }

        .metric {
            min-height: 142px;
            padding: 26px 28px;
            display: flex;
            justify-content: space-between;
            gap: 16px;
        }

        .metric-label {
            display: block;
            margin-bottom: 14px;
            color: var(--muted);
            font-size: 16px;
            font-weight: 700;
        }

        .metric-value {
            display: block;
            color: var(--ink);
            font-size: 35px;
            font-weight: 800;
            line-height: 1;
        }

        .metric-note {
            display: block;
            margin-top: 14px;
            color: var(--muted);
            font-size: 14px;
            font-weight: 600;
        }

        .metric-icon {
            display: grid;
            place-items: center;
            width: 52px;
            height: 52px;
            border-radius: 14px;
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
            border-bottom: 1px solid var(--line);
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
            background: var(--blue);
            color: #fff;
            font-weight: 800;
            white-space: nowrap;
        }

        .button.green {
            background: #16a34a;
        }

        .button.secondary {
            background: #fff;
            color: var(--ink);
            border-color: var(--line);
            box-shadow: 0 1px 6px rgba(15, 23, 42, .06);
        }

        .button.danger {
            background: var(--red);
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
            grid-template-columns: 74px minmax(120px, 1fr);
            align-items: center;
            margin-top: 7px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
            overflow: hidden;
        }

        .phone-field .phone-prefix {
            min-height: 42px;
            border-right: 1px solid var(--line);
            color: var(--ink);
            background: #f7f8fb;
            font-weight: 700;
            text-align: center;
        }

        .phone-field input {
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
            .topbar, main {
                width: min(100% - 24px, 1250px);
            }

            h1 {
                font-size: 28px;
            }

            .metrics {
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
        }
    </style>
</head>
<body>
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
                <a class="navlink ${ativo === 'planos' ?'active' : ''}" href="/planos">${icon('planos')} Planos</a>
                <a class="navlink ${ativo === 'modelos' ?'active' : ''}" href="/modelos">${icon('modelos')} Modelos</a>
                <a class="navlink ${ativo === 'apps' ?'active' : ''}" href="/apps">${icon('apps')} Apps</a>
                <a class="navlink ${ativo === 'dispositivos' ?'active' : ''}" href="/dispositivos">${icon('dispositivos')} Dispositivos</a>
                <a class="navlink ${ativo === 'paineis' ?'active' : ''}" href="/paineis">${icon('paineis')} Painéis</a>
                <a class="navlink ${ativo === 'financeiro' ?'active' : ''}" href="/financeiro">${icon('financeiro')} Financeiro</a>
                <a class="navlink ${ativo === 'preparacao' ?'active' : ''}" href="/preparacao-comercial">${icon('trend')} Preparação</a>
                <a class="navlink" href="/qr">${icon('whats')} WhatsApp</a>
                <a class="navlink ${ativo === 'manutencao' ?'active' : ''}" href="/manutencao">${icon('manutencao')} Manutenção</a>
                <a class="navlink" href="/logout" title="Sair do painel">${icon('sair')}</a>
            </nav>
        </div>
    </div>
    <main>
        ${avisoAvaliacao ?`<div class="notice">${escapar(avisoAvaliacao)} <a href="/licenca"><strong>Ver licença</strong></a></div>` : ''}
        ${mensagem ?`<div class="notice">${escapar(mensagem)}</div>` : ''}
        ${conteudo}
    </main>
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

function secaoNotasCliente(cliente = {}, notas = []) {
    if (!cliente.id) return '';

    const listaNotas = notas.length
        ?`<div class="notes-list">${notas.map(nota => `<div class="note-item">
            <span class="note-date">${escapar(formatarDataNota(nota.criadoEm))}</span>
            <div>${escapar(nota.texto)}</div>
        </div>`).join('')}</div>`
        : '<div class="empty">Nenhuma nota registrada para este cliente.</div>';

    return `<section class="panel" style="margin-top:24px;">
        <div class="fields">
            <div class="form-section full">Histórico de atendimento</div>
            <div class="full">${listaNotas}</div>
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
        ['Mais usados', ['😀', '😃', '😄', '😁', '😉', '😊', '😍', '🤔', '👍', '🙏', '💪', '👏', '💬', '📲', '📺', '💰', '💳', '📅', '⏰', '✅']],
        ['Atendimento', ['👋', '🤗', '🙂', '✅', '⚠', '🚨', '📞', '📱', '📩', '📝', '📌', '📋', '🧾', '🔒', '🔑', '🔎', '🔧', '💡', '🚀', '🎯']],
        ['IPTV e apps', ['📺', '📱', '🖥', '⌨', '💻', '🕹', '📡', '📶', '💬', '🌐', '🔗', '🎞', '▶', '⏯', '🎧', '📦', '🛠', '⚡', '🔋', '💾']],
        ['Festas', ['🎉', '🎊', '🎁', '🎂', '🥳', '🥂', '🍾', '🌟', '✨', '💖', '💚', '💙', '❤', '🥇', '🏆', '🎁', '🙌', '👏', '🥰', '😍']],
        ['Datas e pagamento', ['📅', '⏰', '⌛', '💸', '💵', '💰', '💳', '🧾', '📈', '📊', '📤', '📥', '📋', '📝', '📢', '🔔', '🔜', '🔁', '🆗', '🆘', '🟢', '🔴']],
        ['Mãos e sinais', ['👍', '👎', '☝', '✌', '🤝', '👌', '🤞', '🙏', '👏', '💪', '👉', '👈', '👆', '👇', '🖐', '🖖', '🤟', '🤘', '✋', '🤚']]
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

            const inserirEmoji = (emoji) => {
                const inicio = textarea.selectionStart ?? textarea.value.length;
                const fim = textarea.selectionEnd ?? textarea.value.length;
                textarea.value = textarea.value.slice(0, inicio) + emoji + textarea.value.slice(fim);
                const pos = inicio + emoji.length;
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
                inserirEmoji(botao.dataset.emoji || '');
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

function campoWhatsApp(valor = '') {
    const numeros = String(valor || '').replace(/\D/g, '');
    let ddi = '55';
    let telefone = numeros;

    if (numeros.startsWith('55') && numeros.length > 11) {
        telefone = numeros.slice(2);
        while (telefone.startsWith('55') && telefone.length > 11) {
            telefone = telefone.slice(2);
        }
    } else if (numeros.length > 11) {
        ddi = numeros.slice(0, numeros.length - 11) || '55';
        telefone = numeros.slice(-11);
    }

    return `<label>WhatsApp *
        <div class="phone-field">
            <input class="phone-prefix" type="text" name="ddiTelefone" value="${escapar(ddi || '55')}" aria-label="DDI">
            <input type="tel" name="telefone" value="${escapar(telefone)}" required placeholder="11999999999">
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

function formatarAniversario(dataISO) {
    const partes = String(dataISO || '').slice(0, 10).split('-');
    if (partes.length !== 3) return dataISO || '';
    return `${partes[2]}/${partes[1]}`;
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
    if (!valor) return '-';

    const hoje = new Date();
    const data = new Date(String(valor).length <= 10 ?`${valor}T23:59:59` : valor);
    if (Number.isNaN(data.getTime())) return '-';

    const minuto = 60 * 1000;
    const hora = 60 * minuto;
    const dia = 24 * hora;
    const diff = data - hoje;
    const vencido = diff < 0;
    const totalMinutos = Math.ceil(Math.abs(diff) / minuto);

    if (totalMinutos <= 0) return vencido ?'vencido agora' : 'vence agora';

    if (totalMinutos < 60) {
        const unidade = plural(totalMinutos, 'minuto', 'minutos');
        const sufixo = plural(totalMinutos, 'restante', 'restantes');
        return vencido ?`${totalMinutos} ${unidade} vencido` : `${totalMinutos} ${unidade} ${sufixo}`;
    }

    if (totalMinutos < 24 * 60) {
        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;
        const textoHoras = `${horas} ${plural(horas, 'hora', 'horas')}`;

        if (!minutos) {
            const sufixo = plural(horas, 'restante', 'restantes');
            return vencido ?`${textoHoras} vencido` : `${textoHoras} ${sufixo}`;
        }

        const textoMinutos = `${minutos} ${plural(minutos, 'minuto', 'minutos')}`;
        return vencido ?`${textoHoras} e ${textoMinutos} vencido` : `${textoHoras} e ${textoMinutos} restantes`;
    }

    const dias = Math.ceil(Math.abs(diff) / dia);
    const textoDias = `${dias} ${plural(dias, 'dia', 'dias')}`;
    const sufixo = plural(dias, 'restante', 'restantes');
    return vencido ?`${textoDias} vencido` : `${textoDias} ${sufixo}`;
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
    const nascimento = dataCsvParaIso(valorCsv(registro, ['Nascimento', 'Data de aniversário', 'Data aniversario']), false);
    const apps = listaCsvParaArray(valorCsv(registro, ['Apps instalados', 'Aplicativos', 'App']));
    const dispositivos = listaCsvParaArray(valorCsv(registro, ['Dispositivos', 'Dispositivo', 'Aparelho']));
    const paineis = listaCsvParaArray(valorCsv(registro, ['Painéis', 'Paineis', 'Painel']));
    const enderecoMac = valorCsv(registro, ['Endereço MAC', 'Endereco MAC', 'MAC']);
    const idAplicativo = valorCsv(registro, ['ID do aplicativo', 'ID aplicativo', 'ID']);

    return {
        nome,
        ddiTelefone: '',
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
    const resumo = Object.entries(dados)
        .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
        .map(([chave, valor]) => `${chave}=${valor}`)
        .join(' ');

    console.log(`[controle-clientes] ${evento}${resumo ?` | ${resumo}` : ''}`);
}

function aguardarComTimeout(promessa, ms, descricao) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${descricao} demorou demais para responder.`)), ms);
        })
    ]);
}

async function resolverDestinosWhatsApp(client, telefone) {
    const numero = normalizarTelefone(telefone);

    if (!numero || numero.length < 12) {
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

async function enviarMensagemWhatsAppComFallback(client, telefone, mensagem, descricao = 'Envio pelo WhatsApp') {
    const destinos = await resolverDestinosWhatsApp(client, telefone);
    let ultimoErro = null;

    for (const destino of destinos) {
        try {
            registrarEnvioDoRobo(destino, mensagem);
            const envio = await aguardarComTimeout(
                client.sendMessage(destino, mensagem),
                90000,
                descricao
            );

            if (!envio) {
                throw new Error('O WhatsApp nao confirmou o envio da mensagem.');
            }

            registrarMensagemDoRobo(envio);

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
    return `*RENOVAÇÃO CONFIRMADA*
--------------------
Olá, *${cliente.nome || 'cliente'}*!

Sua renovação foi registrada com sucesso.

*Plano:* ${resultado.plano}
*Valor:* R$ ${resultado.valorTotal}
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

function montarMensagemPlanosTesteExpiradoManual(cliente = {}, planos = []) {
    return `⚠️ *TESTE GRÁTIS EXPIRADO*
--------------------
Olá, *${cliente.nome || 'cliente'}*! Seu teste grátis expirou.

Para reativar seu acesso, escolha um plano fixo:

${menuRenovacao(planos)}

Digite apenas o número do plano que deseja ativar, ou digite *sair* para encerrar o atendimento.`;
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
    const planoAtual = cliente.tipoPlanoId || planos.find(plano => {
        return String(plano.nome || '').toLowerCase() === String(cliente.plano || '').toLowerCase();
    })?.id || planos[0]?.id || '';
    const planoInicial = planos.find(plano => String(plano.id) === String(planoAtual)) || planos[0] || {};
    const linhasHistorico = pagamentos.length
        ?pagamentos.map(pagamento => `<tr>
            <td>${escapar(formatarDataHoraCurta(pagamento.dataPagamento || pagamento.criadoEm))}</td>
            <td>
                <div class="cell-title">${escapar(pagamento.plano)}</div>
                <div class="cell-muted">${escapar(pagamento.diasContrato)} dias</div>
            </td>
            <td>R$ ${escapar(pagamento.valorTotal || '0,00')}</td>
            <td>${escapar(pagamento.formaPagamento || '-')}</td>
            <td>${escapar(formatarDataHoraCurta(pagamento.vencimentoNovo))}</td>
            <td>${pagamento.mensagemEnviada ?'<span class="badge green">Enviada</span>' : '<span class="badge orange">Não enviada</span>'}</td>
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
        <form class="fields client-form" method="post" action="/clientes/${escapar(cliente.id)}/renovar">
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
            ${campo({ nome: 'diasContrato', label: 'Dias de contrato', valor: planoInicial.dias || cliente.diasContrato || '', tipo: 'number', attrs: 'id="renovarDiasContrato" min="1" required' })}
            ${campo({ nome: 'valorPlano', label: 'Valor do Plano (R$)', valor: planoInicial.valor || cliente.valorPlano || '', attrs: 'id="renovarValorPlano" inputmode="decimal" class="money-field" placeholder="0,00" required' })}
            ${campo({ nome: 'assinaturaApp', label: 'Assinatura App (R$)', valor: cliente.assinaturaApp || '0,00', attrs: 'id="renovarAssinaturaApp" inputmode="decimal" class="money-field" placeholder="0,00"' })}
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
            ${campo({ nome: 'dataPagamento', label: 'Data/Hora do pagamento', valor: agoraLocalDateTime(), tipo: 'datetime-local', attrs: 'required' })}
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

                function atualizarPlanoRenovacao() {
                    const plano = planosRenovacao.find(item => String(item.id) === String(select?.value));
                    if (!plano) return;
                    planoNome.value = plano.nome || '';
                    dias.value = plano.dias || '';
                    valor.value = plano.valor || valor.value || '';
                }

                select?.addEventListener('change', atualizarPlanoRenovacao);
                atualizarPlanoRenovacao();
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

function clienteAniversarioPendente(cliente = {}) {
    const nascimento = String(cliente.nascimento || '');
    if (nascimento.length < 10) return false;
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return nascimento.slice(5, 10) === `${valores.month}-${valores.day}`
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
    const inicio = inputDateTime(cliente.dataInicio) || agoraLocalDateTime();
    const vencimento = inputDateTime(cliente.dataVencimento || cliente.vencimento);
    const appsSelecionados = lerListaSalva(cliente.appsInstalados);
    const dispositivosSelecionados = lerListaSalva(cliente.dispositivosSelecionados);
    const paineisSelecionados = lerListaSalva(cliente.paineisSelecionados);
    const tagsSelecionadas = normalizarTagsTela(cliente.tags);
    const planoAtual = cliente.tipoPlanoId || planos.find(plano => {
        return String(plano.nome || '').toLowerCase() === String(cliente.plano || '').toLowerCase();
    })?.id || '';

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
            ${campoWhatsApp(cliente.telefone)}
            ${campo({ nome: 'nascimento', label: 'Data de Aniversário', valor: cliente.nascimento, tipo: 'date' })}
            ${campo({
                nome: 'origem',
                label: 'Origem do Cliente',
                valor: cliente.origem || '',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...ORIGENS_CLIENTE.map(origem => ({ valor: origem, texto: origem }))
                ]
            })}
            ${opcoesMulti('tags', 'Tags/Categorias', TAGS_CLIENTE.map(nome => ({ nome })), tagsSelecionadas, 'Adicionar tag...')}
            ${campo({ nome: 'bonusMeses', label: 'Bônus disponíveis (meses)', valor: cliente.bonusMeses || 0, tipo: 'number', attrs: 'min="0" step="1"' })}

            <div class="form-section full">Plano</div>
            ${campo({
                nome: 'tipoPlanoId',
                label: 'Tipo do Plano *',
                valor: planoAtual,
                attrs: 'id="tipoPlanoId" required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...planos.map(plano => ({
                        valor: plano.id,
                        texto: plano.dias > 0 ?`${plano.nome} (${plano.dias} dias)` : plano.nome
                    }))
                ]
            })}
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
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar cliente</button>
                <a class="button secondary" href="/clientes/todos">Cancelar</a>
            </div>
        </form>
    </section>
    <script>
        const planos = ${JSON.stringify(planos.map(plano => ({
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
                .replace(/[^a-fA-F0-9]/g, '')
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
        });
    </script>`;

    const extras = [
        secaoConfirmacaoAssinatura(cliente),
        secaoRenovacaoCliente(cliente, listas, pagamentos),
        secaoBonusCliente(cliente),
        cliente.id && clienteEhTeste(cliente) ?secaoTesteLiberado(cliente, listas) : '',
        secaoNotasCliente(cliente, notas)
    ].filter(Boolean).join('');

    return `${formulario}${extras}`;
}

function metricCard({ label, valor, nota = '', tipo, icone }) {
    return `<div class="metric">
        <div>
            <span class="metric-label">${escapar(label)}</span>
            <strong class="metric-value">${escapar(valor)}</strong>
            ${nota ?`<span class="metric-note">${escapar(nota)}</span>` : ''}
        </div>
        <span class="metric-icon ${tipo}">${icon(icone)}</span>
    </div>`;
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

function paginacao({ base, params = {}, pagina, totalPaginas, total, porPagina }) {
    if (totalPaginas <= 1) return '';

    const inicio = total ?((pagina - 1) * porPagina) + 1 : 0;
    const fim = Math.min(total, pagina * porPagina);
    const paginas = [];
    const primeira = Math.max(1, pagina - 2);
    const ultima = Math.min(totalPaginas, pagina + 2);

    for (let numero = primeira; numero <= ultima; numero += 1) {
        paginas.push(`<a class="page-link ${numero === pagina ?'active' : ''}" href="${escapar(montarUrlPaginacao(base, params, numero))}">${numero}</a>`);
    }

    return `<nav class="pagination" aria-label="Paginação">
        <span class="pagination-info">${escapar(inicio)}-${escapar(fim)} de ${escapar(total)}</span>
        <a class="page-link ${pagina <= 1 ?'disabled' : ''}" href="${escapar(montarUrlPaginacao(base, params, pagina - 1))}">Anterior</a>
        ${paginas.join('')}
        <a class="page-link ${pagina >= totalPaginas ?'disabled' : ''}" href="${escapar(montarUrlPaginacao(base, params, pagina + 1))}">Próxima</a>
    </nav>`;
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
        <a class="button secondary icon-only" href="/clientes/${cliente.id}/editar" title="Editar cliente">${icon('whats')}</a>
    </div>`;
}

function dashboard(clientes, pagina = 1, receitaBase = clientes, aniversariantes = []) {
    const resumo = calcularResumo(clientes);
    const receita = calcularReceitaMensal(receitaBase);
    const proximos = clientesComVencimentoProximo(clientes);
    const proximosPaginados = paginarItens(proximos, pagina, DASHBOARD_VENCIMENTOS_POR_PAGINA);
    return `<section class="page-title">
        <h1>Painel de Controle</h1>
        <div class="subtitle">Visão geral dos seus clientes</div>
    </section>
    <section class="metrics">
        ${metricCard({ label: 'Total de Clientes', valor: resumo.total, tipo: 'blue', icone: 'clientes' })}
        ${metricCard({ label: 'Em Teste', valor: resumo.testes, nota: 'Teste grátis', tipo: 'info', icone: 'apps' })}
        ${metricCard({ label: 'Ativos', valor: resumo.ativos, tipo: 'green', icone: 'check' })}
        ${metricCard({ label: 'Vencidos', valor: resumo.vencidos, tipo: 'red', icone: 'close' })}
        ${metricCard({ label: `Vencem em ${DIAS_DASHBOARD} dias`, valor: resumo.vencendo, nota: 'Precisam de atenção', tipo: 'orange', icone: 'alert' })}
        ${metricCard({ label: 'Vencem este mês', valor: resumo.vencemMes, nota: 'Ainda este mês', tipo: 'orange', icone: 'alert' })}
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
                <div class="subtitle">Clientes que vencem nos próximos ${DIAS_DASHBOARD} dias ou já venceram</div>
            </div>
            <div class="actions">
                <form method="post" action="/clientes/verificar-renovacoes">
                    <button class="button green" type="submit">${icon('whats')} Disparar Avisos (${proximos.length})</button>
                </form>
                <a class="button secondary" href="/clientes/todos">Ver todos ${icon('arrow')}</a>
            </div>
        </div>
        ${proximosPaginados.itens.length ?proximosPaginados.itens.map(cardVencimento).join('') : '<div class="empty">Nenhum cliente vencendo nos próximos dias.</div>'}
        ${paginacao({
            base: '/clientes',
            pagina: proximosPaginados.pagina,
            totalPaginas: proximosPaginados.totalPaginas,
            total: proximosPaginados.total,
            porPagina: proximosPaginados.porPagina
        })}
    </section>
    ${autoAtualizarPaginaScript(DASHBOARD_AUTO_REFRESH_MS)}`;
}

function tabelaClientes(clientes) {
    if (!clientes.length) {
        return '<div class="empty">Nenhum cliente encontrado.</div>';
    }

    const linhas = clientes.map(cliente => `<tr>
        <td data-label="Cliente">
            <div class="cell-title">${escapar(cliente.nome)}</div>
            <div class="cell-muted">${escapar(cliente.telefone || '')}</div>
            ${cliente.origem ?`<div class="cell-muted">Origem: ${escapar(cliente.origem)}</div>` : ''}
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
                <a class="button icon-only icon-action" href="/clientes/${cliente.id}/editar" title="Editar">${icon('edit')}</a>
                <form method="post" action="/clientes/${cliente.id}/excluir" onsubmit="return confirm('Excluir este cliente?');">
                    <button class="button icon-only icon-action" type="submit" title="Excluir">${icon('trash')}</button>
                </form>
            </div>
        </td>
    </tr>`).join('');

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
                    const dias = Math.ceil(Math.abs(diff) / dia);
                    const textoDias = dias + ' ' + plural(dias, 'dia', 'dias');
                    const sufixo = plural(dias, 'restante', 'restantes');
                    texto = vencido ?textoDias + ' vencido' : textoDias + ' ' + sufixo;
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

function listaClientes({ clientes, busca, status, origem, tag, paginacaoClientes }) {
    const totalClientes = paginacaoClientes?.total ?? clientes.length;
    const urlExportar = montarUrlComFiltros('/clientes/exportar.csv', { busca, status, origem, tag });

    return `<section class="page-title">
        <h1>Clientes</h1>
        <div class="subtitle">${totalClientes} clientes cadastrados</div>
    </section>
    <form class="clients-toolbar" method="get" action="/clientes/todos">
        <div class="clients-search">
            ${icon('search')}
            <input name="busca" value="${escapar(busca)}" placeholder="Buscar por nome, telefone ou email...">
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
            params: { busca, status, origem, tag },
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
        const valor = numeroMoeda(pagamento.valorTotal);

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
            atual.total += numeroMoeda(pagamento.valorTotal);
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
                <div class="cell-title">R$ ${escapar(pagamento.valorTotal || '0,00')}</div>
                <div class="cell-muted">Plano: R$ ${escapar(pagamento.valorPlano || '0,00')} | App: R$ ${escapar(pagamento.assinaturaApp || '0,00')}</div>
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

function variaveisDisponiveis() {
    const variaveis = [
        ['{{nome}}', 'Primeiro nome do cliente'],
        ['{{plano}}', 'Tipo do plano'],
        ['{{vencimento}}', 'Data de vencimento'],
        ['{{dias}}', 'Dias restantes ou vencidos'],
        ['{{valor}}', 'Valor do plano']
    ];

    return `<section class="panel" style="margin-bottom: 24px;">
        <div class="vars">
            <strong style="display:inline-flex;align-items:center;gap:8px;">${icon('info')} Variáveis disponíveis</strong>
            ${variaveis.map(([token, descricao]) => `<span><span class="var-token">${escapar(token)}</span> <span class="helper">- ${escapar(descricao)}</span></span>`).join('')}
        </div>
    </section>`;
}

function chipPlano(modelo) {
    const label = modelo.plano === 'padrao' ?'Padrão (todos os planos)' : modelo.plano;
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
    ${variaveisDisponiveis()}
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

function telaApps(apps) {
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Aplicativos</h1>
                <div class="subtitle">Gerencie os apps disponíveis para cadastro de clientes</div>
            </div>
            <a class="button" href="/apps/novo">${icon('plus')} Novo App</a>
        </div>
    </section>
    <section class="panel catalog-panel">
        ${apps.length ?apps.map(appRow).join('') : '<div class="empty">Nenhum app cadastrado.</div>'}
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

function telaDispositivos(dispositivos) {
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Dispositivos</h1>
                <div class="subtitle">${dispositivos.length} dispositivos cadastrados</div>
            </div>
            <a class="button" href="/dispositivos/novo">${icon('plus')} Novo Dispositivo</a>
        </div>
    </section>
    <section class="device-grid">
        ${dispositivos.length ?dispositivos.map(deviceCard).join('') : '<div class="empty">Nenhum dispositivo cadastrado.</div>'}
    </section>`;
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
        </div>
        <div class="model-actions">
            <a class="button secondary icon-only" href="/paineis/${painel.id}/editar" title="Editar painel">${icon('edit')}</a>
            <form method="post" action="/paineis/${painel.id}/excluir" onsubmit="return confirm('Excluir este painel?');">
                <button class="button secondary icon-only" type="submit" title="Excluir painel">${icon('trash')}</button>
            </form>
        </div>
    </article>`;
}

function telaPaineis(paineis) {
    return `<section class="page-title">
        <div class="toolbar" style="align-items:flex-start;">
            <div>
                <h1>Painéis</h1>
                <div class="subtitle">${paineis.length} painéis cadastrados</div>
            </div>
            <a class="button" href="/paineis/novo">${icon('plus')} Novo Painel</a>
        </div>
    </section>
    <section class="device-grid">
        ${paineis.length ?paineis.map(panelCard).join('') : '<div class="empty">Nenhum painel cadastrado.</div>'}
    </section>`;
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

function resumoImportacaoClientes(importacao = {}) {
    if (!importacao.preview) return '';

    const preview = importacao.preview;
    const token = importacao.token || '';
    const itens = preview.itens || [];
    const amostra = itens.slice(0, 12);
    const podeConfirmar = preview.ignorar === 0 && itens.length > 0;

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
        ${preview.ignorar ?'<div class="notice">Corrija as linhas com erro e envie o CSV novamente antes de confirmar.</div>' : '<div class="notice">Tudo certo para importar. O sistema criará um backup antes de gravar.</div>'}
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

function telaManutencao(status = {}, opcoes = {}) {
    const whatsapp = status.whatsapp || {};
    const backups = status.backups || [];
    const eventos = status.eventos || [];
    const licenca = status.licenca || {};
    const diagnostico = status.diagnostico || null;
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
        <form class="fields" method="post" action="/manutencao/acesso" style="padding-top:0;">
            ${campo({ nome: 'painelUsuario', label: 'Usuário do painel', valor: status.config?.painelUsuario || 'admin', attrs: 'required autocomplete="username"' })}
            ${campo({ nome: 'painelSenha', label: 'Nova senha', valor: '', tipo: 'password', attrs: 'autocomplete="new-password" placeholder="Deixe em branco para manter a atual"' })}
            ${campo({ nome: 'painelConfirmarSenha', label: 'Confirmar nova senha', valor: '', tipo: 'password', attrs: 'autocomplete="new-password" placeholder="Repita a nova senha"' })}
            <div class="notice full">Depois de alterar, faça login novamente com o novo acesso.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar acesso</button>
            </div>
        </form>
    </section>`}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Configuração do robô</h2>
                <div class="subtitle">Identidade, gatilhos, imagens e atalhos usados nas respostas automáticas desta instalação</div>
            </div>
        </div>
        <form class="fields" method="post" action="/manutencao/robo" style="padding-top:0;">
            ${campo({ nome: 'nomeEmpresaRobo', label: 'Nome da empresa nas mensagens', valor: status.config?.nomeEmpresaRobo || status.config?.licencaCliente || status.config?.nomeSistema || '', attrs: 'required placeholder="Ex: Minha IPTV"' })}
            ${campo({ nome: 'roboPalavrasChave', label: 'Palavras que iniciam o robô', valor: status.config?.roboPalavrasChave || 'oi, ola, olá, menu, Planos, planos, Plano, plano, preço, preco, teste, grátis, gratis', attrs: 'placeholder="Ex: oi, menu, Planos, plano, preço, teste"' })}
            ${campo({ nome: 'roboAtendimentoHumanoMinutos', label: 'Minutos em atendimento humano', valor: status.config?.roboAtendimentoHumanoMinutos || '30', tipo: 'number', attrs: 'min="1" max="1440" required' })}
            ${areaTexto({ nome: 'roboMensagemDesconhecida', label: 'Mensagem interna quando não houver palavra-chave', valor: status.config?.roboMensagemDesconhecida || 'Mensagem ignorada sem palavra-chave para iniciar atendimento.' })}
            <div class="notice full">O robô usa este nome nas boas-vindas, menus, planos, renovações e encerramentos. As palavras acima servem apenas para iniciar um novo atendimento.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar configuração do robô</button>
                <a class="button secondary" href="/modelos">${icon('modelos')} Editar modelos</a>
                <a class="button secondary" href="/planos">${icon('planos')} Editar planos</a>
                <a class="button secondary" href="/qr">${icon('whats')} Ver WhatsApp</a>
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
            <div class="notice full">O QR Code será gerado automaticamente com estes dados e o valor do plano enviado ao cliente.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar PIX</button>
            </div>
        </form>
    </section>

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Monitoramento comercial</h2>
                <div class="subtitle">Backup automático, retenção e alerta quando o WhatsApp ficar desconectado</div>
            </div>
        </div>
        <form class="fields" method="post" action="/manutencao/monitoramento" style="padding-top:0;">
            <label class="toggle-line">
                <input type="checkbox" name="backupAutomaticoAtivo" value="1" ${String(status.config?.backupAutomaticoAtivo) === '1' ?'checked' : ''}>
                <span>Ativar backup automático diário</span>
            </label>
            ${campo({ nome: 'backupAutomaticoHora', label: 'Horário do backup', valor: status.config?.backupAutomaticoHora || '03:00', tipo: 'time', attrs: 'required' })}
            ${campo({ nome: 'backupRetencaoDias', label: 'Reter backups automáticos por dias', valor: status.config?.backupRetencaoDias || '30', tipo: 'number', attrs: 'min="1" max="365" required' })}
            ${campo({ nome: 'alertaWhatsAppMinutos', label: 'Alertar após desconectado por minutos', valor: status.config?.alertaWhatsAppMinutos || '5', tipo: 'number', attrs: 'min="1" max="1440" required' })}
            ${campo({ nome: 'alertaWebhookUrl', label: 'Webhook HTTPS para alertas (opcional)', valor: status.config?.alertaWebhookUrl || '', tipo: 'url', attrs: 'placeholder="https://..."' })}
            <div class="notice full">Sem webhook, os alertas continuam registrados abaixo. Backups manuais nunca são apagados pela retenção automática.</div>
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar monitoramento</button>
                <button class="button secondary" type="submit" formaction="/manutencao/monitoramento/testar" formmethod="post">${icon('alert')} Enviar alerta de teste</button>
            </div>
        </form>
    </section>`}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Backup dos dados</h2>
                <div class="subtitle">Gere uma cópia do banco antes de atualizar ou fazer manutenção</div>
            </div>
            <form method="post" action="/manutencao/backup">
                <button class="button" type="submit">${icon('planos')} Gerar backup agora</button>
            </form>
        </div>
        <table>
            <tbody>
                <tr><th>Pasta dos dados</th><td>${escapar(status.dataDir || '-')}</td></tr>
                <tr><th>Banco atual</th><td>${escapar(status.dbPath || '-')}</td></tr>
                <tr><th>Pasta de backups</th><td>${escapar(status.backupDir || '-')}</td></tr>
                <tr><th>Último backup</th><td>${escapar(ultimoBackup)}</td></tr>
            </tbody>
        </table>
    </section>`}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
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

    ${resumoImportacaoClientes(opcoes.importacao)}`}

    ${manutencaoRestrita ?'' : `<section class="panel" style="margin-bottom:24px;">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Backups recentes</h2>
                <div class="subtitle">${status.totalBackups || 0} backup(s) encontrado(s)</div>
            </div>
        </div>
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
                        <form method="post" action="/manutencao/restaurar" onsubmit="return confirm('Restaurar este backup?O sistema criará uma cópia do banco atual antes de restaurar. Depois reinicie o PM2.');">
                            <input type="hidden" name="backup" value="${escapar(backup.nome)}">
                            <button class="button secondary" type="submit">${icon('refresh')} Restaurar</button>
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
                <div class="subtitle">Últimos backups, alertas e recuperações registrados</div>
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

function formularioPainel(painel = {}) {
    return `<section class="page-title">
        <h1>${painel.id ?'Editar Painel' : 'Novo Painel'}</h1>
        <div class="subtitle">Cadastre os painéis usados no controle dos clientes</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/paineis/salvar">
            ${painel.id ?`<input type="hidden" name="id" value="${escapar(painel.id)}">` : ''}
            ${campo({ nome: 'nome', label: 'Nome do painel', valor: painel.nome })}
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
                <a class="button secondary" href="/paineis">Cancelar</a>
            </div>
        </form>
    </section>`;
}

router.get('/clientes', async (req, res) => {
    desativarCache(res);
    const anoAtual = Number(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric'
    }).format(new Date()));
    const [clientes, receitaBase, aniversariantes] = await Promise.all([
        listarClientes(),
        listarReceitaMensalFinanceira(),
        listarClientesAniversarioHoje(anoAtual)
    ]);
    const mensagem = req.query.mensagem || '';
    const pagina = paginaAtual(req.query.pagina);

    await renderizar(res, {
        titulo: 'Painel',
        conteudo: dashboard(clientes, pagina, receitaBase, aniversariantes),
        mensagem,
        ativo: 'painel'
    });
});

router.get('/clientes/todos', async (req, res) => {
    desativarCache(res);
    const { busca, status, origem, tag } = filtrosClientesQuery(req.query);
    const pagina = paginaAtual(req.query.pagina);
    const todosClientes = await listarClientes({ busca, status, origem, tag });
    const paginacaoClientes = paginarItens(todosClientes, pagina, CLIENTES_POR_PAGINA);
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Clientes',
        conteudo: listaClientes({
            clientes: paginacaoClientes.itens,
            busca,
            status,
            origem,
            tag,
            paginacaoClientes
        }),
        mensagem,
        ativo: 'clientes'
    });
});

router.get('/financeiro', async (req, res) => {
    desativarCache(res);
    const filtros = filtrosFinanceiroQuery(req.query);
    const pagina = paginaAtual(req.query.pagina);
    const [pagamentos, clientes] = await Promise.all([
        listarPagamentosFinanceiro(filtros),
        listarClientes()
    ]);
    const paginacaoFinanceiro = paginarItens(pagamentos, pagina, FINANCEIRO_POR_PAGINA);

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

router.get('/clientes/:id/editar', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes?mensagem=Cliente não encontrado');
    }

    const [listas, notas, pagamentos, alertas] = await Promise.all([
        obterListasCliente(),
        listarNotasCliente(cliente.id),
        listarPagamentosCliente(cliente.id),
        buscarAlertasCadastroCliente(cliente)
    ]);

    await renderizar(res, {
        titulo: 'Editar cliente',
        conteudo: formularioCliente(cliente, listas, { notas, pagamentos, alertas }),
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
        const clienteSalvo = await salvarCliente(req.body);
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

router.post('/clientes/:id/renovar', async (req, res) => {
    try {
        const resultado = await renovarCliente({
            ...req.body,
            clienteId: req.params.id
        });
        const clienteAtualizado = resultado.cliente;
        const deveEnviar = Boolean(req.body.enviarMensagem);
        let mensagemRetorno = 'Renovação registrada com sucesso';

        logControleClientes('Renovacao registrada', {
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
                        'Envio de renovacao confirmada'
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
                    logControleClientes('Erro ao enviar renovacao', {
                        clienteId: clienteAtualizado.id,
                        erro: erroEnvio.message
                    });
                }
            }
        }

        return res.redirect(montarUrlClienteMensagem(clienteAtualizado.id, mensagemRetorno));
    } catch (err) {
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
            nomeCliente: cliente.nome
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
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Apps',
        conteudo: telaApps(apps),
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
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Dispositivos',
        conteudo: telaDispositivos(dispositivos),
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
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Painéis',
        conteudo: telaPaineis(paineis),
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

    await renderizar(res, {
        titulo: 'Editar painel',
        conteudo: formularioPainel(painel),
        ativo: 'paineis'
    });
});

router.post('/paineis/salvar', async (req, res) => {
    try {
        await salvarPainel(req.body);
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

router.post('/manutencao/backup', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const backup = await criarBackupManual();
        logControleClientes('Backup manual criado', {
            arquivo: backup.nome
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Backup criado: ${backup.nome}`)}`);
    } catch (err) {
        logControleClientes('Erro ao criar backup manual', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao criar backup: ${err.message}`)}`);
    }
});

router.post('/manutencao/diagnostico', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const resultado = await executarDiagnosticoSistema(getStatusWhatsApp(), testarWebhookAlertas);
        logControleClientes('Diagnostico do sistema executado', { status: resultado.status });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(resultado.mensagem)}`);
    } catch (err) {
        logControleClientes('Erro ao executar diagnostico do sistema', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao executar diagnóstico: ${err.message}`)}`);
    }
});

router.get('/manutencao/clientes-modelo.csv', bloquearManutencaoRestritaCliente, (req, res) => {
    desativarCache(res);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-clientes.csv"');
    res.send(`\uFEFF${csvModeloClientes()}`);
});

router.post('/manutencao/importar-clientes', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const upload = await lerUploadMultipart(req);
        const preview = await prepararImportacaoClientesCsv(upload.buffer.toString('utf8'));
        const token = salvarPreviaImportacao(preview);
        const status = await obterStatusSistema(getStatusWhatsApp());

        await renderizar(res, {
            titulo: 'Manutenção',
            conteudo: telaManutencao(status, { importacao: { preview, token } }),
            mensagem: `CSV validado: ${preview.criar} criar, ${preview.atualizar} atualizar, ${preview.ignorar} ignorar`,
            ativo: 'manutencao'
        });
    } catch (err) {
        const status = await obterStatusSistema(getStatusWhatsApp());

        await renderizar(res, {
            titulo: 'Manutenção',
            conteudo: telaManutencao(status),
            mensagem: err.message || 'Não foi possível validar o CSV.',
            ativo: 'manutencao'
        });
    }
});

router.post('/manutencao/importar-clientes/confirmar', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const preview = lerPreviaImportacao(req.body.token);
        const itens = preview.itens || [];
        const itensValidos = itens.filter(item => item.acao !== 'ignorar');

        if (!itensValidos.length) {
            throw new Error('Não há clientes válidos para importar.');
        }

        if (itens.some(item => item.acao === 'ignorar')) {
            throw new Error('A importação possui linhas com erro. Envie o CSV corrigido antes de confirmar.');
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

router.post('/manutencao/restaurar', bloquearManutencaoRestritaCliente, async (req, res) => {
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

router.post('/manutencao/licenca', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        await atualizarLicencaComercial(req.body);
        logControleClientes('Licenca da instalacao atualizada', {
            cliente: req.body.licencaCliente,
            vencimento: req.body.licencaVencimento,
            tipo: req.body.licencaTipo
        });
        res.redirect('/manutencao?mensagem=Licença salva com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar licenca da instalacao', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar licença: ${err.message}`)}`);
    }
});

router.post('/manutencao/robo', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        await salvarConfiguracoesRobo(req.body);
        logControleClientes('Configuracao do robo atualizada', {
            nomeEmpresa: req.body.nomeEmpresaRobo
        });
        res.redirect('/manutencao?mensagem=Configuração do robô salva com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar configuracao do robo', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar configuração do robô: ${err.message}`)}`);
    }
});

router.post('/manutencao/robo/imagem/:chave', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        const upload = await lerUploadMultipart(req);

        if (!extensaoLogoPermitida(upload.filename)) {
            return res.redirect('/manutencao?mensagem=Use uma imagem PNG, JPG, WEBP, GIF ou SVG');
        }

        fs.mkdirSync(ASSETS_DIR, { recursive: true });

        const extensao = path.extname(upload.filename).toLowerCase();
        const chave = String(req.params.chave || '');
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

router.post('/manutencao/pix', async (req, res) => {
    try {
        await salvarConfiguracoesPix(req.body);
        logControleClientes('Configuracao PIX atualizada', {
            chave: req.body.pixChave,
            nome: req.body.pixNome
        });
        res.redirect('/manutencao?mensagem=PIX salvo com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar PIX', {
            erro: err.message
        });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar PIX: ${err.message}`)}`);
    }
});

router.post('/manutencao/monitoramento', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        await salvarConfiguracoesMonitoramento(req.body);
        logControleClientes('Monitoramento comercial atualizado', {
            backupAtivo: Boolean(req.body.backupAutomaticoAtivo),
            horario: req.body.backupAutomaticoHora,
            retencao: req.body.backupRetencaoDias,
            alertaMinutos: req.body.alertaWhatsAppMinutos
        });
        res.redirect('/manutencao?mensagem=Monitoramento salvo com sucesso');
    } catch (err) {
        logControleClientes('Erro ao salvar monitoramento comercial', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar monitoramento: ${err.message}`)}`);
    }
});

router.post('/manutencao/monitoramento/testar', bloquearManutencaoRestritaCliente, async (req, res) => {
    try {
        await testarWebhookAlertas(req.body.alertaWebhookUrl);
        logControleClientes('Alerta de teste enviado ao webhook');
        res.redirect('/manutencao?mensagem=Alerta de teste enviado com sucesso');
    } catch (err) {
        logControleClientes('Erro ao testar webhook de alertas', { erro: err.message });
        res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao enviar teste: ${err.message}`)}`);
    }
});

router.post('/manutencao/acesso', bloquearManutencaoRestritaCliente, async (req, res) => {
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
        const upload = await lerUploadMultipart(req);

        if (!extensaoLogoPermitida(upload.filename)) {
            return res.redirect('/modelos?mensagem=Use uma imagem PNG, JPG, WEBP, GIF ou SVG');
        }

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
        const mensagem = montarMensagemPlanosTesteExpiradoManual(cliente, planos);
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

router.post('/clientes/:id/excluir', async (req, res) => {
    await removerCliente(req.params.id);
    res.redirect('/clientes/todos?mensagem=Cliente excluído');
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

        console.log(`[dashboard] Disparo manual concluido: renovacao=${enviados}, umaHora=${enviadosUmaHora}, vencidosDias=${enviadosVencidosDias}, aniversarios=${aniversarios}, ignorados=${totalIgnorados}.`);
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

module.exports = router;


