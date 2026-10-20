const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

const setup = `
const assert = require('node:assert/strict');
const db = require('./database/sqlite');
const svc = require('./services/indicacoesService');
const modelos = require('./services/modelosMensagem');
const run = (sql, p=[]) => new Promise((ok,no)=>db.run(sql,p,function(e){e?no(e):ok(this)}));
const get = (sql,p=[]) => new Promise((ok,no)=>db.get(sql,p,(e,r)=>e?no(e):ok(r)));
async function campanha(chave) {
  const lista=await modelos.listarModelos();
  const modelo=lista.find(m=>m.chave===chave);
  await modelos.salvarModelo({...modelo,ativo:'1'});
}
async function pagamento(id, ciclo, forma='PIX', valor='35,00', excluido='') {
  await run('INSERT INTO cliente_pagamentos (clienteId, plano, formaPagamento, valorTotal, vencimentoNovo, excluidoEm) VALUES (?, ?, ?, ?, ?, ?)',[id,'Mensal',forma,valor,ciclo,excluido]);
}
async function saldo() { return (await get('SELECT bonusMeses FROM clientes WHERE id=1')).bonusMeses; }
await db.ready;
for(let id=1;id<=6;id++) await run('INSERT INTO clientes (id,nome,telefone,status,valorPlano,dataVencimento) VALUES (?,?,?, ?,?,?)',[id,'Cliente '+id,'551190000000'+id,'ativo','35,00','2026-10-01T23:59']);
await run("UPDATE clientes SET plano='Mensal'");
for(let id=2;id<=6;id++) await pagamento(id,'2026-09-01'); // primeira assinatura, fora da contagem
`;
function isolated(code) {
    // Multiplas gravacoes e inicializacao do banco podem superar 30s no servidor.
    // Mesmo limite de 90s usado pelo helper no CI; todas as assercoes permanecem.
    const result = executarIsolado(`(async()=>{${setup}\n${code}\nawait db.encerrar();console.log('ok')})().catch(e=>{console.error(e);process.exit(1)})`, { timeout: 90000 });
    try { assert.equal(result.stdout, 'ok'); } finally { removerAmbiente(result.ambiente); }
}

test('primeira assinatura e sua duplicação não contam; somente renovação gera bônus', () => isolated(`
 await run('DELETE FROM cliente_pagamentos WHERE clienteId=2');
 await campanha('campanha_amizade_presente');
 await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 assert.equal((await svc.listarIndicacoes()).itens[0].pagamentosValidos,0);
 await pagamento(2,'2026-10-01'); await pagamento(2,'2026-10-01');
 await pagamento(2,'zero','PIX','0,00'); await pagamento(2,'gratis','Bônus mensal');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 assert.equal((await svc.listarIndicacoes()).itens[0].pagamentosValidos,0);
 await pagamento(2,'2026-11-01'); await svc.processarCreditosIndicacoes();
 assert.equal(await saldo(),1);
 assert.equal((await svc.listarIndicacoes()).itens[0].pagamentosValidos,1);
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),1);
`));

test('campanha de um credita após renovação e mantém vencimento, valor e aplicação manuais', () => isolated(`
 await campanha('campanha_amizade_presente');
 await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 assert.equal((await svc.listarIndicacoes()).itens[0].pagamentosValidos,0);
 await pagamento(2,'2026-11-01');
 await Promise.all([svc.processarCreditosIndicacoes(),svc.processarCreditosIndicacoes()]);
 assert.equal(await saldo(),1);
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),1);
 const c=await get('SELECT valorPlano,dataVencimento FROM clientes WHERE id=1');
 assert.deepEqual(c,{valorPlano:'35,00',dataVencimento:'2026-10-01T23:59'});
 assert.equal((await get('SELECT COUNT(*) n FROM cliente_pagamentos WHERE clienteId=1')).n,0);
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2}), /já participa/);
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:3,indicadoClienteId:2}), /já participa/);
 const item=(await svc.listarIndicacoes()).itens[0];
 await assert.rejects(svc.cancelarIndicacao(item.id), /já gerou/);
`));

