const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();

const { getQrCode, getStatusWhatsApp, gerarNovoQrCodeWhatsApp } = require('../config/whatsapp');

function pagina({ titulo, mensagem, qrImage = '', refresh = 2, mostrarNovoQr = false }) {
    return `
    <!doctype html>
    <html lang="pt-BR">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="${refresh}">
        <title>JULIAN PLAY - WhatsApp</title>
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

            button {
                margin-top: 16px;
                border: 0;
                border-radius: 8px;
                padding: 12px 16px;
                background: #4169e1;
                color: #fff;
                cursor: pointer;
                font-weight: 700;
            }
        </style>
    </head>
    <body>
        <main>
            <h2>${titulo}</h2>
            ${qrImage ? `<img src="${qrImage}" alt="QR Code WhatsApp">` : ''}
            <p>${mensagem}</p>
            ${mostrarNovoQr ? `<form method="post" action="/qr/novo" onsubmit="return confirm('Isso vai encerrar a sessao atual do WhatsApp e gerar um novo QR Code. Continuar?')"><button type="submit">Gerar novo QR Code</button></form>` : ''}
            <small>Esta página atualiza automaticamente.</small>
        </main>
    </body>
    </html>`;
}

router.get('/', (req, res) => {
    res.redirect('/clientes');
});

router.get('/status', (req, res) => {
    res.json(getStatusWhatsApp());
});

router.get('/qr', async (req, res) => {
    const status = getStatusWhatsApp();

    if (status.conectado) {
        return res.send(pagina({
            titulo: 'WhatsApp conectado',
            mensagem: 'O robô está conectado e pronto para responder.',
            refresh: 10,
            mostrarNovoQr: true
        }));
    }

    if (status.status === 'autenticado' || status.status === 'conectando') {
        return res.send(pagina({
            titulo: 'QR Code escaneado',
            mensagem: 'O WhatsApp está autenticando. Aguarde nesta tela até aparecer conectado.'
        }));
    }

    const qr = getQrCode();

    if (!qr) {
        return res.send(pagina({
            titulo: 'Aguardando QR Code',
            mensagem: 'O WhatsApp ainda está iniciando. Aguarde alguns segundos nesta tela.'
        }));
    }

    const qrImage = await QRCode.toDataURL(qr);

    return res.send(pagina({
        titulo: 'Escaneie o QR Code',
        mensagem: 'Abra o WhatsApp no celular, toque em Aparelhos conectados e escaneie este QR Code. Use sempre o QR Code mais recente desta tela.',
        qrImage
    }));
});

router.post('/qr/novo', async (req, res) => {
    try {
        await gerarNovoQrCodeWhatsApp({ motivo: 'Solicitado pela tela de QR Code' });
        res.redirect('/qr');
    } catch (err) {
        res.send(pagina({
            titulo: 'Erro ao gerar novo QR Code',
            mensagem: err.message || 'Não foi possível reiniciar a sessão do WhatsApp.',
            refresh: 5
        }));
    }
});

module.exports = router;
