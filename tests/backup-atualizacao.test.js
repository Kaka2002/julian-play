const fs=require('fs'); const os=require('os'); const path=require('path'); const {spawnSync}=require('child_process'); const test=require('node:test'); const assert=require('node:assert/strict');
const {criarAmbiente,executarIsolado,removerAmbiente,repoRoot}=require('./helpers/isolated');

test('backup e restauracao recuperam o banco anterior',()=>{
 const ambiente=criarAmbiente();
 try{
  const criado=executarIsolado(`(async()=>{const c=require('./services/configuracoesPainel');const m=require('./services/manutencao');const db=require('./database/sqlite');await c.salvarConfiguracao('nomeEmpresaRobo','Antes');const b=await m.criarBackupManual();await c.salvarConfiguracao('nomeEmpresaRobo','Depois');process.stdout.write(b.nome);db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{ambiente});
  const caminhoManifesto=path.join(ambiente.backupDir,`${criado.stdout}.json`);assert.ok(fs.existsSync(caminhoManifesto));const manifesto=JSON.parse(fs.readFileSync(caminhoManifesto,'utf8'));assert.equal(manifesto.integridade,'ok');assert.equal(manifesto.restauracaoTeste,'aprovada');assert.match(manifesto.hashSha256,/^[a-f0-9]{64}$/);assert.ok(manifesto.tamanho>0);
  const exportado=executarIsolado(`(async()=>{const m=require('./services/manutencao');const db=require('./database/sqlite');const a=await m.exportarBackupCriptografado(${JSON.stringify(criado.stdout)},'senha-forte-teste');process.stdout.write(a);db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{ambiente});const bufferCriptografado=fs.readFileSync(exportado.stdout);assert.equal(bufferCriptografado.subarray(0,8).toString(),'JPLAYBK2');assert.equal(bufferCriptografado.includes(Buffer.from('SQLite format 3')),false);
  const restaurado=executarIsolado(`(async()=>{const m=require('./services/manutencao');const db=require('./database/sqlite');process.stdout.write(JSON.stringify(await m.restaurarBackup(${JSON.stringify(criado.stdout)})));db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{ambiente});
  assert.equal(JSON.parse(restaurado.stdout).restaurado,criado.stdout);
  const verificado=executarIsolado(`(async()=>{const c=require('./services/configuracoesPainel');const db=require('./database/sqlite');process.stdout.write((await c.obterConfiguracoes()).nomeEmpresaRobo);db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{ambiente});
  assert.equal(verificado.stdout,'Antes');
 }finally{removerAmbiente(ambiente)}
});

test('atualizacao local preserva banco, WhatsApp, backups e configuracao',()=>{
 const atualizar=fs.readFileSync(path.join(repoRoot,'entrega-cliente-local','ENVIAR_AO_CLIENTE','ATUALIZAR-PAINEL.ps1'),'utf8');
 const instalar=fs.readFileSync(path.join(repoRoot,'install-windows.ps1'),'utf8');
 for(const item of ['clientes.db','.wwebjs_auth','.wwebjs_cache','backups'])assert.match(atualizar,new RegExp(item.replace('.', '\\.'),'i'));
 assert.match(atualizar,/Preservando configuracao local/i);
 assert.match(atualizar,/Get-FileHash[\s\S]*SHA256/i);
 const paradaLocal=atualizar.match(/function PararPm2Local[\s\S]*?\n}/)?.[0]||'';
 assert.match(paradaLocal,/\('stop', \$nomeProcesso\)/);
 assert.match(paradaLocal,/\('delete', \$nomeProcesso\)/);
 assert.doesNotMatch(paradaLocal,/\('save'|\('kill'/);
 assert.match(instalar,/Get-ScheduledTask[\s\S]*preservarTarefaExistente[\s\S]*outra instalacao valida e foi preservada/);
 assert.match(instalar,/installMode -eq 'local'[\s\S]*processosPausados = @\(\$NomeProcesso\)[\s\S]*Parando as instalacoes Julian Play/);
 const linhaMaster=instalar.indexOf("AdicionarProcessoJulian $nomes 'julian-master'"); const condicao=instalar.indexOf('if (Test-Path -LiteralPath $arquivoMaster)');
 assert.ok(linhaMaster>condicao,'julian-master somente deve ser incluido dentro da configuracao master');
});

test('artefatos de entrega sao versionados e gerados somente na maquina local',()=>{
 const ignorados=fs.readFileSync(path.join(repoRoot,'.gitignore'),'utf8');
 const deploy=fs.readFileSync(path.join(repoRoot,'deploy.ps1'),'utf8');
 const gerador=fs.readFileSync(path.join(repoRoot,'entrega-cliente-local','USO_INTERNO_NAO_ENVIAR','GERAR-ARTEFATOS-ENTREGA.ps1'),'utf8');
 assert.match(ignorados,/entrega-cliente-local\/\*\*\/\*\.zip/);
 assert.doesNotMatch(deploy,/GERAR-ARTEFATOS-ENTREGA\.ps1/);
 assert.match(gerador,/ENVIAR_AO_CLIENTE-v\$versaoSegura-\$data\.zip/);
 assert.match(gerador,/Get-FileHash[^\n]+SHA256/);
 assert.match(gerador,/Select-Object -Skip \$Retencao/);
});

test('GitHub Actions valida o projeto sem acessar o VPS encerrado',()=>{
 const legado=path.join(repoRoot,'.github','workflows','deploy-vps.yml');
 const workflow=fs.readFileSync(path.join(repoRoot,'.github','workflows','validacao.yml'),'utf8');
 assert.equal(fs.existsSync(legado),false);
 assert.match(workflow,/\n\s+push:/);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/CRIAR-PACOTE-APP\.ps1[\s\S]*test:pacote-limpo/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/runs-on:\s*windows-latest/);
 assert.match(workflow,/npm ci/);
 assert.match(workflow,/run:\s*npm test/);
 assert.match(workflow,/npm run test:e2e/);
 assert.match(workflow,/npm run test:pacote-limpo/);
 assert.doesNotMatch(workflow,/VPS_HOST|VPS_USER|VPS_SSH_KEY|ssh\s|deploy\.ps1/i);
});

test('inicializacao PM2 recupera painel e mestre sem iniciar AMPLAYTV',()=>{
 const script=fs.readFileSync(path.join(repoRoot,'start-pm2.ps1'),'utf8');
 assert.match(script,/pm2\.Source resurrect/);
 assert.match(script,/\.julian-play-install\.json/);
 assert.match(script,/IniciarProcessoPm2SeNecessario/);
 assert.match(script,/julian-play-admin/);
 assert.match(script,/\.julian-master-install\.json/);
 assert.match(script,/master\\ecosystem\.config\.js/);
 assert.match(script,/save --force/);
 assert.doesNotMatch(script,/julian-amplaytv/);
});

test('migracao servidor para local preserva instalacao independente e exige corte confirmado',()=>{
 const exportar=fs.readFileSync(path.join(repoRoot,'scripts','migracao-servidor-local','1-EXPORTAR-NO-SERVIDOR.ps1'),'utf8');
 const importar=fs.readFileSync(path.join(repoRoot,'scripts','migracao-servidor-local','2-IMPORTAR-NESTE-COMPUTADOR.ps1'),'utf8');
 const exportarAmbiente=fs.readFileSync(path.join(repoRoot,'scripts','migracao-servidor-local','3-EXPORTAR-AMBIENTE-SEGURO-NO-SERVIDOR.ps1'),'utf8');
 const exportarAmplay=fs.readFileSync(path.join(repoRoot,'scripts','migracao-servidor-local','4-EXPORTAR-AMPLAYTV-PARADA-NO-SERVIDOR.ps1'),'utf8');
 const importarAmplay=fs.readFileSync(path.join(repoRoot,'scripts','migracao-servidor-local','5-IMPORTAR-AMPLAYTV-PARADA-NESTE-COMPUTADOR.ps1'),'utf8');
 assert.match(exportar,/pm2\.cmd[\s\S]*stop[\s\S]*julian-play/);
 assert.match(exportar,/\.wwebjs_auth/);
 assert.match(exportar,/'assets'/);
 assert.match(exportar,/avisos-fora-horario\.json/);
 assert.match(exportar,/'migrations'/);
 assert.match(exportar,/clientes_backup_antes_manutencao\.db/);
 assert.match(exportar,/LastWriteTime = \$agora/);
 assert.match(exportar,/tar\.exe -a -c -f/);
 assert.match(exportar,/Get-FileHash[\s\S]*SHA256/);
 assert.match(exportar,/not \$exportacaoConcluida[\s\S]*religados automaticamente/);
 assert.match(importar,/ConfirmarServidorParado/);
 assert.match(importar,/GetFullPath\(\$DadosAdministrador\)[\s\S]*C:\\JulianPlay\\dados/);
 assert.match(importar,/D:\\JulianPlayDados\\admin/);
 assert.match(importar,/D:\\MigracaoJulianPlay\\Temporario/);
 assert.match(importar,/PRAGMA quick_check/);
 assert.match(importar,/Nome reconstruido pelo SHA-256/);
 assert.match(importar,/HashSet\[string\]/);
 assert.match(importar,/ExecutarPm2Opcional/);
 assert.match(importar,/cmd\.exe \/d \/c/);
 assert.match(importar,/AmbienteSeguro/);
 assert.match(importar,/JULIAN_SECRET_KEY/);
 assert.match(importar,/MASTER_PASSWORD_HASH/);
 assert.match(importar,/PANEL_TOTP_SECRET/);
 assert.match(importar,/O ambiente seguro deve ficar fora do repositorio/);
 assert.match(importar,/LimparAmbienteSeguro/);
 assert.match(importar,/adaptar-cadastro-local\.js/);
 assert.match(importar,/julian-play-admin/);
 assert.match(importar,/'assets','database','migrations'/);
 assert.match(exportarAmbiente,/dump\.pm2/);
 assert.match(exportarAmbiente,/LICENSE_ADMIN_TOKEN/);
 assert.match(exportarAmbiente,/MASTER_PASSWORD_HASH/);
 assert.doesNotMatch(exportarAmbiente,/Write-Host\s+\$json/);
 assert.match(importar,/ExecutarPm2Opcional 'stop' 'julian-amplaytv'/);
 assert.match(exportarAmplay,/ConfirmarParada/);
 assert.match(exportarAmplay,/pm2\.cmd pid/);
 assert.match(exportarAmplay,/Get-NetTCPConnection/);
 assert.match(exportarAmplay,/\.wwebjs_cache/);
 assert.match(exportarAmplay,/Get-FileHash/);
 assert.match(exportarAmplay,/tar\.exe/);
 assert.doesNotMatch(exportarAmplay,/pm2\.cmd start/);
 assert.match(importarAmplay,/ConfirmarOrigemParada/);
 assert.match(importarAmplay,/D:\\JulianPlayDados\\clientes\\amplaytv/);
 assert.match(importarAmplay,/processoConfirmadoParado/);
 assert.match(importarAmplay,/JULIAN_SECRET_KEY/);
 assert.match(importarAmplay,/LICENSE_ADMIN_TOKEN como chave legada do cofre/);
 assert.match(importarAmplay,/materialCofre/);
 assert.match(importarAmplay,/adaptar-cliente-parado\.js/);
 assert.match(importarAmplay,/function NormalizarCaminhoRelativo/);
 assert.doesNotMatch(importarAmplay,/TrimStart\('\.','\\\\'\)/);
 assert.match(importarAmplay,/ExecutarPm2Opcional 'delete' \$ProcessoPm2/);
 assert.doesNotMatch(importarAmplay,/& pm2\.cmd start/);
});

test('adaptacao do cadastro mestre usa SQL parametrizado em arquivo proprio',async()=>{
 const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'julian-play-master-')); const banco=path.join(raiz,'master.db');
 const sqlite3=require('sqlite3').verbose();
 try{
  await new Promise((resolve,reject)=>{
   const db=new sqlite3.Database(banco);
   db.run('CREATE TABLE instalacoes (processoPm2 TEXT, porta INTEGER, pastaDados TEXT)',erro=>{
    if(erro){db.close();return reject(erro)}
    db.run('INSERT INTO instalacoes (processoPm2,porta,pastaDados) VALUES (?,?,?)',['julian-play',10000,'C:\\bots\\julian-play'],erroInsercao=>db.close(erroFechamento=>erroInsercao||erroFechamento?reject(erroInsercao||erroFechamento):resolve()));
   });
  });
  const script=path.join(repoRoot,'scripts','migracao-servidor-local','adaptar-cadastro-local.js');
  const resultado=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,JULIAN_MASTER_DB:banco,JULIAN_ADMIN_DATA:'D:\\JulianPlayDados\\admin'}});
  assert.equal(resultado.status,0,resultado.stderr||resultado.stdout);
  const linha=await new Promise((resolve,reject)=>{const db=new sqlite3.Database(banco);db.get('SELECT * FROM instalacoes',(erro,row)=>db.close(erroFechamento=>erro||erroFechamento?reject(erro||erroFechamento):resolve(row)))});
  assert.deepEqual(linha,{processoPm2:'julian-play-admin',porta:10001,pastaDados:'D:\\JulianPlayDados\\admin'});
 }finally{fs.rmSync(raiz,{recursive:true,force:true})}
});

