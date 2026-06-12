const db = require('../database/sqlite');

const planosPadrao = [
    ['Teste Grátis', 0, '0,00'],
    ['Mensal', 30, '35,00', 1],
    ['Trimestral', 90, '96,00', 1],
    ['Semestral', 180, '180,00', 1],
    ['Anual', 365, '336,00', 1]
];

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    }));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    }));
}

function limparTexto(valor) {
    return String(valor || '').trim();
}

function normalizarConexoes(valor) {
    const numero = Number.parseInt(valor || 1, 10);
    if (!Number.isFinite(numero)) return 1;
    return Math.min(2, Math.max(1, numero));
}

async function garantirPlanosPadrao() {
    for (const [nome, dias, valor, conexoes = 1] of planosPadrao) {
        await executar(
            'INSERT OR IGNORE INTO tipos_planos (nome, dias, valor, conexoes) VALUES (?, ?, ?, ?)',
            [nome, dias, valor, conexoes]
        );
    }
}

async function listarTiposPlanos() {
    await garantirPlanosPadrao();
    return buscarTodos('SELECT * FROM tipos_planos ORDER BY dias ASC, nome ASC');
}

async function buscarTipoPlanoPorId(id) {
    await garantirPlanosPadrao();
    return buscarUm('SELECT * FROM tipos_planos WHERE id = ?', [id]);
}

async function salvarTipoPlano(dados = {}) {
    const id = limparTexto(dados.id);
    const nome = limparTexto(dados.nome);
    const dias = Number(dados.dias);
    const valor = limparTexto(dados.valor);
    const conexoes = normalizarConexoes(dados.conexoes);

    if (!nome) throw new Error('Informe o nome do tipo de plano.');
    if (!Number.isFinite(dias) || dias < 0) throw new Error('Informe a quantidade de dias.');

    if (id) {
        await executar(
            `UPDATE tipos_planos SET
                nome = ?,
                dias = ?,
                valor = ?,
                conexoes = ?,
                ativo = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [nome, dias, valor, conexoes, dados.ativo === '0' ? 0 : 1, id]
        );

        return buscarTipoPlanoPorId(id);
    }

    const resultado = await executar(
        'INSERT INTO tipos_planos (nome, dias, valor, conexoes, ativo) VALUES (?, ?, ?, ?, ?)',
        [nome, dias, valor, conexoes, dados.ativo === '0' ? 0 : 1]
    );

    return buscarTipoPlanoPorId(resultado.id);
}

function removerTipoPlano(id) {
    return executar('DELETE FROM tipos_planos WHERE id = ?', [id]);
}

module.exports = {
    listarTiposPlanos,
    buscarTipoPlanoPorId,
    salvarTipoPlano,
    removerTipoPlano
};
