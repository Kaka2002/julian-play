const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();

const { getQrCode } = require('../config/whatsapp');

router.get('/qr', async (req, res) => {

    const qr = getQrCode();

    if (!qr) {
        return res.send('QR ainda não gerado');
    }

    const qrImage = await QRCode.toDataURL(qr);

    res.send(`
    <html>
    <body style="text-align:center;font-family:sans-serif">
        <h2>Escaneie o QR Code</h2>
        <img src="${qrImage}" width="300">
    </body>
    </html>
    `);

});

module.exports = router;