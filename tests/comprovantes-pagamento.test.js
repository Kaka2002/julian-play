const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {executarIsolado,removerAmbiente,repoRoot}=require('./helpers/isolated');
const fixture=`const assert=require('node:assert/strict');const db=require('./database/sqlite');await db.ready;
const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok(this.lastID)}));
const all=(s,p=[])=>new Promise((ok,no)=>db.all(s,p,(e,r)=>e?no(e):ok(r)));
const a=await run("INSERT INTO clientes(nome,telefone,vencimento,status) VALUES('Casa','5511999990000','2099-01-01','ativo')");
const b=await run("INSERT INTO clientes(nome,telefone,vencimento,status) VALUES('Bar','5511999990000','2099-02-01','ativo')");
const pa=await run("INSERT INTO cliente_pagamentos(clienteId,plano,valorTotal,dataPagamento) VALUES(?,'Mensal','35,00','2026-10-28T12:00')",[a]);
const pb=await run("INSERT INTO cliente_pagamentos(clienteId,plano,valorTotal,dataPagamento) VALUES(?,'Mensal','45,00','2026-10-28T12:00')",[b]);
const svc=require('./services/comprovantesPagamentoService');const png=i=>Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from([i])]);`;
function isolado(codigo){const r=executarIsolado('(async()=>{'+fixture+codigo+";console.log(JSON.stringify({sucesso:true}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})");try{assert.deepEqual(JSON.parse(r.stdout),{sucesso:true})}finally{removerAmbiente(r.ambiente)}}

test('comprovante opcional preserva pagamento, contrato e mensagens; valida tipo, limite, dono, duplicidade e integridade',()=>isolado(`
 const clientes=await all('SELECT * FROM clientes ORDER BY id'),pagamentos=await all('SELECT * FROM cliente_pagamentos ORDER BY id');
 assert.deepEqual(await svc.listar(a,pa),[]);
 const {listarPagamentosCliente}=require('./services/clientes');
 assert.equal((await listarPagamentosCliente(a))[0].quantidadeComprovantes,0);
 const primeiro=await svc.anexar(a,pa,png(0),'image/png','operador');
 assert.equal((await listarPagamentosCliente(a))[0].quantidadeComprovantes,1);
 assert.equal((await listarPagamentosCliente(b))[0].quantidadeComprovantes,0);
 assert.equal((await svc.anexar(a,pa,png(0),'image/png','operador')).id,primeiro.id);
 assert.deepEqual((await svc.obter(a,pa,primeiro.id)).conteudo,png(0));
 assert.deepEqual(await svc.listar(b,pb),[]);
 await assert.rejects(svc.obter(b,pb,primeiro.id),e=>e.status===404);
 await assert.rejects(svc.anexar(b,pa,png(0),'image/png'),e=>e.status===404);
 await assert.rejects(svc.anexar(a,pa,Buffer.from('<html>script</html>'),'image/png'),e=>e.status===415);
 await assert.rejects(svc.anexar(a,pa,png(0),'text/html'),e=>e.status===415);
 await assert.rejects(svc.anexar(a,pa,Buffer.alloc(5*1024*1024+1),'image/png'),e=>e.status===400);
 await assert.rejects(svc.anexar(a,pa,Buffer.alloc(0),'image/png'),e=>e.status===400);
 await assert.rejects(svc.listar('../x',pa),e=>e.status===404);
 for(let i=1;i<5;i++)await svc.anexar(a,pa,png(i),'image/png');
 await assert.rejects(svc.anexar(a,pa,png(5),'image/png'),/cinco comprovantes/);
 assert.equal((await svc.listar(a,pa)).length,5);
 await run('UPDATE cliente_pagamento_comprovantes SET conteudo=? WHERE id=?',[png(99),primeiro.id]);
 await assert.rejects(svc.obter(a,pa,primeiro.id),e=>e.status===409);
 await svc.remover(a,pa,primeiro.id,'operador');
 assert.equal((await svc.listar(a,pa)).length,4);
 assert.equal((await listarPagamentosCliente(a))[0].quantidadeComprovantes,4);
 await assert.rejects(svc.obter(a,pa,primeiro.id),e=>e.status===404);
 assert.deepEqual(await all('SELECT * FROM clientes ORDER BY id'),clientes);
 assert.deepEqual(await all('SELECT * FROM cliente_pagamentos ORDER BY id'),pagamentos);
 assert.equal((await all('SELECT * FROM mensagens_saida_fila')).length,0);
 assert.equal((await all('SELECT * FROM renovacoes_painel_fila')).length,0);
 const pdf=Buffer.from('255044462d312e340a2525454f46','hex');const jpg=Buffer.from('ffd8ffe000104a46494600ffd9','hex');
 const pdfItem=await svc.anexar(b,pb,pdf,'application/pdf');const jpgItem=await svc.anexar(b,pb,jpg,'image/jpeg');
 assert.deepEqual((await svc.obter(b,pb,pdfItem.id)).conteudo,pdf);assert.equal((await svc.obter(b,pb,pdfItem.id)).tipo,'application/pdf');
 assert.deepEqual((await svc.obter(b,pb,jpgItem.id)).conteudo,jpg);assert.equal((await svc.obter(b,pb,jpgItem.id)).tipo,'image/jpeg');
 assert.equal((await all("SELECT * FROM cliente_auditoria WHERE tipo='comprovante_anexado'")).length,7);
 assert.equal((await all("SELECT * FROM cliente_auditoria WHERE tipo='comprovante_removido'")).length,1);
`));

