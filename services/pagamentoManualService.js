const db = require('../database/sqlite');
const { buscarClientePorId, renovarCliente, adicionarNotaCliente } = require('./clientes');
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
    let where = `c.provedor IN ('paypal_manual', 'manual')`;
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

async function registrarComprovanteManual(cobrancaId, arquivo) {
    const agora = new Date().toISOString();
    const resultado = await executar(
        `UPDATE cobrancas_pix
         SET comprovanteArquivo = ?, comprovanteRecebidoEm = ?, status = 'aguardando_conferencia',
             erro = '', atualizadoEm = CURRENT_TIMESTAMP
         WHERE id = ? AND provedor IN ('paypal_manual', 'manual')
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
    if (!identificador) throw new Error('Informe o identificador da transação conferida no PayPal.');
    if (!conferidoPor) throw new Error('Não foi possível identificar o administrador responsável.');

    const cobranca = await buscarUm(
        `SELECT * FROM cobrancas_pix WHERE id = ? AND provedor IN ('paypal_manual', 'manual')`,
        [cobrancaId]
    );
    if (!cobranca) throw new Error('Cobrança manual não encontrada.');
    if (cobranca.status === 'aprovado') return { duplicado: true, cobranca };
    if (cobranca.status === 'estornado') throw new Error('Pagamento já estornado.');
    if (!cobranca.comprovanteArquivo) throw new Error('Anexe o comprovante antes da confirmação.');

    const repetido = await buscarUm(
        `SELECT id FROM cobrancas_pix
         WHERE provedor = ? AND identificadorManual = ? AND id <> ? LIMIT 1`,
        [cobranca.provedor, identificador, cobranca.id]
    );
    if (repetido) throw new Error('Este identificador PayPal já foi usado em outra cobrança.');

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
            formaPagamento: cobranca.provedor === 'paypal_manual' ? 'PayPal manual' : 'Pagamento manual',
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
            `Pagamento manual confirmado por ${conferidoPor}. Identificador: ${identificador}.`);
        await registrarEventoSistema('pagamento_manual_confirmado', 'sucesso',
            'Pagamento manual conferido e cliente renovado.', {
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
        `SELECT * FROM cobrancas_pix WHERE id = ? AND provedor IN ('paypal_manual', 'manual')`,
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
    confirmarPagamentoManual,
    estornarPagamentoManual
};
