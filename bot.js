const express = require('express');
const path = require('path');
const qrRoute = require('./routes/qrRoute');
const clientesRoute = require('./routes/clientesRoute');
const {
    iniciarWhatsApp,
    encerrarWhatsApp,
    getClient,
    getStatusWhatsApp
} = require('./config/whatsapp');
const { iniciarAgendadorRenovacao } = require('./services/renovacaoAutomatica');

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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        service: 'julian-play',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.use('/', clientesRoute);
app.use('/', qrRoute);

const PORT = process.env.PORT || 10000;

const server = app.listen(PORT, () => {
    console.log(`Monitor na porta ${PORT}`);
    iniciarWhatsApp();
    iniciarAgendadorRenovacao({ getClient, getStatusWhatsApp });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Porta ${PORT} ja esta em uso. Encerre o outro processo antes de iniciar o julian-play.`);
        process.exit(1);
    }

    console.error('Erro ao iniciar servidor:', err);
    process.exit(1);
});

async function desligar(signal) {
    console.log(`Recebido ${signal}. Encerrando WhatsApp...`);
    await encerrarWhatsApp();
    process.exit(0);
}

process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));
