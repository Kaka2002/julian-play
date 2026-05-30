const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');

let client;
let qrAtual = '';

async function iniciarWhatsApp() {

    const executablePath = await chromium.executablePath();

    console.log('Chrome encontrado:', executablePath);

    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            executablePath,
            headless: true,
            args: chromium.args
        }
    });

    client.on('qr', (qr) => {
        qrAtual = qr;
        console.log('📱 QR Code gerado');
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp conectado');
    });

    client.on('auth_failure', (msg) => {
        console.log('❌ Falha autenticação:', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('❌ Desconectado:', reason);
    });

    client.on('message', async (message) => {

        const texto = message.body.toLowerCase();

        if (
            texto === 'oi' ||
            texto === 'ola' ||
            texto === 'olá' ||
            texto === 'menu'
        ) {

            await message.reply(
`📺 *JULIAN PLAY TV*

1 - Planos

2 - Teste grátis

3 - Renovação

4 - Aplicativos

0 - Sair`
            );

        }

    });

    await client.initialize();
}

function getQrCode() {
    return qrAtual;
}

module.exports = {
    iniciarWhatsApp,
    getQrCode
};