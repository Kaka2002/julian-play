const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { executarIsolado, removerAmbiente, repoRoot } = require('./helpers/isolated');

test('reclamação de campanha bloqueia novos envios de marketing e fica auditável', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const camp=require('./services/campanhasService');const cliente=await c.salvarCliente({nome:'Cliente Reclamação',telefone:'5511999991000',tipoPlanoId:'1',diasContrato:30,valorPlano:'10,00',dataInicio:'2026-07-28T10:00',dataVencimento:'2026-08-28T23:59',status:'ativo',whatsappMarketingConsentimento:'1'});const campanha=await camp.criarCampanha({nome:'Teste governança'});const item=await camp.registrarItemCampanha(campanha.id,cliente,{status:'enviado'});const reclamacao=await camp.registrarReclamacaoCampanha({campanhaId:campanha.id,campanhaItemId:item,clienteId:cliente.id,motivo:'Não quero receber'});const atualizado=await c.buscarClientePorId(cliente.id);const lista=await camp.listarReclamacoesCampanha(campanha.id);process.stdout.write(JSON.stringify({id:reclamacao.id>0,consentimento:atualizado.whatsappMarketingConsentimento,optout:!!atualizado.whatsappOptOutEm,total:lista.length}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { id: true, consentimento: 0, optout: true, total: 1 });
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

test('rota principal de campanhas fica registrada no módulo dedicado', () => {
    const campanhas = fs.readFileSync(path.join(repoRoot, 'routes', 'campanhasRoute.js'), 'utf8');
    const clientes = fs.readFileSync(path.join(repoRoot, 'routes', 'clientesRoute.js'), 'utf8');
    assert.match(campanhas, /router\.get\('\/'/);
    assert.doesNotMatch(clientes, /router\.get\('\/campanhas'/);
    assert.match(clientes, /router\.renderizarPaginaCampanhas = renderizarPaginaCampanhas/);
});

test('pacote possui verificação automatizada de instalação limpa', () => {
    const script = fs.readFileSync(path.join(repoRoot, 'entrega-cliente-local', 'USO_INTERNO_NAO_ENVIAR', 'TESTAR-PACOTE-LIMPO.ps1'), 'utf8');
    assert.match(script, /Expand-Archive/);
    assert.match(script, /\.wwebjs_auth/);
    assert.match(script, /\.Extension -eq '\.db'/);
    assert.match(script, /Remove-Item -LiteralPath \$testeRaiz -Recurse -Force/);
});
