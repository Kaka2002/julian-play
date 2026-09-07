const express = require('express');

function criarConciliacaoFinanceiraRoute(deps = {}) {
    const router = express.Router();
    const { executarConciliacaoFinanceira, listarDivergenciasFinanceiras, renderizar, escapar, desativarCache } = deps;

    function tela(itens = []) {
        return `<section class="page-title"><div><h1>Conciliação Financeira</h1><div class="subtitle">Confere cobranças aprovadas, pagamentos, valores e vencimentos</div></div>
            <form method="post" action="/financeiro/conciliacao/executar"><button class="button" type="submit">Executar agora</button></form></section>
        <section class="panel"><div class="panel-head"><div><h2 class="panel-title">${itens.length} divergência(s)</h2><div class="subtitle">A rotina é diagnóstica e não altera receita ou acesso automaticamente.</div></div></div>
        ${itens.length ? `<div class="pending-list">${itens.map(item => `<article class="pending-item"><div><span class="badge ${item.prioridade === 'critica' ? 'error' : 'warn'}">${item.prioridade === 'critica' ? 'Crítica' : 'Alta'}</span><span class="badge muted">Financeiro</span><h3>${escapar(item.titulo)}</h3><p>${escapar(item.detalhe)}</p><small>Referência: ${escapar(item.referencia)}</small></div><a class="button secondary" href="${escapar(item.href)}">Revisar cliente</a></article>`).join('')}</div>` : '<div class="empty">Nenhuma divergência financeira encontrada.</div>'}</section>`;
    }

    router.get('/financeiro/conciliacao', async (req, res) => {
        desativarCache(res);
        const itens = await listarDivergenciasFinanceiras();
        return renderizar(res, { titulo: 'Conciliação Financeira', conteudo: tela(itens), mensagem: req.query.mensagem || '', ativo: 'financeiro' });
    });
    router.post('/financeiro/conciliacao/executar', async (req, res) => {
        try {
            const resultado = await executarConciliacaoFinanceira({ origem: 'painel' });
            const mensagem = resultado.ignorada ? 'A conciliação já está em andamento.' : `Conciliação concluída: ${resultado.resumo.total} divergência(s).`;
            return res.redirect(`/financeiro/conciliacao?mensagem=${encodeURIComponent(mensagem)}`);
        } catch (err) { return res.redirect(`/financeiro/conciliacao?mensagem=${encodeURIComponent(`Falha na conciliação: ${err.message}`)}`); }
    });
    return router;
}

module.exports = criarConciliacaoFinanceiraRoute;
