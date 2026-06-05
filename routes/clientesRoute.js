const express = require('express');
const fs = require('fs');
const path = require('path');
const {
    listarClientes,
    salvarCliente,
    buscarClientePorId,
    removerCliente,
    normalizarTelefone,
    listarNotasCliente,
    adicionarNotaCliente,
    buscarAlertasCadastroCliente
} = require('../services/clientes');
const { verificarRenovacoes } = require('../services/renovacaoAutomatica');
const { getClient, getStatusWhatsApp } = require('../config/whatsapp');
const {
    listarModelos,
    buscarModeloPorId,
    salvarModelo,
    removerModelo
} = require('../services/modelosMensagem');
const {
    obterConfiguracoes,
    salvarConfiguracoesPainel
} = require('../services/configuracoesPainel');
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

const router = express.Router();
const DIAS_DASHBOARD = 7;
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const CLIENTES_AUTO_REFRESH_MS = Number(process.env.CLIENTES_AUTO_REFRESH_MS || 30000);
const DASHBOARD_AUTO_REFRESH_MS = Number(process.env.DASHBOARD_AUTO_REFRESH_MS || 30000);
const CLIENTES_POR_PAGINA = 10;
const DASHBOARD_VENCIMENTOS_POR_PAGINA = 4;
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
    'Cliente indicado por outro cliente.',
    'Cliente deve receber atendimento com prioridade.',
    'Cliente demonstrou comportamento problemático.',
    'Cliente não seguiu as orientações enviadas.',
    'Cliente pediu cancelamento.',
    'Cliente retornou após período sem usar o serviço.',
    'Cliente precisa de acompanhamento no próximo atendimento.'
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
    return Number.isFinite(pagina) && pagina > 0 ? pagina : 1;
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
    const data = new Date(texto.length <= 10 ? `${texto}T23:59:59` : texto);
    return Number.isNaN(data.getTime()) ? null : data;
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

    return Number.isFinite(numero) ? numero : 0;
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
            const grupo = grupoPlanoReceita(cliente);
            const dias = diasPlanoCliente(cliente);
            const valorPlano = numeroMoeda(cliente.valorPlano);
            const assinaturaApp = numeroMoeda(cliente.assinaturaApp);
            const mensalPlano = dias > 0 ? (valorPlano / dias) * 30 : valorPlano;
            const mensal = mensalPlano + assinaturaApp;
            const atual = grupos.get(grupo) || { plano: grupo, clientes: 0, total: 0 };

            atual.clientes += 1;
            atual.total += mensal;
            grupos.set(grupo, atual);
        });

    const ordem = ['Mensal', 'Trimestral', 'Semestral', 'Anual'];
    const itens = Array.from(grupos.values())
        .sort((a, b) => {
            const posA = ordem.indexOf(a.plano);
            const posB = ordem.indexOf(b.plano);
            if (posA !== -1 || posB !== -1) return (posA === -1 ? 99 : posA) - (posB === -1 ? 99 : posB);
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
            return vencimento && !vencimentoExpirou(vencimento) && data >= hoje && data <= fimMesISO;
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
        return `Vencido ha ${Math.abs(dias)} dia(s)`;
    }
    if (dias < 0) return `Vencido ha ${Math.abs(dias)} dia(s)`;
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
                        ${logoUrl ? `<img class="brand-logo" src="${escapar(logoUrl)}" alt="Logo">` : `<span class="brand-icon">${icon('logo')}</span>`}
                        <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onchange="this.form.submit()">
                    </label>
                </form>
                <a class="brand-text" href="/clientes">${escapar(nomeSistema)}</a>
            </div>
            <nav>
                <a class="navlink ${ativo === 'painel' ? 'active' : ''}" href="/clientes">${icon('painel')} Painel</a>
                <a class="navlink ${ativo === 'clientes' ? 'active' : ''}" href="/clientes/todos">${icon('clientes')} Clientes</a>
                <a class="navlink ${ativo === 'planos' ? 'active' : ''}" href="/planos">${icon('planos')} Planos</a>
                <a class="navlink ${ativo === 'modelos' ? 'active' : ''}" href="/modelos">${icon('modelos')} Modelos</a>
                <a class="navlink ${ativo === 'apps' ? 'active' : ''}" href="/apps">${icon('apps')} Apps</a>
                <a class="navlink ${ativo === 'dispositivos' ? 'active' : ''}" href="/dispositivos">${icon('dispositivos')} Dispositivos</a>
                <a class="navlink ${ativo === 'paineis' ? 'active' : ''}" href="/paineis">${icon('paineis')} Painéis</a>
                <a class="navlink" href="/qr" title="WhatsApp: ${status.conectado ? 'conectado' : escapar(status.status || 'desconectado')}">${icon('sair')}</a>
            </nav>
        </div>
    </div>
    <main>
        ${mensagem ? `<div class="notice">${escapar(mensagem)}</div>` : ''}
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
                ${opcoes.map(opcao => `<option value="${escapar(opcao.valor)}" ${String(opcao.valor) === String(valor) ? 'selected' : ''}>${escapar(opcao.texto)}</option>`).join('')}
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
        return `<span class="tag-chip ${aviso ? 'warn' : ''}">${escapar(tag)}</span>`;
    }).join('')}</div>`;
}

function formatarDataNota(valor) {
    if (!valor) return '';
    const data = new Date(String(valor).replace(' ', 'T'));
    if (Number.isNaN(data.getTime())) return String(valor);

    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(data);
}

function alertaClienteHtml(alertas = []) {
    if (!alertas.length) return '';

    const itens = alertas.map(alerta => `<div class="client-alert-item">
        Atenção: existe cadastro anterior para ${escapar(alerta.nome || 'cliente')} (${escapar(alerta.telefone || '-')})
        <small>Status: ${escapar(rotuloStatus(alerta.status))}${alerta.tags ? ` | Tags: ${escapar(alerta.tags)}` : ''}${alerta.origem ? ` | Origem: ${escapar(alerta.origem)}` : ''}</small>
        ${alerta.ultimaNota ? `<small>Última nota: ${escapar(alerta.ultimaNota)}</small>` : ''}
    </div>`).join('');

    return `<div class="notice warn">Cliente com histórico que merece avaliação antes de continuar.</div>
    <div class="client-alert-list">${itens}</div>`;
}

function secaoNotasCliente(cliente = {}, notas = []) {
    if (!cliente.id) return '';

    const listaNotas = notas.length
        ? `<div class="notes-list">${notas.map(nota => `<div class="note-item">
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
                        ? textarea.value.trim() + '\\n' + nota
                        : nota;
                    textarea.focus();
                });
            })();
        </script>`;
}

function editorMensagemModelo(valor = '') {
    const grupos = [
        ['Mais usados', ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😉', '😎', '🤝', '🙌', '🙏', '👏', '👍', '👌', '💪', '❤️', '💙', '💚', '💛']],
        ['Atendimento', ['✅', '☑️', '⚠️', '❗', '❌', '🔔', '📢', '📌', '📍', '📝', '📄', '📷', '🖼️', '💬', '📞', '☎️', '📲', '📩', '📤', '📥']],
        ['IPTV e apps', ['📺', '📱', '💻', '🖥️', '⌨️', '🖱️', '🎬', '🎥', '📡', '📶', '🌐', '🔌', '🔧', '⚙️', '🛠️', '📦', '🚀', '⭐', '🔥', '💎']],
        ['Festas', ['🎉', '🎊', '🥳', '🎈', '🎁', '🎂', '🍰', '🧁', '🍾', '🥂', '🍻', '🍹', '✨', '🌟', '⭐', '💫', '🎆', '🎇', '🪅', '🎵']],
        ['Datas e pagamento', ['⏰', '⏳', '⌛', '📅', '🗓️', '🎁', '🎉', '🎊', '🥳', '🎂', '💳', '💰', '💵', '🧾', '🏦', '🔐', '🔑', '🔒', '🔓', '🟢', '🟡', '🔴']],
        ['Mãos e sinais', ['👋', '🤚', '✋', '🖐️', '👍', '👎', '👌', '🤌', '🤙', '👈', '👉', '👆', '👇', '☝️', '✍️', '🙏', '👏', '🙌', '🤲', '💪']]
    ];

    return `<label class="full message-editor">Mensagem
        <div class="emoji-toolbar">
            <button class="button secondary" type="button" id="toggleEmojiPicker">😊 Adicionar emoji</button>
            <div class="emoji-picker" id="emojiPicker" hidden>
                <input class="emoji-search" id="emojiSearch" type="search" placeholder="Buscar emoji...">
                ${grupos.map(([titulo, emojis]) => `<div class="emoji-title">${escapar(titulo)}</div><div class="emoji-group">${emojis.map(emoji => `<button type="button" data-emoji="${escapar(emoji)}" title="${escapar(emoji)}">${escapar(emoji)}</button>`).join('')}</div>`).join('')}
            </div>
        </div>
        <textarea name="texto" id="modeloTexto">${escapar(valor)}</textarea>
    </label>
    <script>
        (() => {
            const textarea = document.getElementById('modeloTexto');
            const toggle = document.getElementById('toggleEmojiPicker');
            const picker = document.getElementById('emojiPicker');
            const search = document.getElementById('emojiSearch');

            if (!textarea || !toggle || !picker) return;

            toggle.addEventListener('click', () => {
                picker.hidden = !picker.hidden;
                if (!picker.hidden) search?.focus();
            });

            picker.addEventListener('click', (event) => {
                const button = event.target.closest('[data-emoji]');
                if (!button) return;

                const emoji = button.dataset.emoji;
                const inicio = textarea.selectionStart ?? textarea.value.length;
                const fim = textarea.selectionEnd ?? textarea.value.length;
                textarea.value = textarea.value.slice(0, inicio) + emoji + textarea.value.slice(fim);
                textarea.focus();
                textarea.selectionStart = textarea.selectionEnd = inicio + emoji.length;
            });

            search?.addEventListener('input', () => {
                const termo = search.value.trim().toLowerCase();
                picker.querySelectorAll('[data-emoji]').forEach((button) => {
                    button.hidden = termo && !button.dataset.emoji.includes(termo);
                });
            });
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
        return Array.isArray(lista) ? lista.map(String) : [];
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

    const data = new Date(String(valor).length <= 10 ? `${valor}T00:00:00` : valor);
    if (Number.isNaN(data.getTime())) return valor;

    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = String(data.getFullYear()).slice(-2);
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');

    return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

function textoDiasRestantes(valor) {
    return textoTempoRestante(valor);
}

function plural(valor, singular, pluralTexto) {
    return Number(valor) === 1 ? singular : pluralTexto;
}

function textoTempoRestante(valor) {
    if (!valor) return '-';

    const hoje = new Date();
    const data = new Date(String(valor).length <= 10 ? `${valor}T23:59:59` : valor);
    if (Number.isNaN(data.getTime())) return '-';

    const minuto = 60 * 1000;
    const hora = 60 * minuto;
    const dia = 24 * hora;
    const diff = data - hoje;
    const vencido = diff < 0;
    const totalMinutos = Math.ceil(Math.abs(diff) / minuto);

    if (totalMinutos <= 0) return vencido ? 'vencido agora' : 'vence agora';

    if (totalMinutos < 60) {
        const unidade = plural(totalMinutos, 'minuto', 'minutos');
        const sufixo = plural(totalMinutos, 'restante', 'restantes');
        return vencido ? `${totalMinutos} ${unidade} vencido` : `${totalMinutos} ${unidade} ${sufixo}`;
    }

    if (totalMinutos < 24 * 60) {
        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;
        const textoHoras = `${horas} ${plural(horas, 'hora', 'horas')}`;

        if (!minutos) {
            const sufixo = plural(horas, 'restante', 'restantes');
            return vencido ? `${textoHoras} vencido` : `${textoHoras} ${sufixo}`;
        }

        const textoMinutos = `${minutos} ${plural(minutos, 'minuto', 'minutos')}`;
        return vencido ? `${textoHoras} e ${textoMinutos} vencido` : `${textoHoras} e ${textoMinutos} restantes`;
    }

    const dias = Math.ceil(Math.abs(diff) / dia);
    const textoDias = `${dias} ${plural(dias, 'dia', 'dias')}`;
    const sufixo = plural(dias, 'restante', 'restantes');
    return vencido ? `${textoDias} vencido` : `${textoDias} ${sufixo}`;
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
        ? selecionados.map(item => `<span class="selected-chip" data-value="${escapar(item)}">${escapar(item)} <button type="button" aria-label="Remover ${escapar(item)}">x</button></span>`).join('')
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

function inputDateTime(valor) {
    return valor ? String(valor).slice(0, 16) : '';
}

function agoraLocalDateTime() {
    const data = new Date();
    data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
    return data.toISOString().slice(0, 16);
}

function valorPrimeiroItem(valor) {
    return lerListaSalva(valor)[0] || '';
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

    console.log(`[controle-clientes] ${evento}${resumo ? ` | ${resumo}` : ''}`);
}

function aguardarComTimeout(promessa, ms, descricao) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${descricao} demorou demais para responder.`)), ms);
        })
    ]);
}

