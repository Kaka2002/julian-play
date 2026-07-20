const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');
const { enfileirarEnvio } = require('./filaMensagensService');

const JANELA_DUPLICADO_MS = 45000;
const enviosRecentes = new Map();

function chaveEnvio(to, texto) {
    return `${to}|${texto}`;
}

function obterEnvioRecente(chave) {
    const envio = enviosRecentes.get(chave);

    if (!envio) {
        return null;
    }

    if (Date.now() - envio.enviadoEm >= JANELA_DUPLICADO_MS) {
        enviosRecentes.delete(chave);
        return null;
    }

    return envio;
}

function reservarEnvio(chave) {
    enviosRecentes.set(chave, {
        enviadoEm: Date.now(),
        emAndamento: true
    });
}

function erroEsperadoWhatsApp(err) {
    const mensagem = err && err.message ? err.message : String(err || '');

    return (
        mensagem.includes('No LID for user') ||
        mensagem.includes('Evaluation failed') ||
        mensagem.includes('invalid wid') ||
        mensagem.includes('not found')
    );
}

async function enviarMensagem(client, to, texto) {
    const chave = chaveEnvio(to, texto);
    const envioRecente = obterEnvioRecente(chave);

    if (envioRecente) {
        console.log(`Envio automatico duplicado ignorado para ${to}.`);
        return true;
    }

    reservarEnvio(chave);

    try {
        await delay(1000);
        registrarEnvioDoRobo(to, texto);
        const enviada = await enfileirarEnvio(
            () => client.sendMessage(to, texto),
            'Envio de mensagem automatica'
        );
        registrarMensagemDoRobo(enviada);
        enviosRecentes.set(chave, {
            enviadoEm: Date.now(),
            emAndamento: false
        });
        return true;
    } catch (err) {
        enviosRecentes.delete(chave);

        if (erroEsperadoWhatsApp(err)) {
            console.log(`Mensagem automática ignorada para ${to}: ${err.message}`);
        } else {
            console.log(`Falha ao enviar mensagem automática para ${to}: ${err.message}`);
        }

        return false;
    }
}

module.exports = { enviarMensagem };
