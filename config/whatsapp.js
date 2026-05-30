const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

async function iniciarWhatsApp() {

    try {

        const executablePath = await chromium.executablePath();

        console.log('Chrome encontrado:', executablePath);

        const client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, '../.wwebjs_auth')
            }),
            puppeteer: {
                executablePath,
                headless: true,
                args: chromium.args
            }
        });

        client.on('qr', () => {
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

        await client.initialize();

    } catch (error) {

        console.error('Erro ao iniciar WhatsApp:', error);

    }
}

module.exports = iniciarWhatsApp;