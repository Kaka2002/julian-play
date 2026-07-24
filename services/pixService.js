const QRCode = require('qrcode');
const { MessageMedia } = require('whatsapp-web.js');
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');
const { enfileirarEnvio } = require('./filaMensagensService');
const { obterConfiguracoes } = require('./configuracoesPainel');
const { listarTiposPlanos } = require('./tiposPlanos');
const { criarCobrancaMercadoPago } = require('./mercadoPagoService');

const CHAVE_PIX = process.env.CHAVE_PIX || '';
const PIX_NOME = process.env.PIX_NOME || '';
const PIX_CIDADE = process.env.PIX_CIDADE || '';
const PIX_TXID = process.env.PIX_TXID || '';
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
        valor: '',
        arquivoQr: 'pix_mensal.png'
    },
    '2': {
        nome: 'TRIMESTRAL',
        valor: '',
        arquivoQr: 'pix_trimestral.png'
    },
    '3': {
        nome: 'SEMESTRAL',
        valor: '',
        arquivoQr: 'pix_semestral.png'
    },
    '4': {
        nome: 'ANUAL',
        valor: '',
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

function validarConfiguracaoPix(configPix = {}) {
    if (!configPix.chave || !configPix.nome || !configPix.cidade) {
        throw new Error('Configure os dados PIX de recebimento na tela Manutenção antes de enviar cobranças.');
    }
}

function valorPlanoParaNumero(valor) {
    const numero = Number(String(valor || '0').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numero) ? numero : 0;
}

function formatarValorPlano(valor) {
    const numero = valorPlanoParaNumero(valor);
    if (numero <= 0) return '';

    return numero.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function obterValorPlanoPix(plano = {}) {
    const candidatos = [
        plano.valor,
        plano.valorNumero,
        plano.valorTotal,
        plano.total,
        plano.totalNumero,
        plano.valorPlano,
        plano.valorPlanoNumero,
        plano.valorCobranca,
        plano.valorCobrado,
        plano.valorCalculado,
        plano.pagamentoValor,
        plano.pagamentoValorPlano
    ];

    for (const candidato of candidatos) {
        const numero = valorPlanoParaNumero(candidato);
        if (numero > 0) return numero;
    }

    return 0;
}

function normalizarPlanoPix(plano = {}) {
    const valorNumero = obterValorPlanoPix(plano);

    return {
        ...plano,
        valor: valorNumero > 0 ? formatarValorPlano(valorNumero) : (plano.valor || ''),
        valorNumero
    };
}

function planoEhTesteGratis(plano = {}) {
    const nome = normalizarNomePlano(plano.nome);
    return nome.includes('teste');
}

function montarPlanosPadraoComerciais() {
    return Object.entries(planos).map(([opcao, plano]) => {
        const valorNumero = valorPlanoParaNumero(plano.valor);
        const valorFormatado = formatarValorPlano(plano.valor);

        return {
            ...plano,
            opcao,
            valor: valorFormatado || 'valor a consultar',
            valorNumero,
            valorConfigurado: valorNumero > 0
        };
    });
}

async function listarPlanosComerciais() {
    try {
        const planosBanco = await listarTiposPlanos();
        const planosComerciais = planosBanco
            .filter(plano => Number(plano.ativo ?? 1) !== 0)
            .filter(plano => !planoEhTesteGratis(plano))
            .map((plano, index) => {
                const valorNumero = valorPlanoParaNumero(plano.valor);
                const valorFormatado = formatarValorPlano(plano.valor);

                return {
                    id: plano.id,
                    opcao: String(index + 1),
                    nome: plano.nome,
                    valor: valorFormatado || 'valor a consultar',
                    valorNumero,
                    valorConfigurado: valorNumero > 0,
                    dias: Number(plano.dias || 0),
                    arquivoQr: `pix_${normalizarNomePlano(plano.nome).replace(/[^a-z0-9]+/g, '_') || index + 1}.png`
                };
            });

        return planosComerciais.length ? planosComerciais : montarPlanosPadraoComerciais();
    } catch (err) {
        console.log(`PIX: usando planos padrao porque nao foi possivel ler os planos cadastrados: ${err.message}`);
        return montarPlanosPadraoComerciais();
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

async function prepararPlanoPixCliente(cliente = {}) {
    const planosComerciais = await listarPlanosComerciais();
    const nomeNormalizado = normalizarNomePlano(cliente.plano);
    const planoBase = planosComerciais.find(plano => (
        cliente.tipoPlanoId && Number(plano.id) === Number(cliente.tipoPlanoId)
    )) || planosComerciais.find(plano => normalizarNomePlano(plano.nome) === nomeNormalizado)
        || buscarPlanoPorNome(cliente.plano)
        || { nome: cliente.plano || 'Plano', valor: cliente.valorPlano || '' };
    const valorCliente = valorPlanoParaNumero(cliente.valorPlano);
    const valorBase = obterValorPlanoPix(planoBase);
    const valorNumero = valorCliente > 0 ? valorCliente : valorBase;
    const valor = formatarValorPlano(valorNumero);

    return normalizarPlanoPix({
        ...planoBase,
        nome: cliente.plano || planoBase.nome || 'Plano',
        valor,
        valorNumero,
        valorTotal: valor,
        valorPlano: valor
    });
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
    validarConfiguracaoPix(configPix);
    const planoPix = normalizarPlanoPix(plano);
    const identificacao = normalizarCampo(`${configPix.nome || PIX_NOME} ${planoPix.nome}`, 50);
    const merchantAccount = campo('00', 'br.gov.bcb.pix') +
        campo('01', configPix.chave) +
        campo('02', identificacao);

    const payloadSemCRC =
        campo('00', '01') +
        campo('26', merchantAccount) +
        campo('52', '0000') +
        campo('53', '986') +
        campo('54', planoPix.valor.replace(',', '.')) +
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

🔄 Se quiser trocar para outro plano, digite *planos* para ver as opções.

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

🔄 Se quiser trocar para outro plano, digite *planos* para ver as opções.

*0* - Voltar ao menu principal
${RODAPE_ATENDIMENTO}`;
}

function legendaPixPorContexto(plano, options = {}, configPix = configuracaoPixPadrao()) {
    if (options.tipo === 'renovacao') {
        return legendaPixRenovacao(plano, options.nomeCliente || 'não informado', configPix);
    }

    return legendaPix(plano, configPix);
}

function legendaPixMercadoPago(plano, options = {}) {
    return `💳 *PIX${options.tipo === 'renovacao' ?' - RENOVAÇÃO' : ''} ${plano.nome}*
━━━━━━━━━━━━━━━━━━━━
${options.nomeCliente ?`👤 *Cliente:* ${options.nomeCliente}\n` : ''}💰 *Valor:* R$ ${plano.valor}

📲 Abra o aplicativo do seu banco, escolha PIX, leia o QR Code e confirme o pagamento.

✅ A confirmação é automática. Não é necessário enviar comprovante.

🔄 Se quiser trocar para outro plano, digite *planos* para ver as opções.

*0* - Voltar ao menu principal
${RODAPE_ATENDIMENTO}`;
}

async function gerarQRCodeAutomatico(plano, configPix = configuracaoPixPadrao()) {
    const planoPix = normalizarPlanoPix(plano);
    const pixCopiaECola = gerarPixCopiaECola(planoPix, configPix);
    const qrCodeBuffer = await QRCode.toBuffer(pixCopiaECola, {
        width: 400,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });

    const base64Image = qrCodeBuffer.toString('base64');
    return new MessageMedia('image/png', base64Image, planoPix.arquivoQr);
}

async function enviarQRCodePIX(message, plano, options = {}) {
    const destino = message?.fromMe && message?.to ? message.to : message.from;

    return enviarQRCodePIXParaDestino(message.client, destino, plano, options);
}

function descreverConfiguracaoPix(configPix) {
    if (!configPix) {
        return 'pixConfigurado=nao config=nao_lida';
    }

    return [
        `pixConfigurado=${configPix.chave && configPix.nome && configPix.cidade ? 'sim' : 'nao'}`,
        `chave=${configPix.chave ? 'sim' : 'nao'}`,
        `nome=${configPix.nome ? 'sim' : 'nao'}`,
        `cidade=${configPix.cidade ? 'sim' : 'nao'}`
    ].join(' ');
}

async function enviarQRCodePIXParaDestino(client, destino, plano, options = {}) {
    let planoPix = null;
    let configPix = null;

    try {
        planoPix = normalizarPlanoPix(plano);

        if (planoPix.valorNumero <= 0) {
            throw new Error(`O plano ${plano?.nome || ''} esta sem valor de cobranca configurado.`);
        }

        configPix = await obterConfiguracaoPix();
        const cobrancaAutomatica = await criarCobrancaMercadoPago(planoPix, options);
        const media = cobrancaAutomatica
            ? new MessageMedia('image/png', cobrancaAutomatica.qrCodeBase64, planoPix.arquivoQr)
            : await gerarQRCodeAutomatico(planoPix, configPix);
        const caption = cobrancaAutomatica
            ? legendaPixMercadoPago(planoPix, options)
            : legendaPixPorContexto(planoPix, options, configPix);
        console.log(`Enviando QR Code PIX ${planoPix.nome} para:`, destino);
        registrarEnvioDoRobo(destino, caption);

        const enviada = await comTimeout(
            enfileirarEnvio(
                () => client.sendMessage(destino, media, { caption }),
                `Envio do QR Code PIX ${planoPix.nome}`,
                { proativo: Boolean(options.proativo) }
            ),
            ENVIO_TIMEOUT_MS,
            'Envio do QR Code PIX'
        );

        console.log(`QR Code PIX ${planoPix.nome} enviado com sucesso`, enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
        return true;
    } catch (error) {
        console.error(`[pix] Erro ao gerar/enviar QR Code PIX | destino=${destino || 'sem_destino'} plano=${planoPix?.nome || plano?.nome || 'sem_plano'} valor=${planoPix?.valor || plano?.valor || 'sem_valor'} ${descreverConfiguracaoPix(configPix)} erro=${error.message}`);

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
    prepararPlanoPixCliente,
    listarPlanosComerciais,
    montarPlanosPadraoComerciais,
    enviarQRCodePIX,
    enviarQRCodePIXParaDestino,
    gerarPixCopiaECola,
    planos
};
