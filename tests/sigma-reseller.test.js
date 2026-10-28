const test=require('node:test');
const assert=require('node:assert/strict');
const {criarClienteSigma,BASE,validarBase,resultadoConsultaHtml}=require('../services/sigmaResellerService');
let indice=0;
const cliente=transporte=>criarClienteSigma({apiUrl:BASE,apiToken:'token-ficticio-'+(++indice)},transporte);
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
test('Sigma consulta perfil, catalogo paginado e usuario exato sem expor senha nem enviar mutacoes',async()=>{
    const chamadas=[];
    const api=cliente(async(url,op)=>{chamadas.push({url,...op});if(url.endsWith('/me'))return json({data:{id:'revenda-teste',creditsBalance:12,password:'nao-exibir'}});if(url.includes('/packages?'))return json({data:[{id:'p1',name:'Mensal',credits:1,duration:1,duration_in:'MONTHS',password:'nao-exibir'}],meta:{last_page:3}});return json({data:{id:'c1',username:'teste /+@',password:'nao-exibir',m3u_url:'privado',connections:2,status:'ACTIVE',expires_at:'2099-01-01'}});});
    assert.deepEqual(await api.perfil(),{id:'revenda-teste',creditos:12});
    const pacotes=await api.catalogo('packages',2);assert.equal(pacotes.ultima,3);assert.equal(pacotes.itens[0].credits,1);
    const assinatura=await api.assinatura('teste /+@');assert.equal(assinatura.id,'c1');
    assert.ok(chamadas.every(x=>x.method==='GET'&&x.redirect==='manual'&&!x.body));
    assert.ok(chamadas[1].url.endsWith('/packages?page=2&per_page=25'));
    assert.ok(chamadas[2].url.endsWith('/customers/by-username/teste%20%2F%2B%40'));
    assert.ok(!JSON.stringify([pacotes,assinatura]).includes('nao-exibir'));assert.ok(!('m3u_url' in assinatura));
});
test('Sigma recusa URL arbitraria, credenciais em URL, parametros invalidos e assinatura divergente',async()=>{
    for(const u of ['http://127.0.0.1',BASE+'?token=x','https://evil.test/api',BASE+'/me','https://u:p@auratvpainel.com/api/reseller-api/v1'])assert.throws(()=>validarBase(u));
    assert.equal(validarBase(BASE+'/'),BASE);
    const api=cliente(async()=>json({data:{id:'c1',username:'outro'}}));
    await assert.rejects(api.catalogo('customers'),/inválida/);await assert.rejects(api.catalogo('servers',0),/inválida/);
    await assert.rejects(api.assinatura(''),/usuário exato/);await assert.rejects(api.assinatura('teste'),/diferente/);
});
test('Sigma nao repete chamadas em erros, omite corpo remoto e respeita Retry-After',async()=>{
    for(const status of [401,402,403,404,409,429,500,302]){
        let chamadas=0;const api=cliente(async()=>{chamadas++;return json({message:'SEGREDO-REMOTO'},status,{'retry-after':'60'});});
        await assert.rejects(api.perfil(),e=>e.status===status&&!e.message.includes('SEGREDO'));
        if(status===429)await assert.rejects(api.perfil(),e=>e.status===429);
        assert.equal(chamadas,1);
    }
});
test('Sigma rejeita HTML, JSON invalido, respostas excessivas e falhas de transporte sem vazar token',async()=>{
    for(const transporte of [async()=>new Response('<html>desafio</html>',{headers:{'content-type':'text/html'}}),async()=>new Response('{',{headers:{'content-type':'application/json'}}),async()=>json({data:null}),async()=>json({data:'x'.repeat(600000)}),async()=>{throw new Error('Bearer SEGREDO');}]){
        await assert.rejects(cliente(transporte).perfil(),e=>!e.message.includes('SEGREDO'));
    }
});
test('Sigma compartilha ritmo por token e mostra campos legiveis escapados',async()=>{
    const instantes=[];const p={apiUrl:BASE,apiToken:'ritmo-ficticio'};const transporte=async()=>{instantes.push(Date.now());return json({data:{id:'r',creditsBalance:2}});};
    await Promise.all([criarClienteSigma(p,transporte).perfil(),criarClienteSigma(p,transporte).perfil()]);
    assert.ok(instantes[1]-instantes[0]>=550);
    const escapar=s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;');assert.ok(resultadoConsultaHtml({username:'<script>'},escapar).includes('&lt;script&gt;'));
});
test('Sigma configurado preserva token criptografado, configuracoes e bloqueia renovacao automatica',()=>{
    const {executarIsolado,removerAmbiente}=require('./helpers/isolated');
    const r=executarIsolado(`(async()=>{const assert=require('node:assert/strict');const db=require('./database/sqlite');await db.ready;const s=require('./services/appsDispositivos');const p=await s.salvarPainel({nome:'Sigma ficticio',tipoIntegracao:'sigma_reseller',apiUrl:${JSON.stringify(BASE)},apiToken:'token-ficticio',renovacaoAutomatica:'0'});const q=await s.salvarPainel({...p,apiToken:'',nome:'Sigma editado'});assert.equal(q.apiToken,'token-ficticio');await assert.rejects(s.salvarPainel({...q,renovacaoAutomatica:'1'}),/somente para consulta/);const raw=await new Promise((ok,no)=>db.get('SELECT apiToken FROM paineis WHERE id=?',[p.id],(e,r)=>e?no(e):ok(r)));assert.ok(raw.apiToken.startsWith('jplay:v1:'));console.log('OK');process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`,{env:{LICENSE_ADMIN_TOKEN:'chave-ficticia-isolada'}});
    try{assert.equal(r.stdout,'OK');}finally{removerAmbiente(r.ambiente);}
});
test('Sigma permanece isolado por instalacao e nao envia renovacao da fila generica nos perfis clientes',()=>{
    const {executarIsolado,removerAmbiente}=require('./helpers/isolated');
    for(const perfil of [{LICENSE_ROLE:'admin',LICENSE_CUSTOMER_NAME:''},{LICENSE_ROLE:'client',LICENSE_CUSTOMER_NAME:'Comercial ficticio'},{LICENSE_ROLE:'client',LICENSE_CUSTOMER_NAME:'Local ficticio'}]){
        const r=executarIsolado(`(async()=>{const assert=require('node:assert/strict');const db=require('./database/sqlite');await db.ready;const p=await require('./services/appsDispositivos').salvarPainel({nome:'Sigma isolado',tipoIntegracao:'sigma_reseller',apiUrl:${JSON.stringify(BASE)},apiToken:'ficticio'});const run=(s,a=[])=>new Promise((ok,no)=>db.run(s,a,e=>e?no(e):ok()));await run("INSERT INTO renovacoes_painel_fila(protocolo,cobrancaId,pagamentoId,clienteId,painelId,requisicao) VALUES('ficticio',1,1,1,?,?)",[p.id,JSON.stringify({action:'renew'})]);global.fetch=async()=>{throw new Error('HTTP PROIBIDO');};await require('./services/renovacaoPainelService').processarFilaRenovacoes();const row=await new Promise((ok,no)=>db.get('SELECT status,erro FROM renovacoes_painel_fila',(e,r)=>e?no(e):ok(r)));assert.notEqual(row.status,'concluida');assert.match(row.erro,/somente para consulta/);console.log('OK');process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`,{env:{...perfil,LICENSE_ADMIN_TOKEN:'chave-ficticia-isolada'}});
        try{assert.equal(r.stdout,'OK');}finally{removerAmbiente(r.ambiente);}
    }
    const fs=require('fs'),path=require('path');assert.ok(!fs.readFileSync(path.join(__dirname,'../master/app.js'),'utf8').includes("require('../routes/paineisRoute')"));
});
test('consulta Sigma exige sessao e CSRF reais e nao mostra resposta remota bruta',()=>{
    const {executarIsolado,removerAmbiente}=require('./helpers/isolated');
    const r=executarIsolado(`(async()=>{const assert=require('node:assert/strict');const express=require('express');const db=require('./database/sqlite');await db.ready;const {csrfMiddleware}=require('./services/securityService');const auth=require('./services/authService');let chamadas=0;global.fetchOriginal=global.fetch;const sigma=require('./services/sigmaResellerService');sigma.criarClienteSigma=()=>({perfil:async()=>{chamadas++;return {id:'r',creditos:5};}});const app=express();app.use(express.urlencoded({extended:false}));app.use(csrfMiddleware());app.use(auth.protegerPainel);app.use(require('./routes/paineisRoute')({confirmarSenhaAcaoCritica:(req,res,next)=>next(),buscarPainelPorId:async()=>({id:1,tipoIntegracao:'sigma_reseller',ativo:1}),renderizar:(res,p)=>res.send(p.conteudo),escapar:x=>String(x).replaceAll('<','&lt;')}));const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});const url='http://127.0.0.1:'+server.address().port+'/paineis/1/sigma/consultar';let r=await fetch(url,{redirect:'manual'});const csrf=r.headers.get('set-cookie').match(/julian_csrf=([^;]+)/)[1];const sessao=await auth.criarSessao('operador');const cookie='julian_csrf='+csrf+'; julian_play_session='+sessao.token;r=await fetch(url,{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:'consulta=perfil'});assert.equal(r.status,403);r=await fetch(url,{method:'POST',headers:{cookie:'julian_csrf='+csrf,'x-csrf-token':decodeURIComponent(csrf),'content-type':'application/x-www-form-urlencoded'},body:'consulta=perfil'});assert.equal(r.status,401);assert.equal(chamadas,0);r=await fetch(url,{method:'POST',headers:{cookie,'x-csrf-token':decodeURIComponent(csrf),'content-type':'application/x-www-form-urlencoded'},body:'consulta=perfil'});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(await r.text(),/Saldo em créditos/);assert.equal(chamadas,1);await new Promise(ok=>server.close(ok));await new Promise(ok=>db.close(ok));console.log('OK');process.exitCode=0})().catch(e=>{console.error(e);process.exit(1)})`);
    try{assert.equal(r.stdout,'OK');}finally{removerAmbiente(r.ambiente);}
});
