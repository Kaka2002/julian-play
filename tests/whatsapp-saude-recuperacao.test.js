const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../config/whatsapp'), 'utf8');
function contexto() {
 const c = vm.createContext({ Date, Math, AUTH_TIMEOUT_MS:300000, PROTOCOL_TIMEOUT_MS:300000, inicializacaoIniciadaEm:Date.now(), inicializando:false, limpandoCliente:false, conectado:false, statusWhatsApp:'sessao_presa', clientesProntos:new WeakSet(), ultimaVerificacaoSaude:null });
 vm.runInContext(source.slice(source.indexOf('async function verificarSaudeWhatsApp()'), source.indexOf('async function recuperarWhatsAppAutomaticamente')), c);
 return c;
}
test('saude recupera cliente pronto apos oscilacao sem novo ready', async()=>{
 const c=contexto();c.client={getState:async()=> 'CONNECTED'};c.clientesProntos.add(c.client);
 assert.equal((await c.verificarSaudeWhatsApp()).ok,true);assert.equal(c.conectado,true);assert.equal(c.statusWhatsApp,'conectado');
});
test('CONNECTED antes de ready nao libera envio',async()=>{
 const c=contexto();c.client={getState:async()=> 'CONNECTED'};await c.verificarSaudeWhatsApp();assert.equal(c.conectado,false);
});
test('consulta antiga nao rebaixa cliente substituido',async()=>{
 const c=contexto();let resolver;c.client={getState:()=>new Promise(r=>resolver=r)};
 const p=c.verificarSaudeWhatsApp();c.client={};c.conectado=true;resolver('UNPAIRED');await p;assert.equal(c.conectado,true);
});
test('recuperacao nao interrompe inicializacao em andamento',async()=>{
 const c=contexto();c.inicializando=true;
 vm.runInContext(source.slice(source.indexOf('async function recuperarWhatsAppAutomaticamente'),source.indexOf('function getStatusWhatsApp')),c);
 assert.equal((await c.recuperarWhatsAppAutomaticamente()).status,'ignorado');
});
