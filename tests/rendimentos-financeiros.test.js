const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

test('rendimentos financeiros registra, atualiza, filtra por mês e preserva remoção no histórico', () => {
    const { ambiente, stdout } = executarIsolado(`
        (async () => {
            const rendimentos = require('./services/rendimentosFinanceirosService');
            const criado = await rendimentos.criarRendimentoFinanceiro({ descricao: 'Rendimento Mercado Pago', valor: '4,57', dataRecebimento: '2026-09-23', instituicao: 'Mercado Pago', observacoes: 'Crédito diário' }, 'teste');
            await rendimentos.atualizarRendimentoFinanceiro(criado.id, { descricao: 'Rendimento da conta', valor: '5,10', dataRecebimento: '2026-09-23', instituicao: 'Mercado Pago', observacoes: 'Atualizado' }, 'teste');
            const validos = await rendimentos.listarRendimentosFinanceiros({ mes: '2026-09', status: 'validos' });
            await rendimentos.removerRendimentoFinanceiro(criado.id, 'teste');
            const removidos = await rendimentos.listarRendimentosFinanceiros({ mes: '2026-09', status: 'removidos' });
            console.log(JSON.stringify({ validos, removidos }));
        })().catch(err => { console.error(err); process.exit(1); });
    `);
    try {
        const resultado = JSON.parse(stdout.split(/\r?\n/).filter(Boolean).at(-1));
        assert.equal(resultado.validos[0].valor, '5,10');
        assert.equal(resultado.validos[0].instituicao, 'Mercado Pago');
        assert.ok(resultado.removidos[0].excluidoEm);
    } finally { removerAmbiente(ambiente); }
});
