const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/sqlite');
const { buscarClientePorId, buscarClientePorTelefone, renovarCliente, adicionarNotaCliente } = require('./clientes');
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

const PASTA_COMPROVANTES = path.join(db.dataDir, 'comprovantes-pagamentos');
const TIPOS_COMPROVANTE = {
    'image/jpeg': { extensao: '.jpg', assinaturas: ['ffd8ff'] },
    'image/png': { extensao: '.png', assinaturas: ['89504e470d0a1a0a'] },
    'application/pdf': { extensao: '.pdf', assinaturas: ['25504446'] }
};

function tipoComprovanteValido(buffer, mimetype) {
    const regra = TIPOS_COMPROVANTE[String(mimetype || '').toLowerCase()];
    if (!regra || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 5 * 1024 * 1024) return null;
    const inicio = buffer.subarray(0, 16).toString('hex').toLowerCase();
    return regra.assinaturas.some(assinatura => inicio.startsWith(assinatura)) ? regra : null;
}

function numeroMoeda(valor) {
    const texto = String(valor ?? '').trim().replace(/\s/g, '');
    if (!texto) return 0;
    const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
}

function referenciaComprovanteWhatsapp(messageId) {
    return `PIX-WA-${crypto.createHash('sha256').update(String(messageId || '')).digest('hex').slice(0, 24).toUpperCase()}`;
}

async function registrarCobrancaManual(dados = {}) {
    if (!dados.referencia || !dados.clienteId || Number(dados.valorTotal || 0) <= 0) {
        throw new Error('Dados incompletos para registrar cobrança manual.');
    }
    await executar(
        `INSERT INTO cobrancas_pix (
            referencia, provedor, clienteId, plano, tipoPlanoId, diasContrato,
            valorPlano, assinaturaApp, valorTotal, moeda, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aguardando_comprovante')`,
        [
            dados.referencia, dados.provedor || 'manual', dados.clienteId, dados.plano || 'Plano',
            dados.tipoPlanoId || '', Number(dados.diasContrato || 0), dados.valorPlano || '',
            dados.assinaturaApp || '0,00', dados.valorTotal, dados.moeda || 'BRL'
        ]
    );
    return { referencia: dados.referencia, status: 'aguardando_comprovante' };
}

function listarCobrancasManuais(filtros = {}) {
    const params = [];
    let where = `c.provedor IN ('paypal_manual', 'manual', 'pix_comprovante_whatsapp')`;
    if (filtros.status && filtros.status !== 'todos') {
        where += ' AND c.status = ?';
        params.push(filtros.status);
    }
    return buscarTodos(`
        SELECT c.*, cl.nome AS clienteNome, cl.telefone AS clienteTelefone
        FROM cobrancas_pix c
        JOIN clientes cl ON cl.id = c.clienteId
        WHERE ${where}
        ORDER BY c.id DESC
        LIMIT 500
    `, params);
}

