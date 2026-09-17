const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');
const { enfileirarEnvio } = require('./filaMensagensService');

const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));
const tenantAssetsDir = path.join(DATA_DIR, 'assets');
const assetsDir = path.join(__dirname, '..', 'assets');
const ENVIO_TIMEOUT_MS = Number(process.env.ENVIO_IMAGEM_TIMEOUT_MS || 30000);
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

    const arquivoSeguro = path.basename(String(nomeArquivo).split('?')[0]);
    const tenantAsset = path.join(tenantAssetsDir, arquivoSeguro);

    if (fs.existsSync(tenantAsset)) return tenantAsset;

    return path.join(assetsDir, arquivoSeguro);
}

function assetExiste(nomeArquivo) {
    const arquivo = caminhoAsset(nomeArquivo);

    return Boolean(arquivo && fs.existsSync(arquivo));
}

function confirmarEnvioMedia(enviada) {
    const id = enviada?.id?._serialized || enviada?.id?.id || enviada?.id;
    if (!id || typeof id !== 'string' || !id.trim()) {
        throw new Error('WhatsApp nao confirmou o envio da imagem (mensagem sem ID).');
    }
    return enviada;
}

async function enviarMediaUmaTentativa(message, media, opcoes, descricao) {
    const destino = message?.fromMe && message?.to ? message.to : message?.from;
    const opcoesEnvio = { ...opcoes, sendSeen: false };

    try {
        const chat = await comTimeout(message.getChat(), 5000, 'Busca do chat para imagem');
        const enviada = await comTimeout(
            enfileirarEnvio(
                () => chat.sendMessage(media, opcoesEnvio),
                descricao
            ),
            ENVIO_TIMEOUT_MS,
            'Envio de imagem'
        );
        return confirmarEnvioMedia(enviada);
    } catch (erroChat) {
        if (erroChat.isTimeout) throw erroChat;

        if (!message?.client || !destino) throw erroChat;

        console.log(`Falha ao enviar imagem pelo chat. Tentando envio direto para ${destino}: ${erroChat.message}`);
        const enviada = await comTimeout(
            enfileirarEnvio(
                () => message.client.sendMessage(destino, media, opcoesEnvio),
                `${descricao} direto`
            ),
            ENVIO_TIMEOUT_MS,
            'Envio direto de imagem'
        );
        return confirmarEnvioMedia(enviada);
    }
}

async function enviarMedia(message, media, opcoes = {}, descricao = 'Envio de imagem') {
    try {
        return await enviarMediaUmaTentativa(message, media, opcoes, descricao);
    } catch (erroImagem) {
        if (erroImagem.isTimeout || opcoes.sendMediaAsDocument) throw erroImagem;

        // O WhatsApp Web pode quebrar o pipeline de imagens quando a conversa
        // usa LID. Repetir como documento preserva o arquivo PNG e evita o
        // conversor que depende de módulos internos instáveis.
        console.log(`Falha no envio da imagem; tentando como documento: ${erroImagem.message}`);
        return enviarMediaUmaTentativa(
            message,
            media,
            { ...opcoes, sendMediaAsDocument: true },
            `${descricao} como documento`
        );
    }
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
        registrarEnvioDoRobo(destino, legenda);

        const enviada = await enviarMedia(message, media, { caption: legenda }, `Envio de imagem ${nomeArquivo}`);

        console.log(`Imagem enviada: ${nomeArquivo}`, enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
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

async function enviarImagem(message, nomeArquivo) {
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

        const enviada = await enviarMedia(message, media, {}, `Envio de imagem ${nomeArquivo}`);

        console.log(`Imagem enviada: ${nomeArquivo}`, enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
        return true;
    } catch (err) {
        console.log(`Falha ao enviar imagem ${nomeArquivo}: ${err.message}`);

        if (err.isTimeout) {
            console.log('Envio da imagem pode terminar em segundo plano.');
        }

        return false;
    }
}

module.exports = {
    enviarImagemComLegenda,
    enviarImagem
};
