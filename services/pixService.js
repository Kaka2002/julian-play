const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { MessageMedia } = require('whatsapp-web.js');

const CHAVE_PIX = process.env.CHAVE_PIX || '61319147704';
const PIX_NOME = process.env.PIX_NOME || 'JULIAN PLAY';
const PIX_CIDADE = process.env.PIX_CIDADE || 'SAO PAULO';
const PIX_TXID = process.env.PIX_TXID || 'JULIANPLAY';
const assetsDir = path.join(__dirname, '..', 'assets');
const RODAPE_ATENDIMENTO = 'Digite *sair* para encerrar o atendimento.';
const ENVIO_TIMEOUT_MS = Number(process.env.ENVIO_TIMEOUT_MS || 90000);

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

const planos = {
    '1': {
        nome: 'MENSAL',
        valor: '35,00',
        arquivoQr: 'pix_mensal.png',
        pixCode: CHAVE_PIX
    },
    '2': {
        nome: 'TRIMESTRAL',
        valor: '96,00',
        arquivoQr: 'pix_trimestral.png',
        pixCode: CHAVE_PIX
    },
    '3': {
        nome: 'SEMESTRAL',
        valor: '180,00',
        arquivoQr: 'pix_semestral.png',
        pixCode: CHAVE_PIX
    },
    '4': {
        nome: 'ANUAL',
        valor: '336,00',
        arquivoQr: 'pix_anual.png',
        pixCode: CHAVE_PIX
    }
};

function buscarPlano(opcao) {
    return planos[opcao] || null;
}

function normalizarCampo(valor, tamanhoMaximo) {
    return valor
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 $%*+\-./:]/g, '')
        .toUpperCase()
        .slice(0, tamanhoMaximo);
}

function campo(id, valor) {
    const texto = valor.toString();
    return `${id}${texto.length.toString().padStart(2, '0')}${texto}`;
}

function crc16(payload) {
    let crc = 0xFFFF;

    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;

        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
            crc &= 0xFFFF;
        }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarPixCopiaECola(plano) {
    const merchantAccount = campo('00', 'br.gov.bcb.pix') +
        campo('01', CHAVE_PIX) +
        campo('02', `JULIAN PLAY ${plano.nome}`);

    const payloadSemCRC =
        campo('00', '01') +
        campo('26', merchantAccount) +
        campo('52', '0000') +
        campo('53', '986') +
        campo('54', plano.valor.replace(',', '.')) +
        campo('58', 'BR') +
        campo('59', normalizarCampo(PIX_NOME, 25)) +
        campo('60', normalizarCampo(PIX_CIDADE, 15)) +
        campo('62', campo('05', normalizarCampo(PIX_TXID, 25))) +
        '6304';

    return payloadSemCRC + crc16(payloadSemCRC);
}

function legendaPix(plano) {
    return `💳 *PIX - PLANO ${plano.nome}*
━━━━━━━━━━━━━━━━━━━━
Confira os dados antes de pagar:

💰 *Valor:* R$ ${plano.valor}
🔑 *Chave PIX:* ${CHAVE_PIX}

📲 *Como pagar:*
1 - Abra o app do seu banco
2 - Escolha *PIX*
3 - Toque em *Ler QR Code*
4 - Escaneie a imagem acima
5 - Confirme o pagamento

✅ Depois do pagamento, envie o comprovante aqui para ativação.

*0* - Voltar ao menu principal
${RODAPE_ATENDIMENTO}`;
}

function legendaPixRenovacao(plano, nomeCliente) {
    return `💳 *PIX - RENOVAÇÃO ${plano.nome}*
━━━━━━━━━━━━━━━━━━━━
Confira os dados antes de pagar:

👤 *Cliente:* ${nomeCliente}
💰 *Valor:* R$ ${plano.valor}
🔑 *Chave PIX:* ${CHAVE_PIX}

📲 *Como pagar:*
1 - Abra o app do seu banco
2 - Escolha *PIX*
3 - Toque em *Ler QR Code*
4 - Escaneie a imagem acima
5 - Confirme o pagamento

✅ Depois do pagamento, envie o comprovante aqui para renovarmos sua assinatura.

*0* - Voltar ao menu principal
${RODAPE_ATENDIMENTO}`;
}

function legendaPixPorContexto(plano, options = {}) {
    if (options.tipo === 'renovacao') {
        return legendaPixRenovacao(plano, options.nomeCliente || 'não informado');
    }

    return legendaPix(plano);
}

function buscarQRCodeDoPlano(plano) {
    const caminho = path.join(assetsDir, plano.arquivoQr);

    if (!fs.existsSync(caminho)) return null;

    return MessageMedia.fromFilePath(caminho);
}

async function gerarQRCodeAutomatico(plano) {
    const pixCopiaECola = gerarPixCopiaECola(plano);
    const qrCodeBuffer = await QRCode.toBuffer(pixCopiaECola, {
        width: 400,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });

    const base64Image = qrCodeBuffer.toString('base64');
    return new MessageMedia('image/png', base64Image, plano.arquivoQr);
}

async function enviarQRCodePIX(message, plano, options = {}) {
    const destino = message?.fromMe && message?.to ? message.to : message.from;

    try {
        const media = buscarQRCodeDoPlano(plano) || await gerarQRCodeAutomatico(plano);
        console.log(`Enviando QR Code PIX ${plano.nome} para:`, destino);

        const enviada = await comTimeout(
            message.client.sendMessage(destino, media, {
                caption: legendaPixPorContexto(plano, options)
            }),
            ENVIO_TIMEOUT_MS,
            'Envio do QR Code PIX'
        );

        console.log(`QR Code PIX ${plano.nome} enviado com sucesso`, enviada?.id?._serialized || 'sem id');
        return true;
    } catch (error) {
        console.error(`Erro ao gerar QR Code PIX: ${error.message}`);

        try {
            await comTimeout(
                message.client.sendMessage(destino, `⚠️ *ERRO AO GERAR QR CODE*
━━━━━━━━━━━━━━━━━━━━
Não foi possível gerar o QR Code neste momento.

Tente novamente ou escolha outro plano.

*0* - Voltar ao menu principal
${RODAPE_ATENDIMENTO}`),
                ENVIO_TIMEOUT_MS,
                'Envio de erro do PIX'
            );
        } catch (fallbackError) {
            console.error(`Erro ao enviar mensagem de falha do PIX: ${fallbackError.message}`);
        }

        return false;
    }
}

module.exports = {
    buscarPlano,
    enviarQRCodePIX,
    gerarPixCopiaECola,
    planos
};
