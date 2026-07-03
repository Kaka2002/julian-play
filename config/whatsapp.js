const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const { Client, LocalAuth } = require('whatsapp-web.js');
const {
    pausarParaAtendente,
    responderMensagem,
    responderEncerramentoRapido,
    responderIndisponibilidade,
    registrarTesteLiberadoPorMensagem,
    normalizar
} = require('../services/conversaService');
const { foiMensagemDoRobo } = require('../services/mensagensPropriasService');
const { licencaPermiteUso } = require('../services/licencaService');

const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));
const AUTH_DATA_PATH = process.env.WWEBJS_AUTH_PATH || path.join(DATA_DIR, '.wwebjs_auth');
const TAKEOVER_ATIVO = process.env.WWEBJS_TAKEOVER === 'true';
const AUTH_TIMEOUT_MS = Number(process.env.WWEBJS_AUTH_TIMEOUT_MS || 300000);
const PROTOCOL_TIMEOUT_MS = Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS || 300000);
const SESSION_DATA_PATH = path.join(AUTH_DATA_PATH, 'session-julianplay');
const ARQUIVO_AVISOS_FORA_HORARIO = path.join(DATA_DIR, 'database', 'avisos-fora-horario.json');

let client;
let qrAtual = '';
let inicializando = false;
let conectado = false;
let tentativaReconexao = null;
let statusWhatsApp = 'iniciando';
let ultimoQrEm = null;
let limpandoCliente = false;
const filasMensagens = new Map();
const mensagensProcessadas = new Set();
const avisosForaHorario = new Set();

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

function obterHoraSaoPaulo(data = new Date()) {
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false
    }).formatToParts(data);

    return Number(partes.find(parte => parte.type === 'hour')?.value || '0');
}

function estaNoHorarioIndisponivel(data = new Date()) {
    const hora = obterHoraSaoPaulo(data);
    return hora >= 20 || hora < 8;
}

function obterJanelaForaHorario(data = new Date()) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
    }).formatToParts(data);
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    const hora = Number(valores.hour || 0);
    const dia = Date.UTC(Number(valores.year), Number(valores.month) - 1, Number(valores.day));
    const inicioDaJanela = hora < 8 ? dia - 24 * 60 * 60 * 1000 : dia;

    return new Date(inicioDaJanela).toISOString().slice(0, 10);
}

function carregarAvisosForaHorario() {
    try {
        if (!fs.existsSync(ARQUIVO_AVISOS_FORA_HORARIO)) return;
        const dados = JSON.parse(fs.readFileSync(ARQUIVO_AVISOS_FORA_HORARIO, 'utf8'));
        const janelaAtual = obterJanelaForaHorario();

        for (const chave of Array.isArray(dados) ? dados : []) {
            if (String(chave).startsWith(`${janelaAtual}:`)) avisosForaHorario.add(String(chave));
        }
    } catch (err) {
        console.log('Nao foi possivel carregar os avisos fora do horario:', err.message);
    }
}

function registrarPrimeiroAvisoForaHorario(telefone) {
    const janelaAtual = obterJanelaForaHorario();
    const chave = `${janelaAtual}:${telefone}`;
    if (avisosForaHorario.has(chave)) return false;

    for (const chaveSalva of avisosForaHorario) {
        if (!chaveSalva.startsWith(`${janelaAtual}:`)) avisosForaHorario.delete(chaveSalva);
    }
    avisosForaHorario.add(chave);

    try {
        fs.mkdirSync(path.dirname(ARQUIVO_AVISOS_FORA_HORARIO), { recursive: true });
        fs.writeFileSync(ARQUIVO_AVISOS_FORA_HORARIO, JSON.stringify([...avisosForaHorario], null, 2));
    } catch (err) {
        console.log('Nao foi possivel salvar o aviso fora do horario:', err.message);
    }

    return true;
}

carregarAvisosForaHorario();

class LocalAuthControlado extends LocalAuth {
    async logout() {
        // A exclusao ocorre depois que o Chrome for encerrado para evitar EBUSY no Windows.
        console.log('Logout recebido; limpeza da sessao sera feita de forma controlada.');
    }
}

