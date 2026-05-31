const express = require('express');
const qrRoute = require('./routes/qrRoute');
const { iniciarWhatsApp, encerrarWhatsApp } = require('./config/whatsapp');

process.on('unhandledRejection', (err) => {
    const mensagem = err && err.message ? err.message : String(err);

    if (
        mensagem.includes('Execution context was destroyed') ||
        mensagem.includes('Runtime.callFunctionOn timed out') ||
        mensagem.includes('ProtocolError') ||
        mensagem.includes('auth timeout')
    ) {
        console.log('WhatsApp Web demorou/recarregou durante a inicializacao. Aguardando estabilizar...');
        return;
    }

    console.log('Erro nao tratado:', err);
});

const app = express();

app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        service: 'julian-play',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.use('/', qrRoute);

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Monitor na porta ${PORT}`);
});

async function desligar(signal) {
    console.log(`Recebido ${signal}. Encerrando WhatsApp...`);
    await encerrarWhatsApp();
    process.exit(0);
}

process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));

iniciarWhatsApp();
