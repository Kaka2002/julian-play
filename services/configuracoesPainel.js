const db = require('../database/sqlite');

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

async function obterConfiguracoes() {
    const rows = await buscarTodos('SELECT chave, valor FROM configuracoes');
    const config = {
        nomeSistema: 'Controle de Cliente IPTV e P2P',
        logoUrl: '',
        licencaCliente: '',
        licencaTelefone: '',
        licencaAtivacao: '',
        licencaVencimento: '',
        licencaObservacoes: ''
    };

    rows.forEach((row) => {
        config[row.chave] = row.valor || '';
    });

    return config;
}

function salvarConfiguracao(chave, valor) {
    return executar(
        `INSERT INTO configuracoes (chave, valor, atualizadoEm)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chave) DO UPDATE SET
            valor = excluded.valor,
            atualizadoEm = CURRENT_TIMESTAMP`,
        [chave, valor]
    );
}

async function salvarConfiguracoesPainel(dados = {}) {
    await salvarConfiguracao('nomeSistema', dados.nomeSistema || 'Controle de Cliente IPTV e P2P');
    await salvarConfiguracao('logoUrl', dados.logoUrl || '');

    return obterConfiguracoes();
}

async function salvarConfiguracoesLicenca(dados = {}) {
    await salvarConfiguracao('licencaCliente', dados.licencaCliente || '');
    await salvarConfiguracao('licencaTelefone', dados.licencaTelefone || '');
    await salvarConfiguracao('licencaAtivacao', dados.licencaAtivacao || '');
    await salvarConfiguracao('licencaVencimento', dados.licencaVencimento || '');
    await salvarConfiguracao('licencaObservacoes', dados.licencaObservacoes || '');

    return obterConfiguracoes();
}

module.exports = {
    obterConfiguracoes,
    salvarConfiguracoesPainel,
    salvarConfiguracoesLicenca
};