async function resolverDestinoWhatsApp(client, telefone) {
    const numero = normalizarTelefone(telefone);
    const destinoNumero = `${numero}@c.us`;

    if (!numero || numero.length < 12) {
        throw new Error('Telefone do cliente invalido. Confira o DDD e o numero.');
    }

    if (typeof client.getNumberId === 'function') {
        const contato = await aguardarComTimeout(
            client.getNumberId(numero),
            15000,
            'Validacao do numero no WhatsApp'
        );

        if (!contato || !contato._serialized) {
            throw new Error(`O numero ${numero} nao foi localizado no WhatsApp.`);
        }

        if (String(contato._serialized).endsWith('@lid')) {
            console.log(`[clientes] WhatsApp retornou LID ${contato._serialized}; usando telefone cadastrado ${destinoNumero}.`);
            return destinoNumero;
        }

        return contato._serialized;
    }

    return destinoNumero;
}

function formatarDataHoraMensagem(valor) {
    if (!valor) return '';

    const data = new Date(String(valor).length <= 10 ? `${valor}T00:00:00` : valor);
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

function clienteEhTeste(cliente = {}) {
    const status = String(cliente.status || '').toLowerCase();
    const plano = String(cliente.plano || '').toLowerCase();

    return status === 'teste' || plano.includes('teste');
}

function dadosTesteLiberadoDoCliente(cliente = {}) {
    const dispositivo = valorPrimeiroItem(cliente.dispositivosSelecionados) || cliente.aparelho || '';

    return {
        telefone: cliente.telefone,
        nome: cliente.nome,
        aparelho: dispositivo,
        aplicativo: valorPrimeiroItem(cliente.appsInstalados),
        painel: valorPrimeiroItem(cliente.paineisSelecionados),
        usuario: cliente.usuario,
        senha: cliente.senha,
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
                valor: valorPrimeiroItem(cliente.dispositivosSelecionados) || cliente.aparelho,
                attrs: 'required',
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...dispositivos.map(item => ({ valor: item.nome, texto: item.nome }))
                ]
            })}
            ${campo({
                nome: 'aplicativo',
                label: 'Aplicativo',
                valor: valorPrimeiroItem(cliente.appsInstalados),
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...apps.map(item => ({ valor: item.nome, texto: item.nome }))
                ]
            })}
            ${campo({
                nome: 'painel',
                label: 'Painel',
                valor: valorPrimeiroItem(cliente.paineisSelecionados),
                opcoes: [
                    { valor: '', texto: 'Selecione...' },
                    ...paineis.map(item => ({ valor: item.nome, texto: item.nome }))
                ]
            })}
            ${campo({ nome: 'usuario', label: 'Usuário', valor: cliente.usuario, attrs: 'required' })}
            ${campo({ nome: 'senha', label: 'Senha', valor: cliente.senha, attrs: 'required' })}
            ${campo({ nome: 'dataInicio', label: 'Data/Início', valor: inicio, tipo: 'datetime-local', attrs: 'required' })}
            ${campo({ nome: 'validade', label: 'Válido até', valor: validade, tipo: 'datetime-local', attrs: 'required' })}
            <div class="actions full">
                <button class="button green" type="submit">${icon('whats')} Enviar teste liberado</button>
            </div>
        </form>
    </section>`;
}

function formularioCliente(cliente = {}, listas = {}, opcoesFormulario = {}) {
    const planos = listas.planos || [];
    const apps = listas.apps || [];
    const dispositivos = listas.dispositivos || [];
    const paineis = listas.paineis || [];
    const notas = opcoesFormulario.notas || [];
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
        <h1>${cliente.id ? 'Editar Cliente' : 'Novo Cliente'}</h1>
        <div class="subtitle">Dados pessoais, contrato e acesso ao aplicativo</div>
    </section>
    ${alertaClienteHtml(alertas)}
    <section class="panel">
        <form class="fields client-form" method="post" action="/clientes/salvar">
            ${cliente.id ? `<input type="hidden" name="id" value="${escapar(cliente.id)}">` : ''}
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
            <div></div>

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
                        texto: plano.dias > 0 ? `${plano.nome} (${plano.dias} dias)` : plano.nome
                    }))
                ]
            })}
            ${campo({ nome: 'diasContrato', label: 'Dias de Contrato', valor: cliente.diasContrato, tipo: 'number', attrs: 'id="diasContrato" min="0"' })}
            ${campo({ nome: 'valorPlano', label: 'Valor do Plano (R$)', valor: cliente.valorPlano, attrs: 'id="valorPlano" placeholder="99.90"' })}
            ${campo({ nome: 'assinaturaApp', label: 'Assinatura App (R$)', valor: cliente.assinaturaApp, attrs: 'placeholder="0.00"' })}
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
            ${opcoesMulti('appsInstalados', 'Apps Instalados', apps, appsSelecionados, 'Adicionar app...')}
            ${opcoesMulti('dispositivosSelecionados', 'Dispositivos', dispositivos, dispositivosSelecionados, 'Adicionar dispositivo...')}
            ${opcoesMulti('paineisSelecionados', 'Painéis', paineis, paineisSelecionados, 'Adicionar painel...')}
            <label class="toggle-line">
                <input type="checkbox" name="appInstalado" value="1" ${cliente.appInstalado ? 'checked' : ''}>
                <span>App instalado no dispositivo</span>
            </label>
            ${campo({ nome: 'usuario', label: 'Usuário IPTV', valor: cliente.usuario })}
            ${campo({ nome: 'senha', label: 'Senha IPTV', valor: cliente.senha })}
            <input type="hidden" name="plano" id="planoLegado" value="${escapar(cliente.plano || '')}">
            ${areaTexto({ nome: 'observacoes', label: 'Observações', valor: cliente.observacoes })}
            ${cliente.id ? camposNovaNotaAtendimento() : ''}
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

        function atualizarPlano() {
            const plano = planos.find(item => item.id === tipoPlano.value);
            if (!plano) return;
            diasContrato.value = plano.dias || '';
            valorPlano.value = plano.valor || valorPlano.value || '';
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
                data.setDate(data.getDate() + dias);
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
            horasTeste.closest('label').style.opacity = habilitado ? '1' : '.55';
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
        cliente.id && clienteEhTeste(cliente) ? secaoTesteLiberado(cliente, listas) : '',
        secaoNotasCliente(cliente, notas)
    ].filter(Boolean).join('');

    return `${formulario}${extras}`;
}

function metricCard({ label, valor, nota = '', tipo, icone }) {
    return `<div class="metric">
        <div>
            <span class="metric-label">${escapar(label)}</span>
            <strong class="metric-value">${escapar(valor)}</strong>
            ${nota ? `<span class="metric-note">${escapar(nota)}</span>` : ''}
        </div>
        <span class="metric-icon ${tipo}">${icon(icone)}</span>
    </div>`;
}

function pluralCliente(total) {
    return Number(total) === 1 ? 'cliente' : 'clientes';
}

function paginacao({ base, params = {}, pagina, totalPaginas, total, porPagina }) {
    if (totalPaginas <= 1) return '';

    const inicio = total ? ((pagina - 1) * porPagina) + 1 : 0;
    const fim = Math.min(total, pagina * porPagina);
    const paginas = [];
    const primeira = Math.max(1, pagina - 2);
    const ultima = Math.min(totalPaginas, pagina + 2);

    for (let numero = primeira; numero <= ultima; numero += 1) {
        paginas.push(`<a class="page-link ${numero === pagina ? 'active' : ''}" href="${escapar(montarUrlPaginacao(base, params, numero))}">${numero}</a>`);
    }

    return `<nav class="pagination" aria-label="Paginação">
        <span class="pagination-info">${escapar(inicio)}-${escapar(fim)} de ${escapar(total)}</span>
        <a class="page-link ${pagina <= 1 ? 'disabled' : ''}" href="${escapar(montarUrlPaginacao(base, params, pagina - 1))}">Anterior</a>
        ${paginas.join('')}
        <a class="page-link ${pagina >= totalPaginas ? 'disabled' : ''}" href="${escapar(montarUrlPaginacao(base, params, pagina + 1))}">Próxima</a>
    </nav>`;
}

function receitaMensalCard(receita) {
    const maiorValor = Math.max(...receita.itens.map(item => item.total), 1);
    const linhas = receita.itens.length
        ? receita.itens.map((item) => {
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
                <span class="revenue-note">Baseada no valor dos planos e assinatura app dos clientes ativos</span>
            </div>
            <span class="revenue-icon">${icon('trend')}</span>
        </div>
        <div class="revenue-list">${linhas}</div>
    </section>`;
}

