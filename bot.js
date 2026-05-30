const express = require('express');
const iniciarWhatsApp = require('./config/whatsapp');

const app = express();

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Julian Play Bot Online');
});

app.listen(PORT, () => {
    console.log(`Monitor na porta ${PORT}`);
});

iniciarWhatsApp();