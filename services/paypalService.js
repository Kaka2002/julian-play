const crypto = require('crypto');
const db = require('../database/sqlite');
const { obterConfiguracoes } = require('./configuracoesPainel');
const { buscarClientePorId, renovarCliente } = require('./clientes');
const { registrarEventoSistema } = require('./eventosSistema');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    }));
}

function moedaNumero(valor) {
    const numero = Number(String(valor || '0').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numero) ? numero : 0;
}

function moedaTexto(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function baseApi(config) {
    return config.paypalAmbiente === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
}

async function obterAccessToken(config) {
    const credenciais = Buffer.from(`${config.paypalClientId}:${config.paypalClientSecret}`).toString('base64');
    const resposta = await fetch(`${baseApi(config)}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credenciais}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !dados.access_token) {
        throw new Error(`PayPal: ${dados.error_description || dados.error || `HTTP ${resposta.status}`}`);
    }
    return dados.access_token;
}

async function requisicaoPayPal(config, caminho, opcoes = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const accessToken = await obterAccessToken(config);
        const resposta = await fetch(`${baseApi(config)}${caminho}`, {
            ...opcoes,
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
                ...(opcoes.headers || {})
            }
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
            const detalhe = dados.details?.[0]?.description || dados.message || dados.name || `HTTP ${resposta.status}`;
            throw new Error(`PayPal: ${detalhe}`);
        }
        return dados;
    } finally {
        clearTimeout(timer);
    }
}

async function registrarEvento(tipo, nivel, mensagem, detalhes = {}) {
    await registrarEventoSistema(tipo, nivel, mensagem, detalhes).catch(err => {
        console.error(`[paypal] Falha ao registrar evento: ${err.message}`);
    });
    if (tipo === 'paypal_pagamento_aprovado') {
        const config = await obterConfiguracoes().catch(() => ({}));
        if (config.alertaWebhookUrl) {
            const { enviarWebhook } = require('./monitoramentoComercial');
            await enviarWebhook(config.alertaWebhookUrl, {
                tipo,
                nivel,
                mensagem: `PAYPAL RECEBIDO E CONFIRMADO\n${mensagem}`,
                detalhes
            }).catch(err => {
                console.error(`[paypal] Falha ao enviar confirmacao ao webhook: ${err.message}`);
            });
        }
    }
}

async function paypalDisponivel() {
    const config = await obterConfiguracoes();
    return String(config.paypalAtivo) === '1'
        && Boolean(config.paypalClientId)
        && Boolean(config.paypalClientSecret)
        && /^https:\/\//i.test(String(config.paypalRetornoUrl || ''));
}

async function criarCobrancaPayPal(plano = {}, opcoes = {}) {
    const clienteId = Number.parseInt(opcoes.clienteId || 0, 10);
    if (!clienteId) throw new Error('Localize o cadastro do cliente antes de gerar o link PayPal.');

    const config = await obterConfiguracoes();
    if (String(config.paypalAtivo) !== '1') throw new Error('Ative o PayPal na tela Manutencao.');
    if (!config.paypalClientId || !config.paypalClientSecret) throw new Error('Configure as credenciais do PayPal.');
    if (!/^https:\/\//i.test(String(config.paypalRetornoUrl || ''))) {
        throw new Error('Configure a URL HTTPS publica de retorno do PayPal.');
    }

    const cliente = await buscarClientePorId(clienteId);
    if (!cliente) throw new Error('Cliente nao encontrado para gerar a cobranca PayPal.');

    const valorNumero = moedaNumero(plano.valorNumero || plano.valorTotal || plano.valor);
    if (valorNumero <= 0) throw new Error('O plano precisa ter valor maior que zero.');
    const diasContrato = Number.parseInt(opcoes.diasContrato || plano.dias || cliente.diasContrato || 0, 10);
    if (diasContrato <= 0) throw new Error('O plano precisa ter dias de contrato.');

    const referencia = `JP-PP-${clienteId}-${crypto.randomUUID()}`;
    const planoNome = String(opcoes.plano || plano.nome || cliente.plano || 'Plano').trim();
    const valorPlano = opcoes.valorPlano || plano.valor || cliente.valorPlano || moedaTexto(valorNumero);
    const assinaturaApp = opcoes.assinaturaApp || '0,00';

    await executar(
        `INSERT INTO cobrancas_pix (
            referencia, provedor, clienteId, plano, tipoPlanoId, diasContrato,
            valorPlano, assinaturaApp, valorTotal, status
        ) VALUES (?, 'paypal', ?, ?, ?, ?, ?, ?, ?, 'criando')`,
        [referencia, clienteId, planoNome, opcoes.tipoPlanoId || cliente.tipoPlanoId || '',
            diasContrato, valorPlano, assinaturaApp, moedaTexto(valorNumero)]
    );

    try {
        const retornoBase = String(config.paypalRetornoUrl).replace(/\/+$/, '');
        const ordem = await requisicaoPayPal(config, '/v2/checkout/orders', {
            method: 'POST',
            headers: { 'PayPal-Request-Id': referencia },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: referencia,
                    custom_id: referencia,
                    invoice_id: referencia,
                    description: `${planoNome} - ${cliente.nome}`.slice(0, 127),
                    amount: {
                        currency_code: 'BRL',
                        value: valorNumero.toFixed(2)
                    }
                }],
                application_context: {
                    brand_name: String(config.nomeEmpresaRobo || config.nomeSistema || 'Julian Play').slice(0, 127),
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW',
                    return_url: `${retornoBase}/pagamentos/paypal/retorno`,
                    cancel_url: `${retornoBase}/pagamentos/paypal/cancelado`
                }
            })
        });
        const link = ordem.links?.find(item => item.rel === 'approve')?.href;
        if (!ordem.id || !link) throw new Error('PayPal nao retornou o link de aprovacao.');

        await executar(
            `UPDATE cobrancas_pix SET provedorPagamentoId = ?, status = ?, qrCode = ?, atualizadoEm = CURRENT_TIMESTAMP
             WHERE referencia = ?`,
            [ordem.id, ordem.status || 'CREATED', link, referencia]
        );
        await registrarEvento('paypal_cobranca_criada', 'info',
            `Cobranca PayPal criada para ${cliente.nome}: ${planoNome}, R$ ${moedaTexto(valorNumero)}.`,
            { clienteId, cliente: cliente.nome, plano: planoNome, valor: moedaTexto(valorNumero), ordemPayPal: ordem.id });
        return { referencia, ordemId: ordem.id, link, status: ordem.status || 'CREATED' };
    } catch (err) {
        await executar(
            `UPDATE cobrancas_pix SET status = 'erro', erro = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE referencia = ?`,
            [err.message, referencia]
        );
        await registrarEvento('paypal_cobranca_erro', 'erro',
            `Falha ao criar cobranca PayPal para ${cliente.nome}: ${err.message}`,
            { clienteId, plano: planoNome, valor: moedaTexto(valorNumero) });
        throw err;
    }
}

function dadosCaptura(ordem = {}) {
    const unidade = ordem.purchase_units?.[0] || {};
    const captura = unidade.payments?.captures?.[0] || {};
    return {
        referencia: unidade.custom_id || unidade.invoice_id || unidade.reference_id || '',
        capturaId: captura.id || '',
        status: captura.status || ordem.status || '',
        valor: Number(captura.amount?.value || unidade.amount?.value || 0),
        moeda: captura.amount?.currency_code || unidade.amount?.currency_code || ''
    };
}

async function processarOrdemPayPal(ordemId, capturar = false) {
    const config = await obterConfiguracoes();
    if (String(config.paypalAtivo) !== '1') return { ignorado: true };

    let ordem = await requisicaoPayPal(config, `/v2/checkout/orders/${encodeURIComponent(ordemId)}`);
    if (capturar && ordem.status === 'APPROVED') {
        ordem = await requisicaoPayPal(config, `/v2/checkout/orders/${encodeURIComponent(ordemId)}/capture`, {
            method: 'POST',
            headers: { 'PayPal-Request-Id': `capture-${ordemId}` },
            body: '{}'
        });
    }

    const pagamento = dadosCaptura(ordem);
    const cobranca = await buscarUm(
        `SELECT * FROM cobrancas_pix
         WHERE provedor = 'paypal' AND (provedorPagamentoId = ? OR referencia = ?)
         LIMIT 1`,
        [ordemId, pagamento.referencia]
    );
    if (!cobranca) return { ignorado: true, motivo: 'cobranca_nao_encontrada' };
    if (cobranca.status === 'aprovado') return { duplicado: true, cobranca };

    await executar(
        `UPDATE cobrancas_pix SET status = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [pagamento.status || ordem.status || 'PENDING', cobranca.id]
    );
    if (pagamento.status !== 'COMPLETED') {
        return { pendente: true, status: pagamento.status || ordem.status, cobranca };
    }
    if (pagamento.moeda !== 'BRL') throw new Error(`Moeda PayPal divergente: ${pagamento.moeda || 'nao informada'}.`);

    const esperado = moedaNumero(cobranca.valorTotal);
    if (Math.abs(esperado - pagamento.valor) > 0.009) {
        await executar(
            `UPDATE cobrancas_pix SET status = 'valor_divergente', erro = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
            [`Esperado ${esperado} BRL; recebido ${pagamento.valor} ${pagamento.moeda}`, cobranca.id]
        );
        throw new Error('Valor recebido pelo PayPal diverge da cobranca registrada.');
    }

    const bloqueio = await executar(
        `UPDATE cobrancas_pix SET status = 'processando', atualizadoEm = CURRENT_TIMESTAMP
         WHERE id = ? AND status NOT IN ('aprovado', 'processando')`,
        [cobranca.id]
    );
    if (!bloqueio.changes) return { duplicado: true, cobranca };

    try {
        const renovacao = await renovarCliente({
            clienteId: cobranca.clienteId,
            tipoPlanoId: cobranca.tipoPlanoId,
            plano: cobranca.plano,
            diasContrato: cobranca.diasContrato,
            valorPlano: cobranca.valorPlano,
            assinaturaApp: cobranca.assinaturaApp,
            formaPagamento: 'PayPal',
            reiniciarPeriodo: true,
            observacoes: `Confirmado automaticamente. PayPal: ${pagamento.capturaId || ordemId}. Referencia: ${cobranca.referencia}.`
        });
        await executar(
            `UPDATE cobrancas_pix SET status = 'aprovado', pagamentoId = ?, aprovadoEm = ?,
                erro = '', atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
            [renovacao.pagamentoId, new Date().toISOString(), cobranca.id]
        );
        let filaPainel = { criadas: 0 };
        try {
            filaPainel = await require('./renovacaoPainelService').enfileirarRenovacoesDaCobranca(cobranca.id);
        } catch (err) {
            await registrarEvento('paypal_fila_painel_pendente', 'alerta',
                `PayPal aprovado, mas a fila do painel sera reconciliada: ${err.message}`,
                { clienteId: cobranca.clienteId, cobrancaId: cobranca.id });
        }
        await registrarEvento('paypal_pagamento_aprovado', 'sucesso',
            `PayPal aprovado e cliente renovado: ${renovacao.cliente?.nome || cobranca.clienteId}, ${renovacao.plano}, R$ ${renovacao.valorTotal}.`,
            { clienteId: cobranca.clienteId, ordemPayPal: ordemId, capturaPayPal: pagamento.capturaId });
        return { aprovado: true, renovacao, filaPainel, cobranca: { ...cobranca, status: 'aprovado' } };
    } catch (err) {
        await executar(
            `UPDATE cobrancas_pix SET status = 'erro_renovacao', erro = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
            [err.message, cobranca.id]
        );
        throw err;
    }
}

async function verificarWebhookPayPal(headers, evento) {
    const config = await obterConfiguracoes();
    if (!config.paypalWebhookId) return false;
    const verificacao = await requisicaoPayPal(config, '/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: JSON.stringify({
            auth_algo: headers['paypal-auth-algo'],
            cert_url: headers['paypal-cert-url'],
            transmission_id: headers['paypal-transmission-id'],
            transmission_sig: headers['paypal-transmission-sig'],
            transmission_time: headers['paypal-transmission-time'],
            webhook_id: config.paypalWebhookId,
            webhook_event: evento
        })
    });
    return verificacao.verification_status === 'SUCCESS';
}

module.exports = {
    paypalDisponivel,
    criarCobrancaPayPal,
    processarOrdemPayPal,
    verificarWebhookPayPal
};
