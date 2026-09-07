const db = require('../database/sqlite');
const { registrarEventoSistema } = require('./eventosSistema');

const INTERVALO_DIARIO_MS = 24 * 60 * 60 * 1000;
let agendador = null;
let executando = false;

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

function numeroMoeda(valor) {
    if (typeof valor === 'number') return valor;
    const texto = String(valor || '0').trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
    const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
}

function divergencia(linha, tipo, prioridade, titulo, detalhe) {
    return {
        chave: `conciliacao:${tipo}:${linha.cobrancaId}`,
        tipo, prioridade, titulo, detalhe,
        cobrancaId: linha.cobrancaId,
        pagamentoId: linha.pagamentoId || null,
        clienteId: linha.clienteId,
        clienteNome: linha.clienteNome,
        provedor: linha.provedor,
        referencia: linha.referencia,
        atualizadoEm: linha.atualizadoEm,
        href: `/clientes/${linha.clienteId}/editar#renovar`
    };
}

async function listarDivergenciasFinanceiras() {
    const linhas = await buscarTodos(`
        SELECT c.id cobrancaId,c.referencia,c.provedor,c.clienteId,c.status,c.valorTotal valorCobranca,
            c.pagamentoId,c.atualizadoEm,p.id pagamentoEncontrado,p.valorTotal valorPagamento,
            p.vencimentoNovo,p.excluidoEm,cl.nome clienteNome,cl.dataVencimento,cl.vencimento
        FROM cobrancas_pix c
        JOIN clientes cl ON cl.id=c.clienteId
        LEFT JOIN cliente_pagamentos p ON p.id=c.pagamentoId
        WHERE c.status='aprovado'
        ORDER BY c.id DESC LIMIT 1000`);
    const itens = [];
    for (const linha of linhas) {
        if (!linha.pagamentoId) {
            itens.push(divergencia(linha, 'cobranca_sem_pagamento', 'critica',
                `Cobrança aprovada sem pagamento: ${linha.clienteNome}`,
                `Referência ${linha.referencia} foi aprovada, mas não possui lançamento financeiro.`));
            continue;
        }
        if (!linha.pagamentoEncontrado || linha.excluidoEm) {
            itens.push(divergencia(linha, 'pagamento_ausente', 'critica',
                `Pagamento vinculado ausente: ${linha.clienteNome}`,
                `A cobrança ${linha.referencia} aponta para um pagamento inexistente ou removido.`));
            continue;
        }
        const diferenca = Math.abs(numeroMoeda(linha.valorCobranca) - numeroMoeda(linha.valorPagamento));
        if (diferenca >= 0.01) {
            itens.push(divergencia(linha, 'valor_divergente', 'critica',
                `Valor divergente: ${linha.clienteNome}`,
                `Cobrança R$ ${linha.valorCobranca}; pagamento R$ ${linha.valorPagamento}.`));
        }
        const vencimentoCliente = String(linha.dataVencimento || linha.vencimento || '').slice(0, 16);
        const vencimentoPagamento = String(linha.vencimentoNovo || '').slice(0, 16);
        if (vencimentoPagamento && (!vencimentoCliente || vencimentoCliente < vencimentoPagamento)) {
            itens.push(divergencia(linha, 'acesso_nao_atualizado', 'alta',
                `Vencimento não acompanha o pagamento: ${linha.clienteNome}`,
                `Pagamento prevê ${linha.vencimentoNovo}, mas o cadastro permanece em ${linha.dataVencimento || linha.vencimento || 'sem vencimento'}.`));
        }
    }
    return itens;
}

async function executarConciliacaoFinanceira(opcoes = {}) {
    if (executando) return { ignorada: true, motivo: 'conciliacao_em_andamento', divergencias: [] };
    executando = true;
    try {
        const divergencias = await listarDivergenciasFinanceiras();
        const resumo = {
            total: divergencias.length,
            criticas: divergencias.filter(item => item.prioridade === 'critica').length,
            altas: divergencias.filter(item => item.prioridade === 'alta').length
        };
        if (opcoes.registrarEvento !== false) {
            await registrarEventoSistema('pagamento_conciliacao', resumo.total ? 'alerta' : 'info',
                resumo.total ? `Conciliação financeira encontrou ${resumo.total} divergência(s).` : 'Conciliação financeira concluída sem divergências.',
                { ...resumo, origem: opcoes.origem || 'manual' });
        }
        return { ignorada: false, divergencias, resumo, executadaEm: new Date().toISOString() };
    } finally { executando = false; }
}

function iniciarConciliacaoFinanceira(opcoes = {}) {
    if (agendador) return agendador;
    const executar = () => executarConciliacaoFinanceira({ origem: 'agendador' })
        .catch(err => registrarEventoSistema('pagamento_conciliacao', 'erro', `Falha na conciliação financeira: ${err.message}`, { origem: 'agendador' }).catch(() => {}));
    const atrasoInicialMs = Math.max(1000, Number(opcoes.atrasoInicialMs || 60000));
    const inicial = setTimeout(executar, atrasoInicialMs);
    inicial.unref?.();
    agendador = setInterval(executar, Math.max(60000, Number(opcoes.intervaloMs || INTERVALO_DIARIO_MS)));
    agendador.unref?.();
    return agendador;
}

module.exports = { listarDivergenciasFinanceiras, executarConciliacaoFinanceira, iniciarConciliacaoFinanceira, numeroMoeda };
