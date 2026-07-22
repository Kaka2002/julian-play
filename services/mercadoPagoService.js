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

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

function moedaNumero(valor) {
    const numero = Number(String(valor || '0').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numero) ? numero : 0;
}

function moedaTexto(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function notificarEventoPix(config, tipo, nivel, mensagem, detalhes = {}) {
    await registrarEventoSistema('pix', nivel, mensagem, detalhes).catch(err => {
        console.error(`[mercado-pago] Falha ao registrar evento PIX: ${err.message}`);
    });
    if (config?.alertaWebhookUrl) {
        const { enviarWebhook } = require('./monitoramentoComercial');
        await enviarWebhook(config.alertaWebhookUrl, { tipo, nivel, mensagem, detalhes });
    }
}

async function requisicaoMercadoPago(caminho, accessToken, opcoes = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const resposta = await fetch(`https://api.mercadopago.com${caminho}`, {
            ...opcoes,
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...(opcoes.headers || {})
            }
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
            const detalhe = dados.message || dados.error || `HTTP ${resposta.status}`;
            throw new Error(`Mercado Pago: ${detalhe}`);
        }
        return dados;
    } finally {
        clearTimeout(timer);
    }
}

async function criarCobrancaMercadoPago(plano = {}, opcoes = {}) {
    const clienteId = Number.parseInt(opcoes.clienteId || 0, 10);
    if (!clienteId) return null;

    const config = await obterConfiguracoes();
    if (config.pixProvedor !== 'mercado_pago') return null;
    const accessToken = String(config.mercadoPagoAccessToken || '').trim();
    if (!accessToken) throw new Error('Configure o Access Token do Mercado Pago na tela Manutencao.');

    const cliente = await buscarClientePorId(clienteId);
    if (!cliente) throw new Error('Cliente nao encontrado para gerar a cobranca PIX.');
    const valorTotalNumero = moedaNumero(plano.valorNumero || plano.valorTotal || plano.total || plano.valor);
    if (valorTotalNumero <= 0) throw new Error('A cobranca do Mercado Pago precisa ter valor maior que zero.');

    const referencia = `JP-${clienteId}-${crypto.randomUUID()}`;
    const planoNome = String(opcoes.plano || plano.nome || cliente.plano || 'Plano').trim();
    const diasContrato = Number.parseInt(opcoes.diasContrato || plano.dias || cliente.diasContrato || 0, 10);
    if (diasContrato <= 0) throw new Error('O plano precisa ter dias de contrato para renovacao automatica.');
    const valorPlano = opcoes.valorPlano || plano.valorPlano || cliente.valorPlano || moedaTexto(valorTotalNumero);
    const assinaturaApp = opcoes.assinaturaApp || plano.assinaturaApp || '0,00';
    const email = String(opcoes.email || config.mercadoPagoEmailPagador || `cliente${clienteId}@julianplay.com.br`).trim();

    await executar(
        `INSERT INTO cobrancas_pix (
            referencia, provedor, clienteId, plano, tipoPlanoId, diasContrato,
            valorPlano, assinaturaApp, valorTotal, status
        ) VALUES (?, 'mercado_pago', ?, ?, ?, ?, ?, ?, ?, 'criando')`,
        [referencia, clienteId, planoNome, opcoes.tipoPlanoId || cliente.tipoPlanoId || '', diasContrato,
            valorPlano, assinaturaApp, moedaTexto(valorTotalNumero)]
    );

    try {
        const corpo = {
            transaction_amount: Number(valorTotalNumero.toFixed(2)),
            description: `${planoNome} - ${cliente.nome}`.slice(0, 120),
            payment_method_id: 'pix',
            external_reference: referencia,
            payer: { email }
        };
        if (/^https:\/\//i.test(String(config.mercadoPagoWebhookUrl || ''))) {
            corpo.notification_url = config.mercadoPagoWebhookUrl;
        }

        const pagamento = await requisicaoMercadoPago('/v1/payments', accessToken, {
            method: 'POST',
            headers: { 'X-Idempotency-Key': referencia },
            body: JSON.stringify(corpo)
        });
        const dadosPix = pagamento.point_of_interaction?.transaction_data || {};
        if (!dadosPix.qr_code || !dadosPix.qr_code_base64) {
            throw new Error('Mercado Pago nao retornou o QR Code PIX.');
        }

        await executar(
            `UPDATE cobrancas_pix SET provedorPagamentoId = ?, status = ?, qrCode = ?, atualizadoEm = CURRENT_TIMESTAMP
             WHERE referencia = ?`,
            [String(pagamento.id), pagamento.status || 'pending', dadosPix.qr_code, referencia]
        );
        await notificarEventoPix(
            config,
            'pix_cobranca_criada',
            'info',
            `PIX Mercado Pago gerado para ${cliente.nome}: ${planoNome}, R$ ${moedaTexto(valorTotalNumero)}.`,
            { clienteId, cliente: cliente.nome, plano: planoNome, valor: moedaTexto(valorTotalNumero), mercadoPagoPagamentoId: String(pagamento.id) }
        );
        return {
            referencia,
            pagamentoId: String(pagamento.id),
            qrCode: dadosPix.qr_code,
            qrCodeBase64: dadosPix.qr_code_base64,
            status: pagamento.status || 'pending'
        };
    } catch (err) {
        await executar(
            `UPDATE cobrancas_pix SET status = 'erro', erro = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE referencia = ?`,
            [err.message, referencia]
        );
        await notificarEventoPix(
            config,
            'pix_cobranca_erro',
            'erro',
            `Falha ao gerar PIX Mercado Pago para ${cliente.nome}: ${err.message}`,
            { clienteId, cliente: cliente.nome, plano: planoNome, valor: moedaTexto(valorTotalNumero) }
        );
        throw err;
    }
}

