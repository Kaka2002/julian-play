const test=require('node:test');
const assert=require('node:assert/strict');
const {executarIsolado,removerAmbiente}=require('./helpers/isolated');

test('rotas internas exigem o token administrativo',()=>{
    const r=executarIsolado(`(async()=>{const express=require('express');const db=require('./database/sqlite');const app=express();app.use(express.json());app.use('/interno',require('./routes/adminInternoRoute'));const s=await new Promise(ok=>{const x=app.listen(0,'127.0.0.1',()=>ok(x))});const u='http://127.0.0.1:'+s.address().port+'/interno/status';const a=await fetch(u);const b=await fetch(u,{headers:{'x-master-token':'errado'}});const c=await fetch(u,{headers:{'x-master-token':'segredo'}});process.stdout.write(JSON.stringify([a.status,b.status,c.status]));await new Promise(ok=>s.close(ok));db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{env:{LICENSE_ADMIN_TOKEN:'segredo'}});
    try{assert.deepEqual(JSON.parse(r.stdout),[403,403,200])}finally{removerAmbiente(r.ambiente)}
});
