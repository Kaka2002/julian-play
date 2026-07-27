const express = require('express');
const { processarPagamentoMercadoPago } = require('../services/mercadoPagoService');
const { processarOrdemPayPal, verificarWebhookPayPal } = require('../services/paypalService');
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

async function notificarClientePayPal(resultado) {
    if (!resultado?.aprovado) return;
    const cliente = resultado.renovacao?.cliente;
    const client = getClient();
    if (!client || !getStatusWhatsApp().conectado || !cliente?.telefone) return;
    const mensagem = `✅ *PAGAMENTO PAYPAL CONFIRMADO*\n\nOlá, *${cliente.nome || 'cliente'}*! Seu pagamento foi confirmado automaticamente.\n\n*Plano:* ${resultado.renovacao.plano}\n*Valor:* R$ ${resultado.renovacao.valorTotal}\n*Novo vencimento:* ${resultado.renovacao.vencimentoNovo}\n\nObrigado!`;
    await client.sendMessage(destinoWhatsapp(cliente.telefone), mensagem);
}

router.get('/pagamentos/paypal/retorno', async (req, res) => {
    const ordemId = String(req.query.token || '');
    if (!/^[A-Z0-9]+$/.test(ordemId)) {
        return res.status(400).send('<h1>Pagamento inválido</h1>');
    }
    try {
        const resultado = await processarOrdemPayPal(ordemId, true);
        await notificarClientePayPal(resultado).catch(err => {
            console.error(`[paypal] Pagamento confirmado, mas a mensagem falhou: ${err.message}`);
        });
        const texto = resultado.aprovado || resultado.duplicado
            ? 'Pagamento confirmado. Sua renovação foi processada.'
            : 'O pagamento ainda está sendo processado. Você pode fechar esta página.';
        return res.status(200).send(`<meta charset="utf-8"><title>PayPal</title><h1>${texto}</h1>`);
    } catch (err) {
        console.error(`[paypal] Falha no retorno da ordem ${ordemId}: ${err.message}`);
        return res.status(500).send('<meta charset="utf-8"><h1>Não foi possível confirmar o pagamento.</h1><p>Entre em contato com o atendimento.</p>');
    }
});

router.get('/pagamentos/paypal/cancelado', (req, res) => {
    res.status(200).send('<meta charset="utf-8"><title>PayPal</title><h1>Pagamento cancelado.</h1><p>Nenhuma renovação foi realizada.</p>');
});

router.post('/webhooks/paypal', async (req, res) => {
    try {
        if (!(await verificarWebhookPayPal(req.headers, req.body))) {
            return res.status(401).json({ ok: false });
        }
        if (String(req.body?.event_type || '') !== 'PAYMENT.CAPTURE.COMPLETED') {
            return res.sendStatus(200);
        }
        const ordemId = String(req.body?.resource?.supplementary_data?.related_ids?.order_id || '');
        if (!ordemId) return res.sendStatus(200);
        const resultado = await processarOrdemPayPal(ordemId, false);
        res.sendStatus(200);
        await notificarClientePayPal(resultado).catch(err => {
            console.error(`[paypal] Pagamento confirmado, mas a mensagem falhou: ${err.message}`);
        });
    } catch (err) {
        console.error(`[paypal] Erro ao processar webhook: ${err.message}`);
        res.status(500).json({ ok: false });
    }
});

module.exports = router;
