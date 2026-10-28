const express = require('express');

function criarPaineisRoute(deps = {}) {
    const router = express.Router();
    const {
        renderizar, escapar, paginaAtual, quantidadePorPagina, paginarItens,
        registrosPorPagina, telaPaineis, formularioPainel, listarPaineis,
        buscarPainelPorId, salvarPainel, removerPainel, listarHistoricoRenovacoes,
        testarIntegracaoPainel, reagendarRenovacao, confirmarSenhaAcaoCritica,
        logControleClientes
    } = deps;

    router.get('/paineis', async (req, res) => {
        const paineis = await listarPaineis();
        const paginacao = paginarItens(
            paineis,
            paginaAtual(req.query.pagina),
            quantidadePorPagina(req.query.porPagina, registrosPorPagina)
        );
        return renderizar(res, {
            titulo: 'Painéis',
            conteudo: telaPaineis(paineis, paginacao),
            mensagem: req.query.mensagem || '',
            ativo: 'paineis'
        });
    });

    router.get('/paineis/novo', async (_req, res) => renderizar(res, {
        titulo: 'Novo painel', conteudo: formularioPainel({ ativo: 1 }), ativo: 'paineis'
    }));

    router.get('/paineis/:id/editar', async (req, res) => {
        const painel = await buscarPainelPorId(req.params.id);
        if (!painel) return res.redirect('/paineis?mensagem=Painel não encontrado');
        const historico = await listarHistoricoRenovacoes(painel.id);
        return renderizar(res, {
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
            return res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(resultado.resumo || `API respondeu com HTTP ${resultado.status}.`)}`);
        } catch (err) {
            return res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(`Falha no teste da API: ${err.message}`)}`);
        }
    });

    router.post('/paineis/:id/sigma/consultar', async (req,res) => {
        res.set('Cache-Control','no-store');
        try {
            const painel=await buscarPainelPorId(req.params.id);
            if (!painel || painel.tipoIntegracao!=='sigma_reseller' || !painel.ativo) throw new Error('Selecione um painel Aura/Sigma ativo.');
            const api=require('../services/sigmaResellerService').criarClienteSigma(painel);
            let resultado;
            if(req.body.consulta==='perfil') resultado=await api.perfil();
            else if(['servers','packages'].includes(req.body.consulta)) resultado=await api.catalogo(req.body.consulta,req.body.paginaSigma || 1);
            else if(req.body.consulta==='assinatura') resultado=await api.assinatura(req.body.usuarioSigma);
            else throw new Error('Selecione uma consulta válida.');
            return renderizar(res,{titulo:'Consulta Aura/Sigma',ativo:'paineis',conteudo:`<section class="panel" style="padding:20px;"><h1>Consulta Aura/Sigma</h1><p>Somente leitura. Nenhum acesso, pagamento ou crédito foi alterado.</p>${require('../services/sigmaResellerService').resultadoConsultaHtml(resultado,escapar)}<a class="button secondary" href="/paineis/${Number(painel.id)}/editar">Voltar ao painel</a></section>`});
        } catch(err) {
            res.status(400);
            const mensagem=err instanceof require('../services/sigmaResellerService').ErroSigma ? err.message : 'Não foi possível consultar. Confira o painel, a URL e o token salvos.';
            return renderizar(res,{titulo:'Consulta Aura/Sigma',ativo:'paineis',conteudo:`<section class="panel" style="padding:20px;"><h1>Consulta não concluída</h1><p>${escapar(mensagem)}</p><a href="/paineis">Voltar aos painéis</a></section>`});
        }
    });

    router.post('/paineis/:id/renovacoes/:filaId/tentar', async (req, res) => {
        try {
            await reagendarRenovacao(req.params.filaId);
            return res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent('Nova tentativa agendada.')}`);
        } catch (err) {
            return res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(err.message)}`);
        }
    });

    router.post('/paineis/salvar', confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            await salvarPainel(req.body);
            logControleClientes('Configuracao de painel IPTV/P2P atualizada', {
                painelId: req.body.id || 'novo', nome: req.body.nome,
                api: req.body.apiUrl ? 'configurada' : 'vazia',
                token: req.body.apiToken ? 'atualizado' : 'mantido',
                renovacaoAutomatica: req.body.renovacaoAutomatica
            });
            return res.redirect('/paineis?mensagem=Painel salvo com sucesso');
        } catch (err) {
            res.status(400);
            return renderizar(res, {
                titulo: 'Salvar painel',
                conteudo: `${formularioPainel(req.body)}<div class="notice">${escapar(err.message)}</div>`,
                ativo: 'paineis'
            });
        }
    });

    router.post('/paineis/:id/excluir', async (req, res) => {
        try { await removerPainel(req.params.id); return res.redirect('/paineis?mensagem=Painel excluído'); }
        catch (err) { return res.redirect(`/paineis?mensagem=${encodeURIComponent(`Erro ao excluir painel: ${err.message}`)}`); }
    });

    return router;
}

module.exports = criarPaineisRoute;
