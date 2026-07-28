const db = require('../database/sqlite');
const { proteger, revelar } = require('./cofreSegredosService');

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
    'Painel 1',
    'Painel 2'
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

async function seedJaProcessado(chave, tabela) {
    const marcado = await buscarUm('SELECT valor FROM configuracoes WHERE chave = ?', [chave]);
    if (marcado) return true;

    const resultado = await buscarUm(`SELECT COUNT(*) AS total FROM ${tabela}`);
    if (Number(resultado?.total || 0) > 0) {
        await marcarSeedProcessado(chave);
        return true;
    }

    return false;
}

function marcarSeedProcessado(chave) {
    return executar(
        `INSERT INTO configuracoes (chave, valor, atualizadoEm)
         VALUES (?, '1', CURRENT_TIMESTAMP)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizadoEm = CURRENT_TIMESTAMP`,
        [chave]
    );
}

async function garantirAppsPadrao() {
    if (await seedJaProcessado('seed_catalogo_apps', 'apps')) return;

    for (const [nome, descricao] of appsPadrao) {
        await executar(
            'INSERT OR IGNORE INTO apps (nome, descricao) VALUES (?, ?)',
            [nome, descricao]
        );
    }

    await marcarSeedProcessado('seed_catalogo_apps');
}

async function garantirDispositivosPadrao() {
    if (await seedJaProcessado('seed_catalogo_dispositivos', 'dispositivos')) return;

    for (const nome of dispositivosPadrao) {
        await executar(
            'INSERT OR IGNORE INTO dispositivos (nome) VALUES (?)',
            [nome]
        );
    }

    await marcarSeedProcessado('seed_catalogo_dispositivos');
}

async function garantirPaineisPadrao() {
    if (await seedJaProcessado('seed_catalogo_paineis', 'paineis')) return;

    for (const nome of paineisPadrao) {
        await executar(
            'INSERT OR IGNORE INTO paineis (nome) VALUES (?)',
            [nome]
        );
    }

    await marcarSeedProcessado('seed_catalogo_paineis');
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
    const paineis = await buscarTodos('SELECT * FROM paineis ORDER BY nome ASC');
    return paineis.map(revelarPainel);
}

async function buscarPainelPorId(id) {
    await garantirPaineisPadrao();
    return revelarPainel(await buscarUm('SELECT * FROM paineis WHERE id = ?', [id]));
}

function revelarPainel(painel) {
    if (!painel) return painel;
    return { ...painel,
        apiUsuario: revelar('painel.apiUsuario', painel.apiUsuario || ''),
        apiToken: revelar('painel.apiToken', painel.apiToken || '')
    };
}

async function salvarPainel(dados = {}) {
    const id = limparTexto(dados.id);
    const nome = limparTexto(dados.nome);
    const tipoIntegracao = limparTexto(dados.tipoIntegracao) || 'rest_json';
    const apiUrl = limparTexto(dados.apiUrl);
    const apiUsuario = limparTexto(dados.apiUsuario);
    const produtoPadrao = limparTexto(dados.produtoPadrao);
    const renovacaoAutomatica = String(dados.renovacaoAutomatica || '0') === '1' ? 1 : 0;
    const timeoutSegundos = Math.max(3, Math.min(60, Number(dados.timeoutSegundos || 15)));
    const maxTentativas = Math.max(1, Math.min(10, Number(dados.maxTentativas || 5)));

    if (!nome) throw new Error('Informe o nome do painel.');
    if (apiUrl && !/^https?:\/\//i.test(apiUrl)) throw new Error('A URL da API precisa iniciar com http:// ou https://.');

    if (id) {
        const atual = await buscarPainelPorId(id);
        const apiToken = limparTexto(dados.apiToken) || atual?.apiToken || '';
        await executar(
            `UPDATE paineis SET
                nome = ?,
                ativo = ?,
                tipoIntegracao = ?, apiUrl = ?, apiUsuario = ?, apiToken = ?, produtoPadrao = ?,
                renovacaoAutomatica = ?, timeoutSegundos = ?, maxTentativas = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [nome, dados.ativo === '0' ? 0 : 1, tipoIntegracao, apiUrl, proteger('painel.apiUsuario', apiUsuario), proteger('painel.apiToken', apiToken), produtoPadrao,
                renovacaoAutomatica, timeoutSegundos, maxTentativas, id]
        );

        return buscarPainelPorId(id);
    }

    const resultado = await executar(
        `INSERT INTO paineis (nome, ativo, tipoIntegracao, apiUrl, apiUsuario, apiToken, produtoPadrao,
            renovacaoAutomatica, timeoutSegundos, maxTentativas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, dados.ativo === '0' ? 0 : 1, tipoIntegracao, apiUrl, proteger('painel.apiUsuario', apiUsuario), proteger('painel.apiToken', limparTexto(dados.apiToken)),
            produtoPadrao, renovacaoAutomatica, timeoutSegundos, maxTentativas]
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
