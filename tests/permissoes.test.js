const test=require('node:test');
const assert=require('node:assert/strict');
const {executarIsolado,removerAmbiente}=require('./helpers/isolated');
const fs=require('fs');
const path=require('path');
const {repoRoot}=require('./helpers/isolated');

test('rotas internas exigem o token administrativo',()=>{
    const r=executarIsolado(`(async()=>{const express=require('express');const db=require('./database/sqlite');const app=express();app.use(express.json());app.use('/interno',require('./routes/adminInternoRoute'));const s=await new Promise(ok=>{const x=app.listen(0,'127.0.0.1',()=>ok(x))});const u='http://127.0.0.1:'+s.address().port+'/interno/status';const a=await fetch(u);const b=await fetch(u,{headers:{'x-master-token':'errado'}});const c=await fetch(u,{headers:{'x-master-token':'segredo'}});process.stdout.write(JSON.stringify([a.status,b.status,c.status]));await new Promise(ok=>s.close(ok));db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{env:{LICENSE_ADMIN_TOKEN:'segredo'}});
    try{assert.deepEqual(JSON.parse(r.stdout),[403,403,200])}finally{removerAmbiente(r.ambiente)}
});

test('controle do robo fica restrito a instalacao local na interface e na rota',()=>{
    const rota=fs.readFileSync(path.join(repoRoot,'routes','clientesRoute.js'),'utf8');
    assert.match(rota,/JULIAN_PLAY_INSTALL_MODE[\s\S]{0,160}=== 'local'/);
    assert.match(rota,/podeControlarRoboLocal \?`<section/);
    assert.match(rota,/router\.post\('\/manutencao\/robo\/reiniciar', bloquearControleRoboLocal/);
    assert.match(rota,/router\.post\('\/manutencao\/robo\/parar', bloquearControleRoboLocal/);
    assert.match(rota,/spawn\(process\.execPath, argumentos/);
});

test('Painel Mestre oferece limpeza segura de disco e otimizacao de memoria',()=>{
    const app=fs.readFileSync(path.join(repoRoot,'master','app.js'),'utf8');
    const provisionador=fs.readFileSync(path.join(repoRoot,'master','provisionador.js'),'utf8');
    assert.match(app,/action="\/manutencao\/limpar"/);
    assert.match(app,/action="\/manutencao\/memoria"/);
    assert.match(app,/app\.post\('\/manutencao\/memoria'/);
    assert.match(provisionador,/status NOT IN \('arquivado', 'parado'\)/);
    assert.match(provisionador,/pm2\.cmd', \['restart', instalacao\.processoPm2/);
    assert.match(provisionador,/\['\.wwebjs_auth_backup', '\.wwebjs_cache_backup'\]/);
    assert.match(provisionador,/copiasSessao\.slice\(1\)/);
});
