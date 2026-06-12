const db = require('../database/sqlite');

const appsPadrao = [
    ['4K IPTV', 'Painel Sigma Genial, TV LG, TV SAMSUNG, TV ROKU'],
    ['AUTHENTIC PRO (PORTAL)', 'Painel Authentic, TV SAMSUNG, TV LG'],
    ['BRASIL IPTV', 'Painel WPLAY, TV SAMSUNG, TV LG'],
    ['DREAM TV', 'Painel Sigma Genial, TV LG, TV SAMSUNG'],
    ['FUN PLAY', 'Painel TVS ZUMI, TV SAMSUNG'],
    ['GENIAL IBO PRO', 'Painel Office Genial'],
    ['IBO PLAYER PRO', 'Painel Sigma Genial, CELULAR IPHONE'],
    ['WPLAY', 'Painel WPlay, TV LG, TV BOX ANDROID'],
    ['XCLOUD TV', 'Painel WPLAY, TV SAMSUNG, BTV 10']
];

const dispositivosPadrao = [
    'BTV 10',
    'BTV 11',
    'BTV 13',
    'CELULAR ANDROID',
    'CELULAR IOS',
    'TABLET IOS',
    'TV BOX',
    'TV LG',
    'TV PHILCO',
    'TV PHILLIPS',
    'TV ROKU',
    'TV SAMSUNG'
];

const paineisPadrao = [
    'Painel Aura TV+',
    'Painel Authentic',
    'Painel Office Genial',
    'Painel Sigma Genial',
    'Painel Souiptv',
    'Painel TVS Zumi',
    'Painel Wplay'
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

async function garantirAppsPadrao() {
    for (const [nome, descricao] of appsPadrao) {
        await executar(
            'INSERT OR IGNORE INTO apps (nome, descricao) VALUES (?, ?)',
            [nome, descricao]
        );
    }
}

async function garantirDispositivosPadrao() {
    for (const nome of dispositivosPadrao) {
        await executar(
            'INSERT OR IGNORE INTO dispositivos (nome) VALUES (?)',
            [nome]
        );
    }
}

async function garantirPaineisPadrao() {
    for (const nome of paineisPadrao) {
        await executar(
            'INSERT OR IGNORE INTO paineis (nome, conexoes) VALUES (?, ?)',
            [nome, 1]
        );
    }
}

async function listarApps() {
    await garantirAppsPadrao();
    return buscarTodos('SELECT * FROM apps ORDER BY nome ASC');
}

async function buscarAppPorId(id) {
    await garantirAppsPadrao();
    return buscarUm('SELECT * FROM apps WHERE id = ?', [id]);
}

async function salvarApp(dados = {}) {
    const id = limparTexto(dados.id);
    const nome = limparTexto(dados.nome);
    const descricao = limparTexto(dados.descricao);

    if (!nome) throw new Error('Informe o nome do app.');

    if (id) {
        await executar(
            `UPDATE apps SET
                nome = ?,
                descricao = ?,
                ativo = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [nome, descricao, dados.ativo === '0' ? 0 : 1, id]
        );

        return buscarAppPorId(id);
    }

    const resultado = await executar(
        'INSERT INTO apps (nome, descricao, ativo) VALUES (?, ?, ?)',
        [nome, descricao, dados.ativo === '0' ? 0 : 1]
    );

    return buscarAppPorId(resultado.id);
}

function removerApp(id) {
    return executar('DELETE FROM apps WHERE id = ?', [id]);
}

async function listarDispositivos() {
    await garantirDispositivosPadrao();
    return buscarTodos('SELECT * FROM dispositivos ORDER BY nome ASC');
}

async function buscarDispositivoPorId(id) {
    await garantirDispositivosPadrao();
    return buscarUm('SELECT * FROM dispositivos WHERE id = ?', [id]);
}

async function salvarDispositivo(dados = {}) {
    const id = limparTexto(dados.id);
    const nome = limparTexto(dados.nome);

    if (!nome) throw new Error('Informe o nome do dispositivo.');

    if (id) {
        await executar(
            `UPDATE dispositivos SET
                nome = ?,
                ativo = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [nome, dados.ativo === '0' ? 0 : 1, id]
        );

        return buscarDispositivoPorId(id);
    }

    const resultado = await executar(
        'INSERT INTO dispositivos (nome, ativo) VALUES (?, ?)',
        [nome, dados.ativo === '0' ? 0 : 1]
    );

    return buscarDispositivoPorId(resultado.id);
}

function removerDispositivo(id) {
    return executar('DELETE FROM dispositivos WHERE id = ?', [id]);
}

async function listarPaineis() {
    await garantirPaineisPadrao();
    return buscarTodos('SELECT * FROM paineis ORDER BY nome ASC');
}

async function buscarPainelPorId(id) {
    await garantirPaineisPadrao();
    return buscarUm('SELECT * FROM paineis WHERE id = ?', [id]);
}

async function salvarPainel(dados = {}) {
    const id = limparTexto(dados.id);
    const nome = limparTexto(dados.nome);
    const conexoes = normalizarConexoes(dados.conexoes);

    if (!nome) throw new Error('Informe o nome do painel.');

    if (id) {
        await executar(
            `UPDATE paineis SET
                nome = ?,
                conexoes = ?,
                ativo = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [nome, conexoes, dados.ativo === '0' ? 0 : 1, id]
        );

        return buscarPainelPorId(id);
    }

    const resultado = await executar(
        'INSERT INTO paineis (nome, conexoes, ativo) VALUES (?, ?, ?)',
        [nome, conexoes, dados.ativo === '0' ? 0 : 1]
    );

    return buscarPainelPorId(resultado.id);
}

function removerPainel(id) {
    return executar('DELETE FROM paineis WHERE id = ?', [id]);
}

module.exports = {
    listarApps,
    buscarAppPorId,
    salvarApp,
    removerApp,
    listarDispositivos,
    buscarDispositivoPorId,
    salvarDispositivo,
    removerDispositivo,
    listarPaineis,
    buscarPainelPorId,
    salvarPainel,
    removerPainel
};
