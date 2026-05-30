const express = require('express');
const qrRoute = require('./routes/qrRoute');
const { iniciarWhatsApp } = require('./config/whatsapp');

process.on('unhandledRejection', (err) => {
    const mensagem = err && err.message ? err.message : String(err);

    if (mensagem.includes('Execution context was destroyed')) {
        console.log('WhatsApp Web recarregou durante a inicializacao. Aguardando reconexao...');
        return;
    }

    console.log('Erro nao tratado:', err);
});

const app = express();

app.use('/', qrRoute);

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Monitor na porta ${PORT}`);
});

iniciarWhatsApp();