test('campanha de dois exige dois ciclos pagos para cada indicado sem somar campanhas', () => isolated(`
 await campanha('campanha_indique_ganhe_tres_meses');
 for(const id of [2,3]) await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:id});
 await pagamento(2,'2026-10-01');
 await pagamento(3,'2026-10-01');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 await pagamento(2,'2026-11-01');
 await pagamento(3,'2026-11-01');
 await pagamento(3,'2026-11-01'); // mesma renovação não é um novo ciclo
 await pagamento(3,'bonus','Bônus mensal');
 await pagamento(3,'zero','PIX','0,00');
 await pagamento(3,'excluido','PIX','35,00','2026-09-26');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),3);
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),3);
 const itens=(await svc.listarIndicacoes()).itens;
 assert.equal(itens[0].creditoId,itens[1].creditoId);
 assert.equal((await get('SELECT COUNT(*) n FROM indicacao_creditos')).n,1);
`));

test('crédito e consumo das indicações revertem juntos se a atualização falhar', () => isolated(`
 await campanha('campanha_amizade_presente');
 await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 await pagamento(2,'2026-11-01');
 await run("CREATE TRIGGER falha_credito BEFORE UPDATE OF bonusMeses ON clientes BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
 await assert.rejects(svc.processarCreditosIndicacoes(),/falha simulada/);
 assert.equal(await saldo(),0);
 assert.equal((await get('SELECT COUNT(*) n FROM indicacao_creditos')).n,0);
 assert.equal((await svc.listarIndicacoes()).itens[0].status,'ativa');
 await run('DROP TRIGGER falha_credito');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),1);
`));

test('modelos novos preservam personalização e resolvem saldo e vencimento no envio manual', () => isolated(`
 let lista=await modelos.listarModelos();
 assert.ok(lista.some(m=>m.chave==='padrao_vencimento'));
 for(const meses of [1,3]) assert.ok(lista.some(m=>m.chave==='indicacao_bonus_'+meses && m.plano==='bonus'));
 const modelo=lista.find(m=>m.chave==='indicacao_bonus_1');
 await modelos.salvarModelo({...modelo,texto:'Texto personalizado',ativo:'0'});
 lista=await modelos.listarModelos();
 assert.equal(lista.find(m=>m.id===modelo.id).texto,'Texto personalizado');
 assert.equal(lista.find(m=>m.id===modelo.id).ativo,0);
 const aplicado=lista.find(m=>m.chave==='bonus_periodo_aplicado');
 const mensagem=await modelos.montarMensagemModeloManual({nome:'Pessoa Teste',bonusMeses:2,valorPlano:'35,00',diasContrato:30,dataInicio:'2026-10-01T23:59',dataVencimento:'2026-10-31T23:59'},aplicado);
 assert.match(mensagem,/01\\/10\\/2026/); assert.match(mensagem,/30 dia/); assert.ok(mensagem.includes('R$ 0,00')); assert.doesNotMatch(mensagem,/35,00/);
 await modelos.salvarModelo({...aplicado,texto:'Meu texto de bônus',ativo:'0'});
 const preservado=(await modelos.listarModelos()).find(m=>m.id===aplicado.id);
 assert.equal(preservado.texto,'Meu texto de bônus'); assert.equal(preservado.ativo,0);
 assert.match(mensagem,/31\\/10\\/2026/); assert.match(mensagem,/2 mês/); assert.doesNotMatch(mensagem,/{{/);
`));

test('aviso de bônus por indicação segue o ciclo programado e encerra ao aplicar o período', () => isolated(`
 const clientes=require('./services/clientes');
 await run("UPDATE clientes SET bonusMeses=1, avisoBonusIndicacaoAtivo=1, vencimento='2026-10-01', dataVencimento='2026-10-01T23:59' WHERE id=1");
 await run("UPDATE bonus_creditos SET campanhaChave='campanha_amizade_presente' WHERE clienteId=1");
 const aviso=await modelos.montarMensagemAvisoProgramado({nome:'Cliente 1',bonusMeses:1,statusAvisoBonus:'programado',campanhasBonus:'campanha_amizade_presente',dataVencimento:'2026-10-01T23:59'},5);
 const segundoAviso=await modelos.montarMensagemAvisoProgramado({nome:'Cliente 1',bonusMeses:1,statusAvisoBonus:'programado',campanhasBonus:'campanha_amizade_presente',dataVencimento:'2026-10-01T23:59'},2);
 const avisoUmaHora=await modelos.montarMensagemAvisoProgramado({nome:'Cliente 1',bonusMeses:1,statusAvisoBonus:'programado',campanhasBonus:'campanha_amizade_presente',dataVencimento:'2026-10-01T23:59'},-60);
 assert.match(aviso,/Amizade que vale presente/); assert.match(aviso,/1 mês de bônus/); assert.match(aviso,/Continue indicando/);
 assert.match(segundoAviso,/Amizade que vale presente/); assert.match(segundoAviso,/2 dias/); assert.match(avisoUmaHora,/aproximadamente 1 hora/);
 const planos=await require('./services/tiposPlanos').listarTiposPlanos();
 const bonus=planos.find(p=>p.nome==='Bônus Mensal');
 const antes=await clientes.buscarClientePorId(1);
 const salvo=await clientes.salvarCliente({...antes,tipoPlanoId:String(bonus.id),dataInicio:'2026-10-01T23:59',dataVencimento:'2026-11-01T23:59',statusAvisoBonus:'programado',bonusMesesOriginal:1});
 assert.equal(salvo.avisoBonusIndicacaoAtivo,0);
 assert.equal(salvo.statusAvisoBonus,'aplicado');
`));

