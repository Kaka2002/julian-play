const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { executarIsolado, removerAmbiente, repoRoot } = require('./helpers/isolated');

test('detecta telefone normalizado e MAC repetidos sem alterar cadastros', () => {
    const resultado = executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const run=(sql,p=[])=>new Promise((ok,no)=>db.run(sql,p,function(e){e?no(e):ok(this.lastID)}));
        const get=(sql,p=[])=>new Promise((ok,no)=>db.get(sql,p,(e,x)=>e?no(e):ok(x)));
        const a=await run("INSERT INTO clientes(nome,telefone,enderecoMac,status) VALUES('Ana','(11) 99999-0000','AA:BB:CC:DD:EE:FF','ativo')");
        const b=await run("INSERT INTO clientes(nome,telefone,status) VALUES('Ana antiga','5511999990000','inativo')");
        const acessos=JSON.stringify([{enderecoMac:'aa-bb-cc-dd-ee-ff'}]);
        const c=await run("INSERT INTO clientes(nome,telefone,acessosApp,status) VALUES('Outro aparelho','5511888880000',?,'teste')",[acessos]);
        const antes=await get('SELECT COUNT(*) total FROM clientes');
        const grupos=await require('./services/clientesDuplicadosService').listarGruposClientesDuplicados();
        const depois=await get('SELECT COUNT(*) total FROM clientes');
        process.stdout.write(JSON.stringify({a,b,c,antes:antes.total,depois:depois.total,grupos}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const dados = JSON.parse(resultado.stdout);
        assert.equal(dados.antes, 3);
        assert.equal(dados.depois, 3);
        assert.equal(dados.grupos.length, 1);
        assert.deepEqual(dados.grupos[0].clientes.map(item => item.id), [dados.a, dados.b, dados.c]);
        assert.deepEqual(dados.grupos[0].coincidencias.map(item => item.tipo).sort(), ['mac', 'telefone']);
        assert.equal(dados.grupos[0].prioridade, 'alta');
    } finally { removerAmbiente(resultado.ambiente); }
});

test('ignora dados fracos e anonimizado e desaparece após correção da origem', () => {
    const resultado = executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const run=(sql,p=[])=>new Promise((ok,no)=>db.run(sql,p,e=>e?no(e):ok()));
        await run("INSERT INTO clientes(nome,telefone,status) VALUES('Um','123','ativo')");
        await run("INSERT INTO clientes(nome,telefone,status) VALUES('Dois','123','ativo')");
        await run("INSERT INTO clientes(nome,telefone,status) VALUES('Três','5511999991111','ativo')");
        await run("INSERT INTO clientes(nome,telefone,status,anonimizadoEm) VALUES('Anonimizado','5511999991111','inativo',CURRENT_TIMESTAMP)");
        const svc=require('./services/clientesDuplicadosService');
        const antes=await svc.listarGruposClientesDuplicados();
        await run("INSERT INTO clientes(nome,telefone,status) VALUES('Quatro','5511999991111','ativo')");
        const detectado=await svc.listarGruposClientesDuplicados();
        await run("UPDATE clientes SET telefone='5511888882222' WHERE nome='Quatro'");
        const corrigido=await svc.listarGruposClientesDuplicados();
        process.stdout.write(JSON.stringify({antes:antes.length,detectado:detectado.length,corrigido:corrigido.length}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try { assert.deepEqual(JSON.parse(resultado.stdout), { antes: 0, detectado: 1, corrigido: 0 }); }
    finally { removerAmbiente(resultado.ambiente); }
});

test('revisão de duplicados é protegida e integrada à lista e às pendências', () => {
    const rota = fs.readFileSync(path.join(repoRoot, 'routes', 'clientesDuplicadosRoute.js'), 'utf8');
    const principal = fs.readFileSync(path.join(repoRoot, 'routes', 'clientesRoute.js'), 'utf8');
    const pendencias = fs.readFileSync(path.join(repoRoot, 'services', 'pendenciasOperacionaisService.js'), 'utf8');
    const bot = fs.readFileSync(path.join(repoRoot, 'bot.js'), 'utf8');
    assert.match(rota, /router\.get\('\/clientes\/duplicados'/);
    assert.match(rota, /não une nem exclui clientes automaticamente/);
    assert.match(principal, /href="\/clientes\/duplicados"/);
    assert.match(principal, /router\.use\(criarClientesDuplicadosRoute/);
    assert.match(pendencias, /tipo: 'cliente_duplicado'/);
    assert.ok(bot.indexOf("app.use('/', protegerPainel)") < bot.indexOf("app.use('/', clientesRoute)"));
});
