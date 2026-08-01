const fs=require('fs'); const path=require('path'); const test=require('node:test'); const assert=require('node:assert/strict');
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

test('migracao servidor para local preserva instalacao independente e exige corte confirmado',()=>{
 const exportar=fs.readFileSync(path.join(repoRoot,'scripts','migracao-servidor-local','1-EXPORTAR-NO-SERVIDOR.ps1'),'utf8');
 const importar=fs.readFileSync(path.join(repoRoot,'scripts','migracao-servidor-local','2-IMPORTAR-NESTE-COMPUTADOR.ps1'),'utf8');
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
 assert.match(importar,/julian-play-admin/);
 assert.match(importar,/'assets','database','migrations'/);
 assert.match(importar,/pm2\.cmd stop julian-amplaytv/);
});
