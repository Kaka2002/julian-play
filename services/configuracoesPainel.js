const db = require('../database/sqlite');
const crypto = require('crypto');

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
        licencaObservacoes: '',
        painelUsuario: '',
        painelSenhaHash: ''
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

function hashSenhaPainel(senha) {
    return crypto.createHash('sha256').update(String(senha || '')).digest('hex');
}

async function salvarConfiguracoesAcesso(dados = {}) {
    const usuario = String(dados.painelUsuario || '').trim();
    const senha = String(dados.painelSenha || '');
    const confirmarSenha = String(dados.painelConfirmarSenha || '');

    if (!usuario) {
        throw new Error('Informe o usuario de acesso ao painel.');
    }

    await salvarConfiguracao('painelUsuario', usuario);

    if (senha || confirmarSenha) {
        if (senha.length < 6) {
            throw new Error('A senha do painel precisa ter pelo menos 6 caracteres.');
        }

        if (senha !== confirmarSenha) {
            throw new Error('A confirmacao da senha nao confere.');
        }

        await salvarConfiguracao('painelSenhaHash', hashSenhaPainel(senha));
    }

    return obterConfiguracoes();
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
    salvarConfiguracao,
    salvarConfiguracoesPainel,
    salvarConfiguracoesLicenca,
    salvarConfiguracoesAcesso
};