test('adaptacao da AMPLAYTV aponta para o disco D e mantem o robo parado',async()=>{
 const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'julian-play-amplay-')); const banco=path.join(raiz,'master.db');
 const sqlite3=require('sqlite3').verbose();
 try{
  await new Promise((resolve,reject)=>{
   const db=new sqlite3.Database(banco);
   db.run('CREATE TABLE instalacoes (slug TEXT, processoPm2 TEXT, porta INTEGER, pastaDados TEXT, status TEXT, detalheStatus TEXT, atualizadoEm DATETIME)',erro=>{
    if(erro){db.close();return reject(erro)}
    db.run('INSERT INTO instalacoes (slug,processoPm2,porta,pastaDados,status) VALUES (?,?,?,?,?)',['amplaytv','julian-amplaytv',11004,'C:\\JulianPlayClientes\\amplaytv','ativo'],erroInsercao=>db.close(erroFechamento=>erroInsercao||erroFechamento?reject(erroInsercao||erroFechamento):resolve()));
   });
  });
  const script=path.join(repoRoot,'scripts','migracao-servidor-local','adaptar-cliente-parado.js');
  const resultado=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,JULIAN_MASTER_DB:banco,JULIAN_CLIENT_SLUG:'amplaytv',JULIAN_CLIENT_DATA:'D:\\JulianPlayDados\\clientes\\amplaytv',JULIAN_CLIENT_PROCESS:'julian-amplaytv',JULIAN_CLIENT_PORT:'11004'}});
  assert.equal(resultado.status,0,resultado.stderr||resultado.stdout);
  const linha=await new Promise((resolve,reject)=>{const db=new sqlite3.Database(banco);db.get('SELECT processoPm2,porta,pastaDados,status,detalheStatus FROM instalacoes WHERE slug=?',['amplaytv'],(erro,row)=>db.close(erroFechamento=>erro||erroFechamento?reject(erro||erroFechamento):resolve(row))) });
  assert.deepEqual(linha,{processoPm2:'julian-amplaytv',porta:11004,pastaDados:'D:\\JulianPlayDados\\clientes\\amplaytv',status:'parado',detalheStatus:'Dados migrados para o computador local; robo mantido parado.'});
 }finally{fs.rmSync(raiz,{recursive:true,force:true})}
});

