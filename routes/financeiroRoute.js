const express = require('express');

function criarFinanceiroRoute(deps = {}) {
    const router = express.Router();
    const {
        desativarCache, filtrosFinanceiroQuery, paginaAtual,
        listarPagamentosFinanceiro, listarClientes, paginarItens,
        financeiroPorPagina, renderizar, telaFinanceiro, gerarCsvFinanceiro,
        listarDespesasFinanceiras, buscarDespesaFinanceiraPorId,
        criarDespesaFinanceira, atualizarDespesaFinanceira, removerDespesaFinanceira,
        listarRendimentosFinanceiros, buscarRendimentoFinanceiroPorId,
        criarRendimentoFinanceiro, atualizarRendimentoFinanceiro, removerRendimentoFinanceiro,
        importarRendimentosMercadoPago,
        obterConciliacaoSaldo, salvarConciliacaoSaldo,
        telaDespesasFinanceiras, telaEditarDespesaFinanceira, calcularReceitaRealDoMes,
        telaRendimentosFinanceiros, telaEditarRendimentoFinanceiro,
        calcularAnaliseReceitaMensal, listarReceitaMensalFinanceira, listarTiposPlanos, calcularReceitaMensal
    } = deps;

    function filtrosDespesas(query = {}) {
        const status = String(query.status || 'validas');
        const agora = new Date();
        agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
        return {
            mes: /^\d{4}-\d{2}$/.test(String(query.mes || '')) ?String(query.mes).slice(0, 7) : agora.toISOString().slice(0, 7),
            busca: String(query.busca || '').trim().slice(0, 160),
            status: ['validas', 'removidas', 'todas'].includes(status) ?status : 'validas'
        };
    }

    function urlDespesas(filtros, mensagem = '') {
        const query = new URLSearchParams({ mes: filtros.mes });
        if (filtros.busca) query.set('busca', filtros.busca);
        if (filtros.status && filtros.status !== 'validas') query.set('status', filtros.status);
        if (mensagem) query.set('mensagem', mensagem);
        return `/financeiro/despesas?${query.toString()}`;
    }

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

    router.get('/financeiro/despesas', async (req, res) => {
        desativarCache(res);
        const filtros = filtrosDespesas(req.query);
        const [despesas, rendimentos, pagamentos, receitaBase, planos] = await Promise.all([
            listarDespesasFinanceiras(filtros),
            listarRendimentosFinanceiros({ mes: filtros.mes, status: 'validos' }),
            listarPagamentosFinanceiro({ mes: filtros.mes, status: 'validos' }),
            listarReceitaMensalFinanceira(),
            listarTiposPlanos()
        ]);
        const recorrente = calcularReceitaMensal(receitaBase);
        const analiseReceita = calcularAnaliseReceitaMensal(recorrente, pagamentos, planos);
        return renderizar(res, {
            titulo: 'Despesas',
            conteudo: telaDespesasFinanceiras({
                despesas, filtros, receitaMes: analiseReceita.total, pagamentosMes: analiseReceita.pagamentos,
                receitaRecorrente: recorrente.total, rendimentosMes: rendimentos.reduce((total, item) => total + Number(String(item.valor || 0).replace('.', '').replace(',', '.')), 0), analiseReceita
            }),
            mensagem: req.query.mensagem || '', ativo: 'financeiro'
        });
    });

    router.post('/financeiro/despesas', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try {
            await criarDespesaFinanceira(req.body, req.usuarioPainel || 'sistema');
            return res.redirect(urlDespesas(filtros, 'Despesa registrada com sucesso.'));
        } catch (err) {
            if (err?.message) return res.redirect(urlDespesas(filtros, err.message));
            return next(err);
        }
    });

    router.get('/financeiro/despesas/:id/editar', async (req, res) => {
        desativarCache(res);
        const filtros = filtrosDespesas(req.query);
        const despesa = await buscarDespesaFinanceiraPorId(req.params.id, false);
        if (!despesa) return res.redirect(urlDespesas(filtros, 'Despesa não encontrada.'));
        return renderizar(res, {
            titulo: 'Editar despesa', conteudo: telaEditarDespesaFinanceira(despesa, filtros.mes),
            mensagem: req.query.mensagem || '', ativo: 'financeiro'
        });
    });

    router.post('/financeiro/despesas/:id/editar', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try {
            await atualizarDespesaFinanceira(req.params.id, req.body, req.usuarioPainel || 'sistema');
            return res.redirect(urlDespesas(filtros, 'Despesa atualizada com sucesso.'));
        } catch (err) {
            if (err?.message) return res.redirect(urlDespesas(filtros, err.message));
            return next(err);
        }
    });

    router.post('/financeiro/despesas/:id/excluir', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try {
            await removerDespesaFinanceira(req.params.id, req.usuarioPainel || 'sistema');
            return res.redirect(urlDespesas(filtros, 'Despesa removida do resumo; o histórico foi preservado.'));
        } catch (err) {
            if (err?.message) return res.redirect(urlDespesas(filtros, err.message));
            return next(err);
        }
    });

    router.get('/financeiro/rendimentos', async (req, res) => {
        desativarCache(res);
        const filtros = filtrosDespesas(req.query);
        const [rendimentos, despesas, pagamentos, conciliacao] = await Promise.all([
            listarRendimentosFinanceiros(filtros),
            listarDespesasFinanceiras({ mes: filtros.mes, status: 'validas' }),
            listarPagamentosFinanceiro({ mes: filtros.mes, status: 'validos' }),
            obterConciliacaoSaldo(filtros.mes)
        ]);
        const receitaMes = calcularReceitaRealDoMes(pagamentos).total;
        const despesasMes = despesas.reduce((total, despesa) => total + Number(String(despesa.valor || 0).replace('.', '').replace(',', '.')), 0);
        return renderizar(res, { titulo: 'Rendimentos', conteudo: telaRendimentosFinanceiros({ rendimentos, filtros, receitaMes, despesasMes, conciliacao }), mensagem: req.query.mensagem || '', ativo: 'financeiro' });
    });

    function urlRendimentos(filtros, mensagem = '') {
        const query = new URLSearchParams({ mes: filtros.mes });
        if (filtros.busca) query.set('busca', filtros.busca);
        if (filtros.status && filtros.status !== 'validas') query.set('status', filtros.status);
        if (mensagem) query.set('mensagem', mensagem);
        return `/financeiro/rendimentos?${query.toString()}`;
    }
    router.post('/financeiro/rendimentos', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try { await criarRendimentoFinanceiro(req.body, req.usuarioPainel || 'sistema'); return res.redirect(urlRendimentos(filtros, 'Rendimento registrado com sucesso.')); }
        catch (err) { if (err?.message) return res.redirect(urlRendimentos(filtros, err.message)); return next(err); }
    });
    router.post('/financeiro/rendimentos/sincronizar-mercado-pago', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try {
            const resultado = await importarRendimentosMercadoPago();
            return res.redirect(urlRendimentos(filtros, resultado.importados ?`${resultado.importados} rendimento(s) importado(s) do Mercado Pago.` :'Nenhum rendimento novo encontrado no relatório Mercado Pago.'));
        } catch (err) { if (err?.message) return res.redirect(urlRendimentos(filtros, err.message)); return next(err); }
    });
    router.post('/financeiro/rendimentos/conciliacao-saldo', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try { await salvarConciliacaoSaldo(filtros.mes, req.body); return res.redirect(urlRendimentos(filtros, 'Conciliação salva.')); }
        catch (err) { if (err?.message) return res.redirect(urlRendimentos(filtros, err.message)); return next(err); }
    });
    router.get('/financeiro/rendimentos/:id/editar', async (req, res) => {
        desativarCache(res); const filtros = filtrosDespesas(req.query); const rendimento = await buscarRendimentoFinanceiroPorId(req.params.id, false);
        if (!rendimento) return res.redirect(urlRendimentos(filtros, 'Rendimento não encontrado.'));
        return renderizar(res, { titulo: 'Editar rendimento', conteudo: telaEditarRendimentoFinanceiro(rendimento, filtros.mes), mensagem: req.query.mensagem || '', ativo: 'financeiro' });
    });
    router.post('/financeiro/rendimentos/:id/editar', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try { await atualizarRendimentoFinanceiro(req.params.id, req.body, req.usuarioPainel || 'sistema'); return res.redirect(urlRendimentos(filtros, 'Rendimento atualizado com sucesso.')); }
        catch (err) { if (err?.message) return res.redirect(urlRendimentos(filtros, err.message)); return next(err); }
    });
    router.post('/financeiro/rendimentos/:id/excluir', async (req, res, next) => {
        const filtros = filtrosDespesas(req.body);
        try { await removerRendimentoFinanceiro(req.params.id, req.usuarioPainel || 'sistema'); return res.redirect(urlRendimentos(filtros, 'Rendimento removido do resumo; o histórico foi preservado.')); }
        catch (err) { if (err?.message) return res.redirect(urlRendimentos(filtros, err.message)); return next(err); }
    });

    return router;
}

module.exports = criarFinanceiroRoute;
