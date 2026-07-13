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

function dataISO(offsetDias) {
    const data = new Date();
    data.setDate(data.getDate() + offsetDias);
    return data.toISOString().slice(0, 10);
}

function dataHoraISO(offsetDias, hora = '20:00') {
    return `${dataISO(offsetDias)}T${hora}`;
}

async function configurarSeVazio(chave, valor, valoresVazios = ['']) {
    const atual = await buscarUm('SELECT valor FROM configuracoes WHERE chave = ?', [chave]);
    if (atual && !valoresVazios.includes(String(atual.valor || ''))) return false;

    await executar(
        `INSERT INTO configuracoes (chave, valor, atualizadoEm)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizadoEm = CURRENT_TIMESTAMP`,
        [chave, valor]
    );
    return true;
}

async function garantirPlano(nome, dias, valor) {
    const existente = await buscarUm('SELECT id FROM tipos_planos WHERE nome = ?', [nome]);
    if (existente) return existente.id;

    const resultado = await executar(
        'INSERT INTO tipos_planos (nome, dias, valor, ativo) VALUES (?, ?, ?, 1)',
        [nome, dias, valor]
    );
    return resultado.id;
}

async function garantirItem(tabela, dados) {
    const existente = await buscarUm(`SELECT id FROM ${tabela} WHERE nome = ?`, [dados.nome]);
    if (existente) return existente.id;

    const colunas = Object.keys(dados);
    const valores = Object.values(dados);
    const marcadores = colunas.map(() => '?').join(', ');
    const resultado = await executar(
        `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${marcadores})`,
        valores
    );
    return resultado.id;
}

async function garantirCliente(cliente) {
    const existente = await buscarUm('SELECT id FROM clientes WHERE telefone = ? AND nome = ?', [cliente.telefone, cliente.nome]);
    if (existente) return existente.id;

    const resultado = await executar(
        `INSERT INTO clientes (
            nome, telefone, usuario, senha, plano, aparelho, vencimento, nascimento,
            tipoPlanoId, diasContrato, valorPlano, assinaturaApp, dataInicio, dataVencimento,
            appsInstalados, dispositivosSelecionados, paineisSelecionados, conexoesPainel,
            appInstalado, acessosApp, observacoes, origem, tags, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            cliente.dataInicio,
            cliente.dataVencimento,
            JSON.stringify(cliente.appsInstalados || []),
            JSON.stringify(cliente.dispositivosSelecionados || []),
            JSON.stringify(cliente.paineisSelecionados || []),
            cliente.conexoesPainel || 1,
            cliente.appInstalado ? 1 : 0,
            JSON.stringify(cliente.acessosApp || []),
            cliente.observacoes || 'Cliente ficticio para demonstracao comercial.',
            cliente.origem || 'Demo comercial',
            cliente.tags || '',
            cliente.status
        ]
    );
    return resultado.id;
}

async function garantirPagamento(clienteId, pagamento) {
    const existente = await buscarUm(
        'SELECT id FROM cliente_pagamentos WHERE clienteId = ? AND plano = ? AND dataPagamento = ?',
        [clienteId, pagamento.plano, pagamento.dataPagamento]
    );
    if (existente) return existente.id;

    const resultado = await executar(
        `INSERT INTO cliente_pagamentos (
            clienteId, tipoPlanoId, plano, diasContrato, valorPlano, assinaturaApp,
            valorTotal, formaPagamento, dataPagamento, vencimentoAnterior, vencimentoNovo,
            observacoes, mensagemEnviada
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            clienteId,
            pagamento.tipoPlanoId,
            pagamento.plano,
            pagamento.diasContrato,
            pagamento.valorPlano,
            pagamento.assinaturaApp,
            pagamento.valorTotal,
            pagamento.formaPagamento,
            pagamento.dataPagamento,
            pagamento.vencimentoAnterior || '',
            pagamento.vencimentoNovo,
            'Pagamento ficticio criado pelo modo demo.',
            1
        ]
    );
    return resultado.id;
}

