const test=require('node:test'); const assert=require('node:assert/strict');
const fs=require('fs'); const path=require('path');
const {executarIsolado,removerAmbiente,repoRoot}=require('./helpers/isolated');

test('navegação consulta sessão sem gravar a cada página e mantém revogação imediata', () => {
    const r = executarIsolado(`(async()=>{
        const db=require('./database/sqlite'); const a=require('./services/authService');
        const sessao=await a.criarSessao('teste');const req={headers:{cookie:'julian_play_session='+sessao.token}};
        let escritas=0;const run=db.run.bind(db);db.run=function(sql,...args){if(sql.startsWith('UPDATE sessoes_painel SET ultimoAcessoEm'))escritas++;return run(sql,...args)};
        await a.obterSessao(req);await a.obterSessao(req);
        const recentes=escritas;
        await new Promise((ok,erro)=>db.run('UPDATE sessoes_painel SET ultimoAcessoEm = ?', ['2000-01-01T00:00:00Z'], e=>e?erro(e):ok()));
        escritas=0;await a.obterSessao(req);const antiga=escritas;
        await a.encerrarSessao(req);const revogada=await a.obterSessao(req);
        process.stdout.write(JSON.stringify({recentes,antiga,revogada}));process.exit(0);
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try { assert.deepEqual(JSON.parse(r.stdout), { recentes: 0, antiga: 1, revogada: null }); }
    finally { removerAmbiente(r.ambiente); }
});

test('HTML desativa atalhos do LastPass em todos os campos e formularios',()=>{const s=require('../services/securityService');const html=s.desativarAtalhosGerenciadorSenhas('<html><head></head><body><form><input type="password" data-autofill-empty="true"><textarea></textarea><select></select></form></body></html>');assert.equal((html.match(/data-lpignore="true"/g)||[]).length,4);assert.match(html,/julian-play-password-manager-style/);assert.match(html,/julian-play-password-manager-control/);assert.match(html,/campo-segredo-manual/);assert.match(html,/el\.type = 'text'/);assert.match(html,/data-1p-ignore/);assert.match(html,/data-bwignore/);assert.match(html,/usuarioDigitou/);assert.match(html,/setInterval\(\(\) => limpar\(\), 250\)/);assert.match(html,/clearInterval\(vigilancia\)/);assert.match(html,/MutationObserver/)});

test('pagina de login preserva preenchimento automatico',()=>{const s=require('../services/securityService');const html=s.desativarAtalhosGerenciadorSenhas('<form method="post" action="/login"><input name="usuario" autocomplete="username"><input type="password" name="senha" autocomplete="current-password"></form>');assert.doesNotMatch(html.match(/<form[\s\S]*?<\/form>/)[0],/data-lpignore/);assert.match(html,/autocomplete="username"/);assert.match(html,/autocomplete="current-password"/)});

test('campos de anonimização sempre abrem vazios e bloqueiam autofill tardio',()=>{const rota=fs.readFileSync(path.join(repoRoot,'routes','clientesRoute.js'),'utf8');const inicio=rota.indexOf('Digite ANONIMIZAR');const formulario=rota.slice(inicio,inicio+900);assert.match(formulario,/ATRIBUTOS_CAMPO_SEMPRE_VAZIO[\s\S]*senhaConfirmacao/);assert.equal((formulario.match(/readonly onfocus=/g)||[]).length,2);assert.equal((formulario.match(/this\.value=/g)||[]).length,2)});

test('CAPTCHA assinado aceita resposta correta e rejeita alteracao',()=>{const r=executarIsolado(`const s=require('./services/securityService');const c=s.criarCaptcha();const partes=c.pergunta.split(' ');const resposta=Number(partes[0])+Number(partes[2]);process.stdout.write(JSON.stringify([s.validarCaptcha(c.desafio,resposta),s.validarCaptcha(c.desafio,resposta+1),s.validarCaptcha(c.desafio+'x',resposta)]))`);try{assert.deepEqual(JSON.parse(r.stdout),[true,false,false])}finally{removerAmbiente(r.ambiente)}});

test('reCAPTCHA so ativa com as duas chaves e valida a resposta no servidor',async()=>{const site=process.env.RECAPTCHA_SITE_KEY;const segredo=process.env.RECAPTCHA_SECRET_KEY;process.env.RECAPTCHA_SITE_KEY='site-publica-teste';process.env.RECAPTCHA_SECRET_KEY='segredo-teste';try{const s=require('../services/securityService');assert.equal(s.recaptchaConfigurado(),true);const ok=await s.validarRecaptcha('token',{fetch:async()=>({ok:true,json:async()=>({success:true,hostname:'painel.julianplay.com.br'})})});const recusado=await s.validarRecaptcha('',{fetch:async()=>{throw new Error('nao deve chamar')}});assert.equal(ok.valido,true);assert.equal(recusado.valido,false)}finally{if(site===undefined)delete process.env.RECAPTCHA_SITE_KEY;else process.env.RECAPTCHA_SITE_KEY=site;if(segredo===undefined)delete process.env.RECAPTCHA_SECRET_KEY;else process.env.RECAPTCHA_SECRET_KEY=segredo}});
test('reCAPTCHA usa CAPTCHA matematico nos enderecos locais',()=>{const site=process.env.RECAPTCHA_SITE_KEY;const segredo=process.env.RECAPTCHA_SECRET_KEY;process.env.RECAPTCHA_SITE_KEY='site-publica-teste';process.env.RECAPTCHA_SECRET_KEY='segredo-teste';try{const s=require('../services/securityService');assert.equal(s.recaptchaDisponivelParaRequisicao({headers:{host:'painel.julianplay.com.br'}}),true);assert.equal(s.recaptchaDisponivelParaRequisicao({headers:{host:'localhost:10000'}}),false);assert.equal(s.recaptchaDisponivelParaRequisicao({headers:{host:'127.0.0.1:10000'}}),false);assert.equal(s.recaptchaDisponivelParaRequisicao({headers:{host:'192.168.15.17:10000'}}),false)}finally{if(site===undefined)delete process.env.RECAPTCHA_SITE_KEY;else process.env.RECAPTCHA_SITE_KEY=site;if(segredo===undefined)delete process.env.RECAPTCHA_SECRET_KEY;else process.env.RECAPTCHA_SECRET_KEY=segredo}});

test('CSRF injeta token, bloqueia POST invalido e permite logout seguro',()=>{const r=executarIsolado(`(async()=>{const express=require('express');const s=require('./services/securityService');const app=express();app.use(express.urlencoded({extended:false}));app.use(s.csrfMiddleware({isento:req=>req.path==='/logout'}));app.get('/',(q,p)=>p.send('<form method="post" action="/salvar"></form>'));app.post('/salvar',(q,p)=>p.send('ok'));app.post('/logout',(q,p)=>p.send('saiu'));const server=await new Promise(ok=>{const x=app.listen(0,'127.0.0.1',()=>ok(x))});const base='http://127.0.0.1:'+server.address().port;const get=await fetch(base+'/');const html=await get.text();const cookie=get.headers.get('set-cookie').split(';')[0];const token=html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];const negado=await fetch(base+'/salvar',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'x=1'});const aceito=await fetch(base+'/salvar',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','cookie':cookie},body:'_csrf='+token});const logout=await fetch(base+'/logout',{method:'POST'});process.stdout.write(JSON.stringify({injeta:html.includes('_csrf'),negado:negado.status,aceito:aceito.status,logout:logout.status}));await new Promise(ok=>server.close(ok))})().catch(e=>{console.error(e);process.exit(1)})`);try{assert.deepEqual(JSON.parse(r.stdout),{injeta:true,negado:403,aceito:200,logout:200})}finally{removerAmbiente(r.ambiente)}});

test('logout revoga imediatamente e sessao persiste no banco',()=>{const r=executarIsolado(`(async()=>{const a=require('./services/authService');const s=await a.criarSessao('admin',{headers:{'user-agent':'teste'},ip:'127.0.0.1'});const req={headers:{cookie:'julian_play_session='+s.token}};const antes=!!(await a.obterSessao(req));delete require.cache[require.resolve('./services/authService')];const recarregado=require('./services/authService');const persistiu=!!(await recarregado.obterSessao(req));await recarregado.encerrarSessao(req);process.stdout.write(JSON.stringify([antes,persistiu,!!(await recarregado.obterSessao(req))]));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);try{assert.deepEqual(JSON.parse(r.stdout),[true,true,false])}finally{removerAmbiente(r.ambiente)}});

test('health externo nao expoe numero nem ultimos contatos do WhatsApp',()=>{const bot=fs.readFileSync(path.join(repoRoot,'bot.js'),'utf8');const inicio=bot.indexOf("app.get('/health'");const fim=bot.indexOf('app.use(protegerPainel)',inicio);const rota=bot.slice(inicio,fim);assert.match(rota,/cf-connecting-ip/);assert.match(rota,/x-forwarded-for/);assert.match(rota,/origemLocal/);const respostaExterna=rota.slice(0,rota.indexOf('res.status(200).json({',rota.indexOf('return res.status(200).json({')+10));assert.doesNotMatch(respostaExterna,/numeroConectado|ultimaMensagemRecebidaDe|ultimoEnvioRoboPara/)});

test('falha de rede, timeout e HTTP do reCAPTCHA falham fechados com motivo proprio', async () => {
    const site=process.env.RECAPTCHA_SITE_KEY, segredo=process.env.RECAPTCHA_SECRET_KEY;
    process.env.RECAPTCHA_SITE_KEY='site-teste'; process.env.RECAPTCHA_SECRET_KEY='segredo-teste';
    try {
        const s=require('../services/securityService');
        const timeout=await s.validarRecaptcha('token',{timeoutMs:5,fetch:(_,o)=>new Promise((ok,no)=>o.signal.addEventListener('abort',()=>{const e=new Error('timeout');e.name='AbortError';no(e)}))});
        const rede=await s.validarRecaptcha('token',{fetch:async()=>{throw new Error('rede')}});
        const http=await s.validarRecaptcha('token',{fetch:async()=>({ok:false,json:async()=>{throw new Error('nao deve ler HTML')}})});
        assert.deepEqual([timeout,rede,http].map(r=>[r.valido,r.motivo]),[[false,'tempo_esgotado'],[false,'falha_de_rede'],[false,'servico_indisponivel']]);
    } finally {
        if(site===undefined)delete process.env.RECAPTCHA_SITE_KEY;else process.env.RECAPTCHA_SITE_KEY=site;
        if(segredo===undefined)delete process.env.RECAPTCHA_SECRET_KEY;else process.env.RECAPTCHA_SECRET_KEY=segredo;
    }
});

test('login nao penaliza indisponibilidade do Google e continua recusando captcha invalido', () => {
    const r=executarIsolado(`(async()=>{
        const assert=require('node:assert/strict');process.env.PANEL_USER='teste';process.env.PANEL_PASSWORD='senha-ficticia-de-teste';
        const db=require('./database/sqlite');await db.ready;
        const seguranca=require('./services/securityService');seguranca.recaptchaDisponivelParaRequisicao=()=>true;
        let motivo='tempo_esgotado';seguranca.validarRecaptcha=async()=>({valido:false,motivo});
        const login=require('./services/loginSecurityService');let falhas=0;login.registrarFalha=async()=>{falhas++};
        const express=require('express');const app=express();app.use(express.urlencoded({extended:false}));app.use(require('./routes/authRoute'));
        const servidor=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s))});
        try {
            for(const falha of ['tempo_esgotado','falha_de_rede','servico_indisponivel']) {
                motivo=falha;const res=await fetch('http://127.0.0.1:'+servidor.address().port+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:'usuario=teste&senha=ficticia'});
                assert.equal(res.status,302);assert.match(decodeURIComponent(res.headers.get('location')),/Google/);
            }
            assert.equal(falhas,0);
            motivo='timeout-or-duplicate';await fetch('http://127.0.0.1:'+servidor.address().port+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:'usuario=teste&senha=ficticia'});
            assert.equal(falhas,1);
            login.bloqueioAtual=async()=>{const e=new Error('detalhe privado');e.code='SQLITE_BUSY';throw e};
            const ocupado=await fetch('http://127.0.0.1:'+servidor.address().port+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:'usuario=outro&senha=ficticia'});
            assert.equal(ocupado.status,503);assert.equal(ocupado.headers.get('retry-after'),'5');assert.doesNotMatch(await ocupado.text(),/detalhe privado|SQLITE_BUSY|ficticia/);assert.equal(ocupado.headers.get('set-cookie'),null);
            console.log('ok');
        } finally { await new Promise(ok=>servidor.close(ok));await db.encerrar(); }
    })().catch(e=>{console.error(e);process.exit(1)})`,{timeout:90000});
    try{assert.equal(r.stdout,'ok')}finally{removerAmbiente(r.ambiente)}
});

test('consultas de modelos e verificacao sem credito nao disputam escrita com login', () => {
    const r=executarIsolado(`(async()=>{
        const db=require('./database/sqlite');await db.ready;
        const assert=require('node:assert/strict');const modelos=require('./services/modelosMensagem');const indicacoes=require('./services/indicacoesService');
        const listas=await Promise.all([modelos.listarModelos(),modelos.listarModelos(),modelos.listarModelos()]);
        const modelo=listas[0].find(m=>m.chave==='bonus_periodo_aplicado');
        await modelos.salvarModelo({...modelo,texto:'Personalizado preservado'});
        const sqlite3=require('sqlite3');const Database=sqlite3.Database;let conexoes=0,escritas=0;
        sqlite3.Database=function(...args){conexoes++;return new Database(...args)};
        const run=db.run;db.run=function(sql,...args){escritas++;return run.call(this,sql,...args)};
        const outros=await Promise.all([modelos.listarModelos(),modelos.buscarModeloPorId(modelo.id),modelos.montarMensagemAvisoProgramado({nome:'Teste',plano:'Mensal'},5),indicacoes.processarCreditosIndicacoes()]);
        assert.equal(outros[1].texto,'Personalizado preservado');assert.equal(escritas,0);assert.equal(conexoes,0);
        db.run=run;sqlite3.Database=Database;
        const escritor=await new Promise((ok,no)=>{const c=new Database(db.dbPath,e=>e?no(e):ok(c))});
        const escrita=(conexao,sql)=>new Promise((ok,no)=>conexao.run(sql,e=>e?no(e):ok()));
        await escrita(escritor,'BEGIN IMMEDIATE');
        const liberar=new Promise((ok,no)=>setTimeout(()=>escrita(escritor,'COMMIT').then(ok,no),100));
        await Promise.all([liberar,escrita(db,"INSERT OR REPLACE INTO configuracoes(chave,valor) VALUES('regressao_disputa_breve','preservado')")]);
        await new Promise(ok=>escritor.close(ok));
        await modelos.removerModelo(modelo.id);assert.ok((await modelos.listarModelos()).some(m=>m.chave==='bonus_periodo_aplicado'));
        await db.encerrar();console.log('ok');
    })().catch(e=>{console.error(e);process.exit(1)})`,{timeout:90000});
    try{assert.equal(r.stdout,'ok')}finally{removerAmbiente(r.ambiente)}
});
