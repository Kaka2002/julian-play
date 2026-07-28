const express = require('express');
const { registrarReclamacaoCampanha, listarReclamacoesCampanha } = require('../services/campanhasService');
const { registrarEventoSistema } = require('../services/eventosSistema');

function criarCampanhasRoute(dependencias = {}) {
    const router = express.Router();
    if (typeof dependencias.renderizarPaginaCampanhas !== 'function') {
        throw new Error('Renderização da página de campanhas não configurada.');
    }

    router.get('/', dependencias.renderizarPaginaCampanhas);
    router.get('/reclamacoes', async (req, res) => {
        const registros = await listarReclamacoesCampanha(req.query.campanhaId || null, req.query.limite || 100);
        res.json({ ok: true, total: registros.length, registros });
    });

    router.post('/reclamacoes', async (req, res) => {
    try {
        const reclamacao = await registrarReclamacaoCampanha({
            campanhaId: req.body.campanhaId,
            campanhaItemId: req.body.campanhaItemId,
            clienteId: req.body.clienteId,
            motivo: req.body.motivo,
            origem: 'painel',
            responsavel: req.session?.usuario || req.usuario?.usuario || ''
        });
        await registrarEventoSistema('campanha_reclamacao', 'alerta',
            'Reclamação de campanha registrada; cliente bloqueado para novos envios de marketing.', {
                reclamacaoId: reclamacao.id,
                campanhaId: reclamacao.campanhaId,
                clienteId: reclamacao.clienteId
            });
        const retorno = String(req.body.retorno || '/campanhas');
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Reclamação registrada. O cliente não receberá novas campanhas.')}`);
    } catch (err) {
        return res.redirect(`/campanhas?mensagem=${encodeURIComponent(err.message)}`);
    }
    });

    return router;
}

module.exports = criarCampanhasRoute;
