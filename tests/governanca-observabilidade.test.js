const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { executarIsolado, removerAmbiente, repoRoot } = require('./helpers/isolated');

test('reclamação de campanha identifica o cliente pelo item e bloqueia marketing', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const camp=require('./services/campanhasService');const cliente=await c.salvarCliente({nome:'Cliente Reclamação',telefone:'5511999991000',tipoPlanoId:'1',diasContrato:30,valorPlano:'10,00',dataInicio:'2026-07-28T10:00',dataVencimento:'2026-08-28T23:59',status:'ativo',whatsappMarketingConsentimento:'1'});const campanha=await camp.criarCampanha({nome:'Teste governança'});const item=await camp.registrarItemCampanha(campanha.id,cliente,{status:'enviado'});const reclamacao=await camp.registrarReclamacaoCampanha({campanhaId:campanha.id,campanhaItemId:item,motivo:'Não quero receber'});const atualizado=await c.buscarClientePorId(cliente.id);const lista=await camp.listarReclamacoesCampanha(campanha.id);process.stdout.write(JSON.stringify({id:reclamacao.id>0,clienteId:reclamacao.clienteId,consentimento:atualizado.whatsappMarketingConsentimento,optout:!!atualizado.whatsappOptOutEm,total:lista.length}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const dados = JSON.parse(resultado.stdout);
        assert.equal(dados.id, true);
        assert.ok(Number(dados.clienteId) > 0);
        assert.equal(dados.consentimento, 0);
        assert.equal(dados.optout, true);
        assert.equal(dados.total, 1);
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('observabilidade compara versão sem depender de rede', () => {
    const { compararVersoes } = require('../services/observabilidadeService');
    assert.equal(compararVersoes('1.1.4', '1.1.4'), 'atualizada');
    assert.equal(compararVersoes('1.1.4', '1.2.0'), 'desatualizada');
    assert.equal(compararVersoes('2.0.0', '1.9.9'), 'adiantada');
});

test('Painel Mestre compara automaticamente a versão de cada instalação', () => {
    const provisionador = fs.readFileSync(path.join(repoRoot, 'master', 'provisionador.js'), 'utf8');
    const mestre = fs.readFileSync(path.join(repoRoot, 'master', 'app.js'), 'utf8');
    assert.match(provisionador, /compararVersoes\(dados\.version/);
    assert.match(provisionador, /versaoEsperada: packageInfo\.version/);
    assert.match(mestre, /version: packageInfo\.version/);
});

test('nova instalação do Painel Mestre exige usuário e senha sem valores automáticos', () => {
    const provisionador = fs.readFileSync(path.join(repoRoot, 'master', 'provisionador.js'), 'utf8');
    const mestre = fs.readFileSync(path.join(repoRoot, 'master', 'app.js'), 'utf8');
    assert.match(mestre, /name="usuarioPainel" value=""[^>]*data-autofill-empty="true"/);
    assert.match(mestre, /name="senhaPainel"[^>]*data-autofill-empty="true"/);
    assert.doesNotMatch(mestre, /name="usuarioPainel" value="admin" required/);
    assert.match(provisionador, /String\(dados\.usuarioPainel \|\| ''\)\.trim\(\)/);
    assert.match(provisionador, /if \(!usuarioPainel\) throw new Error/);
});

test('rota principal de campanhas fica registrada no módulo dedicado', () => {
    const campanhas = fs.readFileSync(path.join(repoRoot, 'routes', 'campanhasRoute.js'), 'utf8');
    const clientes = fs.readFileSync(path.join(repoRoot, 'routes', 'clientesRoute.js'), 'utf8');
    assert.match(campanhas, /router\.get\('\/'/);
    assert.doesNotMatch(clientes, /router\.get\('\/campanhas'/);
    assert.match(clientes, /router\.renderizarPaginaCampanhas = renderizarPaginaCampanhas/);
    assert.match(clientes, /select name="campanhaItemId"/);
    assert.match(clientes, /Selecione pelo nome ou telefone/);
    assert.doesNotMatch(clientes, /ID do cliente que reclamou/);
    assert.match(clientes, /paginaClientes/);
    assert.match(clientes, /Execução #/);
    assert.match(clientes, /paginarItens\(todosItens, paginaAtual\(req\.query\.paginaClientes\), 10\)/);
});

test('pacote possui verificação automatizada de instalação limpa', () => {
    const script = fs.readFileSync(path.join(repoRoot, 'entrega-cliente-local', 'USO_INTERNO_NAO_ENVIAR', 'TESTAR-PACOTE-LIMPO.ps1'), 'utf8');
    assert.match(script, /Expand-Archive/);
    assert.match(script, /\.wwebjs_auth/);
    assert.match(script, /\.Extension -eq '\.db'/);
    assert.match(script, /Remove-Item -LiteralPath \$testeRaiz -Recurse -Force/);
});

test('fila persistente retoma envio interrompido e nao repete falha conhecida', () => {
    const { criarAmbiente } = require('./helpers/isolated');
    const ambiente = criarAmbiente('julian-fila-persistente-');
    const env = { JULIAN_SECRET_KEY: 'chave-estavel-da-fila-de-testes' };
    try {
        const interrompido = executarIsolado(`(async()=>{const q=require('./services/filaMensagensService');const db=require('./database/sqlite');await db.ready;q.enfileirarEnvio(()=>new Promise(()=>{}),'Bloqueio anterior',{proativo:false});q.enfileirarEnvio(async()=>({id:{_serialized:'nao-executado'}}),'Envio interrompido',{proativo:false,persistencia:{tipo:'texto',destino:'5511999999999@c.us',texto:'mensagem protegida'}});setTimeout(()=>db.get('SELECT status,payloadProtegido FROM mensagens_saida_fila ORDER BY id DESC LIMIT 1',(e,r)=>{if(e)throw e;process.stdout.write(JSON.stringify({status:r.status,protegido:String(r.payloadProtegido).startsWith('jplay:v1:')}));process.exit(0)}),200)})().catch(e=>{console.error(e);process.exit(1)})`, { ambiente, env });
        assert.deepEqual(JSON.parse(interrompido.stdout.split(/\r?\n/).at(-1)), { status: 'pendente', protegido: true });

        const retomado = executarIsolado(`(async()=>{const q=require('./services/filaMensagensService');const db=require('./database/sqlite');await db.ready;let enviados=0;q.configurarExecutorFilaPersistente(async p=>{enviados++;return{id:{_serialized:'retomado-1'},destino:p.destino}});await q.prepararFilaPersistente();await q.processarFilaPersistente();let falhou=false;try{await q.enfileirarEnvio(async()=>{throw new Error('falha definitiva simulada')},'Falha conhecida',{persistencia:{tipo:'texto',destino:'5511888888888@c.us',texto:'nao repetir'}})}catch(_){falhou=true}const linhas=await new Promise((ok,no)=>db.all('SELECT status,tentativas FROM mensagens_saida_fila ORDER BY id',(e,r)=>e?no(e):ok(r)));process.stdout.write(JSON.stringify({enviados,falhou,linhas}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`, { ambiente, env });
        assert.deepEqual(JSON.parse(retomado.stdout.split(/\r?\n/).at(-1)), {
            enviados: 1,
            falhou: true,
            linhas: [
                { status: 'enviado', tentativas: 0 },
                { status: 'falhou', tentativas: 1 }
            ]
        });
    } finally {
        removerAmbiente(ambiente);
    }
});

test('privacidade exporta os dados e anonimiza sem apagar o historico financeiro', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const p=require('./services/privacidadeService');const db=require('./database/sqlite');const cliente=await c.salvarCliente({nome:'Pessoa Privacidade',telefone:'5511999994444',usuario:'usuario-titular',senha:'senha-titular',tipoPlanoId:'1',plano:'Mensal',diasContrato:30,valorPlano:'35,00',dataInicio:'2026-08-01T10:00',dataVencimento:'2026-09-01T10:00',status:'ativo',whatsappMarketingConsentimento:'1',observacoes:'Dado pessoal'});await db.ready;const run=(sql,args=[])=>new Promise((ok,no)=>db.run(sql,args,e=>e?no(e):ok()));const get=(sql,args=[])=>new Promise((ok,no)=>db.get(sql,args,(e,r)=>e?no(e):ok(r)));await run("INSERT INTO cliente_pagamentos (clienteId,plano,valorTotal,observacoes) VALUES (?,?,?,?)",[cliente.id,'Mensal','35,00','observacao pessoal']);await run("INSERT INTO cliente_notas (clienteId,texto) VALUES (?,?)",[cliente.id,'telefone alternativo']);const exportacao=await p.exportarDadosCliente(cliente.id);await p.anonimizarCliente(cliente.id,{motivo:'Solicitacao confirmada pelo titular',responsavel:'admin'});const atual=await get('SELECT * FROM clientes WHERE id=?',[cliente.id]);const pagamento=await get('SELECT COUNT(*) total,MAX(observacoes) observacoes FROM cliente_pagamentos WHERE clienteId=?',[cliente.id]);const nota=await get('SELECT COUNT(*) total FROM cliente_notas WHERE clienteId=?',[cliente.id]);const auditoria=await get('SELECT COUNT(*) total FROM solicitacoes_privacidade WHERE clienteId=?',[cliente.id]);process.stdout.write(JSON.stringify({exportouNome:exportacao.cliente.nome,exportouSenha:exportacao.cliente.senha,anonimo:atual.nome,telefone:atual.telefone,status:atual.status,consentimento:atual.whatsappMarketingConsentimento,anonimizado:!!atual.anonimizadoEm,pagamentos:pagamento.total,observacaoPagamento:pagamento.observacoes,notas:nota.total,auditoria:auditoria.total}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`, { env: { JULIAN_SECRET_KEY: 'chave-estavel-privacidade-teste' } });
    try {
        const dados = JSON.parse(resultado.stdout.split(/\r?\n/).at(-1));
        assert.equal(dados.exportouNome, 'Pessoa Privacidade');
        assert.equal(dados.exportouSenha, 'senha-titular');
        assert.match(dados.anonimo, /^Cliente anonimizado #\d+$/);
        assert.match(dados.telefone, /^anonimizado-\d+$/);
        assert.equal(dados.status, 'inativo');
        assert.equal(dados.consentimento, 0);
        assert.equal(dados.anonimizado, true);
        assert.equal(dados.pagamentos, 1);
        assert.equal(dados.observacaoPagamento, '');
        assert.equal(dados.notas, 0);
        assert.equal(dados.auditoria, 1);
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('exclusao direta foi substituida por privacidade protegida por senha', () => {
    const clientes = fs.readFileSync(path.join(repoRoot, 'routes', 'clientesRoute.js'), 'utf8');
    const privacidade = fs.readFileSync(path.join(repoRoot, 'routes', 'privacidadeRoute.js'), 'utf8');
    assert.doesNotMatch(clientes, /await removerCliente\(req\.params\.id\)/);
    assert.match(clientes, /editar#privacidade/);
    assert.match(privacidade, /confirmarSenhaAtual/);
    assert.match(privacidade, /titularConfirmado/);
    assert.match(privacidade, /ANONIMIZAR/);
});
