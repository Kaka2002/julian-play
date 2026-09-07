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
            return res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(`API respondeu com HTTP ${resultado.status}.`)}`);
        } catch (err) {
            return res.redirect(`/paineis/${req.params.id}/editar?mensagem=${encodeURIComponent(`Falha no teste da API: ${err.message}`)}`);
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
