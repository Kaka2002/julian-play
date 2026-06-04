const mensagensDoRobo = new Set();
const enviosDoRobo = new Map();
const LIMITE_IDS = 500;
const TEMPO_RETENCAO_MS = 10 * 60 * 1000;
const TEMPO_ENVIO_MS = 60 * 1000;

function obterId(message) {
    return message?.id?._serialized || '';
}

function chaveEnvio(destino, texto) {
    return `${destino || ''}|${String(texto || '').trim()}`;
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

    const chave = chaveEnvio(destino, texto);
    enviosDoRobo.set(chave, Date.now() + TEMPO_ENVIO_MS);

    if (enviosDoRobo.size > LIMITE_IDS) {
        const [primeiraChave] = enviosDoRobo;
        enviosDoRobo.delete(primeiraChave);
    }

    const timer = setTimeout(() => enviosDoRobo.delete(chave), TEMPO_ENVIO_MS);
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

module.exports = {
    registrarMensagemDoRobo,
    registrarEnvioDoRobo,
    foiMensagemDoRobo
};