async function removerSessaoLocal() {
    await fs.promises.rm(SESSION_DATA_PATH, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 750
    });
}

async function limparClienteDesconectado(clienteAtual, removerSessao = false) {
    if (limpandoCliente) return;

    limpandoCliente = true;
    if (tentativaReconexao) {
        clearTimeout(tentativaReconexao);
        tentativaReconexao = null;
    }

    try {
        await esperar(1000);
        if (clienteAtual) {
            try {
                await clienteAtual.destroy();
            } catch (err) {
                console.log('Cliente anterior ja estava encerrado:', err.message);
            }
        }

        if (client === clienteAtual) client = null;
        await esperar(1000);

        if (removerSessao) {
            await removerSessaoLocal();
            qrAtual = '';
            console.log('Sessao desconectada removida. Um novo QR Code sera gerado.');
        }
    } catch (err) {
        console.log('Erro ao limpar cliente WhatsApp desconectado:', err.message);
    } finally {
        conectado = false;
        inicializando = false;
        limpandoCliente = false;
        statusWhatsApp = removerSessao ? 'reconectando' : 'desconectado';
        agendarReconexao();
    }
}

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

function ehConversaCliente(message) {
    const telefone = obterTelefoneMensagem(message);
    return Boolean(telefone && /@(c\.us|lid)$/.test(String(telefone)));
}

function obterTextoMensagem(message) {
    return message?.body ||
        message?._data?.body ||
        message?._data?.caption ||
        message?._data?.text ||
        '';
}

function obterTipoMensagem(message) {
    return message?.type ||
        message?._data?.type ||
        message?._data?.subtype ||
        'desconhecido';
}

function ehMidiaPropria(message) {
    if (message?.hasMedia) return true;

    const tipo = normalizar(obterTipoMensagem(message));
    return [
        'image',
        'video',
        'audio',
        'ptt',
        'document',
        'sticker'
    ].includes(tipo);
}

function ehRespostaAutomaticaWhatsapp(texto) {
    const normalizado = normalizar(texto || '');
    return normalizado.includes('agradece sua mensagem') &&
        normalizado.includes('nao estamos disponiveis no momento');
}

async function removerRespostaAutomaticaForaDoHorario(message) {
    if (estaNoHorarioIndisponivel()) return;

    try {
        if (typeof message?.delete === 'function') {
            await message.delete(true);
            console.log('Resposta automática de indisponibilidade removida fora do horário permitido:', obterTelefoneMensagem(message));
            return;
        }

        console.log('Resposta automática de indisponibilidade detectada fora do horário, mas não foi possível remover:', obterTelefoneMensagem(message));
    } catch (err) {
        console.log('Falha ao remover resposta automática de indisponibilidade fora do horário:', err.message);
    }
}

