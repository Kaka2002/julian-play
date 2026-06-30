const express = require('express');
const { criarBackupManual } = require('../services/manutencao');
const { liberarAtendimentosHumanos } = require('../services/conversaService');
const { getStatusWhatsApp } = require('../config/whatsapp');

const router = express.Router();

function autenticarPainelMestre(req, res, next) {
    const esperado = String(process.env.LICENSE_ADMIN_TOKEN || '').trim();
    const recebido = String(req.get('x-master-token') || '').trim();

    if (!esperado || recebido !== esperado) {
        return res.status(403).json({ ok: false, erro: 'Acesso interno negado.' });
    }

    next();
}

router.use(autenticarPainelMestre);

router.get('/status', (req, res) => {
    res.json({ ok: true, whatsapp: getStatusWhatsApp() });
});

router.post('/backup', async (req, res) => {
    try {
        const backup = await criarBackupManual();
        res.json({ ok: true, backup });
    } catch (err) {
        res.status(500).json({ ok: false, erro: err.message });
    }
});

router.post('/atendimentos/liberar', (req, res) => {
    const resultado = liberarAtendimentosHumanos(req.body?.telefone);
    res.json({ ok: true, ...resultado });
});

module.exports = router;