test('exportador do ambiente PM2 seleciona segredos sem mostra-los no terminal',()=>{
 const raiz=fs.mkdtempSync(path.join(os.tmpdir(),'julian-play-pm2-'));
 try{
  const dump=path.join(raiz,'dump.pm2'); const destino=path.join(raiz,'ambiente-seguro.json');
  fs.writeFileSync(dump,JSON.stringify([
   {name:'julian-play',username:'minusculo',USERNAME:'maiusculo',LICENSE_ADMIN_TOKEN:'token-nao-exibir',env:{JULIAN_SECRET_KEY:'chave-nao-exibir',PANEL_TOTP_SECRET:'totp-nao-exibir'}},
   {name:'julian-master',env:{MASTER_USER:'mestre',MASTER_PASSWORD_HASH:'hash-nao-exibir',LICENSE_ADMIN_TOKEN:'token-nao-exibir'}},
   {name:'julian-amplaytv',env:{PANEL_USER:'cliente',PANEL_PASSWORD_HASH:'hash-cliente-nao-exibir',LICENSE_ADMIN_TOKEN:'token-cliente-nao-exibir',JULIAN_SECRET_KEY:'chave-cliente-nao-exibir'}}
  ]));
  const script=path.join(repoRoot,'scripts','migracao-servidor-local','3-EXPORTAR-AMBIENTE-SEGURO-NO-SERVIDOR.ps1');
  const resultado=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Destino',destino,'-DumpPm2',dump],{encoding:'utf8'});
  assert.equal(resultado.status,0,resultado.stderr||resultado.stdout);
  assert.doesNotMatch(resultado.stdout,/token-nao-exibir|chave-nao-exibir|totp-nao-exibir|hash-nao-exibir/);
  const ambiente=JSON.parse(fs.readFileSync(destino,'utf8'));
  assert.equal(ambiente.admin.LICENSE_ADMIN_TOKEN,'token-nao-exibir');
  assert.equal(ambiente.admin.JULIAN_SECRET_KEY,'chave-nao-exibir');
  assert.equal(ambiente.master.MASTER_USER,'mestre');
  assert.equal(ambiente.master.MASTER_PASSWORD_HASH,'hash-nao-exibir');
  assert.equal(ambiente.amplaytv.PANEL_USER,'cliente');
  assert.equal(ambiente.amplaytv.PANEL_PASSWORD_HASH,'hash-cliente-nao-exibir');
  assert.equal(ambiente.amplaytv.JULIAN_SECRET_KEY,'chave-cliente-nao-exibir');
  const fonteExportador=fs.readFileSync(script,'utf8');
  assert.doesNotMatch(fonteExportador,/ConvertFrom-Json/);
  assert.doesNotMatch(fonteExportador,/Get-FileHash/);
  assert.match(fonteExportador,/Security\.Cryptography\.SHA256/);
 }finally{fs.rmSync(raiz,{recursive:true,force:true})}
});
