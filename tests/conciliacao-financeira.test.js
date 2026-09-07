const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { executarIsolado, removerAmbiente, repoRoot } = require('./helpers/isolated');

test('conciliacao detecta vinculo, valor e vencimento sem alterar dados', () => {
    const resultado = executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok(this.lastID)}));
        const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));
        const cliente=await run("INSERT INTO clientes(nome,telefone,status,dataVencimento) VALUES('Cliente conciliar','5511900000040','ativo','2026-09-10T23:59')");
        const criarPagamento=(valor,vencimento,excluido='')=>run("INSERT INTO cliente_pagamentos(clienteId,plano,valorTotal,vencimentoNovo,excluidoEm) VALUES(?,'Mensal',?,?,?)",[cliente,valor,vencimento,excluido]);
        const criarCobranca=(ref,valor,pagamento=null)=>run("INSERT INTO cobrancas_pix(referencia,provedor,clienteId,plano,diasContrato,valorTotal,status,pagamentoId) VALUES(?,'mercado_pago',?,'Mensal',30,?,'aprovado',?)",[ref,cliente,valor,pagamento]);
        await criarCobranca('sem-pagamento','35,00');
        const removido=await criarPagamento('35,00','2026-10-10T23:59','2026-09-07T10:00');await criarCobranca('removido','35,00',removido);
        const diferente=await criarPagamento('30,00','2026-09-10T23:59');await criarCobranca('valor-diferente','35,00',diferente);
        const acesso=await criarPagamento('35,00','2026-11-10T23:59');await criarCobranca('acesso-atrasado','35,00',acesso);
        const correto=await criarPagamento('35,00','2026-09-10T23:59');await criarCobranca('correto','35,00',correto);
        const svc=require('./services/conciliacaoFinanceiraService');const antes=await get('SELECT dataVencimento FROM clientes WHERE id=?',[cliente]);
        const execucao=await svc.executarConciliacaoFinanceira({origem:'teste'});const depois=await get('SELECT dataVencimento FROM clientes WHERE id=?',[cliente]);
        const evento=await get("SELECT nivel,mensagem FROM eventos_sistema WHERE tipo='pagamento_conciliacao' ORDER BY id DESC LIMIT 1");
        process.stdout.write(JSON.stringify({tipos:execucao.divergencias.map(x=>x.tipo),resumo:execucao.resumo,antes:antes.dataVencimento,depois:depois.dataVencimento,evento}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const dados=JSON.parse(resultado.stdout);
        assert.deepEqual(dados.tipos.sort(), ['acesso_nao_atualizado','cobranca_sem_pagamento','pagamento_ausente','valor_divergente'].sort());
        assert.deepEqual(dados.resumo,{total:4,criticas:3,altas:1});
        assert.equal(dados.antes,dados.depois);
        assert.equal(dados.evento.nivel,'alerta');
    } finally { removerAmbiente(resultado.ambiente); }
});

test('conciliacao consistente conclui sem divergencias e registra auditoria', () => {
    const resultado = executarIsolado(`(async()=>{const db=require('./database/sqlite');await db.ready;const get=s=>new Promise((ok,no)=>db.get(s,(e,r)=>e?no(e):ok(r)));const svc=require('./services/conciliacaoFinanceiraService');const r=await svc.executarConciliacaoFinanceira({origem:'teste'});const e=await get("SELECT nivel FROM eventos_sistema WHERE tipo='pagamento_conciliacao' ORDER BY id DESC LIMIT 1");process.stdout.write(JSON.stringify({total:r.resumo.total,nivel:e.nivel}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try { assert.deepEqual(JSON.parse(resultado.stdout),{total:0,nivel:'info'}); }
    finally { removerAmbiente(resultado.ambiente); }
});

test('rota de conciliacao e agendador diario ficam protegidos e integrados', () => {
    const rota=fs.readFileSync(path.join(repoRoot,'routes','conciliacaoFinanceiraRoute.js'),'utf8');
    const principal=fs.readFileSync(path.join(repoRoot,'routes','clientesRoute.js'),'utf8');
    const bot=fs.readFileSync(path.join(repoRoot,'bot.js'),'utf8');
    assert.match(rota,/router\.get\('\/financeiro\/conciliacao'/);
    assert.match(rota,/router\.post\('\/financeiro\/conciliacao\/executar'/);
    assert.match(principal,/router\.use\(criarConciliacaoFinanceiraRoute\(/);
    assert.match(principal,/href="\/financeiro\/conciliacao"/);
    assert.match(bot,/iniciarConciliacaoFinanceira\(\)/);
    assert.ok(bot.indexOf("app.use(protegerPainel)") < bot.indexOf("app.use('/', clientesRoute)"));
});
