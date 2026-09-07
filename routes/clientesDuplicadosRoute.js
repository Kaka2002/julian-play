const express = require('express');

function criarClientesDuplicadosRoute(deps = {}) {
    const router = express.Router();
    const { listarGruposClientesDuplicados, renderizar, escapar, desativarCache } = deps;

    function formatarIdentificador(item) {
        if (item.tipo === 'telefone') return `WhatsApp ${item.valor}`;
        return `MAC ${item.valor.match(/.{2}/g)?.join(':') || item.valor}`;
    }

    router.get('/clientes/duplicados', async (_req, res) => {
        desativarCache(res);
        const grupos = await listarGruposClientesDuplicados();
        const conteudo = `<section class="page-title"><div><h1>Possíveis clientes duplicados</h1>
            <div class="subtitle">Revise coincidências fortes antes de corrigir qualquer cadastro.</div></div></section>
        <section class="panel"><div class="panel-head"><div><h2 class="panel-title">${grupos.length} grupo(s) para revisar</h2>
            <div class="subtitle">O sistema não une nem exclui clientes automaticamente. Corrija o telefone ou MAC no cadastro que estiver incorreto.</div></div></div>
            ${grupos.length ? `<div class="pending-list">${grupos.map(grupo => `<article class="pending-item"><div>
                <span class="badge ${grupo.prioridade === 'alta' ? 'warn' : 'info'}">${grupo.prioridade === 'alta' ? 'Alta' : 'Média'}</span>
                <h3>${grupo.clientes.map(cliente => escapar(cliente.nome)).join(' × ')}</h3>
                <p>${grupo.coincidencias.map(item => escapar(formatarIdentificador(item))).join(' · ')}</p>
                <div class="quick-actions">${grupo.clientes.map(cliente => `<a class="button secondary" href="/clientes/${cliente.id}/editar">Revisar ${escapar(cliente.nome)}</a>`).join('')}</div>
            </div></article>`).join('')}</div>` : '<div class="empty">Nenhuma duplicidade forte encontrada.</div>'}
        </section>`;
        return renderizar(res, { titulo: 'Possíveis clientes duplicados', conteudo, ativo: 'clientes' });
    });

    return router;
}

module.exports = criarClientesDuplicadosRoute;
