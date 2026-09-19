const db = require('../database/sqlite');
const { registrarEventoSistema } = require('./eventosSistema');

const CATEGORIAS = ['Aplicativos', 'Painéis', 'Infraestrutura', 'Marketing', 'Equipamentos', 'Serviços', 'Impostos', 'Outros'];

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

function limparTexto(valor, limite = 500) {
    return String(valor || '').trim().slice(0, limite);
}

function normalizarValor(valor) {
    const texto = limparTexto(valor, 32).replace(/R\$\s*/gi, '').replace(/\s/g, '');
    const normalizado = texto.includes(',')
        ?texto.replace(/\./g, '').replace(',', '.')
        : texto;
    const numero = Number(normalizado);
    if (!Number.isFinite(numero) || numero <= 0 || numero > 100000000) {
        throw new Error('Informe um valor de despesa válido e maior que zero.');
    }
    return numero.toFixed(2).replace('.', ',');
}

function validarDados(dados = {}) {
    const descricao = limparTexto(dados.descricao, 160);
    const categoriaInformada = limparTexto(dados.categoria, 60);
    const categoria = CATEGORIAS.includes(categoriaInformada) ?categoriaInformada : 'Outros';
    const dataPagamento = limparTexto(dados.dataPagamento, 10);

    if (!descricao) throw new Error('Informe a descrição da despesa.');
    const partesData = dataPagamento.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dataUtc = partesData ?new Date(Date.UTC(Number(partesData[1]), Number(partesData[2]) - 1, Number(partesData[3]))) : null;
    const dataValida = dataUtc
        && dataUtc.getUTCFullYear() === Number(partesData[1])
        && dataUtc.getUTCMonth() === Number(partesData[2]) - 1
        && dataUtc.getUTCDate() === Number(partesData[3]);
    if (!dataValida) {
        throw new Error('Informe uma data de pagamento válida.');
    }

    return {
        descricao,
        categoria,
        valor: normalizarValor(dados.valor),
        dataPagamento,
        formaPagamento: limparTexto(dados.formaPagamento, 80),
        observacoes: limparTexto(dados.observacoes, 1000)
    };
}

function listarDespesasFinanceiras(filtros = {}) {
    const mes = limparTexto(filtros.mes, 7);
    const status = limparTexto(filtros.status, 16) || 'validas';
    const busca = limparTexto(filtros.busca, 160);
    const where = [];
    const params = [];

    if (status === 'removidas') {
        where.push("excluidoEm IS NOT NULL AND excluidoEm != ''");
    } else if (status !== 'todas') {
        where.push("(excluidoEm IS NULL OR excluidoEm = '')");
    }
    if (/^\d{4}-\d{2}$/.test(mes)) {
        where.push('substr(dataPagamento, 1, 7) = ?');
        params.push(mes);
    }
    if (busca) {
        where.push('(descricao LIKE ? OR categoria LIKE ? OR formaPagamento LIKE ? OR observacoes LIKE ?)');
        const termo = `%${busca}%`;
        params.push(termo, termo, termo, termo);
    }

    return buscarTodos(`SELECT * FROM despesas_financeiras ${where.length ?`WHERE ${where.join(' AND ')}` : ''} ORDER BY dataPagamento DESC, id DESC`, params);
}

function buscarDespesaFinanceiraPorId(id, incluirRemovida = true) {
    const filtroRemovida = incluirRemovida ?'' : " AND (excluidoEm IS NULL OR excluidoEm = '')";
    return buscarUm(`SELECT * FROM despesas_financeiras WHERE id = ?${filtroRemovida}`, [Number(id)]);
}

async function criarDespesaFinanceira(dados = {}, responsavel = '') {
    const despesa = validarDados(dados);
    const resultado = await executar(
        `INSERT INTO despesas_financeiras (descricao, categoria, valor, dataPagamento, formaPagamento, observacoes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [despesa.descricao, despesa.categoria, despesa.valor, despesa.dataPagamento, despesa.formaPagamento, despesa.observacoes]
    );
    await registrarEventoSistema('despesa_financeira', 'info', 'Despesa financeira registrada.', {
        despesaId: resultado.id, descricao: despesa.descricao, categoria: despesa.categoria, valor: despesa.valor,
        responsavel: limparTexto(responsavel, 120)
    });
    return buscarDespesaFinanceiraPorId(resultado.id);
}

async function atualizarDespesaFinanceira(id, dados = {}, responsavel = '') {
    const despesa = validarDados(dados);
    const resultado = await executar(
        `UPDATE despesas_financeiras SET descricao = ?, categoria = ?, valor = ?, dataPagamento = ?, formaPagamento = ?, observacoes = ?, atualizadoEm = CURRENT_TIMESTAMP
         WHERE id = ? AND (excluidoEm IS NULL OR excluidoEm = '')`,
        [despesa.descricao, despesa.categoria, despesa.valor, despesa.dataPagamento, despesa.formaPagamento, despesa.observacoes, Number(id)]
    );
    if (!resultado.changes) throw new Error('Despesa não encontrada ou já removida.');
    await registrarEventoSistema('despesa_financeira', 'info', 'Despesa financeira atualizada.', {
        despesaId: Number(id), descricao: despesa.descricao, responsavel: limparTexto(responsavel, 120)
    });
    return buscarDespesaFinanceiraPorId(id);
}

async function removerDespesaFinanceira(id, responsavel = '') {
    const resultado = await executar(
        `UPDATE despesas_financeiras SET excluidoEm = ?, excluidoPor = ?, atualizadoEm = CURRENT_TIMESTAMP
         WHERE id = ? AND (excluidoEm IS NULL OR excluidoEm = '')`,
        [new Date().toISOString(), limparTexto(responsavel, 120), Number(id)]
    );
    if (!resultado.changes) throw new Error('Despesa não encontrada ou já removida.');
    await registrarEventoSistema('despesa_financeira', 'alerta', 'Despesa financeira removida do resumo.', {
        despesaId: Number(id), responsavel: limparTexto(responsavel, 120)
    });
}

module.exports = {
    CATEGORIAS,
    listarDespesasFinanceiras,
    buscarDespesaFinanceiraPorId,
    criarDespesaFinanceira,
    atualizarDespesaFinanceira,
    removerDespesaFinanceira
};
