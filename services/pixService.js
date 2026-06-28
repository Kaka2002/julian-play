const QRCode = require('qrcode');
const { MessageMedia } = require('whatsapp-web.js');
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');
const { obterConfiguracoes } = require('./configuracoesPainel');
const { listarTiposPlanos } = require('./tiposPlanos');

const CHAVE_PIX = process.env.CHAVE_PIX || '61319147704';
const PIX_NOME = process.env.PIX_NOME || 'JULIAN PLAY';
const PIX_CIDADE = process.env.PIX_CIDADE || 'SAO PAULO';
const PIX_TXID = process.env.PIX_TXID || 'JULIANPLAY';
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
        arquivoQr: 'pix_mensal.png'
    },
    '2': {
        nome: 'TRIMESTRAL',
        valor: '96,00',
        arquivoQr: 'pix_trimestral.png'
    },
    '3': {
        nome: 'SEMESTRAL',
        valor: '180,00',
        arquivoQr: 'pix_semestral.png'
    },
    '4': {
        nome: 'ANUAL',
        valor: '336,00',
        arquivoQr: 'pix_anual.png'
    }
};

function configuracaoPixPadrao() {
    return {
        chave: CHAVE_PIX,
        nome: PIX_NOME,
        cidade: PIX_CIDADE,
        txid: PIX_TXID
    };
}

function valorPlanoParaNumero(valor) {
    const numero = Number(String(valor || '0').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numero) ? numero : 0;
}

function planoEhTesteGratis(plano = {}) {
    const nome = normalizarNomePlano(plano.nome);
    return nome.includes('teste') || valorPlanoParaNumero(plano.valor) <= 0;
}

async function listarPlanosComerciais() {
    try {
        const planosBanco = await listarTiposPlanos();
        return planosBanco
            .filter(plano => Number(plano.ativo ?? 1) !== 0)
            .filter(plano => !planoEhTesteGratis(plano))
            .map((plano, index) => ({
                id: plano.id,
                opcao: String(index + 1),
                nome: plano.nome,
                valor: plano.valor || '0,00',
                dias: Number(plano.dias || 0),
                arquivoQr: `pix_${normalizarNomePlano(plano.nome).replace(/[^a-z0-9]+/g, '_') || index + 1}.png`
            }));
    } catch (err) {
        console.log(`PIX: usando planos padrao porque nao foi possivel ler os planos cadastrados: ${err.message}`);
        return Object.entries(planos).map(([opcao, plano]) => ({
            ...plano,
            opcao
        }));
    }
}

async function obterConfiguracaoPix() {
    try {
        const config = await obterConfiguracoes();
        return {
            chave: config.pixChave || CHAVE_PIX,
            nome: config.pixNome || PIX_NOME,
            cidade: config.pixCidade || PIX_CIDADE,
            txid: config.pixTxid || PIX_TXID
        };
    } catch (err) {
        console.log(`PIX: usando configuracao padrao porque nao foi possivel ler o painel: ${err.message}`);
        return configuracaoPixPadrao();
    }
}

async function buscarPlano(opcao) {
    const planosComerciais = await listarPlanosComerciais();
    return planosComerciais.find(plano => plano.opcao === String(opcao)) || null;
}

function normalizarNomePlano(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function buscarPlanoPorNome(nomePlano) {
    const plano = normalizarNomePlano(nomePlano);

    if (plano.includes('mensal')) return planos['1'];
    if (plano.includes('trimestral')) return planos['2'];
    if (plano.includes('semestral')) return planos['3'];
    if (plano.includes('anual')) return planos['4'];

    return null;
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

function gerarPixCopiaECola(plano, configPix = configuracaoPixPadrao()) {
    const identificacao = normalizarCampo(`${configPix.nome || PIX_NOME} ${plano.nome}`, 50);
    const merchantAccount = campo('00', 'br.gov.bcb.pix') +
        campo('01', configPix.chave) +
        campo('02', identificacao);

    const payloadSemCRC =
        campo('00', '01') +
        campo('26', merchantAccount) +
        campo('52', '0000') +
        campo('53', '986') +
        campo('54', plano.valor.replace(',', '.')) +
        campo('58', 'BR') +
        campo('59', normalizarCampo(configPix.nome, 25)) +
        campo('60', normalizarCampo(configPix.cidade, 15)) +
        campo('62', campo('05', normalizarCampo(configPix.txid, 25))) +
        '6304';

    return payloadSemCRC + crc16(payloadSemCRC);
}

function legendaPix(plano, configPix = configuracaoPixPadrao()) {
    return `💳 *PIX - PLANO ${plano.nome}*
━━━━━━━━━━━━━━━━━━━━
Confira os dados antes de pagar:

💰 *Valor:* R$ ${plano.valor}
🔑 *Chave PIX:* ${configPix.chave}

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

function legendaPixRenovacao(plano, nomeCliente, configPix = configuracaoPixPadrao()) {
    return `💳 *PIX - RENOVAÇÃO ${plano.nome}*
━━━━━━━━━━━━━━━━━━━━
Confira os dados antes de pagar:

👤 *Cliente:* ${nomeCliente}
💰 *Valor:* R$ ${plano.valor}
🔑 *Chave PIX:* ${configPix.chave}

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

function legendaPixPorContexto(plano, options = {}, configPix = configuracaoPixPadrao()) {
    if (options.tipo === 'renovacao') {
        return legendaPixRenovacao(plano, options.nomeCliente || 'não informado', configPix);
    }

    return legendaPix(plano, configPix);
}

async function gerarQRCodeAutomatico(plano, configPix = configuracaoPixPadrao()) {
    const pixCopiaECola = gerarPixCopiaECola(plano, configPix);
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

    return enviarQRCodePIXParaDestino(message.client, destino, plano, options);
}

async function enviarQRCodePIXParaDestino(client, destino, plano, options = {}) {
    try {
        const configPix = await obterConfiguracaoPix();
        const media = await gerarQRCodeAutomatico(plano, configPix);
        const caption = legendaPixPorContexto(plano, options, configPix);
        console.log(`Enviando QR Code PIX ${plano.nome} para:`, destino);
        registrarEnvioDoRobo(destino, caption);

        const enviada = await comTimeout(
            client.sendMessage(destino, media, {
                caption
            }),
            ENVIO_TIMEOUT_MS,
            'Envio do QR Code PIX'
        );

        console.log(`QR Code PIX ${plano.nome} enviado com sucesso`, enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
        return true;
    } catch (error) {
        console.error(`Erro ao gerar QR Code PIX: ${error.message}`);

        try {
            await comTimeout(
                client.sendMessage(destino, `⚠️ *ERRO AO GERAR QR CODE*
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
    buscarPlanoPorNome,
    listarPlanosComerciais,
    enviarQRCodePIX,
    enviarQRCodePIXParaDestino,
    gerarPixCopiaECola,
    planos
};
