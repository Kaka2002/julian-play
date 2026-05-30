const { delay } = require('../utils/helpers');

async function enviarMensagem(client, to, texto) {

    try {

        await delay(1000);

        await client.sendMessage(to, texto);

        return true;

    } catch (err) {

        console.error(err);

        return false;
    }
}

module.exports = enviarMensagem;