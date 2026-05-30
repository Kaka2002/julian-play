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

        // MENU

        if (
            texto === 'oi' ||
            texto === 'ola' ||
            texto === 'olá' ||
            texto === 'menu'
        ) {

            console.log('📋 MENU ACIONADO');

            await message.reply(
`📺 *JULIAN PLAY TV*

1️⃣ Solicitar Planos

2️⃣ Teste Grátis

3️⃣ Renovar Assinatura

4️⃣ Ativar Aplicativos

0️⃣ Encerrar Atendimento`
            );

            return;
        }

        // PLANOS

        if (texto === '1') {

            await message.reply(
`💎 *PLANOS JULIAN PLAY TV*

📅 Mensal - R$ 25,00

📅 Trimestral - R$ 70,00

📅 Semestral - R$ 130,00

📅 Anual - R$ 240,00

💳 PIX:
11925716232

Após o pagamento envie o comprovante.`
            );

            return;
        }

        // TESTE GRATIS

        if (texto === '2') {

            await message.reply(
`🎁 *TESTE GRÁTIS*

Envie:

👤 Seu nome

📱 Modelo do aparelho

para receber seu acesso de teste.`
            );

            return;
        }

        // RENOVAÇÃO

        if (texto === '3') {

            await message.reply(
`🔄 *RENOVAÇÃO DE ASSINATURA*

Envie:

📱 Número cadastrado

ou

👤 Nome do assinante

para localizarmos sua assinatura.`
            );

            return;
        }

        // ATIVAÇÃO

        if (texto === '4') {

            await message.reply(
`📲 *ATIVAÇÃO DE APLICATIVOS*

Escolha uma opção:

1 - Smart TV

2 - TV Box

3 - Android

4 - iPhone`
            );

            return;
        }

        // SMART TV

        if (texto === 'smart tv' || texto === 'tv' || texto === '1 tv') {

            await message.reply(
`📺 Instalação Smart TV

1. Acesse a loja de aplicativos

2. Instale o aplicativo IPTV Smarters Pro

3. Envie uma foto da tela para receber seus dados`
            );

            return;
        }

        // ENCERRAMENTO

        if (texto === '0') {

            await message.reply(
`🙏 Obrigado pelo contato.

Quando precisar novamente basta enviar:

👉 MENU

JULIAN PLAY TV`
            );

            return;
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