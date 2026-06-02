const express = require('express');
const {
    listarClientes,
    salvarCliente,
    buscarClientePorId,
    removerCliente
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

const router = express.Router();
const DIAS_DASHBOARD = 7;

function escapar(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatarData(dataISO) {
    if (!dataISO) return '-';

    const [ano, mes, dia] = dataISO.split('-');
    if (!ano || !mes || !dia) return dataISO;

    return `${dia}/${mes}/${ano}`;
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function adicionarDiasISO(dias) {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return data.toISOString().slice(0, 10);
}

function calcularDiasRestantes(vencimento) {
    if (!vencimento) return null;

    const hoje = new Date(`${hojeISO()}T00:00:00`);
    const dataVencimento = new Date(`${vencimento}T00:00:00`);
    const umDia = 24 * 60 * 60 * 1000;

    return Math.ceil((dataVencimento - hoje) / umDia);
}

function calcularResumo(clientes) {
    const hoje = hojeISO();
    const limiteISO = adicionarDiasISO(DIAS_DASHBOARD);

    return {
        total: clientes.length,
        ativos: clientes.filter(cliente => cliente.status === 'ativo').length,
        vencidos: clientes.filter(cliente => cliente.vencimento && cliente.vencimento < hoje).length,
        vencendo: clientes.filter(cliente => cliente.vencimento && cliente.vencimento >= hoje && cliente.vencimento <= limiteISO).length
    };
}

function clientesComVencimentoProximo(clientes) {
    const limiteISO = adicionarDiasISO(DIAS_DASHBOARD);

    return clientes
        .filter(cliente => cliente.vencimento && cliente.vencimento <= limiteISO)
        .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
}

function statusClasse(status) {
    if (status === 'ativo') return 'ok';
    if (status === 'teste') return 'info';
    if (status === 'suspenso') return 'warn';
    return 'muted';
}

function textoVencimento(cliente) {
    const dias = calcularDiasRestantes(cliente.vencimento);

    if (dias === null) return 'Sem vencimento';
    if (dias < 0) return `Vencido ha ${Math.abs(dias)} dia(s)`;
    if (dias === 0) return 'Vence hoje';

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
        planos: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>'
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
    <title>${escapar(titulo)} - ${escapar(nomeSistema)}</title>
    <style>
        :root {
            color-scheme: light;
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
            font-family: Inter, Arial, sans-serif;
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
            width: min(1250px, calc(100% - 36px));
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

        .metrics {
            display: grid;
            grid-template-columns: repeat(4, minmax(180px, 1fr));
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
        .metric-icon.green { background: var(--green-soft); color: var(--green); }
        .metric-icon.red { background: var(--red-soft); color: var(--red); }
        .metric-icon.orange { background: var(--orange-soft); color: var(--orange); }

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
            gap: 8px;
            justify-content: flex-end;
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
            grid-template-columns: 1fr 1fr auto;
            gap: 14px;
            align-items: end;
            padding: 22px;
        }

        .logo-preview {
            display: flex;
            gap: 12px;
            align-items: center;
            padding: 14px 22px 0;
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
            font-size: 23px;
            font-weight: 800;
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
            <a class="brand" href="/clientes">
                ${logoUrl ? `<img class="brand-logo" src="${escapar(logoUrl)}" alt="Logo">` : `<span class="brand-icon">${icon('logo')}</span>`}
                <span>${escapar(nomeSistema)}</span>
            </a>
            <nav>
                <a class="navlink ${ativo === 'painel' ? 'active' : ''}" href="/clientes">${icon('painel')} Painel</a>
                <a class="navlink ${ativo === 'clientes' ? 'active' : ''}" href="/clientes/todos">${icon('clientes')} Clientes</a>
                <a class="navlink ${ativo === 'planos' ? 'active' : ''}" href="/planos">${icon('planos')} Planos</a>
                <a class="navlink ${ativo === 'modelos' ? 'active' : ''}" href="/modelos">${icon('modelos')} Modelos</a>
                <a class="navlink ${ativo === 'apps' ? 'active' : ''}" href="/apps">${icon('apps')} Apps</a>
                <a class="navlink ${ativo === 'dispositivos' ? 'active' : ''}" href="/dispositivos">${icon('dispositivos')} Dispositivos</a>
                <a class="navlink ${ativo === 'paineis' ? 'active' : ''}" href="/paineis">${icon('paineis')} Paineis</a>
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

async function renderizar(res, opcoes) {
    const config = await obterConfiguracoes();
    res.send(layout({ ...opcoes, config }));
}

function campo({ nome, label, tipo = 'text', valor = '', opcoes = [] }) {
    if (opcoes.length) {
        return `<label>${label}
            <select name="${nome}">
                ${opcoes.map(opcao => `<option value="${escapar(opcao.valor)}" ${opcao.valor === valor ? 'selected' : ''}>${escapar(opcao.texto)}</option>`).join('')}
            </select>
        </label>`;
    }

    return `<label>${label}
        <input type="${tipo}" name="${nome}" value="${escapar(valor)}">
    </label>`;
}

function areaTexto({ nome, label, valor = '' }) {
    return `<label class="full">${label}
        <textarea name="${nome}">${escapar(valor)}</textarea>
    </label>`;
}

function formularioCliente(cliente = {}) {
    return `<section class="page-title">
        <h1>${cliente.id ? 'Editar Cliente' : 'Novo Cliente'}</h1>
        <div class="subtitle">Dados de acesso, plano e vencimento</div>
    </section>
    <section class="panel">
        <form class="fields" method="post" action="/clientes/salvar">
            ${cliente.id ? `<input type="hidden" name="id" value="${escapar(cliente.id)}">` : ''}
            ${campo({ nome: 'nome', label: 'Nome', valor: cliente.nome, tipo: 'text' })}
            ${campo({ nome: 'telefone', label: 'WhatsApp', valor: cliente.telefone, tipo: 'tel' })}
            ${campo({ nome: 'usuario', label: 'Usuario IPTV', valor: cliente.usuario })}
            ${campo({ nome: 'senha', label: 'Senha IPTV', valor: cliente.senha })}
            ${campo({ nome: 'plano', label: 'Plano', valor: cliente.plano })}
            ${campo({ nome: 'aparelho', label: 'Aparelho', valor: cliente.aparelho })}
            ${campo({ nome: 'vencimento', label: 'Vencimento', valor: cliente.vencimento, tipo: 'date' })}
            ${campo({
                nome: 'status',
                label: 'Status',
                valor: cliente.status || 'ativo',
                opcoes: [
                    { valor: 'ativo', texto: 'Ativo' },
                    { valor: 'teste', texto: 'Teste' },
                    { valor: 'suspenso', texto: 'Suspenso' },
                    { valor: 'cancelado', texto: 'Cancelado' }
                ]
            })}
            <div class="actions full">
                <button class="button" type="submit">${icon('check')} Salvar cliente</button>
                <a class="button secondary" href="/clientes/todos">Cancelar</a>
            </div>
        </form>
    </section>`;
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

function cardVencimento(cliente) {
    const dias = calcularDiasRestantes(cliente.vencimento);
    const classeVencimento = dias < 0 ? 'expired' : '';

    return `<div class="client-row">
        <div class="avatar">${escapar(iniciais(cliente.nome))}</div>
        <div>
            <div class="client-name">${escapar(cliente.nome)}</div>
            <div class="helper">${escapar(cliente.telefone || '')}</div>
        </div>
        <div>
            <div class="due ${classeVencimento}">${escapar(textoVencimento(cliente))}</div>
            <div class="due-date">${escapar(formatarData(cliente.vencimento))} 00:00</div>
        </div>
        <span class="badge ${statusClasse(cliente.status)}">${escapar(cliente.status || '-')}</span>
        <a class="button secondary icon-only" href="/clientes/${cliente.id}/editar" title="Editar cliente">${icon('whats')}</a>
    </div>`;
}

function dashboard(clientes) {
    const resumo = calcularResumo(clientes);
    const proximos = clientesComVencimentoProximo(clientes);

    return `<section class="page-title">
        <h1>Painel de Controle</h1>
        <div class="subtitle">Visao geral dos seus clientes</div>
    </section>
    <section class="metrics">
        ${metricCard({ label: 'Total de Clientes', valor: resumo.total, tipo: 'blue', icone: 'clientes' })}
        ${metricCard({ label: 'Ativos', valor: resumo.ativos, tipo: 'green', icone: 'check' })}
        ${metricCard({ label: 'Vencidos', valor: resumo.vencidos, tipo: 'red', icone: 'close' })}
        ${metricCard({ label: `Vencem em ${DIAS_DASHBOARD} dias`, valor: resumo.vencendo, nota: 'Precisam de atencao', tipo: 'orange', icone: 'alert' })}
    </section>
    <section class="panel">
        <div class="panel-head">
            <div>
                <h2 class="panel-title">Clientes com Vencimento Proximo</h2>
                <div class="subtitle">Clientes que vencem nos proximos ${DIAS_DASHBOARD} dias ou ja venceram</div>
            </div>
            <div class="actions">
                <form method="post" action="/clientes/verificar-renovacoes">
                    <button class="button green" type="submit">${icon('whats')} Disparar Avisos (${proximos.length})</button>
                </form>
                <a class="button secondary" href="/clientes/todos">Ver todos ${icon('arrow')}</a>
            </div>
        </div>
        ${proximos.length ? proximos.map(cardVencimento).join('') : '<div class="empty">Nenhum cliente vencendo nos proximos dias.</div>'}
    </section>`;
}

function tabelaClientes(clientes) {
    if (!clientes.length) {
        return '<div class="empty">Nenhum cliente encontrado.</div>';
    }

    const linhas = clientes.map(cliente => `<tr>
        <td data-label="Nome"><strong>${escapar(cliente.nome)}</strong><div class="helper">${escapar(cliente.telefone)}</div></td>
        <td data-label="Usuario">${escapar(cliente.usuario || '-')}</td>
        <td data-label="Plano">${escapar(cliente.plano || '-')}</td>
        <td data-label="Aparelho">${escapar(cliente.aparelho || '-')}</td>
        <td data-label="Vencimento">${escapar(formatarData(cliente.vencimento))}</td>
        <td data-label="Status"><span class="badge ${statusClasse(cliente.status)}">${escapar(cliente.status || '-')}</span></td>
        <td data-label="Acoes">
            <div class="row-actions">
                <a class="button secondary" href="/clientes/${cliente.id}/editar">Editar</a>
                <form method="post" action="/clientes/${cliente.id}/excluir" onsubmit="return confirm('Excluir este cliente?');">
                    <button class="button danger" type="submit">Excluir</button>
                </form>
            </div>
        </td>
    </tr>`).join('');

    return `<table>
        <thead>
            <tr>
                <th>Cliente</th>
                <th>Usuario</th>
                <th>Plano</th>
                <th>Aparelho</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th></th>
            </tr>
        </thead>
        <tbody>${linhas}</tbody>
    </table>`;
}

function listaClientes({ clientes, busca }) {
    return `<section class="page-title">
        <h1>Clientes</h1>
        <div class="subtitle">Cadastro completo e gerenciamento</div>
    </section>
    <section class="panel" style="padding: 22px;">
        <div class="toolbar">
            <form class="search" method="get" action="/clientes/todos">
                <input name="busca" value="${escapar(busca)}" placeholder="Buscar por nome, telefone, usuario ou plano">
                <button class="button secondary" type="submit">${icon('search')} Buscar</button>
            </form>
            <div class="actions">
                <form method="post" action="/clientes/verificar-renovacoes">
                    <button class="button green" type="submit">${icon('whats')} Enviar avisos</button>
                </form>
                <a class="button" href="/clientes/novo">${icon('user')} Novo cliente</a>
            </div>
        </div>
        ${tabelaClientes(clientes)}
    </section>`;
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
        <div class="subtitle">Exemplo: Mensal com 30 dias de duracao</div>
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
            <strong style="display:inline-flex;align-items:center;gap:8px;">${icon('info')} Variaveis disponiveis</strong>
            ${variaveis.map(([token, descricao]) => `<span><span class="var-token">${escapar(token)}</span> <span class="helper">- ${escapar(descricao)}</span></span>`).join('')}
        </div>
    </section>`;
}

function chipPlano(modelo) {
    const label = modelo.plano === 'padrao' ? 'Padrao (todos os planos)' : modelo.plano;
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
        ${config.logoUrl ? `<div class="logo-preview"><img class="brand-logo" src="${escapar(config.logoUrl)}" alt="Logo atual"><span class="helper">Logo atual</span></div>` : ''}
        <form class="logo-config" method="post" action="/configuracoes/painel">
            ${campo({ nome: 'nomeSistema', label: 'Nome do sistema', valor: config.nomeSistema || 'Controle de Cliente IPTV e P2P' })}
            ${campo({ nome: 'logoUrl', label: 'URL ou caminho do logo', valor: config.logoUrl || '', tipo: 'text' })}
            <button class="button" type="submit">${icon('image')} Salvar marca</button>
        </form>
    </section>
    <section class="model-grid">
        ${modelos.length ? modelos.map(cardModelo).join('') : '<div class="empty">Nenhum modelo cadastrado.</div>'}
    </section>`;
}

function formularioModelo(modelo = {}) {
    return `<section class="page-title">
        <h1>${modelo.id ? 'Editar Modelo' : 'Novo Modelo'}</h1>
        <div class="subtitle">Use variaveis para personalizar cada mensagem enviada</div>
    </section>
    ${variaveisDisponiveis()}
    <section class="panel">
        <form class="fields" method="post" action="/modelos/salvar">
            ${modelo.id ? `<input type="hidden" name="id" value="${escapar(modelo.id)}">` : ''}
            ${campo({ nome: 'titulo', label: 'Titulo', valor: modelo.titulo })}
            ${campo({
                nome: 'plano',
                label: 'Plano',
                valor: modelo.plano || 'padrao',
                opcoes: [
                    { valor: 'padrao', texto: 'Padrao (todos os planos)' },
                    { valor: 'mensal', texto: 'Mensal' },
                    { valor: 'trimestral', texto: 'Trimestral' },
                    { valor: 'semestral', texto: 'Semestral' },
                    { valor: 'anual', texto: 'Anual' }
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
            ${areaTexto({ nome: 'texto', label: 'Mensagem', valor: modelo.texto })}
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
                <div class="subtitle">Gerencie os apps disponiveis para cadastro de clientes</div>
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
            ${areaTexto({ nome: 'descricao', label: 'Descricao / paineis e dispositivos compativeis', valor: app.descricao })}
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
                <h1>Paineis</h1>
                <div class="subtitle">${paineis.length} paineis cadastrados</div>
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
        <div class="subtitle">Cadastre os paineis usados no controle dos clientes</div>
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
    const clientes = await listarClientes();
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Painel',
        conteudo: dashboard(clientes),
        mensagem,
        ativo: 'painel'
    });
});

router.get('/clientes/todos', async (req, res) => {
    const busca = req.query.busca || '';
    const clientes = await listarClientes({ busca });
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Clientes',
        conteudo: listaClientes({ clientes, busca }),
        mensagem,
        ativo: 'clientes'
    });
});

router.get('/clientes/novo', (req, res) => {
    renderizar(res, {
        titulo: 'Novo cliente',
        conteudo: formularioCliente({ status: 'ativo' }),
        ativo: 'clientes'
    });
});

router.get('/clientes/:id/editar', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes?mensagem=Cliente nao encontrado');
    }

    await renderizar(res, {
        titulo: 'Editar cliente',
        conteudo: formularioCliente(cliente),
        ativo: 'clientes'
    });
});

router.post('/clientes/salvar', async (req, res) => {
    try {
        await salvarCliente(req.body);
        res.redirect('/clientes/todos?mensagem=Cliente salvo com sucesso');
    } catch (err) {
        res.status(400);
        await renderizar(res, {
            titulo: 'Salvar cliente',
            conteudo: `${formularioCliente(req.body)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'clientes'
        });
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
        return res.redirect('/planos?mensagem=Plano nao encontrado');
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
    res.redirect('/planos?mensagem=Plano excluido');
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
        return res.redirect('/apps?mensagem=App nao encontrado');
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
    res.redirect('/apps?mensagem=App excluido');
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
        return res.redirect('/dispositivos?mensagem=Dispositivo nao encontrado');
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
    res.redirect('/dispositivos?mensagem=Dispositivo excluido');
});

router.get('/paineis', async (req, res) => {
    const paineis = await listarPaineis();
    const mensagem = req.query.mensagem || '';

    await renderizar(res, {
        titulo: 'Paineis',
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
        return res.redirect('/paineis?mensagem=Painel nao encontrado');
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
    res.redirect('/paineis?mensagem=Painel excluido');
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
            texto: 'Ola, *{{nome}}!*\n\nSeu plano *{{plano}}* vence em *{{dias}} dia(s)*, no dia *{{vencimento}}*.\n\nEntre em contato para renovar.'
        }),
        ativo: 'modelos'
    });
});

router.get('/modelos/:id/editar', async (req, res) => {
    const modelo = await buscarModeloPorId(req.params.id);

    if (!modelo) {
        return res.redirect('/modelos?mensagem=Modelo nao encontrado');
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
    res.redirect('/modelos?mensagem=Modelo excluido');
});

router.post('/configuracoes/painel', async (req, res) => {
    await salvarConfiguracoesPainel(req.body);
    res.redirect('/modelos?mensagem=Marca do painel salva');
});

router.post('/clientes/:id/excluir', async (req, res) => {
    await removerCliente(req.params.id);
    res.redirect('/clientes/todos?mensagem=Cliente excluido');
});

router.post('/clientes/verificar-renovacoes', async (req, res) => {
    const diasAviso = Number(process.env.RENOVACAO_DIAS_AVISO || 3);
    const resultado = await verificarRenovacoes({ getClient, getStatusWhatsApp, diasAviso });

    if (resultado.erro) {
        return res.redirect(`/clientes?mensagem=${encodeURIComponent(resultado.erro)}`);
    }

    res.redirect(`/clientes?mensagem=${encodeURIComponent(`${resultado.enviados} aviso(s) enviado(s).`)}`);
});

module.exports = router;
