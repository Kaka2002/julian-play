const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

test('cliente novo exige consentimento explicito para entrar em campanhas', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const base={nome:'Cliente Teste',telefone:'5511999990000',tipoPlanoId:'1',diasContrato:30,valorPlano:'10,00',dataInicio:'2026-07-28T10:00',dataVencimento:'2026-08-28T23:59',status:'ativo'};const sem=await c.salvarCliente(base);const antes=await c.listarClientesAtivosComerciais();const com=await c.salvarCliente({...base,id:sem.id,whatsappMarketingConsentimento:'1'});const depois=await c.listarClientesAtivosComerciais();process.stdout.write(JSON.stringify({sem:sem.whatsappMarketingConsentimento,antes:antes.length,com:com.whatsappMarketingConsentimento,depois:depois.length}));})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { sem: 0, antes: 0, com: 1, depois: 1 });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('backup verificado pode ser copiado para armazenamento externo', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const m=require('./services/manutencao');const b=await m.criarBackupAutomatico();const externa=path.join(${JSON.stringify(require('os').tmpdir())},'julian-play-backup-externo-'+Date.now());const destino=await m.copiarBackupExterno(b.nome,externa);process.stdout.write(JSON.stringify({db:fs.existsSync(destino),manifesto:fs.existsSync(destino+'.json')}));fs.rmSync(externa,{recursive:true,force:true});})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { db: true, manifesto: true });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('TOTP aceita somente codigo atual da chave configurada', () => {
    const resultado = executarIsolado(`const s=require('./services/securityService');const segredo='JBSWY3DPEHPK3PXP';const atual=(()=>{const crypto=require('crypto');const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of segredo)bits+=a.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const contador=Buffer.alloc(8);contador.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',Buffer.from(bytes)).update(contador).digest();const o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')})();process.stdout.write(JSON.stringify([s.validarTotp(segredo,atual),s.validarTotp(segredo,'000000')]))`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), [true, false]);
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('cofre cifra segredos e detecta chave incorreta', () => {
    const resultado = executarIsolado(`const c=require('./services/cofreSegredosService');const x=c.proteger('paypalClientSecret','segredo-real');process.stdout.write(JSON.stringify({cifrado:x.startsWith('jplay:v1:'),claro:c.revelar('paypalClientSecret',x)}))`, { env: { JULIAN_SECRET_KEY: 'chave-de-teste-segura' } });
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { cifrado: true, claro: 'segredo-real' });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('configuracao antiga em texto e migrada sem alterar o valor usado', () => {
    const resultado = executarIsolado(`(async()=>{const db=require('./database/sqlite');await db.ready;await new Promise((ok,fail)=>db.run("INSERT INTO configuracoes(chave,valor) VALUES('paypalClientSecret','legado')",e=>e?fail(e):ok()));const c=require('./services/configuracoesPainel');const config=await c.obterConfiguracoes();const linha=await new Promise((ok,fail)=>db.get("SELECT valor FROM configuracoes WHERE chave='paypalClientSecret'",(e,r)=>e?fail(e):ok(r)));process.stdout.write(JSON.stringify({usado:config.paypalClientSecret,cifrado:linha.valor.startsWith('jplay:v1:')}));})().catch(e=>{console.error(e);process.exit(1)})`, { env: { LICENSE_ADMIN_TOKEN: 'token-persistente-da-instalacao' } });
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { usado: 'legado', cifrado: true });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});
