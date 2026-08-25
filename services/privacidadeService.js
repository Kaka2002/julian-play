const db = require('../database/sqlite');
const { buscarClientePorId } = require('./clientes');
const { registrarEventoSistema } = require('./eventosSistema');

function executar(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function concluido(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, alteracoes: this.changes });
        });
    });
}

function buscarTodos(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}

function buscarUm(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    });
}

function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}

async function exportarDadosCliente(clienteId) {
    await db.ready;
    const cliente = await buscarClientePorId(clienteId);
    if (!cliente) throw new Error('Cliente nao encontrado.');

    const telefone = String(cliente.telefone || '');
    const [
        pagamentos,
        cobrancasPix,
        notas,
        atendimentos,
        interacoesRobo,
        campanhas,
        reclamacoes,
        avisosRenovacao,
        renovacoesPainel,
        testesGratis,
        leads,
        solicitacoes
    ] = await Promise.all([
        buscarTodos(`SELECT id, plano, diasContrato, valorPlano, assinaturaApp, valorTotal,
            formaPagamento, dataPagamento, vencimentoAnterior, vencimentoNovo, observacoes,
            mensagemEnviada, excluidoEm, criadoEm
            FROM cliente_pagamentos WHERE clienteId = ? ORDER BY id`, [cliente.id]),
        buscarTodos(`SELECT id, referencia, provedor, provedorPagamentoId, plano, diasContrato,
            valorPlano, assinaturaApp, valorTotal, status, pagamentoId, criadoEm,
            atualizadoEm, aprovadoEm, controleMensagemEnviada
            FROM cobrancas_pix WHERE clienteId = ? ORDER BY id`, [cliente.id]),
        buscarTodos('SELECT id, texto, criadoEm FROM cliente_notas WHERE clienteId = ? ORDER BY id', [cliente.id]),
        buscarTodos(`SELECT id, motivo, prioridade, status, descricao, proximoContato,
            criadoEm, atualizadoEm, resolvidoEm
            FROM cliente_atendimentos WHERE clienteId = ? ORDER BY id`, [cliente.id]),
        buscarTodos(`SELECT id, tipo, titulo, resumo, destino, status, criadoEm
            FROM cliente_interacoes_robo
            WHERE clienteId = ? OR telefone = ? ORDER BY id`, [cliente.id, telefone]),
        buscarTodos(`SELECT i.id, i.campanhaId, c.nome AS campanhaNome, i.status, i.motivo,
            i.enviadoEm, i.criadoEm, i.atualizadoEm
            FROM campanha_itens i
            LEFT JOIN campanhas c ON c.id = i.campanhaId
            WHERE i.clienteId = ? OR i.telefone = ? ORDER BY i.id`, [cliente.id, telefone]),
        buscarTodos(`SELECT id, campanhaId, campanhaItemId, motivo, origem, responsavel, criadoEm
            FROM campanha_reclamacoes WHERE clienteId = ? ORDER BY id`, [cliente.id]),
        buscarTodos(`SELECT id, vencimento, diasAntes, enviadoEm
            FROM avisos_renovacao WHERE clienteId = ? ORDER BY id`, [cliente.id]),
        buscarTodos(`SELECT id, protocolo, cobrancaId, pagamentoId, painelId, status,
            tentativas, iniciadoEm, concluidoEm, criadoEm, atualizadoEm
            FROM renovacoes_painel_fila WHERE clienteId = ? ORDER BY id`, [cliente.id]),
        buscarTodos(`SELECT id, nome, telefone, dispositivo, origem, dataPrimeiroTeste,
            dataUltimaSolicitacao, totalSolicitacoes
            FROM testes_gratis_historico
            WHERE clienteId = ? OR telefone = ? ORDER BY id`, [cliente.id, telefone]),
        buscarTodos(`SELECT id, nome, telefone, origem, interesse, status, prioridade,
            valorEstimado, proximoContato, ultimoContato, motivoPerda, observacoes,
            criadoEm, atualizadoEm, convertidoEm, perdidoEm
            FROM leads WHERE clienteId = ? OR telefone = ? ORDER BY id`, [cliente.id, telefone]),
        buscarTodos(`SELECT id, tipo, motivo, responsavel, resumo, status, criadoEm
            FROM solicitacoes_privacidade WHERE clienteId = ? ORDER BY id`, [cliente.id])
    ]);

    const idsLeads = leads.map(item => Number(item.id)).filter(Number.isFinite);
    const historicoLeads = idsLeads.length
        ? await buscarTodos(`SELECT id, leadId, tipo, texto, criadoEm FROM lead_historico
            WHERE leadId IN (${idsLeads.map(() => '?').join(',')}) ORDER BY id`, idsLeads)
        : [];

    return {
        formato: 'julian-play-exportacao-titular-v1',
        geradoEm: new Date().toISOString(),
        aviso: 'Arquivo confidencial. Entregue somente ao titular confirmado e armazene pelo menor tempo necessario.',
        cliente,
        historico: {
            pagamentos,
            cobrancasPix,
            notas,
            atendimentos,
            interacoesRobo,
            campanhas,
            reclamacoes,
            avisosRenovacao,
            renovacoesPainel,
            testesGratis,
            leads,
            historicoLeads,
            solicitacoesPrivacidade: solicitacoes
        }
    };
}

