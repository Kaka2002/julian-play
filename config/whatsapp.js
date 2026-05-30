const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');

let client;
let qrAtual = '';

async function iniciarWhatsApp() {

    const executablePath = await chromium.executablePath();

    console.log('Chrome encontrado:', executablePath);

    client = new Client({
        authStrategy: new LocalAuth({dataPath: './.wwebjs_auth'}),
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

    client.on('authenticated', () => {
        console.log('✅ Autenticado');
    });

    client.on('qr', (qr) => {
        qrAtual = qr;
        console.log('📱 QR Code gerado');
    });

    client.on('ready', async () => {
        console.log('✅ WhatsApp conectado');

        const numeroTeste = '5511925716232@c.us';

        await client.sendMessage(
            numeroTeste,
            '🚀 JULIAN PLAY TV online no Render!'
        );
    });

    client.on('auth_failure', (msg) => {
        console.log('❌ Falha autenticação:', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('❌ Desconectado:', reason);
    });

    // MENU PRINCIPAL
    client.on('message', async (message) => {
        console.log('MENSAGEM RECEBIDA:', message.body);

        const texto = message.body.toLowerCase();

        if (
            texto === 'oi' ||
            texto === 'ola' ||
            texto === 'olá' ||
            texto === 'menu'
        ){

        console.log('MENU ACIONADO');

        await message.reply(`

            📺 JULIAN PLAY TV

            1 - Solicitar Planos
            2 - Teste Grátis
            3 - Renovar Assinatura
            4 - Ativar Aplicativos
            0 - Encerrar Atendimento
        `);
    }
});

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