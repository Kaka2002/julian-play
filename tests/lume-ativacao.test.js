const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');const os = require('os');const path = require('path');
const { criarConsumidor, validarAviso, validarConfig } = require('../services/lumeAtivacaoService');
const config = { enabled: true, site: 'https://ativacao.julianplay.com.br', token: 'f'.repeat(64), sender: '5511925716232' };
const job = { reference: 'a'.repeat(48), receipt: 'b'.repeat(48), phone: '5511999999999', mac: 'AA:AA:AA:AA:AA:AA', plan: 'annual', expires: 1900000000 };
function fixture(options = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lume-test-'));let sends=0,requests=0;const acks=[];
    const client = { info: { wid: { user: options.sender || config.sender } }, getNumberId: async()=>({_serialized: options.destination || `${job.phone}@c.us`}), getChatById: async()=>({sendStateTyping: async()=>{}}), sendMessage: async(to,text)=> { sends++;assert.equal(to,options.destination || `${job.phone}@c.us`);assert.match(text,/Pagamento confirmado/);if(options.uncertain)throw Error('falha apos envio');return { id:{_serialized:'message-id'} }; } };
    const consumer = criarConsumidor({ dataDir, config, getClient: ()=>client, getStatusWhatsApp: ()=>({ conectado: options.connected!==false }), administrador: ()=>options.admin!==false,
        enfileirarEnvio: async fn=> {if(options.queueError)throw Error('pausado');return fn();},
        fetchFn: async(url,req)=>{ requests++;assert.equal(req.redirect,'error');assert.equal(req.headers.Authorization,`Bearer ${config.token}`);if(url.endsWith('/claim'))return {ok:true,text:async()=>JSON.stringify({job})};acks.push(JSON.parse(req.body));if(options.ackError)throw Error('ack perdido');return {ok:true,text:async()=>'{"received":true}'}; }
    });
    return { consumer, dataDir, acks, sends:()=>sends, requests:()=>requests, cleanup:()=>fs.rmSync(dataDir,{recursive:true,force:true}) };
}
test('envio confirmado nao repete apos perda do ack ou reinicio',async()=>{const f=fixture({ackError:true});try {await assert.rejects(f.consumer.executar());await assert.rejects(f.consumer.executar());assert.equal(f.sends(),1);assert.equal(f.acks[1].result,'sent');assert.doesNotMatch(fs.readFileSync(path.join(f.dataDir,'.lume-whatsapp-envios',`${job.reference}.json`),'utf8'),/999999999/);}finally{f.cleanup();}});
test('envio incerto nao tenta novamente',async()=>{const f=fixture({uncertain:true});try{await f.consumer.executar();await f.consumer.executar();assert.equal(f.sends(),1);assert.equal(f.acks[1].result,'uncertain');}finally{f.cleanup();}});
test('consulta de telefone pode retornar LID e envio preserva identificador',async()=>{const f=fixture({destination:'123456789012345@lid'});try{await f.consumer.executar();await f.consumer.executar();assert.equal(f.sends(),1);assert.equal(f.acks[0].result,'sent');}finally{f.cleanup();}});
test('consulta nao autoriza grupo como destino',async()=>{const f=fixture({destination:'123456789@g.us'});try{await assert.rejects(f.consumer.executar(),/Destino invalido/);assert.equal(f.sends(),0);}finally{f.cleanup();}});
test('pausa na fila antes de enviar pode ser recuperada',async()=>{const f=fixture({queueError:true});try{await f.consumer.executar();assert.equal(f.sends(),0);assert.equal(f.acks[0].result,'deferred');assert.equal(fs.existsSync(path.join(f.dataDir,'.lume-whatsapp-envios',`${job.reference}.json`)),false);}finally{f.cleanup();}});
test('outros perfis, conta diferente e desconexao nao consultam avisos',async()=>{for(const options of [{admin:false},{sender:'5511888888888'},{connected:false}]){const f=fixture(options);try{await f.consumer.executar();assert.equal(f.requests(),0);}finally{f.cleanup();}}});
test('configuracao e destinatarios invalidos sao rejeitados',()=>{assert.equal(validarConfig({...config,site:'https://example.org'}),false);assert.throws(()=>validarAviso({...job,phone:'123@g.us'}));assert.throws(()=>validarAviso({...job,reference:'../secret'}));assert.throws(()=>validarAviso({...job,expires:'1900000000'}));});
test('diagnostico exige marcador de teste e nao afirma pagamento',()=>{
    const { mensagem } = require('../services/lumeAtivacaoService');
    const diagnostic = {...job,plan:'trial',test:true};
    assert.throws(()=>validarAviso({...job,plan:'trial'}));
    assert.throws(()=>validarAviso({...job,test:true}));
    assert.match(mensagem(diagnostic),/TESTE/);
    assert.doesNotMatch(mensagem(diagnostic),/Pagamento confirmado/);
    assert.match(mensagem(diagnostic),/licenca nao foi alterada/);
});
