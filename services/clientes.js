const db = require('../database/sqlite');

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
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    }));
}

function gerarCredenciais(telefone) {
    const numeros = telefone.replace(/\D/g, '').slice(-6) || Date.now().toString().slice(-6);

    return {
        usuario: `jp${numeros}`,
        senha: Math.random().toString(36).slice(2, 8).toUpperCase()
    };
}

function calcularVencimentoTeste() {
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 1);
    return vencimento.toISOString().slice(0, 10);
}

async function cadastrarOuAtualizarCliente({ telefone, nome, aparelho, plano = 'Teste gratis' }) {
    const clienteAtual = await buscarClientePorTelefone(telefone);
    const credenciais = clienteAtual || gerarCredenciais(telefone);
    const vencimento = clienteAtual?.vencimento || calcularVencimentoTeste();

    await executar(
        `INSERT INTO clientes (
            nome, telefone, usuario, senha, plano, aparelho, vencimento, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(telefone) DO UPDATE SET
            nome = excluded.nome,
            usuario = COALESCE(clientes.usuario, excluded.usuario),
            senha = COALESCE(clientes.senha, excluded.senha),
            plano = excluded.plano,
            aparelho = excluded.aparelho,
            vencimento = COALESCE(clientes.vencimento, excluded.vencimento),
            status = excluded.status,
            atualizadoEm = CURRENT_TIMESTAMP`,
        [
            nome,
            telefone,
            credenciais.usuario,
            credenciais.senha,
            plano,
            aparelho,
            vencimento,
            'teste'
        ]
    );

    return buscarClientePorTelefone(telefone);
}

function buscarClientePorTelefone(telefone) {
    return buscarUm('SELECT * FROM clientes WHERE telefone = ?', [telefone]);
}

function buscarClientePorNomeOuTelefone(valor) {
    const termo = `%${valor}%`;

    return buscarUm(
        `SELECT * FROM clientes
        WHERE telefone LIKE ? OR nome LIKE ?
        ORDER BY atualizadoEm DESC
        LIMIT 1`,
        [termo, termo]
    );
}

module.exports = {
    cadastrarOuAtualizarCliente,
    buscarClientePorTelefone,
    buscarClientePorNomeOuTelefone
};