test('comprovantes acompanham backup e são removidos na anonimização ou exclusão sem afetar outro cliente',()=>isolado(`
 const x=await svc.anexar(a,pa,png(1),'image/png');const y=await svc.anexar(b,pb,png(2),'image/png');
 const backup=await require('./services/manutencao').criarBackupManual();
 const sqlite=require('sqlite3');const copia=await new Promise((ok,no)=>{const c=new sqlite.Database(backup.caminho,sqlite.OPEN_READONLY,e=>e?no(e):ok(c))});
 const salvo=await new Promise((ok,no)=>copia.get('SELECT conteudo FROM cliente_pagamento_comprovantes WHERE id=?',[x.id],(e,r)=>e?no(e):ok(r)));
 assert.deepEqual(salvo.conteudo,png(1));await new Promise(ok=>copia.close(ok));
 await run('UPDATE clientes SET anonimizadoEm=CURRENT_TIMESTAMP WHERE id=?',[a]);
 assert.equal((await all('SELECT id FROM cliente_pagamento_comprovantes WHERE clienteId=?',[a])).length,0);
 await assert.rejects(svc.anexar(a,pa,png(3),'image/png'),e=>e.status===404);
 assert.equal((await svc.listar(b,pb)).length,1);
 await run('UPDATE cliente_pagamentos SET excluidoEm=CURRENT_TIMESTAMP WHERE id=?',[pb]);
 await assert.rejects(svc.obter(b,pb,y.id),e=>e.status===404);
 await run('DELETE FROM cliente_pagamentos WHERE id=?',[pb]);
 assert.equal((await all('SELECT * FROM cliente_pagamento_comprovantes')).length,0);
`));

test('rotas usam sessão real e CSRF, isolam assinatura e servem bytes privados sem cache',()=>isolado(`
 const express=require('express');const {csrfMiddleware}=require('./services/securityService');const auth=require('./services/authService');
 const app=express();app.use(express.urlencoded({extended:true}));app.use(express.json());app.use(csrfMiddleware({isento:req=>req.is('application/json')}));app.use(auth.protegerPainel);app.use(require('./routes/comprovantesPagamentoRoute')());
 app.use((e,req,res,next)=>res.status(e.status||500).json({erro:'Falha controlada'}));
 const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s))});const origem='http://127.0.0.1:'+server.address().port;const base=origem+'/clientes/'+a+'/pagamentos/'+pa+'/comprovantes';
 let r=await fetch(base,{redirect:'manual'});assert.equal(r.status,302);const csrf=r.headers.get('set-cookie').match(/julian_csrf=([^;]+)/)[1];
 const sessao=await auth.criarSessao('operador');const cookie='julian_csrf='+csrf+'; julian_play_session='+sessao.token;
 r=await fetch(base,{method:'POST',headers:{cookie,'content-type':'image/png'},body:png(1)});assert.equal(r.status,403);
 r=await fetch(base,{method:'POST',headers:{cookie:'julian_csrf='+csrf,'content-type':'image/png','x-csrf-token':decodeURIComponent(csrf)},body:png(1)});assert.equal(r.status,401);
 const headers={cookie,'content-type':'image/png','x-csrf-token':decodeURIComponent(csrf)};
 r=await fetch(base,{method:'POST',headers,body:png(1)});assert.equal(r.status,201);const item=await r.json();assert.equal(Object.hasOwn(item,'conteudo'),false);
 r=await fetch(base+'/'+item.id,{headers:{cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('content-disposition'),/inline; filename="comprovante-/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),png(1));
 r=await fetch(origem+'/clientes/'+b+'/pagamentos/'+pb+'/comprovantes/'+item.id,{headers:{cookie}});assert.equal(r.status,404);
 r=await fetch(base,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({conteudo:'arquivo'})});assert.equal(r.status,400);
 r=await fetch(base+'/'+item.id+'/remover',{method:'POST',headers:{cookie}});assert.equal(r.status,403);
 r=await fetch(base+'/'+item.id+'/remover',{method:'POST',headers:{cookie,'x-csrf-token':decodeURIComponent(csrf)}});assert.equal(r.status,204);
 r=await fetch(base,{headers:{cookie}});assert.deepEqual(await r.json(),[]);await new Promise(ok=>server.close(ok));
`));

test('interface oferece anexo separado do financeiro e Mestre não monta rotas de clientes',()=>{
 const view=fs.readFileSync(path.join(repoRoot,'services/comprovantesPagamentoView.js'),'utf8');
 const principal=fs.readFileSync(path.join(repoRoot,'routes/clientesRoute.js'),'utf8');
 const master=fs.readFileSync(path.join(repoRoot,'master/app.js'),'utf8');
 assert.match(view,/Anexar comprovante/);assert.match(view,/não altera o pagamento/);assert.doesNotMatch(view,/location\.reload/);
 assert.match(principal,/anexarComprovante/);assert.match(principal,/comprovantesPagamentoRoute/);assert.doesNotMatch(master,/comprovantesPagamentoRoute/);
});
