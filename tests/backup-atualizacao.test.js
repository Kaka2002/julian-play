const fs=require('fs'); const path=require('path'); const test=require('node:test'); const assert=require('node:assert/strict');
const {criarAmbiente,executarIsolado,removerAmbiente,repoRoot}=require('./helpers/isolated');

test('backup e restauracao recuperam o banco anterior',()=>{
 const ambiente=criarAmbiente();
 try{
  const criado=executarIsolado(`(async()=>{const c=require('./services/configuracoesPainel');const m=require('./services/manutencao');const db=require('./database/sqlite');await c.salvarConfiguracao('nomeEmpresaRobo','Antes');const b=await m.criarBackupManual();await c.salvarConfiguracao('nomeEmpresaRobo','Depois');process.stdout.write(b.nome);db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{ambiente});
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
 const linhaMaster=instalar.indexOf("AdicionarProcessoJulian $nomes 'julian-master'"); const condicao=instalar.indexOf('if (Test-Path -LiteralPath $arquivoMaster)');
 assert.ok(linhaMaster>condicao,'julian-master somente deve ser incluido dentro da configuracao master');
});
