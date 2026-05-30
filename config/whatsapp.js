const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { responderMensagem } = require('../services/conversaService');

let client;
let qrAtual = '';

async function iniciarWhatsApp() {
    try {
        const executablePath = await chromium.executablePath();

        console.log('Chrome encontrado:', executablePath);

        client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'julianplay'
            }),
            puppeteer: {
                executablePath,
                headless: true,
                args: [
                    ...chromium.args,
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process'
                ]
            }
        });

        console.log('Iniciando cliente WhatsApp...');

        client.on('loading_screen', (percent, message) => {
            console.log(`Carregando: ${percent}% - ${message}`);
        });

        client.on('qr', (qr) => {
            qrAtual = qr;
            console.log('QR Code gerado');
        });

        client.on('authenticated', () => {
            console.log('Autenticado');
        });

        client.on('ready', async () => {
            console.log('WhatsApp conectado');

            try {
                console.log('Estado:', await client.getState());
            } catch (err) {
                console.log('Erro ao consultar estado:', err);
            }
        });

        client.on('change_state', (state) => {
            console.log('Estado alterado:', state);
        });

        client.on('auth_failure', (msg) => {
            console.log('Falha autenticacao:', msg);
        });

        client.on('disconnected', (reason) => {
            console.log('Desconectado:', reason);
        });

        client.on('message', async (message) => {
            try {
                if (message.fromMe) return;

                console.log('Mensagem recebida:', message.body);
                await responderMensagem(message);
            } catch (err) {
                console.log('Erro no evento message:', err);
            }
        });

        client.on('message_create', async (message) => {
            if (message.fromMe) return;
            console.log('Message create:', message.body);
        });

        await client.initialize();

        console.log('Initialize executado');
    } catch (err) {
        console.log('Erro geral:', err);
    }
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