test('campanha inativa e vínculos cancelados não creditam; mesmo telefone é rejeitado', () => isolated(`
 await campanha('campanha_amizade_presente');
 const item=await svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:2});
 await svc.cancelarIndicacao(item.id);
 await pagamento(2,'2026-11-01');
 await svc.processarCreditosIndicacoes(); assert.equal(await saldo(),0);
 await run("UPDATE clientes SET telefone='5511900000001' WHERE id=3");
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:3}),/mesmo telefone/);
 await run("UPDATE modelos_mensagem SET ativo=0 WHERE plano='campanha'");
 await assert.rejects(svc.registrarIndicacao({indicadorClienteId:1,indicadoClienteId:4}),/Ative/);
`));

test('migração conserva vínculos antigos e associa a regra original sem liberar créditos', async () => {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(':memory:');
    const exec = sql => new Promise((ok,no)=>db.exec(sql,e=>e?no(e):ok()));
    try {
        await require('../database/migrations/018-programa-indicacoes').up({exec});
        await exec("INSERT INTO programa_indicacoes (indicadorClienteId,indicadoClienteId,status) VALUES (1,2,'beneficio_liberado'),(1,3,'ativa')");
        await require('../database/migrations/019-bonus-campanhas').up({exec});
        const rows = await new Promise((ok,no)=>db.all('SELECT * FROM programa_indicacoes ORDER BY id',(e,r)=>e?no(e):ok(r)));
        assert.deepEqual(rows.map(r=>r.status),['beneficio_liberado','ativa']);
        assert.ok(rows.every(r=>r.campanhaChave==='campanha_indique_ganhe_tres_meses' && r.creditoId===null));
    } finally { await new Promise(resolve=>db.close(resolve)); }
});

