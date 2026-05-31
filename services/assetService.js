const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

const assetsDir = path.join(__dirname, '..', 'assets');
const ENVIO_TIMEOUT_MS = Number(process.env.ENVIO_TIMEOUT_MS || 30000);
const MAX_ASSET_BYTES = Number(process.env.MAX_ASSET_BYTES || 900000);

function comTimeout(promessa, ms, descricao) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => {
            setTimeout(() => {
                const err = new Error(`${descricao} excedeu ${ms}ms`);
                err.isTimeout = true;
                reject(err);
            }, ms);
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

    try {
        const arquivo = caminhoAsset(nomeArquivo);
        const tamanho = fs.statSync(arquivo).size;

        if (tamanho > MAX_ASSET_BYTES) {
            console.log(`Imagem ${nomeArquivo} ignorada: ${tamanho} bytes acima do limite ${MAX_ASSET_BYTES}`);
            return false;
        }

        const media = MessageMedia.fromFilePath(arquivo);

        await comTimeout(
            message.client.sendMessage(message.from, media, { caption: legenda }),
            ENVIO_TIMEOUT_MS,
            'Envio de imagem'
        );

        console.log(`Imagem enviada: ${nomeArquivo}`);
        return true;
    } catch (err) {
        console.log(`Falha ao enviar imagem ${nomeArquivo}: ${err.message}`);

        if (err.isTimeout) {
            console.log('Envio da imagem pode terminar em segundo plano. Texto reserva nao sera enviado para evitar duplicidade.');
            return true;
        }

        return false;
    }
}

module.exports = {
    enviarImagemComLegenda
};
