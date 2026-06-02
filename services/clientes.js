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

function normalizarTelefone(telefone) {
    const numeros = limparTexto(telefone).replace(/\D/g, '');

    if (!numeros) return '';
    if (numeros.startsWith('55')) return numeros;

    return `55${numeros}`;
}

function normalizarLista(valor) {
    if (Array.isArray(valor)) return valor.map(limparTexto).filter(Boolean);
    if (!valor) return [];
    return [limparTexto(valor)].filter(Boolean);
}

function serializarLista(valor) {
    return JSON.stringify(normalizarLista(valor));
}

function gerarCredenciais(telefone) {
    const numeros = telefone.replace(/\D/g, '').slice(-6) || Date.now().toString().slice(-6);

    return {
        usuario: `jp${numeros}`,
        senha: Math.random().toString(36).slice(2, 8).toUpperCase()
    };
}

function montarCliente(dados = {}) {
    const telefone = normalizarTelefone(dados.telefone);

    if (!limparTexto(dados.nome)) {
        throw new Error('Informe o nome do cliente.');
    }

    if (!telefone) {
        throw new Error('Informe o telefone do cliente.');
    }

    return {
        nome: limparTexto(dados.nome),
        telefone,
        usuario: limparTexto(dados.usuario),
        senha: limparTexto(dados.senha),
        plano: limparTexto(dados.plano),
        aparelho: limparTexto(dados.aparelho),
        vencimento: limparTexto(dados.dataVencimento || dados.vencimento).slice(0, 10),
        nascimento: limparTexto(dados.nascimento),
        tipoPlanoId: limparTexto(dados.tipoPlanoId),
        diasContrato: Number(dados.diasContrato || 0),
        valorPlano: limparTexto(dados.valorPlano),
        assinaturaApp: limparTexto(dados.assinaturaApp),
        validadeApp: limparTexto(dados.validadeApp),
        dataInicio: limparTexto(dados.dataInicio),
        dataVencimento: limparTexto(dados.dataVencimento),
        appsInstalados: serializarLista(dados.appsInstalados),
        dispositivosSelecionados: serializarLista(dados.dispositivosSelecionados),
        paineisSelecionados: serializarLista(dados.paineisSelecionados),
        appInstalado: dados.appInstalado ? 1 : 0,
        usuarioApp: limparTexto(dados.usuarioApp),
        senhaApp: limparTexto(dados.senhaApp),
        observacoes: limparTexto(dados.observacoes),
        status: limparTexto(dados.status) || 'ativo'
    };
}

function calcularVencimentoTeste() {
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 1);
    return vencimento.toISOString().slice(0, 10);
}

async function cadastrarOuAtualizarCliente({ telefone, nome, aparelho, plano = 'Teste gratis' }) {
    const telefoneNormalizado = normalizarTelefone(telefone);
    const clienteAtual = await buscarClientePorTelefone(telefoneNormalizado);
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
            telefoneNormalizado,
            credenciais.usuario,
            credenciais.senha,
            plano,
            aparelho,
            vencimento,
            'teste'
        ]
    );

    return buscarClientePorTelefone(telefoneNormalizado);
}

