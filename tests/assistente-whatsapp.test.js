const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');
const { registrarEnvioDoRobo, foiMensagemDoRobo, foiTextoEnviadoPeloRobo } = require('../services/mensagensPropriasService');

test('resposta do assistente não pausa o robô quando o evento WhatsApp vier sem ID', () => {
    const texto = '📊 *RESUMO DE TESTE*\n\nRecebido: R$ 10,00';
    registrarEnvioDoRobo('contato-original@lid', texto);
    assert.equal(foiMensagemDoRobo({ fromMe: true, to: 'destino-alterado@lid', body: texto }), false);
    assert.equal(foiTextoEnviadoPeloRobo(texto), true);
});

test('assistente inicia desligado e só aceita números autorizados', () => {
    const r = executarIsolado(`(async()=>{
        const c=require('./services/configuracoesPainel'); const a=require('./services/assistenteWhatsappService'); const db=require('./database/sqlite');
        const inicial=await a.responderConsulta({texto:'ajuda',telefone:'5511999999999'});
        await c.salvarConfiguracoesRobo({nomeEmpresaRobo:'Teste',roboResponderMensagensAtivo:'1',roboEnviarMensagensPainelAtivo:'1',roboRespostaHumanizadaAtiva:'0',roboFilaMensagensAtiva:'1',assistenteWhatsappAtivo:'1',assistenteWhatsappNumerosAutorizados:'5511999999999'});
        const permitido=await a.responderConsulta({texto:'resumo do mês',telefone:'5511999999999@c.us'});
        const peloFim=await a.responderConsulta({texto:'menu gestão',telefone:'5511999999999@c.us'});
        const comercial=await a.responderConsulta({texto:'menu',telefone:'5511999999999@c.us'});
        const negado=await a.responderConsulta({texto:'ajuda',telefone:'5511888888888'});
        process.stdout.write(JSON.stringify({inicial,permitido,peloFim,comercial,negado})); db.close();
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const resultado = JSON.parse(r.stdout);
        assert.equal(resultado.inicial, null);
        assert.match(resultado.permitido, /RESUMO/);
        assert.match(resultado.peloFim, /ASSISTENTE DE GESTÃO/);
        assert.equal(resultado.comercial, null);
        assert.equal(resultado.negado, null);
    } finally { removerAmbiente(r.ambiente); }
});

test('assistente responde resumo e consulta sem alterar cliente ou pagamento', () => {
    const r = executarIsolado(`(async()=>{
        const db=require('./database/sqlite'); const c=require('./services/configuracoesPainel'); const a=require('./services/assistenteWhatsappService');
        await c.salvarConfiguracoesRobo({nomeEmpresaRobo:'Teste',roboResponderMensagensAtivo:'1',roboEnviarMensagensPainelAtivo:'1',roboRespostaHumanizadaAtiva:'0',roboFilaMensagensAtiva:'1',assistenteWhatsappAtivo:'1',assistenteWhatsappNumerosAutorizados:'5511999999999'});
        await new Promise((ok,no)=>db.run("INSERT INTO clientes (nome,telefone,plano,status,dataVencimento) VALUES ('Ana','5511888888888','Mensal','ativo','2099-01-01')",e=>e?no(e):ok()));
        const data=(dias)=>{const d=new Date();d.setDate(d.getDate()+dias);return d.toISOString().slice(0,10)};
        const vencido=data(-2); const proximo=data(2);
        await new Promise((ok,no)=>db.run("INSERT INTO clientes (nome,telefone,plano,status,dataVencimento,vencimento,valorPlano,assinaturaApp) VALUES (?,?,?,?,?,?,?,?)",['Vencido','5511777777777','Mensal','ativo',vencido,vencido,'35,00','0,00'],e=>e?no(e):ok()));
        await new Promise((ok,no)=>db.run("INSERT INTO clientes (nome,telefone,plano,status,dataVencimento,vencimento,valorPlano,assinaturaApp) VALUES (?,?,?,?,?,?,?,?)",['Proximo','5511666666666','Mensal','ativo',proximo,proximo,'40,00','0,00'],e=>e?no(e):ok()));
        const antes=await new Promise((ok,no)=>db.get('SELECT COUNT(*) total FROM cliente_pagamentos',[],(e,x)=>e?no(e):ok(x.total)));
        const resumo=await a.responderConsulta({texto:'quanto recebi este mês?',telefone:'5511999999999'});
        const cliente=await a.responderConsulta({texto:'situação do cliente Ana',telefone:'5511999999999'});
        const vencimentos=await a.responderConsulta({texto:'quais clientes vencem hoje?',telefone:'5511999999999'});
        const vencidos=await a.responderConsulta({texto:'quem está vencido?',telefone:'5511999999999'});
        const receber=await a.responderConsulta({texto:'quanto tenho para receber?',telefone:'5511999999999'});
        const proximos=await a.responderConsulta({texto:'quem vence nos próximos 3 dias?',telefone:'5511999999999'});
        const radar=await a.responderConsulta({texto:'o que preciso resolver hoje?',telefone:'5511999999999'});
        const semanal=await a.responderConsulta({texto:'como foi a semana?',telefone:'5511999999999'});
        const contexto=await a.responderConsulta({texto:'ele está em dia?',telefone:'5511999999999'});
        const depois=await new Promise((ok,no)=>db.get('SELECT COUNT(*) total FROM cliente_pagamentos',[],(e,x)=>e?no(e):ok(x.total)));
        process.stdout.write(JSON.stringify({resumo,cliente,vencimentos,vencidos,receber,proximos,radar,semanal,contexto,antes,depois})); db.close();
    })().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const resultado = JSON.parse(r.stdout);
        assert.match(resultado.resumo, /RESUMO/);
        assert.match(resultado.cliente, /Nome: \*Ana\*/);
        assert.match(resultado.vencimentos, /(VENCIMENTOS|vencimento encontrado)/i);
        assert.match(resultado.vencidos, /Vencido/);
        assert.match(resultado.receber, /R\$\s*35,00/);
        assert.match(resultado.proximos, /Proximo/);
        assert.match(resultado.radar, /RADAR DE HOJE/);
        assert.match(resultado.radar, /Clientes vencidos/);
        assert.match(resultado.semanal, /RELATÓRIO DA SEMANA/);
        assert.match(resultado.semanal, /Saldo do período/);
        assert.match(resultado.contexto, /Nome: \*Ana\*/);
        assert.equal(resultado.antes, resultado.depois);
    } finally { removerAmbiente(r.ambiente); }
});
