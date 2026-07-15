const db = require('../database/sqlite');

const STATUS_VALIDOS = new Set(['aberto', 'em_andamento', 'resolvido']);
const PRIORIDADES_VALIDAS = new Set(['normal', 'urgente']);
const MOTIVOS_VALIDOS = new Set([
    'instalacao',
    'travamento',
    'renovacao',
    'pagamento',
    'troca_app',
    'whatsapp',
    'outro'
]);

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

function normalizarStatus(valor) {
    const status = limparTexto(valor) || 'aberto';
    return STATUS_VALIDOS.has(status) ? status : 'aberto';
}

function normalizarPrioridade(valor) {
    const prioridade = limparTexto(valor) || 'normal';
    return PRIORIDADES_VALIDAS.has(prioridade) ? prioridade : 'normal';
}

function normalizarMotivo(valor) {
    const motivo = limparTexto(valor) || 'outro';
    return MOTIVOS_VALIDOS.has(motivo) ? motivo : 'outro';
}

function listarAtendimentos(filtros = {}) {
    const where = [];
    const params = [];
    const status = limparTexto(filtros.status || 'abertos');
    const busca = limparTexto(filtros.busca);

    if (status === 'abertos') {
        where.push("a.status IN ('aberto', 'em_andamento')");
    } else if (STATUS_VALIDOS.has(status)) {
        where.push('a.status = ?');
        params.push(status);
    }

    if (busca) {
        where.push('(c.nome LIKE ? OR c.telefone LIKE ? OR a.motivo LIKE ? OR a.descricao LIKE ?)');
        params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`);
    }

    return buscarTodos(
        `SELECT a.*, c.nome AS clienteNome, c.telefone AS clienteTelefone
        FROM cliente_atendimentos a
        INNER JOIN clientes c ON c.id = a.clienteId
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY
            CASE a.status WHEN 'aberto' THEN 0 WHEN 'em_andamento' THEN 1 ELSE 2 END,
            CASE a.prioridade WHEN 'urgente' THEN 0 ELSE 1 END,
            COALESCE(a.proximoContato, '') ASC,
            datetime(a.criadoEm) DESC`,
        params
    );
}

function listarAtendimentosCliente(clienteId) {
    return buscarTodos(
        `SELECT a.*, c.nome AS clienteNome, c.telefone AS clienteTelefone
        FROM cliente_atendimentos a
        INNER JOIN clientes c ON c.id = a.clienteId
        WHERE a.clienteId = ?
        ORDER BY datetime(a.criadoEm) DESC, a.id DESC`,
        [clienteId]
    );
}

function buscarAtendimentoPorId(id) {
    return buscarUm(
        `SELECT a.*, c.nome AS clienteNome, c.telefone AS clienteTelefone
        FROM cliente_atendimentos a
        INNER JOIN clientes c ON c.id = a.clienteId
        WHERE a.id = ?`,
        [id]
    );
}

async function criarAtendimento(dados = {}) {
    const clienteId = Number.parseInt(dados.clienteId, 10);
    const motivo = normalizarMotivo(dados.motivo);
    const prioridade = normalizarPrioridade(dados.prioridade);
    const descricao = limparTexto(dados.descricao);
    const proximoContato = limparTexto(dados.proximoContato).slice(0, 16);

    if (!Number.isFinite(clienteId) || clienteId <= 0) {
        throw new Error('Cliente invalido para abrir atendimento.');
    }

    const resultado = await executar(
        `INSERT INTO cliente_atendimentos (clienteId, motivo, prioridade, status, descricao, proximoContato)
        VALUES (?, ?, ?, 'aberto', ?, ?)`,
        [clienteId, motivo, prioridade, descricao, proximoContato]
    );

    return buscarAtendimentoPorId(resultado.id);
}

async function atualizarStatusAtendimento(id, status) {
    const statusFinal = normalizarStatus(status);
    const resolvidoEm = statusFinal === 'resolvido' ? new Date().toISOString() : '';

    await executar(
        `UPDATE cliente_atendimentos
        SET status = ?, resolvidoEm = ?, atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [statusFinal, resolvidoEm, id]
    );

    return buscarAtendimentoPorId(id);
}

async function removerAtendimento(id) {
    return executar('DELETE FROM cliente_atendimentos WHERE id = ?', [id]);
}

async function resumoAtendimentos() {
    const rows = await buscarTodos(
        `SELECT status, prioridade, COUNT(*) AS total
        FROM cliente_atendimentos
        GROUP BY status, prioridade`
    );

    const resumo = {
        abertos: 0,
        emAndamento: 0,
        resolvidos: 0,
        urgentes: 0
    };

    rows.forEach((row) => {
        const total = Number(row.total || 0);
        if (row.status === 'aberto') resumo.abertos += total;
        if (row.status === 'em_andamento') resumo.emAndamento += total;
        if (row.status === 'resolvido') resumo.resolvidos += total;
        if (row.status !== 'resolvido' && row.prioridade === 'urgente') resumo.urgentes += total;
    });

    return resumo;
}

module.exports = {
    listarAtendimentos,
    listarAtendimentosCliente,
    buscarAtendimentoPorId,
    criarAtendimento,
    atualizarStatusAtendimento,
    removerAtendimento,
    resumoAtendimentos,
    normalizarMotivo,
    normalizarPrioridade,
    normalizarStatus
};