async function processarPagamentoMercadoPago(provedorPagamentoId) {
    const config = await obterConfiguracoes();
    if (config.pixProvedor !== 'mercado_pago' || !config.mercadoPagoAccessToken) return { ignorado: true };
    const pagamento = await requisicaoMercadoPago(`/v1/payments/${encodeURIComponent(provedorPagamentoId)}`, config.mercadoPagoAccessToken);
    const referencia = String(pagamento.external_reference || '');
    const cobranca = await buscarUm(
        `SELECT * FROM cobrancas_pix WHERE referencia = ? AND provedor = 'mercado_pago' LIMIT 1`,
        [referencia]
    );
    if (!cobranca) return { ignorado: true, motivo: 'cobranca_nao_encontrada' };
    if (cobranca.status === 'aprovado') return { duplicado: true, cobranca };

    await executar(
        `UPDATE cobrancas_pix SET provedorPagamentoId = ?, status = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [String(pagamento.id), pagamento.status || 'pending', cobranca.id]
    );
    if (pagamento.status !== 'approved') return { pendente: true, status: pagamento.status, cobranca };

    const valorEsperado = moedaNumero(cobranca.valorTotal);
    const valorRecebido = Number(pagamento.transaction_amount || 0);
    if (Math.abs(valorEsperado - valorRecebido) > 0.009) {
        await executar(`UPDATE cobrancas_pix SET status = 'valor_divergente', erro = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
            [`Esperado ${valorEsperado}; recebido ${valorRecebido}`, cobranca.id]);
        const clienteDivergente = await buscarClientePorId(cobranca.clienteId);
        await notificarEventoPix(
            config,
            'pix_valor_divergente',
            'alerta',
            `PIX com valor divergente para ${clienteDivergente?.nome || `cliente ${cobranca.clienteId}`}: esperado R$ ${moedaTexto(valorEsperado)}, recebido R$ ${moedaTexto(valorRecebido)}.`,
            { clienteId: cobranca.clienteId, plano: cobranca.plano, valorEsperado: moedaTexto(valorEsperado), valorRecebido: moedaTexto(valorRecebido), mercadoPagoPagamentoId: String(pagamento.id) }
        );
        throw new Error('Valor recebido diverge da cobranca registrada.');
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
            formaPagamento: 'PIX Mercado Pago',
            dataPagamento: String(pagamento.date_approved || '').slice(0, 16),
            observacoes: `Confirmado automaticamente. Mercado Pago: ${pagamento.id}. Referencia: ${referencia}.`
        });
        await executar(
            `UPDATE cobrancas_pix SET status = 'aprovado', pagamentoId = ?, aprovadoEm = ?, erro = '', atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
            [renovacao.pagamentoId, pagamento.date_approved || new Date().toISOString(), cobranca.id]
        );
        await notificarEventoPix(
            config,
            'pix_pagamento_aprovado',
            'sucesso',
            `PIX aprovado e cliente renovado: ${renovacao.cliente?.nome || cobranca.clienteId}, ${renovacao.plano}, R$ ${renovacao.valorTotal}. Novo vencimento: ${renovacao.vencimentoNovo}.`,
            { clienteId: cobranca.clienteId, cliente: renovacao.cliente?.nome || '', plano: renovacao.plano, valor: renovacao.valorTotal, vencimentoNovo: renovacao.vencimentoNovo, mercadoPagoPagamentoId: String(pagamento.id) }
        );
        return { aprovado: true, renovacao, cobranca: { ...cobranca, status: 'aprovado' } };
    } catch (err) {
        await executar(`UPDATE cobrancas_pix SET status = 'erro_renovacao', erro = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`, [err.message, cobranca.id]);
        await notificarEventoPix(
            config,
            'pix_renovacao_erro',
            'erro',
            `PIX aprovado, mas a renovacao automatica falhou para o cliente ${cobranca.clienteId}: ${err.message}`,
            { clienteId: cobranca.clienteId, plano: cobranca.plano, valor: cobranca.valorTotal, mercadoPagoPagamentoId: String(pagamento.id) }
        );
        throw err;
    }
}

async function verificarCobrancasPendentesMercadoPago() {
    const config = await obterConfiguracoes();
    if (config.pixProvedor !== 'mercado_pago' || !config.mercadoPagoAccessToken) {
        return { verificadas: 0, aprovadas: 0, erros: 0 };
    }

    const cobrancas = await buscarTodos(
        `SELECT provedorPagamentoId FROM cobrancas_pix
         WHERE provedor = 'mercado_pago'
           AND status IN ('pending', 'in_process', 'authorized')
           AND provedorPagamentoId IS NOT NULL
         ORDER BY datetime(criadoEm) ASC
         LIMIT 30`
    );
    let aprovadas = 0;
    let erros = 0;
    for (const cobranca of cobrancas) {
        try {
            const resultado = await processarPagamentoMercadoPago(cobranca.provedorPagamentoId);
            if (resultado.aprovado) aprovadas += 1;
        } catch (err) {
            erros += 1;
            console.error(`[mercado-pago] Falha ao verificar cobranca ${cobranca.provedorPagamentoId}: ${err.message}`);
        }
    }
    return { verificadas: cobrancas.length, aprovadas, erros };
}

async function listarConfirmacoesPixPendentes(limite = 30) {
    return buscarTodos(
        `SELECT cobranca.id AS cobrancaId, cobranca.pagamentoId, cobranca.plano,
                cobranca.valorTotal, cobranca.aprovadoEm,
                pagamento.vencimentoNovo, cliente.id AS clienteId,
                cliente.nome, cliente.telefone
         FROM cobrancas_pix cobranca
         INNER JOIN cliente_pagamentos pagamento ON pagamento.id = cobranca.pagamentoId
         INNER JOIN clientes cliente ON cliente.id = cobranca.clienteId
         WHERE cobranca.provedor = 'mercado_pago'
           AND cobranca.status = 'aprovado'
           AND COALESCE(pagamento.mensagemEnviada, 0) = 0
         ORDER BY datetime(cobranca.atualizadoEm) ASC
         LIMIT ?`,
        [Math.max(1, Math.min(100, Number(limite) || 30))]
    );
}

module.exports = {
    criarCobrancaMercadoPago,
    processarPagamentoMercadoPago,
    verificarCobrancasPendentesMercadoPago,
    listarConfirmacoesPixPendentes
};
