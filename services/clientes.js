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
    const ddi = limparTexto(dados.ddiTelefone).replace(/\D/g, '');
    const numero = limparTexto(dados.telefone).replace(/\D/g, '');
    const telefone = normalizarTelefone(ddi ? `${ddi}${numero}` : dados.telefone);

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
        horasTeste: limparTexto(dados.horasTeste),
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

function parseValidadeTeste(valor) {
    const texto = limparTexto(valor).replace(/\s+às\s+/i, ' ').replace(/\s+as\s+/i, ' ');
    const isoMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)?(\d{2})?:?(\d{2})?/);

    if (isoMatch) {
        const [, ano, mes, dia, horaBruta = '23', minutoBruto = '59'] = isoMatch;
        const vencimento = `${ano}-${mes}-${dia}`;

        return {
            vencimento,
            dataVencimento: `${vencimento}T${horaBruta || '23'}:${minutoBruto || '59'}`
        };
    }

    const match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);

    if (!match) return {};

    const [, diaBruto, mesBruto, anoBruto, horaBruta = '23', minutoBruto = '59'] = match;
    const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
    const mes = mesBruto.padStart(2, '0');
    const dia = diaBruto.padStart(2, '0');
    const hora = horaBruta.padStart(2, '0');
    const minuto = minutoBruto.padStart(2, '0');
    const vencimento = `${ano}-${mes}-${dia}`;

    return {
        vencimento,
        dataVencimento: `${vencimento}T${hora}:${minuto}`
    };
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

