const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');
const { enfileirarEnvio } = require('./filaMensagensService');

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
    try {
        await delay(1000);
        registrarEnvioDoRobo(to, texto);
        const enviada = await enfileirarEnvio(
            () => client.sendMessage(to, texto),
            'Envio de mensagem automatica'
        );
        registrarMensagemDoRobo(enviada);
        return true;
    } catch (err) {
        if (erroEsperadoWhatsApp(err)) {
            console.log(`Mensagem automática ignorada para ${to}: ${err.message}`);
        } else {
            console.log(`Falha ao enviar mensagem automática para ${to}: ${err.message}`);
        }

        return false;
    }
}

module.exports = { enviarMensagem };
