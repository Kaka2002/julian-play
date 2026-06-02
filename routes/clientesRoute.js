const express = require('express');
const {
    listarClientes,
    salvarCliente,
    buscarClientePorId,
    removerCliente
} = require('../services/clientes');
const { verificarRenovacoes } = require('../services/renovacaoAutomatica');
const { getClient, getStatusWhatsApp } = require('../config/whatsapp');

const router = express.Router();

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

function calcularResumo(clientes) {
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date();
    limite.setDate(limite.getDate() + Number(process.env.RENOVACAO_DIAS_AVISO || 3));
    const limiteISO = limite.toISOString().slice(0, 10);

    return {
        total: clientes.length,
        ativos: clientes.filter(cliente => cliente.status === 'ativo').length,
        testes: clientes.filter(cliente => cliente.status === 'teste').length,
        vencendo: clientes.filter(cliente => cliente.vencimento && cliente.vencimento >= hoje && cliente.vencimento <= limiteISO).length,
        vencidos: clientes.filter(cliente => cliente.vencimento && cliente.vencimento < hoje).length
    };
}

function statusClasse(status) {
    if (status === 'ativo') return 'ok';
    if (status === 'teste') return 'info';
    if (status === 'suspenso') return 'warn';
    return 'muted';
}

function layout({ titulo, conteudo, mensagem = '' }) {
    const status = getStatusWhatsApp();

    return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapar(titulo)} - Julian Play</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f6f7f9;
            --panel: #ffffff;
            --ink: #18212f;
            --soft: #647084;
            --line: #dfe4ea;
            --brand: #0f8b6f;
            --accent: #2563eb;
            --danger: #b42318;
            --warn: #a15c00;
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            background: var(--bg);
            color: var(--ink);
            font-family: Arial, sans-serif;
        }

        header {
            background: #14213d;
            color: #fff;
            border-bottom: 4px solid var(--brand);
        }

        .topbar, main {
            width: min(1180px, calc(100% - 32px));
            margin: 0 auto;
        }

        .topbar {
            min-height: 72px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        h1 {
            margin: 0;
            font-size: 22px;
            letter-spacing: 0;
        }

        nav {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }

        a, button {
            font: inherit;
        }

        .navlink, .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 38px;
            padding: 0 14px;
            border-radius: 6px;
            border: 1px solid transparent;
            text-decoration: none;
            cursor: pointer;
            white-space: nowrap;
        }

        .navlink {
            color: #fff;
            border-color: rgba(255,255,255,.25);
        }

        .button {
            color: #fff;
            background: var(--accent);
            border-color: var(--accent);
        }

        .button.secondary {
            background: #fff;
            color: var(--ink);
            border-color: var(--line);
        }

        .button.danger {
            background: var(--danger);
            border-color: var(--danger);
        }

        main {
            padding: 24px 0 40px;
        }

        .notice {
            margin-bottom: 16px;
            padding: 12px 14px;
            border-left: 4px solid var(--brand);
            background: #eaf7f3;
            color: #173d34;
        }

        .status {
            color: ${status.conectado ? '#bdf4d3' : '#ffd6a5'};
            font-size: 14px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(130px, 1fr));
            gap: 12px;
            margin-bottom: 18px;
        }

        .metric, .panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 8px;
        }

        .metric {
            padding: 14px;
            min-height: 84px;
        }

        .metric strong {
            display: block;
            margin-top: 8px;
            font-size: 26px;
        }

        .metric span, label, .helper {
            color: var(--soft);
            font-size: 14px;
        }

        .panel {
            padding: 18px;
            margin-bottom: 18px;
        }

        .toolbar {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 14px;
        }

        .search {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        input, select {
            width: 100%;
            min-height: 40px;
            padding: 8px 10px;
            border: 1px solid var(--line);
            border-radius: 6px;
            background: #fff;
            color: var(--ink);
        }

        .search input {
            width: min(360px, 100%);
        }

        form.fields {
            display: grid;
            grid-template-columns: repeat(4, minmax(150px, 1fr));
            gap: 14px;
        }

        .full {
            grid-column: 1 / -1;
        }

        .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 11px 10px;
            border-bottom: 1px solid var(--line);
            text-align: left;
            vertical-align: middle;
        }

        th {
            color: var(--soft);
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .badge {
            display: inline-flex;
            min-height: 26px;
            align-items: center;
            border-radius: 999px;
            padding: 0 10px;
            font-size: 13px;
            font-weight: 700;
        }

        .badge.ok { background: #e7f8ef; color: #087443; }
        .badge.info { background: #e8f1ff; color: #1d4ed8; }
        .badge.warn { background: #fff3df; color: var(--warn); }
        .badge.muted { background: #eef1f5; color: #576171; }

        .row-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        .empty {
            padding: 24px;
            text-align: center;
            color: var(--soft);
        }

        @media (max-width: 860px) {
            .topbar { align-items: flex-start; flex-direction: column; padding: 16px 0; }
            nav { justify-content: flex-start; }
            .grid { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
            form.fields { grid-template-columns: 1fr; }
            table, thead, tbody, th, td, tr { display: block; }
            thead { display: none; }
            tr { border-bottom: 1px solid var(--line); padding: 10px 0; }
            td { border: 0; padding: 7px 0; }
            td::before {
                content: attr(data-label);
                display: block;
                color: var(--soft);
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                margin-bottom: 2px;
            }
            .row-actions { justify-content: flex-start; }
        }
    </style>
</head>
<body>
    <header>
        <div class="topbar">
            <div>
                <h1>Julian Play - Clientes</h1>
                <div class="status">WhatsApp: ${status.conectado ? 'conectado' : escapar(status.status || 'desconectado')}</div>
            </div>
            <nav>
                <a class="navlink" href="/clientes">Clientes</a>
                <a class="navlink" href="/clientes/novo">Novo cliente</a>
                <a class="navlink" href="/qr">QR WhatsApp</a>
            </nav>
        </div>
    </header>
    <main>
        ${mensagem ? `<div class="notice">${escapar(mensagem)}</div>` : ''}
        ${conteudo}
    </main>
</body>
</html>`;
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

function formularioCliente(cliente = {}) {
    return `<section class="panel">
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
                <button class="button" type="submit">Salvar cliente</button>
                <a class="button secondary" href="/clientes">Cancelar</a>
            </div>
        </form>
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

router.get('/clientes', async (req, res) => {
    const busca = req.query.busca || '';
    const clientes = await listarClientes({ busca });
    const resumo = calcularResumo(clientes);
    const mensagem = req.query.mensagem || '';

    const conteudo = `
        <section class="grid">
            <div class="metric"><span>Total</span><strong>${resumo.total}</strong></div>
            <div class="metric"><span>Ativos</span><strong>${resumo.ativos}</strong></div>
            <div class="metric"><span>Testes</span><strong>${resumo.testes}</strong></div>
            <div class="metric"><span>Vencendo</span><strong>${resumo.vencendo}</strong></div>
            <div class="metric"><span>Vencidos</span><strong>${resumo.vencidos}</strong></div>
        </section>
        <section class="panel">
            <div class="toolbar">
                <form class="search" method="get" action="/clientes">
                    <input name="busca" value="${escapar(busca)}" placeholder="Buscar por nome, telefone, usuario ou plano">
                    <button class="button secondary" type="submit">Buscar</button>
                </form>
                <div class="actions">
                    <form method="post" action="/clientes/verificar-renovacoes">
                        <button class="button" type="submit">Enviar avisos agora</button>
                    </form>
                    <a class="button" href="/clientes/novo">Novo cliente</a>
                </div>
            </div>
            ${tabelaClientes(clientes)}
        </section>`;

    res.send(layout({ titulo: 'Clientes', conteudo, mensagem }));
});

router.get('/clientes/novo', (req, res) => {
    res.send(layout({
        titulo: 'Novo cliente',
        conteudo: formularioCliente({ status: 'ativo' })
    }));
});

router.get('/clientes/:id/editar', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes?mensagem=Cliente nao encontrado');
    }

    res.send(layout({
        titulo: 'Editar cliente',
        conteudo: formularioCliente(cliente)
    }));
});

router.post('/clientes/salvar', async (req, res) => {
    try {
        await salvarCliente(req.body);
        res.redirect('/clientes?mensagem=Cliente salvo com sucesso');
    } catch (err) {
        res.status(400).send(layout({
            titulo: 'Salvar cliente',
            conteudo: `${formularioCliente(req.body)}<div class="notice">${escapar(err.message)}</div>`
        }));
    }
});

router.post('/clientes/:id/excluir', async (req, res) => {
    await removerCliente(req.params.id);
    res.redirect('/clientes?mensagem=Cliente excluido');
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