test('salvar formulário aberto antes do crédito automático conserva o saldo novo', () => isolated(`
 const clientes=require('./services/clientes');
 const antes=await clientes.buscarClientePorId(1);
 await run('UPDATE clientes SET bonusMeses=3 WHERE id=1');
 const depois=await clientes.salvarCliente({...antes,bonusMeses:0,bonusMesesOriginal:0,nome:'Nome atualizado'});
 assert.equal(depois.bonusMeses,3);
`));
test('ficha vincula ID sem repetir e aviso usa campanha antiga após troca da ativa', () => isolated(`
 const cadastro=require('./services/cadastroIndicacaoService');const clientes=require('./services/clientes');
 await campanha('campanha_amizade_presente');
 const dados={id:2,indicadorClienteId:'1',telefone:'5511900000002',campanhaIndicacaoChave:'campanha_amizade_presente'};
 const preparo=await cadastro.prepararIndicacaoCadastro(dados);
 await cadastro.concluirIndicacaoCadastro(preparo, {id:2});
 await pagamento(2,'2026-11-01');await svc.processarCreditosIndicacoes();
 assert.equal(await saldo(),1);
 await campanha('campanha_indique_ganhe_tres_meses');
 const repetido=await cadastro.prepararIndicacaoCadastro(dados);
 await cadastro.concluirIndicacaoCadastro(repetido,{id:2});
 assert.equal(await saldo(),1);
 assert.equal((await get('SELECT COUNT(*) n FROM programa_indicacoes WHERE indicadoClienteId=2')).n,1);
 assert.equal((await get('SELECT campanhaChave FROM programa_indicacoes WHERE indicadoClienteId=2')).campanhaChave,'campanha_amizade_presente');
 await assert.rejects(cadastro.prepararIndicacaoCadastro({...dados,indicadorClienteId:'2'}),/si mesmo/);
 await assert.rejects(cadastro.prepararIndicacaoCadastro({...dados,indicadorClienteId:'3'}),/outro indicador/);
 let envios=0,texto='';const transporte={conectado:true,enviar:async(c,t)=>{envios++;texto=t;return {mensagemId:'teste-simulado'}}};
 const cliente={...(await clientes.buscarClientePorId(1)),statusAvisoBonus:'programado'};
 const resultados=await Promise.all([cadastro.avisarBonusProgramado(cliente,transporte),cadastro.avisarBonusProgramado(cliente,transporte)]);
 await Promise.all(resultados.map(r=>r.conclusao));
 assert.equal(envios,1);assert.match(texto,/Amizade que vale presente/);assert.match(texto,/sem cobrança/);
 assert.doesNotMatch(texto,/Indique e ganhe 3 meses/);
 await cadastro.avisarBonusProgramado(cliente,transporte);assert.equal(envios,1);
 const planos=await require('./services/tiposPlanos').listarTiposPlanos();const bonus=planos.find(p=>p.nome==='Bônus Mensal');
 const salvo=await clientes.salvarCliente({...cliente,tipoPlanoId:bonus.id,dataInicio:'2026-10-01T23:59',dataVencimento:'2026-11-01T23:59',bonusMesesOriginal:1});
 assert.equal(salvo.statusAvisoBonus,'aplicado');assert.equal(salvo.bonusMeses,0);assert.equal(salvo.valorPlano,'35,00');
 const lancamento=await get("SELECT valorTotal FROM cliente_pagamentos WHERE clienteId=1 AND formaPagamento='Bônus mensal'");assert.equal(lancamento.valorTotal,'0,00');
 const normal=await modelos.montarMensagemAvisoProgramado({...salvo,valorPlano:'35,00'},5);assert.doesNotMatch(normal,/mês de bônus|Bônus Mensal/);
 await cadastro.avisarBonusProgramado(salvo,transporte);assert.equal(envios,1);
`));
test('bônus por dias exatos desconta teto de dias por 30 e não repete o consumo', () => isolated(`
 const clientes=require('./services/clientes');const planos=await require('./services/tiposPlanos').listarTiposPlanos();const bonus=planos.find(p=>p.nome==='Bônus Mensal');
 await run('UPDATE clientes SET bonusMeses=3, plano=?, diasContrato=30 WHERE id=1',['Mensal']);
 const antes=await clientes.buscarClientePorId(1);
 const dados={...antes,tipoPlanoId:bonus.id,bonusDiasManual:'1',diasContrato:45,dataInicio:'2026-01-31T12:00',dataVencimento:'2026-05-01T12:00',bonusMesesOriginal:3,statusAvisoBonus:'programado'};
 const salvo=await clientes.salvarCliente(dados);
 assert.equal(salvo.diasContrato,45);assert.equal(salvo.dataVencimento,'2026-03-17T12:00');assert.equal(salvo.bonusMeses,1);assert.equal(salvo.statusAvisoBonus,'aplicado');assert.equal(salvo.valorPlano,'35,00');
 const lancamentoDias=await get("SELECT diasContrato,valorTotal FROM cliente_pagamentos WHERE clienteId=1 AND formaPagamento='Bônus mensal'");assert.deepEqual(lancamentoDias,{diasContrato:45,valorTotal:'0,00'});
 const repetido=await clientes.salvarCliente({...salvo,bonusDiasManual:'1',bonusMesesOriginal:1});assert.equal(repetido.bonusMeses,1);
 assert.equal((await get('SELECT COUNT(*) n FROM cliente_pagamentos WHERE clienteId=1')).n,1);
 await assert.rejects(clientes.salvarCliente({...salvo,bonusDiasManual:'1',diasContrato:31,dataInicio:'2026-05-01T12:00',dataVencimento:'2026-06-01T12:00'}),/suficiente/);
 assert.equal((await clientes.buscarClientePorId(1)).bonusMeses,1);
 for(const dias of [0,-1,1.5])await assert.rejects(clientes.salvarCliente({...salvo,bonusDiasManual:'1',diasContrato:dias}),/inteira e positiva/);
 const final=await clientes.salvarCliente({...salvo,bonusDiasManual:'1',diasContrato:30,dataInicio:'2026-05-01T12:00',dataVencimento:'2026-06-01T12:00',bonusMesesOriginal:1});
 assert.equal(final.dataVencimento,'2026-05-31T12:00');assert.equal(final.bonusMeses,0);
`));
