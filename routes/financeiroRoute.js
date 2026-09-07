const express = require('express');

function criarFinanceiroRoute(deps = {}) {
    const router = express.Router();
    const {
        desativarCache, filtrosFinanceiroQuery, paginaAtual,
        listarPagamentosFinanceiro, listarClientes, paginarItens,
        financeiroPorPagina, renderizar, telaFinanceiro, gerarCsvFinanceiro
    } = deps;

    router.get('/financeiro', async (req, res) => {
        desativarCache(res);
        const filtros = filtrosFinanceiroQuery(req.query);
        const [pagamentos, clientes] = await Promise.all([
            listarPagamentosFinanceiro(filtros), listarClientes()
        ]);
        const paginacaoFinanceiro = paginarItens(
            pagamentos,
            paginaAtual(req.query.pagina),
            filtros.porPagina || financeiroPorPagina
        );
        return renderizar(res, {
            titulo: 'Financeiro',
            conteudo: telaFinanceiro({ pagamentos, filtros, paginacaoFinanceiro, clientes }),
            mensagem: req.query.mensagem || '', ativo: 'financeiro'
        });
    });

    router.get('/financeiro/exportar.csv', async (req, res) => {
        desativarCache(res);
        const pagamentos = await listarPagamentosFinanceiro(filtrosFinanceiroQuery(req.query));
        const agora = new Date();
        const carimbo = [
            agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'),
            String(agora.getDate()).padStart(2, '0'), '-',
            String(agora.getHours()).padStart(2, '0'), String(agora.getMinutes()).padStart(2, '0')
        ].join('');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="financeiro-${carimbo}.csv"`);
        return res.send(`\uFEFF${gerarCsvFinanceiro(pagamentos)}`);
    });

    return router;
}

module.exports = criarFinanceiroRoute;
