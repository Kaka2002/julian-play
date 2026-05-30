const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();

const { getQrCode, getStatusWhatsApp } = require('../config/whatsapp');

function pagina({ titulo, mensagem, qrImage = '' }) {
    return `
    <!doctype html>
    <html lang="pt-BR">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="5">
        <title>JULIAN PLAY TV - WhatsApp</title>
        <style>
            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                background: #111;
                color: #fff;
                font-family: Arial, sans-serif;
                text-align: center;
            }

            main {
                width: min(92vw, 420px);
                padding: 24px;
            }

            img {
                width: 320px;
                max-width: 100%;
                background: #fff;
                padding: 12px;
                border-radius: 8px;
            }

            p {
                color: #ddd;
                line-height: 1.4;
            }

            small {
                color: #aaa;
            }
        </style>
    </head>
    <body>
        <main>
            <h2>${titulo}</h2>
            ${qrImage ? `<img src="${qrImage}" alt="QR Code WhatsApp">` : ''}
            <p>${mensagem}</p>
            <small>Esta pagina atualiza automaticamente a cada 5 segundos.</small>
        </main>
    </body>
    </html>`;
}

router.get('/', (req, res) => {
    res.redirect('/qr');
});

router.get('/status', (req, res) => {
    res.json(getStatusWhatsApp());
});

router.get('/qr', async (req, res) => {
    const status = getStatusWhatsApp();

    if (status.conectado) {
        return res.send(pagina({
            titulo: 'WhatsApp conectado',
            mensagem: 'O robo esta conectado e pronto para responder.'
        }));
    }

    const qr = getQrCode();

    if (!qr) {
        return res.send(pagina({
            titulo: 'Aguardando QR Code',
            mensagem: 'O WhatsApp ainda esta iniciando. Aguarde alguns segundos nesta tela.'
        }));
    }

    const qrImage = await QRCode.toDataURL(qr);

    return res.send(pagina({
        titulo: 'Escaneie o QR Code',
        mensagem: 'Abra o WhatsApp no celular, toque em Aparelhos conectados e escaneie este QR Code. Use sempre o QR Code mais recente desta tela.',
        qrImage
    }));
});

module.exports = router;