async function registrarComprovanteWhatsapp(dados = {}) {
    const telefone = String(dados.telefone || '').trim();
    const messageId = String(dados.messageId || '').trim();
    const arquivoBuffer = Buffer.isBuffer(dados.arquivo) ? dados.arquivo : Buffer.from(dados.arquivo || '');
    const tipo = tipoComprovanteValido(arquivoBuffer, dados.mimetype);
    if (!telefone || !messageId || !tipo) {
        return { registrado: false, motivo: 'arquivo_invalido' };
    }

    const cliente = await buscarClientePorTelefone(telefone);
    if (!cliente) return { registrado: false, motivo: 'cliente_nao_encontrado' };

    const referencia = referenciaComprovanteWhatsapp(messageId);
    const existente = await buscarUm('SELECT id, status FROM cobrancas_pix WHERE referencia = ?', [referencia]);
    if (existente) return { registrado: false, duplicado: true, cobrancaId: existente.id, status: existente.status };

    const valorPlano = String(cliente.valorPlano || '0,00');
    const assinaturaApp = String(cliente.assinaturaApp || '0,00');
    const valorTotal = (numeroMoeda(valorPlano) + numeroMoeda(assinaturaApp)).toFixed(2);
    if (Number(valorTotal) <= 0 || !cliente.plano || Number(cliente.diasContrato || 0) <= 0) {
        return { registrado: false, motivo: 'contrato_cliente_incompleto' };
    }

    fs.mkdirSync(PASTA_COMPROVANTES, { recursive: true });
    const nomeArquivo = `${referencia.toLowerCase()}-${crypto.randomBytes(8).toString('hex')}${tipo.extensao}`;
    const caminhoArquivo = path.join(PASTA_COMPROVANTES, nomeArquivo);
    await fs.promises.writeFile(caminhoArquivo, arquivoBuffer, { flag: 'wx' });

    try {
        await registrarCobrancaManual({
            referencia,
            provedor: 'pix_comprovante_whatsapp',
            clienteId: cliente.id,
            plano: cliente.plano,
            tipoPlanoId: cliente.tipoPlanoId || '',
            diasContrato: cliente.diasContrato,
            valorPlano,
            assinaturaApp,
            valorTotal,
            moeda: 'BRL'
        });
        await executar(`UPDATE cobrancas_pix
            SET comprovanteArquivo = ?, comprovanteRecebidoEm = ?, status = 'aguardando_conferencia',
                erro = '', atualizadoEm = CURRENT_TIMESTAMP
            WHERE referencia = ? AND provedor = 'pix_comprovante_whatsapp'`, [
            nomeArquivo, new Date().toISOString(), referencia
        ]);
    } catch (err) {
        await fs.promises.unlink(caminhoArquivo).catch(() => {});
        if (/UNIQUE constraint failed: cobrancas_pix\.referencia/i.test(err.message)) {
            const repetido = await buscarUm('SELECT id, status FROM cobrancas_pix WHERE referencia = ?', [referencia]);
            return { registrado: false, duplicado: true, cobrancaId: repetido?.id, status: repetido?.status };
        }
        throw err;
    }

    const cobranca = await buscarUm('SELECT id FROM cobrancas_pix WHERE referencia = ?', [referencia]);
    await adicionarNotaCliente(cliente.id, 'Comprovante PIX recebido pelo WhatsApp e aguardando conferência.');
    await registrarEventoSistema('pix_comprovante_whatsapp_recebido', 'info',
        'Comprovante PIX recebido pelo WhatsApp e aguardando conferência.', {
            cobrancaId: cobranca?.id || null, clienteId: cliente.id, referencia
        });
    return { registrado: true, cobrancaId: cobranca?.id || null, clienteId: cliente.id, referencia };
}

async function registrarComprovanteManual(cobrancaId, arquivo) {
    const agora = new Date().toISOString();
    const resultado = await executar(
        `UPDATE cobrancas_pix
         SET comprovanteArquivo = ?, comprovanteRecebidoEm = ?, status = 'aguardando_conferencia',
             erro = '', atualizadoEm = CURRENT_TIMESTAMP
         WHERE id = ? AND provedor IN ('paypal_manual', 'manual', 'pix_comprovante_whatsapp')
           AND status IN ('aguardando_comprovante', 'aguardando_conferencia')`,
        [arquivo, agora, cobrancaId]
    );
    if (!resultado.changes) throw new Error('Cobrança manual não encontrada ou já finalizada.');
    await registrarEventoSistema('pagamento_manual_comprovante', 'info', 'Comprovante manual anexado para conferência.', {
        cobrancaId: Number(cobrancaId)
    });
}

