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
test('lista sem mudança de vencimento permanece legível durante outra transação de escrita', () => {
    const { executarIsolado, removerAmbiente } = require('./helpers/isolated');
    const resultado = executarIsolado(`(async()=>{
        const db=require('./database/sqlite');const sqlite=require('sqlite3');const clientes=require('./services/clientes');await db.ready;
        const run=(sql,params=[])=>new Promise((ok,erro)=>db.run(sql,params,e=>e?erro(e):ok()));
        await run("INSERT INTO clientes(nome,telefone,status,vencimento,dataVencimento,atualizadoEm) VALUES ('Futuro','5511990000001','ativo','2099-01-01','2099-01-01T23:59','2000-01-01')");
        await run("INSERT INTO clientes(nome,telefone,status,vencimento,dataVencimento) VALUES ('Vencido','5511990000002','teste','2000-01-01','2000-01-01T23:59')");
        await run("INSERT INTO clientes(nome,telefone,status,vencimento,dataVencimento) VALUES ('Renovado','5511990000003','expirado','2099-01-01','2099-01-01T23:59')");
        await clientes.atualizarStatusAutomaticoClientes();
        const conexao=await new Promise((ok,erro)=>{const c=new sqlite.Database(db.dbPath,e=>e?erro(e):ok(c))});
        const executar=sql=>new Promise((ok,erro)=>conexao.run(sql,e=>e?erro(e):ok()));
        await executar('BEGIN IMMEDIATE');
        const lista=await clientes.listarClientes();
        await executar('ROLLBACK');await new Promise(ok=>conexao.close(ok));
        console.log(JSON.stringify(lista.map(c=>({nome:c.nome,status:c.status,atualizadoEm:c.atualizadoEm}))));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const lista = JSON.parse(resultado.stdout.trim().split(/\r?\n/).at(-1));
        assert.equal(lista.find(c => c.nome === 'Futuro').atualizadoEm, '2000-01-01');
        assert.equal(lista.find(c => c.nome === 'Vencido').status, 'expirado');
        assert.equal(lista.find(c => c.nome === 'Renovado').status, 'ativo');
    } finally { removerAmbiente(resultado.ambiente); }
});

test('assinaturas do mesmo responsável: vínculo reversível preserva contratos e não esconde MAC ou novo cadastro', () => {
    const resultado = executarIsolado(`(async()=>{
        const db=require('./database/sqlite'); await db.ready;
        const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok(this.lastID)}));
        const all=s=>new Promise((ok,no)=>db.all(s,(e,r)=>e?no(e):ok(r)));
        const a=await run("INSERT INTO clientes(nome,telefone,usuario,vencimento,status) VALUES('Casa','5511999990000','casa','2026-11-01','ativo')");
        const b=await run("INSERT INTO clientes(nome,telefone,usuario,vencimento,status) VALUES('Bar','(11) 99999-0000','bar','2026-12-01','ativo')");
        const antes=await all('SELECT * FROM clientes ORDER BY id');
        const svc=require('./services/assinaturasResponsavelService'); const dup=require('./services/clientesDuplicadosService');
        const inicial=(await dup.listarGruposClientesDuplicados()).length;
        await svc.alterarVinculo(b,a,true,'teste'); await svc.alterarVinculo(a,b,true,'teste');
        const vinculado=(await dup.listarGruposClientesDuplicados()).length;
        const auditoria=(await all('SELECT * FROM cliente_auditoria')).length;
        const preservado=JSON.stringify(antes)===JSON.stringify(await all('SELECT * FROM clientes ORDER BY id'));
        await run("UPDATE clientes SET enderecoMac='AA:BB:CC:DD:EE:FF'");
        const mac=(await dup.listarGruposClientesDuplicados())[0].coincidencias.map(x=>x.tipo);
        await run("UPDATE clientes SET enderecoMac=''");
        const c=await run("INSERT INTO clientes(nome,telefone,status) VALUES('Novo','5511999990000','ativo')");
        const novo=(await dup.listarGruposClientesDuplicados())[0].clientes.length;
        await run('DELETE FROM clientes WHERE id=?',[c]);
        await svc.alterarVinculo(a,b,false,'teste');
        const desfeito=(await dup.listarGruposClientesDuplicados()).length;
        const invalidos=[]; for(const args of [[a,a,true],[a,999,true]]) {try{await svc.alterarVinculo(...args)}catch(e){invalidos.push(true)}}
        await run("UPDATE clientes SET telefone='5511888880000' WHERE id=?",[b]);
        try{await svc.alterarVinculo(a,b,true)}catch(e){invalidos.push(true)}
        console.log(JSON.stringify({inicial,vinculado,auditoria,preservado,mac,novo,desfeito,invalidos}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try { assert.deepEqual(JSON.parse(resultado.stdout),{inicial:1,vinculado:0,auditoria:2,preservado:true,mac:['mac'],novo:3,desfeito:1,invalidos:[true,true,true]}); }
    finally { removerAmbiente(resultado.ambiente); }
});

test('comprovante com mesmo WhatsApp exige contrato explícito e rejeita contrato de outro contato e LID', () => {
    const resultado=executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok(this.lastID)}));
        const all=s=>new Promise((ok,no)=>db.all(s,(e,r)=>e?no(e):ok(r)));
        const a=await run("INSERT INTO clientes(nome,telefone,plano,diasContrato,valorPlano,status) VALUES('Casa','5511999990000','Mensal',30,'30,00','ativo')");
        const b=await run("INSERT INTO clientes(nome,telefone,plano,diasContrato,valorPlano,status) VALUES('Bar','5511999990000','Mensal',30,'40,00','ativo')");
        const outro=await run("INSERT INTO clientes(nome,telefone,status) VALUES('Outro','5511888880000','ativo')");
        const svc=require('./services/pagamentoManualService');
        const dados={telefone:'5511999990000@c.us',messageId:'teste',mimetype:'image/png',arquivo:Buffer.from('89504e470d0a1a0a0000000','hex')};
        const pendente=await svc.registrarComprovanteWhatsapp(dados);
        const invalido=await svc.registrarComprovanteWhatsapp({...dados,clienteId:outro});
        const lid=await svc.registrarComprovanteWhatsapp({...dados,telefone:'5511999990000@lid'});
        const antes=(await all('SELECT id FROM cobrancas_pix')).length;
        const certo=await svc.registrarComprovanteWhatsapp({...dados,clienteId:b});
        const duplicado=await svc.registrarComprovanteWhatsapp({...dados,clienteId:a});
        const registros=await all('SELECT clienteId,status,valorTotal FROM cobrancas_pix');
        const pagamentos=(await all('SELECT id FROM cliente_pagamentos')).length;
        console.log(JSON.stringify({motivo:pendente.motivo,opcoes:pendente.assinaturas.map(x=>x.nome),invalido:invalido.motivo,lid:lid.motivo,antes,clienteCorreto:certo.clienteId===b,duplicado:duplicado.duplicado,registros:registros.map(x=>({correto:x.clienteId===b,status:x.status,valor:x.valorTotal})),pagamentos}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try {assert.deepEqual(JSON.parse(resultado.stdout),{motivo:'selecionar_assinatura',opcoes:['Casa','Bar'],invalido:'selecionar_assinatura',lid:'cliente_nao_encontrado',antes:0,clienteCorreto:true,duplicado:true,registros:[{correto:true,status:'aguardando_conferencia',valor:'40.00'}],pagamentos:0});}
    finally {removerAmbiente(resultado.ambiente);}
});

test('WhatsApp pede assinatura com digitação e resolve LID pelo telefone real, sem afetar controles do robô', async () => {
    const vm=require('node:vm');
    const fonte=fs.readFileSync(path.join(repoRoot,'config/whatsapp.js'),'utf8');
    const trecho=fonte.slice(fonte.indexOf('async function obterTelefoneParaComprovante'),fonte.indexOf('function ehEventoInternoWhatsapp'));
    const eventos=[]; let escolha;
    const contexto={Buffer,console:{log(){}},
        telefoneValido:v=>v.replace('@c.us',''),obterTelefoneClienteMensagem:async()=>{eventos.push('resolver');return '5511999990000@c.us'},
        obterTextoMensagem:m=>m.body,getMessageId:()=> 'midia',obterTelefoneMensagem:()=> '123456789@lid',
        registrarComprovanteWhatsapp:async d=>{escolha=d.clienteId;return {motivo:'selecionar_assinatura',assinaturas:[{id:7,nome:'Casa'},{id:8,nome:'Bar'}]}},
        licencaPermiteUso:async()=>true,roboPodeResponderMensagens:async()=>true,
        simularRespostaHumanizada:async(_m,d)=>eventos.push('digitando:'+d),registrarEnvioDoRobo:()=>eventos.push('registrar'),
        client:{sendMessage:async(d,t)=>{eventos.push('enviar:'+d);assert.match(t,/assinatura 7/);return {}}},
        registrarMensagemDoRobo:()=>eventos.push('propria')};
    vm.createContext(contexto);vm.runInContext(trecho,contexto);
    const message={hasMedia:true,body:'assinatura 8',downloadMedia:async()=>({mimetype:'image/png',data:'YWJj'})};
    await contexto.registrarComprovantePixRecebido(message);
    assert.equal(escolha,8);
    assert.deepEqual(eventos,['resolver','digitando:5511999990000@c.us','registrar','enviar:5511999990000@c.us','propria']);
    contexto.roboPodeResponderMensagens=async()=>false;eventos.length=0;
    await contexto.registrarComprovantePixRecebido(message);
    assert.deepEqual(eventos,['resolver']);
});

test('anonimização, troca de telefone e exclusão removem vínculo e telefone retido', () => {
    const resultado=executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok(this.lastID)}));
        const count=()=>new Promise((ok,no)=>db.get('SELECT COUNT(*) n FROM cliente_assinaturas_vinculos',(e,r)=>e?no(e):ok(r.n)));
        const a=await run("INSERT INTO clientes(nome,telefone) VALUES('Casa','5511999990000')");
        const b=await run("INSERT INTO clientes(nome,telefone) VALUES('Bar','5511999990000')");
        const svc=require('./services/assinaturasResponsavelService');
        await svc.alterarVinculo(a,b,true);const ligado=await count();
        await run('UPDATE clientes SET anonimizadoEm=CURRENT_TIMESTAMP WHERE id=?',[b]);const anonimizado=await count();
        await run("UPDATE clientes SET anonimizadoEm='' WHERE id=?",[b]);await svc.alterarVinculo(a,b,true);
        await run("UPDATE clientes SET telefone='5511888880000' WHERE id=?",[b]);const telefone=await count();
        await run("UPDATE clientes SET telefone='5511999990000' WHERE id=?",[b]);await svc.alterarVinculo(a,b,true);
        await run('DELETE FROM clientes WHERE id=?',[b]);const excluido=await count();
        console.log(JSON.stringify({ligado,anonimizado,telefone,excluido}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try{assert.deepEqual(JSON.parse(resultado.stdout),{ligado:1,anonimizado:0,telefone:0,excluido:0})}
    finally{removerAmbiente(resultado.ambiente)}
});
