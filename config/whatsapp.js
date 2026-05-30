const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');

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
            console.log('📱 QR Code gerado');
        });

        client.on('authenticated', () => {
            console.log('✅ Autenticado');
        });

        client.on('ready', async () => {
            console.log('✅ WhatsApp conectado');

            try {

                console.log('Estado:', await client.getState());

                const numeroTeste = '5511925716232@c.us';

                await client.sendMessage(
                    numeroTeste,
                    '🚀 JULIAN PLAY TV online no Render!'
                );

                console.log('✅ Mensagem de teste enviada');

            } catch (err) {
                console.log('❌ Erro ao enviar mensagem:', err);
            }
        });

        client.on('change_state', (state) => {
            console.log('🔄 Estado alterado:', state);
        });

        client.on('auth_failure', (msg) => {
            console.log('❌ Falha autenticação:', msg);
        });

        client.on('disconnected', (reason) => {
            console.log('❌ Desconectado:', reason);
        });

        // RECEBIMENTO DE MENSAGENS
        client.on('message', async (message) => {

            try {

                if (message.fromMe) return;

                console.log('📩 MENSAGEM RECEBIDA:', message.body);

                const texto = message.body.trim().toLowerCase();

                if (
                    texto === 'oi' ||
                    texto === 'ola' ||
                    texto === 'olá' ||
                    texto === 'menu'
                ) {

                    console.log('📋 MENU ACIONADO');

                    await message.reply(
`📺 *JULIAN PLAY TV*

1 - Solicitar Planos

2 - Teste Grátis

3 - Renovar Assinatura

4 - Ativar Aplicativos

0 - Encerrar Atendimento`
                    );

                    console.log('✅ Menu enviado');
                }

            } catch (err) {
                console.log('❌ Erro no evento message:', err);
            }

        });

        // EVENTO ALTERNATIVO
        client.on('message_create', async (message) => {

            if (message.fromMe) return;

            console.log('📨 MESSAGE_CREATE:', message.body);

        });

        await client.initialize();

        console.log('🚀 Initialize executado');

    } catch (err) {

        console.log('❌ ERRO GERAL:', err);

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