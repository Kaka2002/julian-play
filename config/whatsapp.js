const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { responderMensagem } = require('../services/conversaService');

let client;
let qrAtual = '';
let inicializando = false;
let conectado = false;
let tentativaReconexao = null;

function agendarReconexao() {
    if (tentativaReconexao) return;

    tentativaReconexao = setTimeout(() => {
        tentativaReconexao = null;
        iniciarWhatsApp();
    }, 5000);
}

async function iniciarWhatsApp() {
    if (inicializando) {
        console.log('Inicializacao do WhatsApp ja esta em andamento');
        return;
    }

    inicializando = true;

    try {
        const executablePath = await chromium.executablePath();

        console.log('Chrome encontrado:', executablePath);

        client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'julianplay',
                dataPath: './.wwebjs_auth'
            }),
            takeoverOnConflict: true,
            takeoverTimeoutMs: 0,
            puppeteer: {
                executablePath,
                headless: true,
                protocolTimeout: 120000,
                args: [
                    ...chromium.args,
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote'
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

        client.on('ready', () => {
            if (conectado) return;

            conectado = true;
            inicializando = false;
            console.log('WhatsApp conectado');
        });

        client.on('change_state', (state) => {
            console.log('Estado alterado:', state);
        });

        client.on('auth_failure', (msg) => {
            conectado = false;
            inicializando = false;
            console.log('Falha autenticacao:', msg);
            agendarReconexao();
        });

        client.on('disconnected', (reason) => {
            conectado = false;
            inicializando = false;
            console.log('Desconectado:', reason);
            agendarReconexao();
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

        await client.initialize();

        console.log('Initialize executado');
    } catch (err) {
        inicializando = false;
        console.log('Erro geral:', err);

        const mensagem = err && err.message ? err.message : String(err);

        if (mensagem.includes('Execution context was destroyed')) {
            agendarReconexao();
        }
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
