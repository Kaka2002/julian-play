const mensagensDoRobo = new Set();
const enviosDoRobo = new Map();
const textosDoRobo = new Map();
const LIMITE_IDS = 500;
const TEMPO_RETENCAO_MS = 10 * 60 * 1000;
const TEMPO_ENVIO_MS = 60 * 1000;
let ultimoEnvioDoRoboEm = null;
let ultimoEnvioDoRoboPara = '';

function registrarHistoricoEnvio(destino, texto) {
    try {
        const { registrarInteracaoRoboSilenciosa } = require('./interacoesRoboService');
        registrarInteracaoRoboSilenciosa({
            telefone: destino,
            destino,
            tipo: 'whatsapp',
            titulo: 'Mensagem enviada pelo robô',
            resumo: texto,
            status: 'enviada'
        });
    } catch (err) {
        console.log('Não foi possível preparar histórico do robô:', err.message);
    }
}

function obterId(message) {
    return message?.id?._serialized || '';
}

function chaveEnvio(destino, texto) {
    return `${destino || ''}|${String(texto || '').trim()}`;
}

function normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[*_~`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function registrarMensagemDoRobo(message) {
    const id = obterId(message);
    if (!id) return;

    mensagensDoRobo.add(id);

    if (mensagensDoRobo.size > LIMITE_IDS) {
        const [primeiro] = mensagensDoRobo;
        mensagensDoRobo.delete(primeiro);
    }

    const timer = setTimeout(() => mensagensDoRobo.delete(id), TEMPO_RETENCAO_MS);
    if (typeof timer.unref === 'function') timer.unref();
}

function registrarEnvioDoRobo(destino, texto) {
    if (!destino || !texto) return;

    ultimoEnvioDoRoboEm = new Date().toISOString();
    ultimoEnvioDoRoboPara = destino;
    registrarHistoricoEnvio(destino, texto);

    const chave = chaveEnvio(destino, texto);
    const textoNormalizado = normalizarTexto(texto);
    enviosDoRobo.set(chave, Date.now() + TEMPO_ENVIO_MS);
    if (textoNormalizado) textosDoRobo.set(textoNormalizado, Date.now() + TEMPO_ENVIO_MS);

    if (enviosDoRobo.size > LIMITE_IDS) {
        const [primeiraChave] = enviosDoRobo;
        enviosDoRobo.delete(primeiraChave);
    }

    if (textosDoRobo.size > LIMITE_IDS) {
        const [primeiraChave] = textosDoRobo;
        textosDoRobo.delete(primeiraChave);
    }

    const timer = setTimeout(() => {
        enviosDoRobo.delete(chave);
        if (textoNormalizado) textosDoRobo.delete(textoNormalizado);
    }, TEMPO_ENVIO_MS);
    if (typeof timer.unref === 'function') timer.unref();
}

function foiMensagemDoRobo(message) {
    const id = obterId(message);
    if (id && mensagensDoRobo.has(id)) return true;

    const destino = message?.fromMe && message?.to ? message.to : message.from;
    const chave = chaveEnvio(destino, message?.body);
    const expiraEm = enviosDoRobo.get(chave);

    if (!expiraEm) return false;
    if (Date.now() > expiraEm) {
        enviosDoRobo.delete(chave);
        return false;
    }

    enviosDoRobo.delete(chave);
    return true;
}

function foiTextoEnviadoPeloRobo(texto) {
    const textoNormalizado = normalizarTexto(texto);
    const expiraEm = textosDoRobo.get(textoNormalizado);

    if (!expiraEm) return false;
    if (Date.now() > expiraEm) {
        textosDoRobo.delete(textoNormalizado);
        return false;
    }

    textosDoRobo.delete(textoNormalizado);
    return true;
}

function obterResumoEnviosDoRobo() {
    return {
        ultimoEnvioEm: ultimoEnvioDoRoboEm,
        ultimoEnvioPara: ultimoEnvioDoRoboPara
    };
}

module.exports = {
    registrarMensagemDoRobo,
    registrarEnvioDoRobo,
    obterResumoEnviosDoRobo,
    foiMensagemDoRobo,
    foiTextoEnviadoPeloRobo
};
