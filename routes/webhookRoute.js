const express = require('express');
const { processarPagamentoMercadoPago } = require('../services/mercadoPagoService');
const { getClient, getStatusWhatsApp } = require('../config/whatsapp');

const router = express.Router();

function destinoWhatsapp(telefone) {
    const numero = String(telefone || '').replace(/\D/g, '');
    return numero ? `${numero}@c.us` : '';
}

router.post('/webhooks/mercado-pago', async (req, res) => {
    const tipo = String(req.body?.type || req.query?.type || req.body?.topic || '');
    const pagamentoId = String(req.body?.data?.id || req.query?.['data.id'] || req.query?.id || '');
    if (tipo && tipo !== 'payment') return res.sendStatus(200);
    if (!/^\d+$/.test(pagamentoId)) return res.sendStatus(200);

    try {
        const resultado = await processarPagamentoMercadoPago(pagamentoId);
        res.sendStatus(200);

        if (resultado.aprovado) {
            const cliente = resultado.renovacao?.cliente;
            const client = getClient();
            if (client && getStatusWhatsApp().conectado && cliente?.telefone) {
                const mensagem = `✅ *PAGAMENTO PIX CONFIRMADO*\n\nOlá, *${cliente.nome || 'cliente'}*! Seu pagamento foi confirmado automaticamente.\n\n*Plano:* ${resultado.renovacao.plano}\n*Valor:* R$ ${resultado.renovacao.valorTotal}\n*Novo vencimento:* ${resultado.renovacao.vencimentoNovo}\n\nObrigado!`;
                client.sendMessage(destinoWhatsapp(cliente.telefone), mensagem).catch(err => {
                    console.error(`[mercado-pago] Pagamento confirmado, mas a mensagem falhou: ${err.message}`);
                });
            }
        }
    } catch (err) {
        console.error(`[mercado-pago] Erro ao processar webhook do pagamento ${pagamentoId}: ${err.message}`);
        res.status(500).json({ ok: false });
    }
});

module.exports = router;
