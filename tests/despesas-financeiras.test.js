const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

test('despesas financeiras registra, atualiza, filtra por mês e preserva remoção no histórico', () => {
    const { ambiente, stdout } = executarIsolado(`
        (async () => {
            const despesas = require('./services/despesasFinanceirasService');
            const criada = await despesas.criarDespesaFinanceira({ descricao: 'Hospedagem', categoria: 'Infraestrutura', valor: '120,50', dataPagamento: '2026-09-19', formaPagamento: 'PIX', observacoes: 'Mensal' }, 'teste');
            await despesas.atualizarDespesaFinanceira(criada.id, { descricao: 'Hospedagem mensal', categoria: 'Infraestrutura', valor: '130,00', dataPagamento: '2026-09-20', formaPagamento: 'Cartão', observacoes: 'Atualizada' }, 'teste');
            const validas = await despesas.listarDespesasFinanceiras({ mes: '2026-09', status: 'validas' });
            await despesas.removerDespesaFinanceira(criada.id, 'teste');
            const removidas = await despesas.listarDespesasFinanceiras({ mes: '2026-09', status: 'removidas' });
            console.log(JSON.stringify({ validas, removidas }));
        })().catch(err => { console.error(err); process.exit(1); });
    `);
    try {
        const resultado = JSON.parse(stdout.split(/\r?\n/).filter(Boolean).at(-1));
        assert.equal(resultado.validas.length, 1);
        assert.equal(resultado.validas[0].descricao, 'Hospedagem mensal');
        assert.equal(resultado.validas[0].valor, '130,00');
        assert.equal(resultado.removidas.length, 1);
        assert.ok(resultado.removidas[0].excluidoEm);
    } finally {
        removerAmbiente(ambiente);
    }
});

test('despesas financeiras rejeita valor ou data inválidos', () => {
    const { ambiente } = executarIsolado(`
        (async () => {
            const despesas = require('./services/despesasFinanceirasService');
            for (const dados of [{ descricao: 'Teste', valor: '0', dataPagamento: '2026-09-19' }, { descricao: 'Teste', valor: '10,00', dataPagamento: '2026-02-31' }]) {
                try { await despesas.criarDespesaFinanceira(dados); process.exit(2); } catch (_) {}
            }
        })().catch(err => { console.error(err); process.exit(1); });
    `);
    removerAmbiente(ambiente);
});