async function anonimizarCliente(clienteId, { motivo = '', responsavel = '' } = {}) {
    await db.ready;
    const cliente = await buscarUm('SELECT * FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) throw new Error('Cliente nao encontrado.');
    if (cliente.anonimizadoEm) throw new Error('Este cliente ja foi anonimizado.');

    const motivoSeguro = String(motivo || '').trim();
    const responsavelSeguro = String(responsavel || '').trim().slice(0, 120);
    if (motivoSeguro.length < 10) {
        throw new Error('Descreva o motivo da anonimizacao com pelo menos 10 caracteres.');
    }

    const agora = new Date().toISOString();
    const telefoneOriginal = String(cliente.telefone || '');
    const telefoneDigitos = somenteDigitos(telefoneOriginal);
    const nomeAnonimo = `Cliente anonimizado #${cliente.id}`;
    const telefoneAnonimo = `anonimizado-${cliente.id}`;

    await executar('BEGIN IMMEDIATE');
    try {
        const leads = await buscarTodos(
            'SELECT id FROM leads WHERE clienteId = ? OR telefone = ?',
            [cliente.id, telefoneOriginal]
        );
        const idsLeads = leads.map(item => Number(item.id)).filter(Number.isFinite);

        if (idsLeads.length) {
            await executar(`DELETE FROM lead_historico WHERE leadId IN (${idsLeads.map(() => '?').join(',')})`, idsLeads);
        }

        await executar(`UPDATE leads SET
            nome = ?, telefone = '', origem = '', interesse = '', valorEstimado = '',
            proximoContato = NULL, ultimoContato = NULL, motivoPerda = '', observacoes = '',
            clienteId = ?, atualizadoEm = CURRENT_TIMESTAMP
            WHERE clienteId = ? OR telefone = ?`,
        [nomeAnonimo, cliente.id, cliente.id, telefoneOriginal]);

        await executar('DELETE FROM cliente_notas WHERE clienteId = ?', [cliente.id]);
        await executar('DELETE FROM cliente_atendimentos WHERE clienteId = ?', [cliente.id]);
        await executar(`UPDATE cliente_interacoes_robo SET
            telefone = '', titulo = 'Interacao de cliente anonimizado', resumo = '', destino = ''
            WHERE clienteId = ? OR telefone = ?`, [cliente.id, telefoneOriginal]);
        await executar(`UPDATE campanha_itens SET
            clienteNome = ?, telefone = '', destino = '', motivo = '', atualizadoEm = CURRENT_TIMESTAMP
            WHERE clienteId = ? OR telefone = ?`, [nomeAnonimo, cliente.id, telefoneOriginal]);
        await executar(`UPDATE campanha_reclamacoes SET
            motivo = 'Registro preservado apos anonimizacao do cliente.', responsavel = ''
            WHERE clienteId = ?`, [cliente.id]);
        await executar(`UPDATE testes_gratis_historico SET
            telefone = 'anonimizado-' || ? || '-' || id, nome = ?, dispositivo = '', origem = ''
            WHERE clienteId = ? OR telefone = ?`, [String(cliente.id), nomeAnonimo, cliente.id, telefoneOriginal]);
        await executar(`UPDATE cliente_pagamentos SET observacoes = '', erroMensagem = ''
            WHERE clienteId = ?`, [cliente.id]);
        await executar(`UPDATE cobrancas_pix SET qrCode = NULL, erro = '', controleMensagemErro = ''
            WHERE clienteId = ?`, [cliente.id]);
        await executar(`UPDATE renovacoes_painel_fila SET requisicao = NULL, resposta = NULL, erro = NULL
            WHERE clienteId = ?`, [cliente.id]);

        if (telefoneDigitos) {
            await executar('DELETE FROM mensagens_saida_fila WHERE destino LIKE ?', [`${telefoneDigitos}%`]);
        }

        await executar(`UPDATE clientes SET
            nome = ?, telefone = ?, ddiTelefone = '', paisTelefone = '', usuario = '', senha = '',
            plano = '', aparelho = '', vencimento = '', nascimento = '', tipoPlanoId = NULL,
            diasContrato = NULL, valorPlano = '', assinaturaApp = '', validadeApp = '',
            dataValidadeApp = '', horasTeste = '', dataInicio = '', dataVencimento = '',
            appsInstalados = '', dispositivosSelecionados = '', paineisSelecionados = '',
            conexoesPainel = 0, appInstalado = 0, usuarioApp = '', senhaApp = '',
            enderecoMac = '', idAplicativo = '', acessosApp = '', observacoes = '', origem = '',
            tags = '', bonusMeses = 0, status = 'inativo', ultimoAvisoRenovacao = '',
            ultimoAvisoAniversario = '', whatsappMarketingConsentimento = 0,
            whatsappMarketingConsentidoEm = NULL, whatsappOptOutEm = ?,
            anonimizadoEm = ?, exclusaoSolicitadaEm = ?, atualizadoEm = CURRENT_TIMESTAMP
            WHERE id = ?`, [
            nomeAnonimo,
            telefoneAnonimo,
            agora,
            agora,
            agora,
            cliente.id
        ]);

        await executar(`INSERT INTO solicitacoes_privacidade
            (clienteId, tipo, motivo, responsavel, resumo, status)
            VALUES (?, 'anonimizacao', ?, ?, ?, 'concluida')`, [
            cliente.id,
            motivoSeguro.slice(0, 1000),
            responsavelSeguro,
            'Dados de contato, acesso, atendimento e marketing removidos; registros financeiros minimos preservados.'
        ]);
        await executar('COMMIT');
    } catch (err) {
        await executar('ROLLBACK').catch(() => {});
        throw err;
    }

    await registrarEventoSistema('privacidade_cliente', 'warn', 'Cliente anonimizado', {
        clienteId: cliente.id,
        responsavel: responsavelSeguro,
        registrosFinanceirosPreservados: true
    }).catch(() => {});

    return buscarClientePorId(cliente.id);
}

async function listarSolicitacoesPrivacidade(clienteId, limite = 20) {
    await db.ready;
    const total = Math.max(1, Math.min(100, Number(limite || 20)));
    return buscarTodos(`SELECT id, tipo, motivo, responsavel, resumo, status, criadoEm
        FROM solicitacoes_privacidade WHERE clienteId = ?
        ORDER BY datetime(criadoEm) DESC, id DESC LIMIT ?`, [clienteId, total]);
}

async function verificarExclusaoDefinitivaCliente(clienteId) {
    await db.ready;
    const cliente = await buscarUm('SELECT * FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) return { permitida: false, motivo: 'Cliente não encontrado.' };

    const financeiro = await buscarUm(`SELECT
        (SELECT COUNT(*) FROM cliente_pagamentos WHERE clienteId = ?) AS pagamentos,
        (SELECT COUNT(*) FROM cobrancas_pix WHERE clienteId = ?) AS cobrancas,
        (SELECT COUNT(*) FROM renovacoes_painel_fila WHERE clienteId = ?) AS renovacoes`,
    [cliente.id, cliente.id, cliente.id]);
    const totalFinanceiro = Number(financeiro?.pagamentos || 0)
        + Number(financeiro?.cobrancas || 0)
        + Number(financeiro?.renovacoes || 0);
    if (totalFinanceiro > 0) {
        return { permitida: false, motivo: 'Este cadastro possui histórico financeiro e só pode ser anonimizado.' };
    }

    return { permitida: true, motivo: '', cliente };
}

async function excluirClienteDefinitivamente(clienteId, { motivo = '', responsavel = '' } = {}) {
    const elegibilidade = await verificarExclusaoDefinitivaCliente(clienteId);
    if (!elegibilidade.permitida) throw new Error(elegibilidade.motivo);

    const motivoSeguro = String(motivo || '').trim();
    if (motivoSeguro.length < 10) {
        throw new Error('Descreva o motivo da exclusão com pelo menos 10 caracteres.');
    }

    const cliente = elegibilidade.cliente;
    const telefone = String(cliente.telefone || '');
    await executar('BEGIN IMMEDIATE');
    try {
        await executar('UPDATE leads SET clienteId = NULL WHERE clienteId = ?', [cliente.id]);
        await executar('UPDATE campanha_itens SET clienteId = NULL WHERE clienteId = ?', [cliente.id]);
        await executar('DELETE FROM testes_gratis_historico WHERE clienteId = ? OR telefone = ?', [cliente.id, telefone]);
        await executar('DELETE FROM cliente_interacoes_robo WHERE clienteId = ? OR telefone = ?', [cliente.id, telefone]);
        await executar('DELETE FROM avisos_renovacao WHERE clienteId = ?', [cliente.id]);
        await executar('DELETE FROM solicitacoes_privacidade WHERE clienteId = ?', [cliente.id]);
        const resultado = await executar('DELETE FROM clientes WHERE id = ?', [cliente.id]);
        if (resultado.alteracoes !== 1) throw new Error('O cliente não foi encontrado para exclusão.');
        await executar('COMMIT');
    } catch (err) {
        await executar('ROLLBACK').catch(() => {});
        throw err;
    }

    await registrarEventoSistema('privacidade_cliente', 'warn', 'Cliente sem histórico financeiro excluído definitivamente', {
        clienteId: cliente.id,
        responsavel: String(responsavel || '').slice(0, 120),
        motivo: motivoSeguro.slice(0, 500)
    }).catch(() => {});
    return { id: cliente.id };
}

module.exports = {
    exportarDadosCliente,
    anonimizarCliente,
    listarSolicitacoesPrivacidade,
    verificarExclusaoDefinitivaCliente,
    excluirClienteDefinitivamente
};