function buscarClientePorTelefone(telefone) {
    return buscarUm('SELECT * FROM clientes WHERE telefone = ?', [normalizarTelefone(telefone)]);
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

function listarClientes(filtros = {}) {
    const busca = limparTexto(filtros.busca);
    const status = limparTexto(filtros.status);
    const params = [];
    const where = [];

    if (busca) {
        where.push('(nome LIKE ? OR telefone LIKE ? OR usuario LIKE ? OR usuarioApp LIKE ? OR plano LIKE ?)');
        const termo = `%${busca}%`;
        params.push(termo, termo, termo, termo, termo);
    }

    if (status) {
        where.push('status = ?');
        params.push(status);
    }

    return buscarTodos(
        `SELECT * FROM clientes
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY
            CASE WHEN vencimento IS NULL OR vencimento = '' THEN 1 ELSE 0 END,
            vencimento ASC,
            nome ASC`,
        params
    );
}

async function salvarCliente(dados) {
    const cliente = montarCliente(dados);

    if (dados.id) {
        await executar(
            `UPDATE clientes SET
                nome = ?,
                telefone = ?,
                usuario = ?,
                senha = ?,
                plano = ?,
                aparelho = ?,
                vencimento = ?,
                nascimento = ?,
                tipoPlanoId = ?,
                diasContrato = ?,
                valorPlano = ?,
                assinaturaApp = ?,
                validadeApp = ?,
                dataInicio = ?,
                dataVencimento = ?,
                appsInstalados = ?,
                dispositivosSelecionados = ?,
                paineisSelecionados = ?,
                appInstalado = ?,
                usuarioApp = ?,
                senhaApp = ?,
                observacoes = ?,
                status = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
                cliente.nome,
                cliente.telefone,
                cliente.usuario,
                cliente.senha,
                cliente.plano,
                cliente.aparelho,
                cliente.vencimento,
                cliente.nascimento,
                cliente.tipoPlanoId,
                cliente.diasContrato,
                cliente.valorPlano,
                cliente.assinaturaApp,
                cliente.validadeApp,
                cliente.dataInicio,
                cliente.dataVencimento,
                cliente.appsInstalados,
                cliente.dispositivosSelecionados,
                cliente.paineisSelecionados,
                cliente.appInstalado,
                cliente.usuarioApp,
                cliente.senhaApp,
                cliente.observacoes,
                cliente.status,
                dados.id
            ]
        );

        return buscarClientePorId(dados.id);
    }

    const credenciais = gerarCredenciais(cliente.telefone);

    const resultado = await executar(
        `INSERT INTO clientes (
            nome, telefone, usuario, senha, plano, aparelho, vencimento,
            nascimento, tipoPlanoId, diasContrato, valorPlano, assinaturaApp,
            validadeApp, dataInicio, dataVencimento, appsInstalados,
            dispositivosSelecionados, paineisSelecionados, appInstalado,
            usuarioApp, senhaApp, observacoes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            cliente.nome,
            cliente.telefone,
            cliente.usuario || credenciais.usuario,
            cliente.senha || credenciais.senha,
            cliente.plano,
            cliente.aparelho,
            cliente.vencimento,
            cliente.nascimento,
            cliente.tipoPlanoId,
            cliente.diasContrato,
            cliente.valorPlano,
            cliente.assinaturaApp,
            cliente.validadeApp,
            cliente.dataInicio,
            cliente.dataVencimento,
            cliente.appsInstalados,
            cliente.dispositivosSelecionados,
            cliente.paineisSelecionados,
            cliente.appInstalado,
            cliente.usuarioApp,
            cliente.senhaApp,
            cliente.observacoes,
            cliente.status
        ]
    );

    return buscarClientePorId(resultado.id);
}

function buscarClientePorId(id) {
    return buscarUm('SELECT * FROM clientes WHERE id = ?', [id]);
}

function removerCliente(id) {
    return executar('DELETE FROM clientes WHERE id = ?', [id]);
}

function listarClientesParaAviso(dataLimite) {
    return buscarTodos(
        `SELECT * FROM clientes
        WHERE status IN ('ativo', 'teste')
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND date(vencimento) <= date(?)
            AND (
                ultimoAvisoRenovacao IS NULL
                OR ultimoAvisoRenovacao != vencimento
            )
        ORDER BY vencimento ASC`,
        [dataLimite]
    );
}

function registrarAvisoRenovacao(id, vencimento) {
    return executar(
        `UPDATE clientes SET
            ultimoAvisoRenovacao = ?,
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [vencimento, id]
    );
}

module.exports = {
    cadastrarOuAtualizarCliente,
    buscarClientePorTelefone,
    buscarClientePorNomeOuTelefone,
    listarClientes,
    salvarCliente,
    buscarClientePorId,
    removerCliente,
    listarClientesParaAviso,
    registrarAvisoRenovacao,
    normalizarTelefone
};
