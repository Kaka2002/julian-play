const db = require('../database/sqlite');

const STATUS_LEAD = new Set([
    'novo',
    'em_conversa',
    'teste_liberado',
    'aguardando_pagamento',
    'ganho',
    'perdido'
]);
const PRIORIDADES = new Set(['normal', 'urgente']);

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
            resolve(rows || []);
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

function texto(valor) {
    return String(valor || '').trim();
}

function normalizarStatus(valor) {
    const status = texto(valor) || 'novo';
    return STATUS_LEAD.has(status) ? status : 'novo';
}

function normalizarPrioridade(valor) {
    const prioridade = texto(valor) || 'normal';
    return PRIORIDADES.has(prioridade) ? prioridade : 'normal';
}

function listarLeads(filtros = {}) {
    const where = [];
    const params = [];
    const status = texto(filtros.status || 'ativos');
    const busca = texto(filtros.busca);

    if (status === 'ativos') {
        where.push("l.status NOT IN ('ganho', 'perdido')");
    } else if (STATUS_LEAD.has(status)) {
        where.push('l.status = ?');
        params.push(status);
    }

    if (busca) {
        where.push('(l.nome LIKE ? OR l.telefone LIKE ? OR l.origem LIKE ? OR l.interesse LIKE ? OR l.observacoes LIKE ?)');
        params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`);
    }

    return buscarTodos(
        `SELECT l.*, c.nome AS clienteNome
        FROM leads l
        LEFT JOIN clientes c ON c.id = l.clienteId
        ${where.length ?`WHERE ${where.join(' AND ')}` : ''}
        ORDER BY
            CASE l.status
                WHEN 'aguardando_pagamento' THEN 0
                WHEN 'teste_liberado' THEN 1
                WHEN 'em_conversa' THEN 2
                WHEN 'novo' THEN 3
                WHEN 'ganho' THEN 4
                ELSE 5
            END,
            CASE l.prioridade WHEN 'urgente' THEN 0 ELSE 1 END,
            COALESCE(l.proximoContato, '') ASC,
            datetime(l.atualizadoEm) DESC`,
        params
    );
}

function buscarLeadPorId(id) {
    return buscarUm(
        `SELECT l.*, c.nome AS clienteNome
        FROM leads l
        LEFT JOIN clientes c ON c.id = l.clienteId
        WHERE l.id = ?`,
        [id]
    );
}

function listarHistoricoLead(leadId) {
    return buscarTodos(
        'SELECT * FROM lead_historico WHERE leadId = ? ORDER BY datetime(criadoEm) DESC, id DESC',
        [leadId]
    );
}

async function adicionarHistoricoLead(leadId, textoHistorico, tipo = 'nota') {
    const mensagem = texto(textoHistorico);
    if (!mensagem) return null;

    return executar(
        'INSERT INTO lead_historico (leadId, tipo, texto) VALUES (?, ?, ?)',
        [leadId, texto(tipo) || 'nota', mensagem]
    );
}

async function salvarLead(dados = {}) {
    const id = Number.parseInt(dados.id, 10);
    const payload = {
        nome: texto(dados.nome),
        telefone: texto(dados.telefone).replace(/\D/g, ''),
        origem: texto(dados.origem),
        interesse: texto(dados.interesse),
        status: normalizarStatus(dados.status),
        prioridade: normalizarPrioridade(dados.prioridade),
        valorEstimado: texto(dados.valorEstimado),
        proximoContato: texto(dados.proximoContato).slice(0, 16),
        motivoPerda: texto(dados.motivoPerda),
        observacoes: texto(dados.observacoes)
    };

    if (!payload.nome) {
        throw new Error('Informe o nome do lead.');
    }

    if (id) {
        const anterior = await buscarLeadPorId(id);
        await executar(
            `UPDATE leads
            SET nome = ?, telefone = ?, origem = ?, interesse = ?, status = ?, prioridade = ?,
                valorEstimado = ?, proximoContato = ?, motivoPerda = ?, observacoes = ?,
                ultimoContato = CASE WHEN status <> ? THEN CURRENT_TIMESTAMP ELSE ultimoContato END,
                perdidoEm = CASE WHEN ? = 'perdido' THEN COALESCE(perdidoEm, CURRENT_TIMESTAMP) ELSE perdidoEm END,
                atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
                payload.nome,
                payload.telefone,
                payload.origem,
                payload.interesse,
                payload.status,
                payload.prioridade,
                payload.valorEstimado,
                payload.proximoContato,
                payload.motivoPerda,
                payload.observacoes,
                payload.status,
                payload.status,
                id
            ]
        );

        if (anterior && anterior.status !== payload.status) {
            await adicionarHistoricoLead(id, `Status alterado de ${anterior.status} para ${payload.status}.`, 'status');
        }
        return buscarLeadPorId(id);
    }

    const resultado = await executar(
        `INSERT INTO leads
        (nome, telefone, origem, interesse, status, prioridade, valorEstimado, proximoContato, motivoPerda, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.nome,
            payload.telefone,
            payload.origem,
            payload.interesse,
            payload.status,
            payload.prioridade,
            payload.valorEstimado,
            payload.proximoContato,
            payload.motivoPerda,
            payload.observacoes
        ]
    );

    await adicionarHistoricoLead(resultado.id, 'Lead criado no CRM.', 'sistema');
    return buscarLeadPorId(resultado.id);
}

async function atualizarStatusLead(id, status, observacao = '') {
    const lead = await buscarLeadPorId(id);
    if (!lead) throw new Error('Lead nao encontrado.');

    const statusFinal = normalizarStatus(status);
    await executar(
        `UPDATE leads
        SET status = ?,
            ultimoContato = CURRENT_TIMESTAMP,
            perdidoEm = CASE WHEN ? = 'perdido' THEN COALESCE(perdidoEm, CURRENT_TIMESTAMP) ELSE perdidoEm END,
            atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [statusFinal, statusFinal, id]
    );

    await adicionarHistoricoLead(id, observacao || `Status alterado para ${statusFinal}.`, 'status');
    return buscarLeadPorId(id);
}

