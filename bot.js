const express = require('express');
const qrRoute = require('./routes/qrRoute');
const iniciarWhatsApp = require('./config/whatsapp');

const app = express();

app.use('/', qrRoute);

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Monitor na porta ${PORT}`);
});

iniciarWhatsApp();