const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { responderMensagem } = require('../services/conversaService');

const AUTH_DATA_PATH = process.env.WWEBJS_AUTH_PATH || './.wwebjs_auth';
const TAKEOVER_ATIVO = process.env.WWEBJS_TAKEOVER === 'true';
const AUTH_TIMEOUT_MS = Number(process.env.WWEBJS_AUTH_TIMEOUT_MS || 90000);

let client;
let qrAtual = '';
let inicializando = false;
let conectado = false;
let tentativaReconexao = null;
let statusWhatsApp = 'iniciando';
let ultimoQrEm = null;

function agendarReconexao() {
    if (tentativaReconexao) return;

    tentativaReconexao = setTimeout(() => {
        tentativaReconexao = null;

        if (statusWhatsApp === 'aguardando_qr') {
            console.log('Reconexao pausada: aguardando leitura do QR Code atual');
            return;
        }

        iniciarWhatsApp();
    }, 5000);
}

async function iniciarWhatsApp() {
    if (inicializando) {
        console.log('Inicializacao do WhatsApp ja esta em andamento');
        return;
    }

    inicializando = true;
    statusWhatsApp = 'iniciando';

    try {
        const executablePath = await chromium.executablePath();

        console.log('Chrome encontrado:', executablePath);

        client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'julianplay',
                dataPath: AUTH_DATA_PATH
            }),
            takeoverOnConflict: TAKEOVER_ATIVO,
            takeoverTimeoutMs: 30000,
            authTimeoutMs: AUTH_TIMEOUT_MS,
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
                    '--disable-extensions',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-features=Translate,AudioServiceOutOfProcess',
                    '--mute-audio',
                    '--hide-scrollbars',
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
            ultimoQrEm = new Date();
            statusWhatsApp = 'aguardando_qr';
            console.log('QR Code gerado');
        });

        client.on('authenticated', () => {
            statusWhatsApp = 'autenticado';
            qrAtual = '';
            console.log('Autenticado');
        });

        client.on('change_state', (state) => {
            if (state === 'CONNECTED') {
                statusWhatsApp = 'conectando';
            }

            console.log('Estado alterado:', state);
        });

        client.on('ready', () => {
            if (conectado) return;

            conectado = true;
            inicializando = false;
            statusWhatsApp = 'conectado';
            qrAtual = '';
            console.log('WhatsApp conectado');
        });

        client.on('auth_failure', (msg) => {
            conectado = false;
            inicializando = false;
            statusWhatsApp = 'falha_autenticacao';
            console.log('Falha autenticacao:', msg);
            agendarReconexao();
        });

        client.on('disconnected', (reason) => {
            conectado = false;
            inicializando = false;
            statusWhatsApp = 'desconectado';
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
        statusWhatsApp = 'erro';
        console.log('Erro geral:', err);

        const mensagem = err && err.message ? err.message : String(err);

        if (mensagem.includes('Execution context was destroyed')) {
            agendarReconexao();
        }
    }
}

async function encerrarWhatsApp() {
    if (tentativaReconexao) {
        clearTimeout(tentativaReconexao);
        tentativaReconexao = null;
    }

    conectado = false;
    inicializando = false;
    statusWhatsApp = 'encerrando';

    if (!client) return;

    try {
        await client.destroy();
        console.log('Cliente WhatsApp encerrado com seguranca');
    } catch (err) {
        console.log('Erro ao encerrar cliente WhatsApp:', err.message);
    } finally {
        client = null;
    }
}

function getQrCode() {
    return qrAtual;
}

function getClient() {
    return client;
}

function getStatusWhatsApp() {
    return {
        status: statusWhatsApp,
        conectado,
        inicializando,
        temQr: Boolean(qrAtual),
        ultimoQrEm,
        authDataPath: AUTH_DATA_PATH,
        takeoverAtivo: TAKEOVER_ATIVO,
        authTimeoutMs: AUTH_TIMEOUT_MS
    };
}

module.exports = {
    iniciarWhatsApp,
    encerrarWhatsApp,
    getQrCode,
    getClient,
    getStatusWhatsApp
};