async function main() {
    await configurarSeVazio('nomeSistema', 'Julian Play Demo', ['', 'Controle de Cliente IPTV e P2P']);
    await configurarSeVazio('pixChave', '11999999999');
    await configurarSeVazio('pixNome', 'JULIAN PLAY DEMO');
    await configurarSeVazio('pixCidade', 'SAO PAULO');
    await configurarSeVazio('pixTxid', 'JULIANPLAY');
    await configurarSeVazio('backupAutomaticoAtivo', '1');
    await configurarSeVazio('backupAutomaticoHora', '03:00');
    await configurarSeVazio('backupRetencaoDias', '30');

    const planoTesteId = await garantirPlano('Teste Gratis', 0, '0,00');
    const planoMensalId = await garantirPlano('Mensal Demo', 30, '39,90');
    const planoTrimestralId = await garantirPlano('Trimestral Demo', 90, '99,90');
    const planoAnualId = await garantirPlano('Anual Demo', 365, '299,90');

    await garantirItem('apps', { nome: 'Julian Play TV', descricao: 'App principal para demonstracao', ativo: 1 });
    await garantirItem('apps', { nome: 'Cinema Play', descricao: 'App alternativo para Smart TV', ativo: 1 });
    await garantirItem('dispositivos', { nome: 'TV Samsung Demo', ativo: 1 });
    await garantirItem('dispositivos', { nome: 'Celular Android Demo', ativo: 1 });
    await garantirItem('paineis', { nome: 'Painel Demo 1', ativo: 1 });

    const clientes = [
        {
            nome: 'Amanda Ribeiro',
            telefone: '5511999101001',
            usuario: 'amanda.demo',
            senha: 'JP1234',
            plano: 'Mensal Demo',
            aparelho: 'TV Samsung Demo',
            vencimento: dataISO(2),
            nascimento: '1992-07-13',
            tipoPlanoId: planoMensalId,
            diasContrato: 30,
            valorPlano: '39,90',
            assinaturaApp: '0,00',
            dataInicio: dataHoraISO(-28),
            dataVencimento: dataHoraISO(2),
            appsInstalados: ['Julian Play TV'],
            dispositivosSelecionados: ['TV Samsung Demo'],
            paineisSelecionados: ['Painel Demo 1'],
            acessosApp: [{ app: 'Julian Play TV', dispositivo: 'TV Samsung Demo', painel: 'Painel Demo 1', usuario: 'amanda.demo', senha: 'JP1234' }],
            origem: 'Instagram',
            tags: 'VIP, Bom pagador',
            status: 'ativo'
        },
        {
            nome: 'Bruno Martins',
            telefone: '5511999101002',
            usuario: 'bruno.demo',
            senha: 'JP5678',
            plano: 'Trimestral Demo',
            aparelho: 'Celular Android Demo',
            vencimento: dataISO(18),
            tipoPlanoId: planoTrimestralId,
            diasContrato: 90,
            valorPlano: '99,90',
            assinaturaApp: '0,00',
            dataInicio: dataHoraISO(-72),
            dataVencimento: dataHoraISO(18),
            appsInstalados: ['Cinema Play'],
            dispositivosSelecionados: ['Celular Android Demo'],
            paineisSelecionados: ['Painel Demo 1'],
            acessosApp: [{ app: 'Cinema Play', dispositivo: 'Celular Android Demo', painel: 'Painel Demo 1', usuario: 'bruno.demo', senha: 'JP5678' }],
            origem: 'Indicacao pessoal',
            tags: 'Indicado',
            status: 'ativo'
        },
        {
            nome: 'Carla Souza',
            telefone: '5511999101003',
            usuario: 'carla.demo',
            senha: 'JP9012',
            plano: 'Mensal Demo',
            aparelho: 'TV Samsung Demo',
            vencimento: dataISO(-3),
            tipoPlanoId: planoMensalId,
            diasContrato: 30,
            valorPlano: '39,90',
            assinaturaApp: '0,00',
            dataInicio: dataHoraISO(-33),
            dataVencimento: dataHoraISO(-3),
            appsInstalados: ['Julian Play TV'],
            dispositivosSelecionados: ['TV Samsung Demo'],
            paineisSelecionados: ['Painel Demo 1'],
            acessosApp: [{ app: 'Julian Play TV', dispositivo: 'TV Samsung Demo', painel: 'Painel Demo 1', usuario: 'carla.demo', senha: 'JP9012' }],
            origem: 'WhatsApp',
            tags: 'Atrasou pagamento',
            status: 'expirado'
        },
        {
            nome: 'Diego Almeida',
            telefone: '5511999101004',
            usuario: 'diego.demo',
            senha: 'JP3456',
            plano: 'Teste Gratis',
            aparelho: 'Celular Android Demo',
            vencimento: dataISO(1),
            tipoPlanoId: planoTesteId,
            diasContrato: 0,
            valorPlano: '0,00',
            assinaturaApp: '0,00',
            dataInicio: dataHoraISO(0, '09:00'),
            dataVencimento: dataHoraISO(1, '09:00'),
            appsInstalados: ['Cinema Play'],
            dispositivosSelecionados: ['Celular Android Demo'],
            paineisSelecionados: ['Painel Demo 1'],
            acessosApp: [{ app: 'Cinema Play', dispositivo: 'Celular Android Demo', painel: 'Painel Demo 1', usuario: 'diego.demo', senha: 'JP3456' }],
            origem: 'Facebook',
            tags: 'Retorno',
            status: 'teste'
        },
        {
            nome: 'Eduarda Lima',
            telefone: '5511999101005',
            usuario: 'eduarda.demo',
            senha: 'JP7890',
            plano: 'Anual Demo',
            aparelho: 'TV Samsung Demo',
            vencimento: dataISO(220),
            tipoPlanoId: planoAnualId,
            diasContrato: 365,
            valorPlano: '299,90',
            assinaturaApp: '0,00',
            dataInicio: dataHoraISO(-145),
            dataVencimento: dataHoraISO(220),
            appsInstalados: ['Julian Play TV'],
            dispositivosSelecionados: ['TV Samsung Demo'],
            paineisSelecionados: ['Painel Demo 1'],
            acessosApp: [{ app: 'Julian Play TV', dispositivo: 'TV Samsung Demo', painel: 'Painel Demo 1', usuario: 'eduarda.demo', senha: 'JP7890' }],
            origem: 'Google',
            tags: 'VIP',
            status: 'ativo'
        }
    ];

    for (const cliente of clientes) {
        const clienteId = await garantirCliente(cliente);
        if (cliente.status !== 'teste') {
            await garantirPagamento(clienteId, {
                tipoPlanoId: cliente.tipoPlanoId,
                plano: cliente.plano,
                diasContrato: cliente.diasContrato,
                valorPlano: cliente.valorPlano,
                assinaturaApp: cliente.assinaturaApp,
                valorTotal: cliente.valorPlano,
                formaPagamento: 'PIX',
                dataPagamento: cliente.dataInicio,
                vencimentoNovo: cliente.dataVencimento
            });
        }
    }

    console.log('Dados demo preparados com sucesso.');
    console.log(`Banco usado: ${db.dbPath}`);
}

main()
    .catch((err) => {
        console.error(`Erro ao preparar dados demo: ${err.message}`);
        process.exitCode = 1;
    })
    .finally(() => {
        db.close();
    });
