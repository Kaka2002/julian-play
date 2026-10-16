const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

test('ciclo da sessão conserva limite e horários sem registrar credenciais', () => {
    const r = executarIsolado(`
        const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
        console.log=()=>{};
        const {registrarCicloWhatsApp}=require('./services/diagnosticoSessaoWhatsappService');
        for(let i=0;i<65;i++)registrarCicloWhatsApp('estado',{estado:'CONNECTED'});
        registrarCicloWhatsApp('desconectado',{motivo:'LOGOUT',logout:true,qr:'SEGREDO',telefone:'5511999990000'});
        registrarCicloWhatsApp('estado',{estado:'https://exemplo/?token=SEGREDO',motivo:'5511999990000'});
        const texto=fs.readFileSync(path.join(process.env.DATA_DIR,'whatsapp-ciclo-sessao.log'),'utf8');
        const itens=JSON.parse(texto);assert.equal(itens.length,60);
        assert.equal(itens[58].motivo,'LOGOUT');assert.equal(itens[58].logout,true);
        assert.ok(itens.every(i=>!Number.isNaN(Date.parse(i.em))));
        assert.doesNotMatch(texto,/SEGREDO|5511999990000|https:/);
        process.stdout.write('ok');
    `);
    try { assert.equal(r.stdout,'ok'); } finally { removerAmbiente(r.ambiente); }
});