async function cadastrarTesteLiberadoPorAtendente(dados = {}) {
    const telefone = normalizarTelefone(dados.telefone);
    const nome = limparTexto(dados.nome);
    const aparelho = limparTexto(dados.aparelho);
    const aplicativo = limparTexto(dados.aplicativo);
    const painel = limparTexto(dados.painel);
    const usuario = limparTexto(dados.usuario);
    const senha = limparTexto(dados.senha);
    const validade = parseValidadeTeste(dados.validade);
    const inicio = parseValidadeTeste(dados.dataInicio);
    const dataInicio = inicio.dataVencimento || limparTexto(dados.dataInicio);

    if (!telefone || !nome || !aparelho || !usuario || !senha) {
        return null;
    }

    const clienteAtual = await buscarClientePorTelefone(telefone);
    const vencimento = validade.vencimento || clienteAtual?.vencimento || calcularVencimentoTeste();
    const dataVencimento = validade.dataVencimento || clienteAtual?.dataVencimento || `${vencimento}T23:59`;
    const dispositivosSelecionados = JSON.stringify([aparelho]);
    const appsInstalados = aplicativo ? JSON.stringify([aplicativo]) : clienteAtual?.appsInstalados || JSON.stringify([]);
    const paineisSelecionados = painel ? JSON.stringify([painel]) : clienteAtual?.paineisSelecionados || JSON.stringify([]);

    if (clienteAtual) {
        await executar(
            `UPDATE clientes SET
                nome = ?,
                usuario = ?,
                senha = ?,
                plano = ?,
                aparelho = ?,
                vencimento = ?,
                dataInicio = COALESCE(NULLIF(?, ''), dataInicio),
                dataVencimento = ?,
                appsInstalados = ?,
                dispositivosSelecionados = ?,
                paineisSelecionados = ?,
                appInstalado = ?,
                status = ?,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
                nome,
                usuario,
                senha,
                'Teste grátis',
                aparelho,
                vencimento,
                dataInicio,
                dataVencimento,
                appsInstalados,
                dispositivosSelecionados,
                paineisSelecionados,
                aplicativo ? 1 : clienteAtual.appInstalado || 0,
                'teste',
                clienteAtual.id
            ]
        );

        return buscarClientePorId(clienteAtual.id);
    }

    const resultado = await executar(
        `INSERT INTO clientes (
            nome, telefone, usuario, senha, plano, aparelho, vencimento,
            dataInicio, dataVencimento, appsInstalados, dispositivosSelecionados,
            paineisSelecionados, appInstalado, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?)`,
        [
            nome,
            telefone,
            usuario,
            senha,
            'Teste grátis',
            aparelho,
            vencimento,
            dataInicio,
            dataVencimento,
            appsInstalados,
            dispositivosSelecionados,
            paineisSelecionados,
            aplicativo ? 1 : 0,
            'teste'
        ]
    );

    return buscarClientePorId(resultado.id);
}

function buscarClientePorTelefone(telefone) {
    return buscarUm('SELECT * FROM clientes WHERE telefone = ?', [normalizarTelefone(telefone)]);
}

function buscarClientePorNomeOuTelefone(valor) {
    const termo = `%${valor}%`;

    return buscarUm(
        `SELECT * FROM clientes
        WHERE telefone LIKE ?
            OR nome LIKE ?
            OR usuario LIKE ?
            OR usuarioApp LIKE ?
            OR paineisSelecionados LIKE ?
        ORDER BY atualizadoEm DESC
        LIMIT 1`,
        [termo, termo, termo, termo, termo]
    );
}

function buscarClientePorUsuarioIPTV(usuario) {
    return buscarUm('SELECT * FROM clientes WHERE usuario = ? LIMIT 1', [limparTexto(usuario)]);
}

async function atualizarStatusAutomaticoClientes() {
    const hoje = new Date().toISOString().slice(0, 10);

    await executar(
        `UPDATE clientes SET
            status = 'expirado',
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE status IN ('ativo', 'pendente', 'teste')
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND date(vencimento) < date(?)`,
        [hoje]
    );

    await executar(
        `UPDATE clientes SET
            status = 'ativo',
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE status = 'expirado'
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND date(vencimento) >= date(?)`,
        [hoje]
    );
}

async function listarClientes(filtros = {}) {
    await atualizarStatusAutomaticoClientes();

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

    const limite = Number(filtros.limite || 0);
    const limiteSql = limite > 0 ? 'LIMIT ?' : '';
    if (limite > 0) params.push(limite);

    return buscarTodos(
        `SELECT * FROM clientes
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY nome COLLATE NOCASE ASC
        ${limiteSql}`,
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
                horasTeste = ?,
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
                cliente.horasTeste,
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
            validadeApp, horasTeste, dataInicio, dataVencimento, appsInstalados,
            dispositivosSelecionados, paineisSelecionados, appInstalado,
            usuarioApp, senhaApp, observacoes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            cliente.horasTeste,
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
    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `SELECT * FROM clientes
        WHERE status IN ('ativo', 'teste', 'pendente', 'expirado')
            AND vencimento IS NOT NULL
            AND vencimento != ''
            AND date(vencimento) <= date(?)
            AND (
                ultimoAvisoRenovacao IS NULL
                OR ultimoAvisoRenovacao != vencimento
            )
        ORDER BY vencimento ASC`,
        [dataLimite]
    ));
}

function hojeSaoPauloISO() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function listarClientesParaAvisosProgramados() {
    const hoje = hojeSaoPauloISO();

    return atualizarStatusAutomaticoClientes().then(() => buscarTodos(
        `WITH candidatos AS (
            SELECT
                clientes.*,
                CAST(julianday(date(vencimento)) - julianday(date(?)) AS INTEGER) AS diasAntes
            FROM clientes
            WHERE status IN ('ativo', 'teste', 'pendente')
                AND vencimento IS NOT NULL
                AND vencimento != ''
        )
        SELECT * FROM candidatos
        WHERE diasAntes IN (0, 1, 2)
            AND NOT EXISTS (
                SELECT 1 FROM avisos_renovacao
                WHERE avisos_renovacao.clienteId = candidatos.id
                    AND avisos_renovacao.vencimento = candidatos.vencimento
                    AND avisos_renovacao.diasAntes = candidatos.diasAntes
            )
        ORDER BY diasAntes DESC, nome ASC`,
        [hoje]
    ));
}

function listarClientesParaAvisoAntigo(dataLimite) {
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

function listarClientesAniversarioHoje(ano) {
    const hoje = new Date();
    const mesDia = hoje.toISOString().slice(5, 10);

    return buscarTodos(
        `SELECT * FROM clientes
        WHERE nascimento IS NOT NULL
            AND nascimento != ''
            AND substr(nascimento, 6, 5) = ?
            AND status NOT IN ('cancelado', 'suspenso')
            AND (
                ultimoAvisoAniversario IS NULL
                OR ultimoAvisoAniversario != ?
            )
        ORDER BY nome ASC`,
        [mesDia, String(ano)]
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

async function registrarAvisoRenovacaoProgramado(id, vencimento, diasAntes) {
    await executar(
        `INSERT OR IGNORE INTO avisos_renovacao (clienteId, vencimento, diasAntes)
        VALUES (?, ?, ?)`,
        [id, vencimento, Number(diasAntes)]
    );

    return registrarAvisoRenovacao(id, `${vencimento}:${diasAntes}`);
}

function registrarAvisoAniversario(id, ano) {
    return executar(
        `UPDATE clientes SET
            ultimoAvisoAniversario = ?,
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [String(ano), id]
    );
}

module.exports = {
    cadastrarOuAtualizarCliente,
    buscarClientePorTelefone,
    buscarClientePorNomeOuTelefone,
    buscarClientePorUsuarioIPTV,
    cadastrarTesteLiberadoPorAtendente,
    listarClientes,
    salvarCliente,
    buscarClientePorId,
    removerCliente,
    listarClientesParaAviso,
    listarClientesParaAvisosProgramados,
    listarClientesAniversarioHoje,
    registrarAvisoRenovacao,
    registrarAvisoRenovacaoProgramado,
    registrarAvisoAniversario,
    atualizarStatusAutomaticoClientes,
    normalizarTelefone
};
