const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');
const {
    responderMensagem,
    responderEncerramentoRapido,
    normalizar
} = require('../services/conversaService');

const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));
const AUTH_DATA_PATH = process.env.WWEBJS_AUTH_PATH || path.join(DATA_DIR, '.wwebjs_auth');
const TAKEOVER_ATIVO = process.env.WWEBJS_TAKEOVER === 'true';
const AUTH_TIMEOUT_MS = Number(process.env.WWEBJS_AUTH_TIMEOUT_MS || 300000);
const PROTOCOL_TIMEOUT_MS = Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS || 300000);

let client;
let qrAtual = '';
let inicializando = false;
let conectado = false;
let tentativaReconexao = null;
let statusWhatsApp = 'iniciando';
let ultimoQrEm = null;
const filasMensagens = new Map();
const mensagensProcessadas = new Set();

async function obterExecutablePath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        if (fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
            return process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        console.log('PUPPETEER_EXECUTABLE_PATH nao encontrado, usando deteccao automatica:', process.env.PUPPETEER_EXECUTABLE_PATH);
    }

    if (process.platform === 'win32') {
        const caminhosChrome = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];

        const caminho = caminhosChrome.find(fs.existsSync);
        if (caminho) return caminho;

        throw new Error('Google Chrome nao encontrado. Instale o Chrome ou defina PUPPETEER_EXECUTABLE_PATH.');
    }

    return chromium.executablePath();
}

function obterPuppeteerArgs() {
    const argsBase = process.platform === 'win32' ? [] : chromium.args;

    return [
        ...argsBase,
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
    ];
}

function getMessageId(message) {
    return message?.id?._serialized || `${message.from}:${message.timestamp}:${message.body}`;
}

function jaProcessouMensagem(message) {
    const id = getMessageId(message);

    if (mensagensProcessadas.has(id)) return true;

    mensagensProcessadas.add(id);

    if (mensagensProcessadas.size > 500) {
        const [primeiro] = mensagensProcessadas;
        mensagensProcessadas.delete(primeiro);
    }

    return false;
}

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

function ehComandoControle(texto) {
    return ['0', 'voltar', 'menu', 'sair', 'encerrar'].includes(texto);
}

function obterTelefoneMensagem(message) {
    return message?.fromMe && message?.to ? message.to : message.from;
}

function ehMensagemPropriaProcessavel(texto) {
    return ehComandoControle(texto) || texto.length <= 80;
}

function processarMensagemEmFila(message, options = {}) {
    if (!message) return;

    const texto = normalizar(message.body || '');

    if (!texto) {
        console.log('Mensagem vazia ignorada');
        return;
    }

    if (message.fromMe && !ehComandoControle(texto) && !(options.permitirFromMe && ehMensagemPropriaProcessavel(texto))) {
        console.log('Mensagem propria ignorada:', message.body);
        return;
    }

    if (message.fromMe) {
        console.log(
            'Mensagem propria manual processada:',
            message.body,
            'from:',
            message.from,
            'to:',
            message.to
        );
    }

    if (jaProcessouMensagem(message)) return;

    const telefone = obterTelefoneMensagem(message);

    if (texto === 'sair' || texto === 'encerrar') {
        filasMensagens.delete(telefone);
        console.log('Encerramento solicitado:', message.body, 'telefone:', telefone);
    }

    const filaAtual = filasMensagens.get(telefone) || Promise.resolve();

    const proximaFila = filaAtual
        .catch(() => {})
        .then(() => {
            if (texto === 'sair' || texto === 'encerrar') {
                return responderEncerramentoRapido(message);
            }

            return responderMensagem(message);
        })
        .catch((err) => {
            console.log('Erro no evento message:', err);
        })
        .finally(() => {
            if (filasMensagens.get(telefone) === proximaFila) {
                filasMensagens.delete(telefone);
            }
        });

    filasMensagens.set(telefone, proximaFila);
}

async function iniciarWhatsApp() {
    if (inicializando) {
        console.log('Inicializacao do WhatsApp ja esta em andamento');
        return;
    }

    inicializando = true;
    statusWhatsApp = 'iniciando';

    try {
        const executablePath = await obterExecutablePath();

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
                protocolTimeout: PROTOCOL_TIMEOUT_MS,
                args: obterPuppeteerArgs()
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
            console.log('Mensagem recebida:', message.body);
            processarMensagemEmFila(message);
        });

        client.on('message_create', async (message) => {
            console.log(`Mensagem recebida via reserva${message.fromMe ? ' (fromMe)' : ''}:`, message.body);
            processarMensagemEmFila(message, { permitirFromMe: true });
        });

        await client.initialize();

        console.log('Initialize executado');
    } catch (err) {
        inicializando = false;
        statusWhatsApp = 'erro';
        console.log('Erro geral:', err);

        const mensagem = err && err.message ? err.message : String(err);

        if (
            mensagem.includes('Execution context was destroyed') ||
            mensagem.includes('Runtime.callFunctionOn timed out') ||
            mensagem.includes('ProtocolError') ||
            mensagem.includes('auth timeout')
        ) {
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
        authTimeoutMs: AUTH_TIMEOUT_MS,
        protocolTimeoutMs: PROTOCOL_TIMEOUT_MS
    };
}

module.exports = {
    iniciarWhatsApp,
    encerrarWhatsApp,
    getQrCode,
    getClient,
    getStatusWhatsApp
};
