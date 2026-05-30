const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

const assetsDir = path.join(__dirname, '..', 'assets');

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
    const chat = await message.getChat();

    await chat.sendMessage(media, { caption: legenda });
    return true;
}

module.exports = {
    enviarImagemComLegenda
};