function cardVencimento(cliente) {
    const vencimento = vencimentoCliente(cliente);
    const dias = calcularDiasRestantes(vencimento);
    const classeVencimento = dias < 0 || vencimentoExpirou(vencimento) ? 'expired' : '';
    const marcadorTeste = clienteEhTeste(cliente) ? '<span class="badge info">Teste gr&aacute;tis</span>' : '';

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

function dashboard(clientes, pagina = 1) {
    const resumo = calcularResumo(clientes);
    const receita = calcularReceitaMensal(clientes);
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
        ${proximosPaginados.itens.length ? proximosPaginados.itens.map(cardVencimento).join('') : '<div class="empty">Nenhum cliente vencendo nos próximos dias.</div>'}
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
            ${cliente.origem ? `<div class="cell-muted">Origem: ${escapar(cliente.origem)}</div>` : ''}
            ${cliente.nascimento ? `<div class="cell-muted">🎂 ${escapar(formatarAniversario(cliente.nascimento))}</div>` : ''}
            ${renderTagsCliente(cliente.tags)}
        </td>
        <td data-label="Plano">
            <div class="cell-title">${escapar(cliente.plano || '-')}</div>
            <div class="cell-muted">${escapar(detalhePlanoCliente(cliente))}</div>
            <div class="cell-muted">${cliente.valorPlano ? `R$ ${escapar(cliente.valorPlano)}` : ''}</div>
        </td>
        <td data-label="Início">${escapar(formatarDataHoraCurta(cliente.dataInicio))}</td>
        <td data-label="Vencimento">
            <div class="cell-title">${escapar(formatarDataHoraCurta(cliente.dataVencimento || cliente.vencimento))}</div>
            <div class="cell-muted" data-vencimento-restante="${escapar(cliente.dataVencimento || cliente.vencimento)}">${escapar(textoDiasRestantes(cliente.dataVencimento || cliente.vencimento))}</div>
        </td>
        <td data-label="Aplicativos">
            ${renderChips(cliente.appsInstalados, 'app-chip')}
            ${cliente.validadeApp ? `<div class="cell-muted">Validade: ${escapar(cliente.validadeApp)}</div>` : ''}
            ${cliente.appInstalado ? '<span class="installed-chip">Instalado</span>' : ''}
        </td>
        <td data-label="Dispositivos">
            ${renderChips(cliente.dispositivosSelecionados, 'device-chip')}
        </td>
        <td data-label="Status"><span class="badge ${statusClasse(cliente.status)}">${escapar(rotuloStatus(cliente.status))}</span></td>
        <td data-label="Ações">
            <div class="row-actions">
                <a class="button icon-only icon-action whats" href="https://wa.me/${escapar(String(cliente.telefone || '').replace(/\\D/g, ''))}" title="WhatsApp">${icon('whats')}</a>
                <form method="post" action="/clientes/verificar-renovacoes">
                    <button class="button icon-only icon-action refresh" type="submit" title="Enviar aviso">${icon('refresh')}</button>
                </form>
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
                return Number(valor) === 1 ? singular : pluralTexto;
            }

            function textoTempoRestante(valor, prefixo) {
                if (!valor) return '-';

                const data = new Date(String(valor).length <= 10 ? String(valor) + 'T23:59:59' : valor);
                if (Number.isNaN(data.getTime())) return '-';

                const minuto = 60 * 1000;
                const hora = 60 * minuto;
                const dia = 24 * hora;
                const diff = data - new Date();
                const vencido = diff < 0;
                const totalMinutos = Math.ceil(Math.abs(diff) / minuto);

                if (totalMinutos <= 0) return vencido ? 'vencido agora' : 'vence agora';

                let texto = '';

                if (totalMinutos < 60) {
                    const unidade = plural(totalMinutos, 'minuto', 'minutos');
                    const sufixo = plural(totalMinutos, 'restante', 'restantes');
                    texto = vencido ? totalMinutos + ' ' + unidade + ' vencido' : totalMinutos + ' ' + unidade + ' ' + sufixo;
                } else if (totalMinutos < 24 * 60) {
                    const horas = Math.floor(totalMinutos / 60);
                    const minutos = totalMinutos % 60;
                    const textoHoras = horas + ' ' + plural(horas, 'hora', 'horas');

                    if (!minutos) {
                        const sufixo = plural(horas, 'restante', 'restantes');
                        texto = vencido ? textoHoras + ' vencido' : textoHoras + ' ' + sufixo;
                    } else {
                        const textoMinutos = minutos + ' ' + plural(minutos, 'minuto', 'minutos');
                        texto = vencido ? textoHoras + ' e ' + textoMinutos + ' vencido' : textoHoras + ' e ' + textoMinutos + ' restantes';
                    }
                } else {
                    const dias = Math.ceil(Math.abs(diff) / dia);
                    const textoDias = dias + ' ' + plural(dias, 'dia', 'dias');
                    const sufixo = plural(dias, 'restante', 'restantes');
                    texto = vencido ? textoDias + ' vencido' : textoDias + ' ' + sufixo;
                }

                if (prefixo === 'dashboard' && !vencido && texto !== '-') {
                    return 'Vence em ' + texto.replace(/ restantes?$/, '');
                }

                if (prefixo === 'dashboard' && vencido) {
                    return texto.includes('vencido agora') ? 'Vencido agora' : texto.replace(' vencido', ' vencido');
                }

                return texto;
            }

            function atualizarVencimentos() {
                document.querySelectorAll('[data-vencimento-restante]').forEach((elemento) => {
                    const texto = textoTempoRestante(elemento.dataset.vencimentoRestante, elemento.dataset.prefixo || '');
                    if (texto && texto !== '-') elemento.textContent = texto;
                    const data = new Date(String(elemento.dataset.vencimentoRestante || '').length <= 10
                        ? String(elemento.dataset.vencimentoRestante || '') + 'T23:59:59'
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
                ['suspenso', 'Suspenso'],
                ['cancelado', 'Cancelado']
            ].map(([valor, texto]) => `<option value="${valor}" ${valor === status ? 'selected' : ''}>${texto}</option>`).join('')}
        </select>
        <select name="origem" onchange="this.form.submit()">
            ${[
                ['', 'Todas as origens'],
                ...ORIGENS_CLIENTE.map(item => [item, item])
            ].map(([valor, texto]) => `<option value="${escapar(valor)}" ${valor === origem ? 'selected' : ''}>${escapar(texto)}</option>`).join('')}
        </select>
        <select name="tag" onchange="this.form.submit()">
            ${[
                ['', 'Todas as tags'],
                ...TAGS_CLIENTE.map(item => [item, item])
            ].map(([valor, texto]) => `<option value="${escapar(valor)}" ${valor === tag ? 'selected' : ''}>${escapar(texto)}</option>`).join('')}
        </select>
    </form>
    <div class="toolbar">
        <span></span>
        <div class="actions">
            <form method="post" action="/clientes/verificar-renovacoes">
                <button class="button green" type="submit">${icon('whats')} Enviar vencimentos</button>
            </form>
            <a class="button" href="/clientes/novo">${icon('plus')} Novo Cliente</a>
        </div>
    </div>
    <section class="clients-panel">
        ${tabelaClientes(clientes)}
        ${paginacaoClientes ? paginacao({
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

function planoCard(plano) {
    return `<article class="device-card">
        <span class="device-icon">${icon('planos')}</span>
        <div>
            <div class="device-name">${escapar(plano.nome)}</div>
            <div class="helper">${escapar(plano.dias)} dias${plano.valor ? ` - R$ ${escapar(plano.valor)}` : ''}</div>
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
        ${planos.length ? planos.map(planoCard).join('') : '<div class="empty">Nenhum tipo de plano cadastrado.</div>'}
    </section>`;
}

function formularioPlano(plano = {}) {
    return `<section class="page-title">
        <h1>${plano.id ? 'Editar Tipo de Plano' : 'Novo Tipo de Plano'}</h1>
        <div class="subtitle">Exemplo: Mensal com 30 dias de duração</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/planos/salvar">
            ${plano.id ? `<input type="hidden" name="id" value="${escapar(plano.id)}">` : ''}
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
    const label = modelo.plano === 'padrao' ? 'Padrão (todos os planos)' : modelo.plano;
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
                        ${config.logoUrl ? `<img class="brand-logo" src="${escapar(config.logoUrl)}" alt="Logo atual">` : `<span class="brand-icon">${icon('image')}</span>`}
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
        ${modelos.length ? modelos.map(cardModelo).join('') : '<div class="empty">Nenhum modelo cadastrado.</div>'}
    </section>`;
}

function formularioModelo(modelo = {}) {
    return `<section class="page-title">
        <h1>${modelo.id ? 'Editar Modelo' : 'Novo Modelo'}</h1>
        <div class="subtitle">Use variáveis para personalizar cada mensagem enviada</div>
    </section>
    ${variaveisDisponiveis()}
    <section class="panel">
        <form class="fields" method="post" action="/modelos/salvar">
            ${modelo.id ? `<input type="hidden" name="id" value="${escapar(modelo.id)}">` : ''}
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
                    { valor: 'aniversario', texto: 'Aniversário' }
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
        ${apps.length ? apps.map(appRow).join('') : '<div class="empty">Nenhum app cadastrado.</div>'}
    </section>`;
}

function formularioApp(app = {}) {
    return `<section class="page-title">
        <h1>${app.id ? 'Editar App' : 'Novo App'}</h1>
        <div class="subtitle">Informe o app e onde ele pode ser usado</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/apps/salvar">
            ${app.id ? `<input type="hidden" name="id" value="${escapar(app.id)}">` : ''}
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
        ${dispositivos.length ? dispositivos.map(deviceCard).join('') : '<div class="empty">Nenhum dispositivo cadastrado.</div>'}
    </section>`;
}

function formularioDispositivo(dispositivo = {}) {
    return `<section class="page-title">
        <h1>${dispositivo.id ? 'Editar Dispositivo' : 'Novo Dispositivo'}</h1>
        <div class="subtitle">Cadastre os aparelhos usados pelos clientes</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/dispositivos/salvar">
            ${dispositivo.id ? `<input type="hidden" name="id" value="${escapar(dispositivo.id)}">` : ''}
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
        <div class="device-name">${escapar(painel.nome)}</div>
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
        ${paineis.length ? paineis.map(panelCard).join('') : '<div class="empty">Nenhum painel cadastrado.</div>'}
    </section>`;
}

function formularioPainel(painel = {}) {
    return `<section class="page-title">
        <h1>${painel.id ? 'Editar Painel' : 'Novo Painel'}</h1>
        <div class="subtitle">Cadastre os painéis usados no controle dos clientes</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/paineis/salvar">
            ${painel.id ? `<input type="hidden" name="id" value="${escapar(painel.id)}">` : ''}
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
    const clientes = await listarClientes();
    const mensagem = req.query.mensagem || '';
    const pagina = paginaAtual(req.query.pagina);

    await renderizar(res, {
        titulo: 'Painel',
        conteudo: dashboard(clientes, pagina),
        mensagem,
        ativo: 'painel'
    });
});

router.get('/clientes/todos', async (req, res) => {
    desativarCache(res);
    const busca = req.query.busca || '';
    const status = req.query.status || '';
    const origem = req.query.origem || '';
    const tag = req.query.tag || '';
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

    const [listas, notas, alertas] = await Promise.all([
        obterListasCliente(),
        listarNotasCliente(cliente.id),
        buscarAlertasCadastroCliente(cliente)
    ]);

    await renderizar(res, {
        titulo: 'Editar cliente',
        conteudo: formularioCliente(cliente, listas, { notas, alertas }),
        mensagem: req.query.mensagem || '',
        ativo: 'clientes'
    });
});

router.post('/clientes/salvar', async (req, res) => {
    try {
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

        logControleClientes(req.body.id ? 'Cliente editado' : 'Cliente cadastrado', {
            id: clienteSalvo?.id,
            nome: clienteSalvo?.nome,
            telefone: clienteSalvo?.telefone,
            plano: clienteSalvo?.plano,
            status: clienteSalvo?.status
        });

        const mensagemAlerta = alertas.length
            ? 'Cliente salvo. Atenção: existe histórico problemático para nome ou telefone parecido.'
            : 'Cliente salvo com sucesso';

        if (adicionandoNota && clienteSalvo?.id) {
            return res.redirect(montarUrlClienteMensagem(clienteSalvo.id, novaNota
                ? 'Nota adicionada ao histórico e cliente salvo'
                : 'Cliente salvo. Nenhuma nota foi informada.'));
        }

        if (clienteEhTeste(clienteSalvo) && clienteSalvo?.id) {
            return res.redirect(montarUrlListaClientesMensagem(alertas.length
                ? mensagemAlerta
                : 'Cliente teste salvo com sucesso. O teste liberado nao foi reenviado.'));
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
    await removerTipoPlano(req.params.id);
    res.redirect('/planos?mensagem=Plano excluído');
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
    await removerApp(req.params.id);
    res.redirect('/apps?mensagem=App excluído');
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
    await removerDispositivo(req.params.id);
    res.redirect('/dispositivos?mensagem=Dispositivo excluído');
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
    await removerPainel(req.params.id);
    res.redirect('/paineis?mensagem=Painel excluído');
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
            logoUrl: `/assets/${nomeArquivo}?v=${Date.now()}`
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
        return res.redirect(`/clientes/${cliente.id}/editar?mensagem=WhatsApp não está conectado`);
    }

    const dados = {
        telefone: cliente.telefone,
        nome: req.body.nome || cliente.nome,
        aparelho: req.body.aparelho || cliente.aparelho,
        aplicativo: req.body.aplicativo || '',
        painel: req.body.painel || '',
        usuario: req.body.usuario || cliente.usuario,
        senha: req.body.senha || cliente.senha,
        dataInicio: req.body.dataInicio || cliente.dataInicio,
        validade: req.body.validade || cliente.dataVencimento || cliente.vencimento
    };
    const faltando = camposFaltandoTesteLiberado(dados);

    if (faltando.length) {
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Preencha antes de enviar: ${faltando.join(', ')}.`));
    }

    try {
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
            appsInstalados: dados.aplicativo ? [dados.aplicativo] : lerListaSalva(cliente.appsInstalados),
            dispositivosSelecionados: dados.aparelho ? [dados.aparelho] : lerListaSalva(cliente.dispositivosSelecionados),
            paineisSelecionados: dados.painel ? [dados.painel] : lerListaSalva(cliente.paineisSelecionados),
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
        const destino = await resolverDestinoWhatsApp(client, clienteAtualizado.telefone);
        registrarEnvioDoRobo(destino, mensagem);
        const envio = await aguardarComTimeout(
            client.sendMessage(destino, mensagem),
            90000,
            'Envio do teste liberado'
        );

        if (!envio) {
            throw new Error('O WhatsApp nao confirmou o envio da mensagem.');
        }

        registrarMensagemDoRobo(envio);
        console.log(`[clientes] Teste liberado enviado para ${destino}. id=${envio.id?._serialized || 'sem-id'}`);
        logControleClientes('Teste liberado enviado', {
            clienteId: clienteAtualizado.id,
            destino
        });
        agendarEncerramentoTeste(client, destino);
        return res.redirect(montarUrlListaClientesMensagem('Teste gratis liberado enviado e cadastro atualizado'));
    } catch (err) {
        console.error(`[clientes] Falha ao enviar teste liberado para cliente ${cliente.id}: ${err.message}`);
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Erro ao enviar teste: ${err.message}`));
    }
});

router.post('/clientes/:id/excluir', async (req, res) => {
    await removerCliente(req.params.id);
    res.redirect('/clientes/todos?mensagem=Cliente excluído');
});

router.post('/clientes/verificar-renovacoes', async (req, res) => {
    const diasAviso = Number(process.env.RENOVACAO_DIAS_AVISO || 3);
    const resultado = await verificarRenovacoes({ getClient, getStatusWhatsApp, diasAviso });

    if (resultado.erro) {
        return res.redirect(`/clientes?mensagem=${encodeURIComponent(resultado.erro)}`);
    }

    res.redirect(`/clientes?mensagem=${encodeURIComponent(`${resultado.enviados} aviso(s) de renovação e ${resultado.aniversarios || 0} aniversário(s) enviado(s).`)}`);
});

module.exports = router;