async function confirmarPagamentoManual(cobrancaId, dados = {}) {
    const identificador = String(dados.identificadorManual || '').trim();
    const conferidoPor = String(dados.conferidoPor || '').trim();
    if (!identificador) throw new Error('Informe o identificador PIX ou uma observação da conferência.');
    if (!conferidoPor) throw new Error('Não foi possível identificar o administrador responsável.');

    const cobranca = await buscarUm(
        `SELECT * FROM cobrancas_pix WHERE id = ? AND provedor IN ('paypal_manual', 'manual', 'pix_comprovante_whatsapp')`,
        [cobrancaId]
    );
    if (!cobranca) throw new Error('Cobrança pendente não encontrada.');
    if (cobranca.status === 'aprovado') return { duplicado: true, cobranca };
    if (cobranca.status === 'estornado') throw new Error('Pagamento já estornado.');
    if (!cobranca.comprovanteArquivo) throw new Error('Anexe o comprovante antes da confirmação.');

    const repetido = await buscarUm(
        `SELECT id FROM cobrancas_pix
         WHERE provedor = ? AND identificadorManual = ? AND id <> ? LIMIT 1`,
        [cobranca.provedor, identificador, cobranca.id]
    );
    if (repetido) throw new Error('Este identificador já foi usado em outra cobrança.');

    const bloqueio = await executar(
        `UPDATE cobrancas_pix SET status = 'processando_manual', identificadorManual = ?,
             conferidoPor = ?, atualizadoEm = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('aguardando_comprovante', 'aguardando_conferencia', 'erro_renovacao')`,
        [identificador, conferidoPor, cobranca.id]
    );
    if (!bloqueio.changes) throw new Error('Cobrança já está sendo processada ou foi finalizada.');

    try {
        const clienteAntes = await buscarClientePorId(cobranca.clienteId);
        if (!clienteAntes) throw new Error('Cliente da cobrança não foi encontrado.');
        const vencimentoAnterior = clienteAntes.dataVencimento || clienteAntes.vencimento || '';
        const renovacao = await renovarCliente({
            clienteId: cobranca.clienteId,
            tipoPlanoId: cobranca.tipoPlanoId,
            plano: cobranca.plano,
            diasContrato: cobranca.diasContrato,
            valorPlano: cobranca.valorPlano,
            assinaturaApp: cobranca.assinaturaApp,
            formaPagamento: cobranca.provedor === 'paypal_manual'
                ? 'PayPal manual'
                : cobranca.provedor === 'pix_comprovante_whatsapp'
                    ? 'PIX (comprovante WhatsApp)'
                    : 'Pagamento manual',
            reiniciarPeriodo: true,
            observacoes: `Conferido por ${conferidoPor}. Transação: ${identificador}. Referência: ${cobranca.referencia}.`
        });
        const agora = new Date().toISOString();
        const vencimentoNovo = renovacao.cliente?.dataVencimento || renovacao.cliente?.vencimento || renovacao.vencimentoNovo || '';
        await executar(
            `UPDATE cobrancas_pix SET status = 'aprovado', pagamentoId = ?, aprovadoEm = ?,
                conferidoEm = ?, vencimentoAnterior = ?, vencimentoNovo = ?, erro = '',
                atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
            [renovacao.pagamentoId, agora, agora, vencimentoAnterior, vencimentoNovo, cobranca.id]
        );
        await adicionarNotaCliente(cobranca.clienteId,
            `Pagamento confirmado por ${conferidoPor}. Identificador: ${identificador}.`);
        await registrarEventoSistema('pagamento_manual_confirmado', 'sucesso',
            'Pagamento conferido e cliente renovado.', {
                cobrancaId: cobranca.id, clienteId: cobranca.clienteId, pagamentoId: renovacao.pagamentoId,
                identificador, conferidoPor, vencimentoAnterior, vencimentoNovo
            });
        return { aprovado: true, renovacao };
    } catch (err) {
        await executar(
            `UPDATE cobrancas_pix SET status = 'erro_renovacao', erro = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
            [err.message, cobranca.id]
        );
        throw err;
    }
}

async function estornarPagamentoManual(cobrancaId, dados = {}) {
    const motivo = String(dados.motivo || '').trim();
    const estornadoPor = String(dados.estornadoPor || '').trim();
    if (motivo.length < 5) throw new Error('Informe o motivo do estorno.');
    const cobranca = await buscarUm(
        `SELECT * FROM cobrancas_pix WHERE id = ? AND provedor IN ('paypal_manual', 'manual', 'pix_comprovante_whatsapp')`,
        [cobrancaId]
    );
    if (!cobranca || cobranca.status !== 'aprovado') throw new Error('Somente pagamento manual aprovado pode ser estornado.');
    const agora = new Date().toISOString();
    const alteracao = await executar(
        `UPDATE cobrancas_pix SET status = 'estornado', estornadoEm = ?, estornadoPor = ?,
             motivoEstorno = ?, atualizadoEm = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'aprovado'`,
        [agora, estornadoPor, motivo, cobranca.id]
    );
    if (!alteracao.changes) throw new Error('O pagamento já foi alterado por outra operação.');
    if (cobranca.pagamentoId) {
        await executar(
            `UPDATE cliente_pagamentos SET excluidoEm = ?,
                observacoes = COALESCE(observacoes, '') || ?
             WHERE id = ? AND excluidoEm IS NULL`,
            [agora, ` | Estornado por ${estornadoPor}: ${motivo}`, cobranca.pagamentoId]
        );
    }
    await adicionarNotaCliente(cobranca.clienteId,
        `Pagamento manual estornado por ${estornadoPor}: ${motivo}. O acesso não foi reduzido automaticamente.`);
    await registrarEventoSistema('pagamento_manual_estornado', 'alerta',
        'Pagamento manual marcado como estornado; acesso mantido para decisão administrativa.', {
            cobrancaId: cobranca.id, clienteId: cobranca.clienteId, pagamentoId: cobranca.pagamentoId,
            estornadoPor, motivo
        });
    return { estornado: true };
}

module.exports = {
    registrarCobrancaManual,
    listarCobrancasManuais,
    registrarComprovanteManual,
    registrarComprovanteWhatsapp,
    confirmarPagamentoManual,
    estornarPagamentoManual
};
