const express = require('express');
const { criarBackupManual } = require('../services/manutencao');
const { liberarAtendimentosHumanos } = require('../services/conversaService');
const { getStatusWhatsApp, getClient } = require('../config/whatsapp');

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

router.post('/alerta-operacional', async (req, res) => {
    try {
        const destino = String(req.body?.destino || '').replace(/\D/g, '');
        const mensagem = String(req.body?.mensagem || '').trim().slice(0, 3000);
        const status = getStatusWhatsApp();
        const client = getClient();
        if (!destino || !mensagem) return res.status(400).json({ ok: false, erro: 'Destino e mensagem sao obrigatorios.' });
        if (!client || !status.conectado) return res.status(409).json({ ok: false, erro: 'WhatsApp da instalacao administradora nao esta conectado.' });
        const enviada = await client.sendMessage(`${destino}@c.us`, mensagem);
        res.json({ ok: true, mensagemId: enviada?.id?._serialized || '' });
    } catch (err) {
        res.status(500).json({ ok: false, erro: err.message });
    }
});

module.exports = router;
