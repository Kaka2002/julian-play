const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

const assetsDir = path.join(__dirname, '..', 'assets');
const ENVIO_TIMEOUT_MS = Number(process.env.ENVIO_IMAGEM_TIMEOUT_MS || 10000);
const MAX_ASSET_BYTES = Number(process.env.MAX_ASSET_BYTES || 3000000);
const ENVIAR_IMAGENS = process.env.ENVIAR_IMAGENS !== 'false';

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
    if (!ENVIAR_IMAGENS) return false;
    if (!assetExiste(nomeArquivo)) return false;

    try {
        const arquivo = caminhoAsset(nomeArquivo);
        const tamanho = fs.statSync(arquivo).size;

        if (tamanho > MAX_ASSET_BYTES) {
            console.log(`Imagem ${nomeArquivo} ignorada: ${tamanho} bytes acima do limite ${MAX_ASSET_BYTES}`);
            return false;
        }

        const media = MessageMedia.fromFilePath(arquivo);
        const destino = message?.fromMe && message?.to ? message.to : message.from;
        console.log(`Enviando imagem ${nomeArquivo} para:`, destino);

        const enviada = await comTimeout(
            message.client.sendMessage(destino, media, { caption: legenda }),
            ENVIO_TIMEOUT_MS,
            'Envio de imagem'
        );

        console.log(`Imagem enviada: ${nomeArquivo}`, enviada?.id?._serialized || 'sem id');
        return true;
    } catch (err) {
        console.log(`Falha ao enviar imagem ${nomeArquivo}: ${err.message}`);

        if (err.isTimeout) {
            console.log('Envio da imagem pode terminar em segundo plano. Enviando texto reserva para garantir resposta.');
            return false;
        }

        return false;
    }
}

module.exports = {
    enviarImagemComLegenda
};
