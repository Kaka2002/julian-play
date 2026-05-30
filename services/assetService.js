const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

const assetsDir = path.join(__dirname, '..', 'assets');
const ENVIO_TIMEOUT_MS = Number(process.env.ENVIO_TIMEOUT_MS || 15000);

function comTimeout(promessa, ms, descricao) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${descricao} excedeu ${ms}ms`)), ms);
        })
    ]);
}

function caminhoAsset(nomeArquivo) {
    if (!nomeArquivo) return null;

    return path.join(assetsDir, nomeArquivo);
}

function assetExiste(nomeArquivo) {
    const arquivo = caminhoAsset(nomeArquivo);

    return Boolean(arquivo && fs.existsSync(arquivo));
}

async function enviarImagemComLegenda(message, nomeArquivo, legenda) {
    if (!assetExiste(nomeArquivo)) return false;

    const arquivo = caminhoAsset(nomeArquivo);
    const media = MessageMedia.fromFilePath(arquivo);

    await comTimeout(
        message.client.sendMessage(message.from, media, { caption: legenda }),
        ENVIO_TIMEOUT_MS,
        'Envio de imagem'
    );

    console.log(`Imagem enviada: ${nomeArquivo}`);
    return true;
}

module.exports = {
    enviarImagemComLegenda
};
