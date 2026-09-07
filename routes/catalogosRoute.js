const express = require('express');

function criarCatalogosRoute(deps = {}) {
    const router = express.Router();
    const {
        renderizar, escapar, paginaAtual, quantidadePorPagina, paginarItens,
        registrosPorPagina, telaPlanos, formularioPlano, telaApps, formularioApp,
        telaDispositivos, formularioDispositivo, listarTiposPlanos,
        buscarTipoPlanoPorId, salvarTipoPlano, removerTipoPlano, listarApps,
        buscarAppPorId, salvarApp, removerApp, listarDispositivos,
        buscarDispositivoPorId, salvarDispositivo, removerDispositivo
    } = deps;

    router.get('/planos', async (req, res) => {
        const planos = await listarTiposPlanos();
        await renderizar(res, { titulo: 'Planos', conteudo: telaPlanos(planos), mensagem: req.query.mensagem || '', ativo: 'planos' });
    });
    router.get('/planos/novo', async (_req, res) => renderizar(res, {
        titulo: 'Novo plano', conteudo: formularioPlano({ nome: 'Mensal', dias: 30, ativo: 1 }), ativo: 'planos'
    }));
    router.get('/planos/:id/editar', async (req, res) => {
        const plano = await buscarTipoPlanoPorId(req.params.id);
        if (!plano) return res.redirect('/planos?mensagem=Plano não encontrado');
        return renderizar(res, { titulo: 'Editar plano', conteudo: formularioPlano(plano), ativo: 'planos' });
    });
    router.post('/planos/salvar', async (req, res) => {
        try {
            await salvarTipoPlano(req.body);
            return res.redirect('/planos?mensagem=Plano salvo com sucesso');
        } catch (err) {
            res.status(400);
            return renderizar(res, { titulo: 'Salvar plano', conteudo: `${formularioPlano(req.body)}<div class="notice">${escapar(err.message)}</div>`, ativo: 'planos' });
        }
    });
    router.post('/planos/:id/excluir', async (req, res) => {
        try { await removerTipoPlano(req.params.id); return res.redirect('/planos?mensagem=Plano excluído'); }
        catch (err) { return res.redirect(`/planos?mensagem=${encodeURIComponent(`Erro ao excluir plano: ${err.message}`)}`); }
    });

    function paginar(lista, req) {
        return paginarItens(lista, paginaAtual(req.query.pagina), quantidadePorPagina(req.query.porPagina, registrosPorPagina));
    }

    router.get('/apps', async (req, res) => {
        const apps = await listarApps();
        return renderizar(res, { titulo: 'Apps', conteudo: telaApps(apps, paginar(apps, req)), mensagem: req.query.mensagem || '', ativo: 'apps' });
    });
    router.get('/apps/novo', async (_req, res) => renderizar(res, { titulo: 'Novo app', conteudo: formularioApp({ ativo: 1 }), ativo: 'apps' }));
    router.get('/apps/:id/editar', async (req, res) => {
        const app = await buscarAppPorId(req.params.id);
        if (!app) return res.redirect('/apps?mensagem=App não encontrado');
        return renderizar(res, { titulo: 'Editar app', conteudo: formularioApp(app), ativo: 'apps' });
    });
    router.post('/apps/salvar', async (req, res) => {
        try { await salvarApp(req.body); return res.redirect('/apps?mensagem=App salvo com sucesso'); }
        catch (err) {
            res.status(400);
            return renderizar(res, { titulo: 'Salvar app', conteudo: `${formularioApp(req.body)}<div class="notice">${escapar(err.message)}</div>`, ativo: 'apps' });
        }
    });
    router.post('/apps/:id/excluir', async (req, res) => {
        try { await removerApp(req.params.id); return res.redirect('/apps?mensagem=App excluído'); }
        catch (err) { return res.redirect(`/apps?mensagem=${encodeURIComponent(`Erro ao excluir app: ${err.message}`)}`); }
    });

    router.get('/dispositivos', async (req, res) => {
        const dispositivos = await listarDispositivos();
        return renderizar(res, { titulo: 'Dispositivos', conteudo: telaDispositivos(dispositivos, paginar(dispositivos, req)), mensagem: req.query.mensagem || '', ativo: 'dispositivos' });
    });
    router.get('/dispositivos/novo', async (_req, res) => renderizar(res, { titulo: 'Novo dispositivo', conteudo: formularioDispositivo({ ativo: 1 }), ativo: 'dispositivos' }));
    router.get('/dispositivos/:id/editar', async (req, res) => {
        const dispositivo = await buscarDispositivoPorId(req.params.id);
        if (!dispositivo) return res.redirect('/dispositivos?mensagem=Dispositivo não encontrado');
        return renderizar(res, { titulo: 'Editar dispositivo', conteudo: formularioDispositivo(dispositivo), ativo: 'dispositivos' });
    });
    router.post('/dispositivos/salvar', async (req, res) => {
        try { await salvarDispositivo(req.body); return res.redirect('/dispositivos?mensagem=Dispositivo salvo com sucesso'); }
        catch (err) {
            res.status(400);
            return renderizar(res, { titulo: 'Salvar dispositivo', conteudo: `${formularioDispositivo(req.body)}<div class="notice">${escapar(err.message)}</div>`, ativo: 'dispositivos' });
        }
    });
    router.post('/dispositivos/:id/excluir', async (req, res) => {
        try { await removerDispositivo(req.params.id); return res.redirect('/dispositivos?mensagem=Dispositivo excluído'); }
        catch (err) { return res.redirect(`/dispositivos?mensagem=${encodeURIComponent(`Erro ao excluir dispositivo: ${err.message}`)}`); }
    });

    return router;
}

module.exports = criarCatalogosRoute;
