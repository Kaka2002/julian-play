const db = require('../database/sqlite');

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    }));
}

function dataValida(valor) {
    const data = valor ? new Date(valor) : null;
    return data && Number.isFinite(data.getTime()) ? data : null;
}

function formatarDataCurta(valor) {
    const data = dataValida(valor);
    return data ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(data) : '-';
}

function criarTarefa(categoria, prioridade, titulo, detalhe, url, identidade) {
    return { categoria, prioridade, titulo, detalhe, url, identidade };
}

async function obterCentralHoje(opcoes = {}) {
    const agora = dataValida(opcoes.agora) || new Date();
    const limiteFuturo = new Date(agora.getTime() + (7 * 24 * 60 * 60 * 1000));
    const [
        clientes,
        pagamentos,
        atendimentos,
        reclamacoes,
        configuracoes
    ] = await Promise.all([
        buscarTodos(`SELECT id, nome, telefone, status,
            COALESCE(NULLIF(dataVencimento, ''), vencimento) AS vencimento
            FROM clientes
            WHERE status <> 'excluido'
            ORDER BY COALESCE(NULLIF(dataVencimento, ''), vencimento) ASC`),
        buscarTodos(`SELECT cp.id, cp.clienteId, cp.provedor, cp.status, cp.valorTotal,
            cp.referencia, cp.criadoEm, c.nome AS clienteNome
            FROM cobrancas_pix cp
            LEFT JOIN clientes c ON c.id = cp.clienteId
            WHERE cp.status IN (
                'pendente', 'aguardando_pagamento', 'aguardando_comprovante',
                'aguardando_conferencia', 'erro', 'erro_renovacao'
            )
            ORDER BY cp.id DESC LIMIT 100`),
        buscarTodos(`SELECT a.id, a.clienteId, a.motivo, a.prioridade, a.status,
            a.descricao, a.proximoContato, c.nome AS clienteNome
            FROM cliente_atendimentos a
            INNER JOIN clientes c ON c.id = a.clienteId
            WHERE a.status IN ('aberto', 'em_andamento')
            ORDER BY CASE a.prioridade WHEN 'urgente' THEN 0 ELSE 1 END,
                COALESCE(a.proximoContato, '') ASC, a.id DESC LIMIT 100`),
        buscarTodos(`SELECT r.id, r.campanhaId, r.clienteId, r.motivo, r.criadoEm,
            c.nome AS clienteNome
            FROM campanha_reclamacoes r
            LEFT JOIN clientes c ON c.id = r.clienteId
            ORDER BY r.id DESC LIMIT 50`),
        buscarTodos(`SELECT chave, valor FROM configuracoes
            WHERE chave IN ('ultimoBackupAutomatico', 'ultimoBackupRecuperavel')`)
    ]);

    const tarefas = [];
    let vencidos = 0;
    let vencendo = 0;
    clientes.forEach((cliente) => {
        const vencimento = dataValida(cliente.vencimento);
        if (!vencimento) return;
        if (vencimento < agora) {
            vencidos += 1;
            tarefas.push(criarTarefa('Clientes', 'critica', `${cliente.nome} está vencido`,
                `Vencimento: ${formatarDataCurta(cliente.vencimento)} · ${cliente.telefone || 'sem telefone'}`,
                `/clientes/${cliente.id}/editar`, `cliente-vencido-${cliente.id}`));
        } else if (vencimento <= limiteFuturo) {
            vencendo += 1;
            tarefas.push(criarTarefa('Clientes', 'atencao', `${cliente.nome} vence em breve`,
                `Vencimento: ${formatarDataCurta(cliente.vencimento)}`,
                `/clientes/${cliente.id}/editar`, `cliente-vencendo-${cliente.id}`));
        }
    });

    let pagamentosManuais = 0;
    let pixPendentes = 0;
    pagamentos.forEach((pagamento) => {
        const manual = ['paypal_manual', 'manual'].includes(String(pagamento.provedor || ''));
        if (manual) pagamentosManuais += 1;
        else pixPendentes += 1;
        tarefas.push(criarTarefa('Pagamentos',
            ['erro', 'erro_renovacao'].includes(pagamento.status) ? 'critica' : 'atencao',
            `${manual ? 'PayPal manual' : 'PIX'}: ${pagamento.clienteNome || `cliente #${pagamento.clienteId}`}`,
            `Status: ${pagamento.status} · Referência: ${pagamento.referencia || '-'} · R$ ${Number(pagamento.valorTotal || 0).toFixed(2).replace('.', ',')}`,
            manual ? '/pagamentos-manuais' : '/financeiro',
            `pagamento-${pagamento.id}`));
    });

    atendimentos.forEach((atendimento) => tarefas.push(criarTarefa(
        'Atendimentos',
        atendimento.prioridade === 'urgente' ? 'critica' : 'atencao',
        `${atendimento.clienteNome}: ${atendimento.motivo || 'atendimento'}`,
        atendimento.descricao || `Status: ${atendimento.status}`,
        `/atendimentos?busca=${encodeURIComponent(atendimento.clienteNome || '')}`,
        `atendimento-${atendimento.id}`
    )));

    reclamacoes.forEach((reclamacao) => tarefas.push(criarTarefa(
        'Campanhas', 'critica',
        `Reclamação de ${reclamacao.clienteNome || `cliente #${reclamacao.clienteId}`}`,
        `${reclamacao.motivo} · ${formatarDataCurta(reclamacao.criadoEm)}`,
        reclamacao.campanhaId ? `/campanhas?id=${reclamacao.campanhaId}` : '/campanhas',
        `reclamacao-${reclamacao.id}`
    )));

    const mapaConfig = Object.fromEntries(configuracoes.map(item => [item.chave, item.valor || '']));
    const ultimoBackup = dataValida(mapaConfig.ultimoBackupAutomatico);
    const backupAtrasado = !ultimoBackup || agora.getTime() - ultimoBackup.getTime() > 48 * 60 * 60 * 1000;
    if (backupAtrasado) {
        tarefas.push(criarTarefa('Sistema', 'critica', 'Backup automático precisa de atenção',
            ultimoBackup ? `Último backup: ${formatarDataCurta(ultimoBackup)}` : 'Nenhum backup automático registrado.',
            '/manutencao', 'backup-atrasado'));
    }

    if (opcoes.whatsapp && !opcoes.whatsapp.conectado) {
        tarefas.push(criarTarefa('Sistema', 'critica', 'WhatsApp desconectado',
            opcoes.whatsapp.status || 'Reconecte o WhatsApp antes de enviar mensagens.',
            '/qr', 'whatsapp-desconectado'));
    }

    const ordem = { critica: 0, atencao: 1, informativa: 2 };
    tarefas.sort((a, b) => (ordem[a.prioridade] ?? 9) - (ordem[b.prioridade] ?? 9)
        || a.categoria.localeCompare(b.categoria, 'pt-BR')
        || a.titulo.localeCompare(b.titulo, 'pt-BR'));

    return {
        geradoEm: agora.toISOString(),
        resumo: {
            total: tarefas.length,
            criticas: tarefas.filter(item => item.prioridade === 'critica').length,
            vencidos,
            vencendo,
            pagamentosManuais,
            pixPendentes,
            atendimentos: atendimentos.length,
            reclamacoes: reclamacoes.length,
            backupAtrasado,
            whatsappConectado: Boolean(opcoes.whatsapp?.conectado)
        },
        tarefas
    };
}

module.exports = { obterCentralHoje };
