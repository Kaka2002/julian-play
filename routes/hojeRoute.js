const express = require('express');
const { getStatusWhatsApp } = require('../config/whatsapp');
const { obterCentralHoje } = require('../services/centralHojeService');

function criarHojeRoute(dependencias = {}) {
    if (typeof dependencias.renderizarPaginaHoje !== 'function') {
        throw new Error('Renderização da Central Hoje não configurada.');
    }
    const router = express.Router();
    router.get('/', async (req, res) => {
        try {
            const dados = await obterCentralHoje({ whatsapp: getStatusWhatsApp() });
            await dependencias.renderizarPaginaHoje(req, res, dados);
        } catch (err) {
            res.status(500);
            await dependencias.renderizarPaginaHoje(req, res, {
                resumo: {},
                tarefas: [],
                erro: err.message
            });
        }
    });
    return router;
}

module.exports = criarHojeRoute;
