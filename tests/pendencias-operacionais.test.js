const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { executarIsolado, removerAmbiente, repoRoot } = require('./helpers/isolated');

test('central consolida pendencias reais, prioriza riscos e respeita filtros', () => {
    const resultado = executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const run=(sql,p=[])=>new Promise((ok,no)=>db.run(sql,p,function(e){e?no(e):ok(this.lastID)}));
        const vencido=await run("INSERT INTO clientes(nome,telefone,status,dataVencimento) VALUES('Vencido','5511900000001','ativo','2026-08-20T23:59')");
        await run("INSERT INTO clientes(nome,telefone,status,dataVencimento) VALUES('Proximo','5511900000002','ativo','2026-09-10T23:59')");
        await run("INSERT INTO clientes(nome,telefone,status,dataVencimento) VALUES('Inativo','5511900000003','inativo','2026-08-01T23:59')");
        await run("INSERT INTO cliente_atendimentos(clienteId,motivo,prioridade,status,descricao) VALUES(?, 'pagamento','urgente','aberto','Conferir cliente')",[vencido]);
        await run("INSERT INTO leads(nome,status,prioridade,proximoContato) VALUES('Lead atrasado','em_conversa','normal','2026-09-06T10:00')");
        const cobranca=await run("INSERT INTO cobrancas_pix(referencia,provedor,clienteId,plano,diasContrato,valorTotal,status,erro) VALUES('pend-1','mercado_pago',?,'Mensal',30,'35,00','erro','Falha de pagamento')",[vencido]);
        const pagamento=await run("INSERT INTO cliente_pagamentos(clienteId,plano,valorTotal) VALUES(?,'Mensal','35,00')",[vencido]);
        const painel=await run("INSERT INTO paineis(nome) VALUES('Painel teste')");
        await run("INSERT INTO renovacoes_painel_fila(protocolo,cobrancaId,pagamentoId,clienteId,painelId,status,erro) VALUES('ren-1',?,?,?,?, 'falha','API indisponivel')",[cobranca,pagamento,vencido,painel]);
        await run("INSERT INTO mensagens_saida_fila(protocolo,tipo,destino,payloadProtegido,status,erro) VALUES('msg-1','texto','5511900000001','protegido','incerto','Sem confirmacao')");
        await run("INSERT INTO campanhas(nome,status,erros,mensagem) VALUES('Campanha teste','pausada',1,'Pausada por erro')");
        const svc=require('./services/pendenciasOperacionaisService');
        const todos=await svc.listarPendenciasOperacionais({}, {agora:new Date('2026-09-07T12:00:00-03:00'),operacional:{whatsapp:{conectado:false},sistema:{backupRecente:false}}});
        const financeiro=await svc.listarPendenciasOperacionais({area:'financeiro'}, {agora:new Date('2026-09-07T12:00:00-03:00'),operacional:{whatsapp:{conectado:true},sistema:{backupRecente:true}}});
        process.stdout.write(JSON.stringify({total:todos.resumo.total,criticas:todos.resumo.critica,primeira:todos.itens[0].prioridade,tipos:todos.itens.map(x=>x.tipo),financeiro:financeiro.itens.map(x=>x.tipo)}));
        process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`, { env: { DISABLE_WHATSAPP: '1' } });
    try {
        const dados = JSON.parse(resultado.stdout);
        assert.equal(dados.total, 10);
        assert.ok(dados.criticas >= 5);
        assert.equal(dados.primeira, 'critica');
        for (const tipo of ['cliente_vencido','cliente_vencendo','atendimento','lead','cobranca','mensagem','renovacao_painel','campanha','whatsapp_desconectado','backup_atrasado']) assert.ok(dados.tipos.includes(tipo), tipo);
        assert.deepEqual(dados.financeiro, ['cobranca']);
    } finally { removerAmbiente(resultado.ambiente); }
});

test('central nao persiste copia das pendencias e desaparece ao resolver origem', () => {
    const resultado = executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const run=(sql,p=[])=>new Promise((ok,no)=>db.run(sql,p,e=>e?no(e):ok()));
        await run("INSERT INTO leads(nome,status,proximoContato) VALUES('Lead','novo','2026-09-01T10:00')");
        const svc=require('./services/pendenciasOperacionaisService');const op={agora:new Date('2026-09-07T12:00:00-03:00'),operacional:{whatsapp:{conectado:true},sistema:{backupRecente:true}}};
        const antes=await svc.listarPendenciasOperacionais({},op);await run("UPDATE leads SET status='ganho'");const depois=await svc.listarPendenciasOperacionais({},op);
        process.stdout.write(JSON.stringify({antes:antes.itens.length,depois:depois.itens.length}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try { assert.deepEqual(JSON.parse(resultado.stdout), { antes: 1, depois: 0 }); }
    finally { removerAmbiente(resultado.ambiente); }
});

test('rota protegida oferece filtros, paginacao e links para resolver nas areas existentes', () => {
    const rota = fs.readFileSync(path.join(repoRoot, 'routes', 'pendenciasRoute.js'), 'utf8');
    const principal = fs.readFileSync(path.join(repoRoot, 'routes', 'clientesRoute.js'), 'utf8');
    const bot = fs.readFileSync(path.join(repoRoot, 'bot.js'), 'utf8');
    assert.match(rota, /router\.get\('\/pendencias'/);
    assert.match(rota, /name="prioridade"/);
    assert.match(rota, /name="area"/);
    assert.match(rota, /href="\$\{escapar\(item\.href\)\}"/);
    assert.match(principal, /router\.use\(criarPendenciasRoute\(/);
    assert.match(principal, /href="\/pendencias"/);
    assert.ok(bot.indexOf("app.use('/', protegerPainel)") < bot.indexOf("app.use('/', clientesRoute)"));
});