async function vincularLeadAoCliente(id, clienteId) {
    await executar(
        `UPDATE leads
        SET status = 'ganho', clienteId = ?, convertidoEm = COALESCE(convertidoEm, CURRENT_TIMESTAMP),
            ultimoContato = CURRENT_TIMESTAMP, atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [clienteId, id]
    );
    await adicionarHistoricoLead(id, `Lead convertido em cliente #${clienteId}.`, 'conversao');
    return buscarLeadPorId(id);
}

async function removerLead(id) {
    return executar('DELETE FROM leads WHERE id = ?', [id]);
}

async function resumoCrm() {
    const rows = await buscarTodos('SELECT status, prioridade, COUNT(*) AS total FROM leads GROUP BY status, prioridade');
    const vencendo = await buscarTodos(
        `SELECT COUNT(*) AS total
        FROM leads
        WHERE status NOT IN ('ganho', 'perdido')
          AND proximoContato IS NOT NULL
          AND proximoContato <> ''
          AND datetime(proximoContato) <= datetime('now', '+1 day')`
    );

    const resumo = {
        total: 0,
        ativos: 0,
        novos: 0,
        emConversa: 0,
        testes: 0,
        aguardandoPagamento: 0,
        ganhos: 0,
        perdidos: 0,
        urgentes: 0,
        retornosHoje: Number(vencendo[0]?.total || 0)
    };

    rows.forEach((row) => {
        const total = Number(row.total || 0);
        resumo.total += total;
        if (!['ganho', 'perdido'].includes(row.status)) resumo.ativos += total;
        if (row.status === 'novo') resumo.novos += total;
        if (row.status === 'em_conversa') resumo.emConversa += total;
        if (row.status === 'teste_liberado') resumo.testes += total;
        if (row.status === 'aguardando_pagamento') resumo.aguardandoPagamento += total;
        if (row.status === 'ganho') resumo.ganhos += total;
        if (row.status === 'perdido') resumo.perdidos += total;
        if (!['ganho', 'perdido'].includes(row.status) && row.prioridade === 'urgente') resumo.urgentes += total;
    });

    return resumo;
}

async function relatorioComercial() {
    const porOrigem = await buscarTodos(
        `SELECT COALESCE(NULLIF(origem, ''), 'Nao informado') AS nome, COUNT(*) AS quantidade
        FROM leads
        GROUP BY COALESCE(NULLIF(origem, ''), 'Nao informado')
        ORDER BY quantidade DESC, nome ASC`
    );
    const porStatus = await buscarTodos(
        `SELECT status AS nome, COUNT(*) AS quantidade
        FROM leads
        GROUP BY status
        ORDER BY quantidade DESC`
    );
    const conversoesMes = await buscarTodos(
        `SELECT COUNT(*) AS total
        FROM leads
        WHERE convertidoEm IS NOT NULL
          AND strftime('%Y-%m', convertidoEm) = strftime('%Y-%m', 'now')`
    );

    return {
        porOrigem,
        porStatus,
        conversoesMes: Number(conversoesMes[0]?.total || 0)
    };
}

module.exports = {
    listarLeads,
    buscarLeadPorId,
    listarHistoricoLead,
    salvarLead,
    atualizarStatusLead,
    vincularLeadAoCliente,
    removerLead,
    adicionarHistoricoLead,
    resumoCrm,
    relatorioComercial,
    normalizarStatus
};
