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

    // MENU PRINCIPAL
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

1 - Solicitar Planos

2 - Teste Grátis

3 - Renovar Assinatura

4 - Ativar Aplicativos

0 - Encerrar Atendimento`
            );

        }

    });

    await client.initialize();
}

function getQrCode() {
    return qrAtual;
}

function getClient() {
    return client;
}

module.exports = {
    iniciarWhatsApp,
    getQrCode,
    getClient
};