function processarMensagemEmFila(message, options = {}) {
    if (!message) return;

    if (!ehConversaCliente(message)) {
        console.log('Mensagem ignorada: conversa não individual:', obterTelefoneMensagem(message));
        return;
    }

    const textoMensagem = obterTextoMensagem(message);
    const texto = normalizar(textoMensagem);

    if (message.fromMe) {
        if (foiMensagemDoRobo(message)) {
            console.log('Mensagem do robô ignorada sem registrar conteúdo.');
            return;
        }

        if (!texto) {
            console.log(`Mensagem própria vazia ignorada: ${obterTelefoneMensagem(message)} tipo=${obterTipoMensagem(message)}`);
            return;
        }

        if (ehRespostaAutomaticaWhatsapp(textoMensagem)) {
            removerRespostaAutomaticaForaDoHorario(message);
            console.log('Resposta automática do WhatsApp ignorada sem pausar atendimento:', obterTelefoneMensagem(message));
            return;
        }

        if (ehMidiaPropria(message)) {
            console.log(`Mensagem própria de mídia ignorada sem pausar atendimento: ${obterTelefoneMensagem(message)} tipo=${obterTipoMensagem(message)}`);
            return;
        }

        const telefone = obterTelefoneMensagem(message);
        pausarParaAtendente(telefone, 'Atendimento manual', 'manual');
        registrarTesteLiberadoPorMensagem(message).catch((err) => {
            console.log('Erro ao registrar teste liberado:', err.message);
        });
        console.log('Mensagem própria ignorada sem registrar conteúdo.');
        return;
    }

    if (!texto) {
        console.log(`Mensagem individual vazia ignorada: ${obterTelefoneMensagem(message)} tipo=${obterTipoMensagem(message)}`);
        return;
    }

    if (jaProcessouMensagem(message)) return;

    const telefone = obterTelefoneMensagem(message);

    if (texto === 'sair' || texto === 'encerrar') {
        filasMensagens.delete(telefone);
        console.log('Encerramento solicitado para:', telefone);
    }

    const filaAtual = filasMensagens.get(telefone) || Promise.resolve();

    const proximaFila = filaAtual
        .catch(() => {})
        .then(async () => {
            if (!(await licencaPermiteUso())) {
                console.log('Mensagem ignorada: licença expirada ou bloqueada.');
                return;
            }

            if (texto === 'sair' || texto === 'encerrar') {
                return responderEncerramentoRapido(message);
            }

            if (estaNoHorarioIndisponivel()) {
                console.log(`Mensagem recebida fora do horário de atendimento: ${telefone} hora=${obterHoraSaoPaulo()}`);
                if (!registrarPrimeiroAvisoForaHorario(telefone)) {
                    console.log(`Aviso fora do horario ja enviado nesta noite para: ${telefone}`);
                    return;
                }
                return responderIndisponibilidade(message);
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
    if (limpandoCliente) {
        console.log('Inicializacao pausada: cliente anterior ainda esta sendo limpo');
        return;
    }

    if (inicializando) {
        console.log('Inicializacao do WhatsApp ja esta em andamento');
        return;
    }

    if (conectado && client) {
        console.log('WhatsApp ja esta conectado');
        return;
    }

    if (client && ['iniciando', 'autenticado', 'aguardando_qr', 'conectando'].includes(statusWhatsApp)) {
        console.log(`Cliente WhatsApp ja existe com status ${statusWhatsApp}`);
        return;
    }

    inicializando = true;
    statusWhatsApp = 'iniciando';

    try {
        const executablePath = await obterExecutablePath();

        console.log('Chrome encontrado:', executablePath);

        client = new Client({
            authStrategy: new LocalAuthControlado({
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
            const clienteAtual = client;
            conectado = false;
            inicializando = false;
            statusWhatsApp = reason === 'LOGOUT' ? 'limpando_logout' : 'desconectado';
            console.log('Desconectado:', reason);
            limparClienteDesconectado(clienteAtual, reason === 'LOGOUT').catch((err) => {
                console.log('Falha na limpeza apos desconexao:', err.message);
            });
        });

        client.on('message', async (message) => {
            console.log('Mensagem recebida de:', message.from);
            processarMensagemEmFila(message);
        });

        client.on('message_create', async (message) => {
            console.log(`Mensagem recebida via reserva${message.fromMe ? ' (fromMe)' : ''}.`);
            processarMensagemEmFila(message);
        });

        await client.initialize();

        console.log('Initialize executado');
    } catch (err) {
        inicializando = false;
        statusWhatsApp = 'erro';
        console.log('Erro geral:', err);

        const mensagem = err && err.message ? err.message : String(err);

        if (mensagem.includes('The browser is already running')) {
            statusWhatsApp = 'chrome_em_uso';
            console.log('Sessao do WhatsApp ja esta em uso por outro Chrome/processo. Pare o processo antigo antes de tentar novamente.');
        }

        if (client) {
            try {
                await client.destroy();
            } catch (destroyErr) {
                console.log('Nao foi possivel destruir cliente apos erro:', destroyErr.message);
            } finally {
                client = null;
            }
        }

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
        protocolTimeoutMs: PROTOCOL_TIMEOUT_MS,
        numeroConectado: client?.info?.wid?.user || ''
    };
}

module.exports = {
    iniciarWhatsApp,
    encerrarWhatsApp,
    getQrCode,
    getClient,
    getStatusWhatsApp
};
