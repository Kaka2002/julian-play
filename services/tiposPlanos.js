const db = require('../database/sqlite');

const planosPadrao = [
    ['Teste Grátis', 0, '0,00'],
    ['Mensal', 30, ''],
    ['Trimestral', 90, ''],
    ['Semestral', 180, ''],
    ['Anual', 365, '']
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

async function seedPlanosJaProcessado() {
    const marcado = await buscarUm('SELECT valor FROM configuracoes WHERE chave = ?', ['seed_catalogo_planos']);
    if (marcado) return true;

    const resultado = await buscarUm('SELECT COUNT(*) AS total FROM tipos_planos');
    if (Number(resultado?.total || 0) > 0) {
        await marcarSeedPlanosProcessado();
        return true;
    }

    return false;
}

function marcarSeedPlanosProcessado() {
    return executar(
        `INSERT INTO configuracoes (chave, valor, atualizadoEm)
         VALUES ('seed_catalogo_planos', '1', CURRENT_TIMESTAMP)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizadoEm = CURRENT_TIMESTAMP`
    );
}

async function garantirPlanosPadrao() {
    if (await seedPlanosJaProcessado()) return;

    for (const [nome, dias, valor] of planosPadrao) {
        await executar(
            'INSERT OR IGNORE INTO tipos_planos (nome, dias, valor) VALUES (?, ?, ?)',
            [nome, dias, valor]
        );
    }

    await marcarSeedPlanosProcessado();
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

    if (!nome) throw new Error('Informe o nome do tipo de plano.');
    if (!Number.isFinite(dias) || dias < 0) throw new Error('Informe a quantidade de dias.');

    if (id) {
        await executar(
            `UPDATE tipos_planos SET
                nome = ?,
                dias = ?,
                valor = ?,
                ativo = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [nome, dias, valor, dados.ativo === '0' ? 0 : 1, id]
        );

        return buscarTipoPlanoPorId(id);
    }

    const resultado = await executar(
        'INSERT INTO tipos_planos (nome, dias, valor, ativo) VALUES (?, ?, ?, ?)',
        [nome, dias, valor, dados.ativo === '0' ? 0 : 1]
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
