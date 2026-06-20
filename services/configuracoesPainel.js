const db = require('../database/sqlite');
const { criarHashSenha } = require('./passwordService');

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
        pixChave: process.env.CHAVE_PIX || '61319147704',
        pixNome: process.env.PIX_NOME || 'JULIAN PLAY',
        pixCidade: process.env.PIX_CIDADE || 'SAO PAULO',
        pixTxid: process.env.PIX_TXID || 'JULIANPLAY',
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

async function salvarConfiguracoesAcesso(dados = {}) {
    const usuario = String(dados.painelUsuario || '').trim();
    const senha = String(dados.painelSenha || '');
    const confirmarSenha = String(dados.painelConfirmarSenha || '');

    if (!usuario) {
        throw new Error('Informe o usuario de acesso ao painel.');
    }

    await salvarConfiguracao('painelUsuario', usuario);

    if (senha || confirmarSenha) {
        if (senha.length < 8) {
            throw new Error('A senha do painel precisa ter pelo menos 8 caracteres.');
        }

        if (senha !== confirmarSenha) {
            throw new Error('A confirmacao da senha nao confere.');
        }

        await salvarConfiguracao('painelSenhaHash', criarHashSenha(senha));
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

async function salvarConfiguracoesPix(dados = {}) {
    const chave = String(dados.pixChave || '').trim();
    const nome = String(dados.pixNome || '').trim();
    const cidade = String(dados.pixCidade || '').trim();
    const txid = String(dados.pixTxid || '').trim();

    if (!chave) {
        throw new Error('Informe a chave PIX que recebera os pagamentos.');
    }

    if (!nome) {
        throw new Error('Informe o nome do recebedor do PIX.');
    }

    if (!cidade) {
        throw new Error('Informe a cidade do recebedor do PIX.');
    }

    await salvarConfiguracao('pixChave', chave);
    await salvarConfiguracao('pixNome', nome);
    await salvarConfiguracao('pixCidade', cidade);
    await salvarConfiguracao('pixTxid', txid || 'JULIANPLAY');

    return obterConfiguracoes();
}

module.exports = {
    obterConfiguracoes,
    salvarConfiguracao,
    salvarConfiguracoesPainel,
    salvarConfiguracoesLicenca,
    salvarConfiguracoesPix,
    salvarConfiguracoesAcesso
};
