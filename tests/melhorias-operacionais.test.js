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

test('backup aplica retencao diaria semanal mensal e comprova restauracao isolada', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const m=require('./services/manutencao');const db=require('./database/sqlite');await db.ready;const criado=await m.criarBackupAutomatico();const pasta=path.dirname(criado.caminho);const agora=new Date('2026-07-28T12:00:00Z');const criar=(nome,data)=>{const destino=path.join(pasta,nome);fs.copyFileSync(criado.caminho,destino);fs.copyFileSync(criado.caminho+'.json',destino+'.json');fs.utimesSync(destino,new Date(data),new Date(data));return destino};criar('clientes-auto-duplicado.db','2026-07-28T08:00:00Z');criar('clientes-auto-semana.db','2026-07-20T08:00:00Z');criar('clientes-auto-mes.db','2026-06-15T08:00:00Z');criar('clientes-auto-antigo.db','2024-01-15T08:00:00Z');fs.utimesSync(criado.caminho,agora,agora);const politica=m.aplicarPoliticaRetencaoBackups({dias:7,semanas:8,meses:6,agora});const nomes=fs.readdirSync(pasta).filter(x=>x.endsWith('.db'));const teste=await m.executarExercicioRestauracaoMensal(criado.nome);const relatorio=m.obterRelatorioUltimaRestauracao();process.stdout.write(JSON.stringify({removidos:politica.removidos,duplicado:nomes.includes('clientes-auto-duplicado.db'),semanal:nomes.includes('clientes-auto-semana.db'),mensal:nomes.includes('clientes-auto-mes.db'),antigo:nomes.includes('clientes-auto-antigo.db'),status:teste.status,mesmo:relatorio.backup===criado.nome,tabelas:teste.tabelas>0}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            removidos: 2,
            duplicado: false,
            semanal: true,
            mensal: true,
            antigo: false,
            status: 'aprovado',
            mesmo: true,
            tabelas: true
        });
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

test('kit de recuperacao inclui banco e chave somente dentro do pacote cifrado', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const crypto=require('crypto');const m=require('./services/manutencao');const b=await m.criarBackupAutomatico();const arquivo=await m.exportarBackupCriptografado(b.nome,'senha-de-recuperacao-forte');const dados=fs.readFileSync(arquivo);const salt=dados.subarray(8,24),iv=dados.subarray(24,36),tag=dados.subarray(36,52);const d=crypto.createDecipheriv('aes-256-gcm',crypto.scryptSync('senha-de-recuperacao-forte',salt,32),iv);d.setAuthTag(tag);const pacote=JSON.parse(Buffer.concat([d.update(dados.subarray(52)),d.final()]));process.stdout.write(JSON.stringify({magic:dados.subarray(0,8).toString(),formato:pacote.formato,temBanco:!!pacote.bancoBase64,token:pacote.recuperacao.licenseAdminToken}));})().catch(e=>{console.error(e);process.exit(1)})`, { env: { LICENSE_ADMIN_TOKEN: 'TOKEN-RECUPERAVEL' } });
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { magic: 'JPLAYBK2', formato: 'JPLAYBK2', temBanco: true, token: 'TOKEN-RECUPERAVEL' });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('credencial da API do painel e cifrada no banco e aberta no servico', () => {
    const resultado = executarIsolado(`(async()=>{const db=require('./database/sqlite');const a=require('./services/appsDispositivos');await db.ready;const painel=await a.salvarPainel({nome:'Painel Seguro',apiUrl:'https://api.exemplo.test',apiUsuario:'usuario-api',apiToken:'token-api'});const bruto=await new Promise((ok,fail)=>db.get('SELECT apiUsuario,apiToken FROM paineis WHERE id=?',[painel.id],(e,r)=>e?fail(e):ok(r)));const aberto=await a.buscarPainelPorId(painel.id);process.stdout.write(JSON.stringify({usuarioCifrado:bruto.apiUsuario.startsWith('jplay:v1:'),tokenCifrado:bruto.apiToken.startsWith('jplay:v1:'),usuario:aberto.apiUsuario,token:aberto.apiToken}));})().catch(e=>{console.error(e);process.exit(1)})`, { env: { LICENSE_ADMIN_TOKEN: 'token-da-instalacao' } });
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { usuarioCifrado: true, tokenCifrado: true, usuario: 'usuario-api', token: 'token-api' });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('senhas de clientes sao cifradas sem quebrar leitura e acessos do app', () => {
    const resultado = executarIsolado(`(async()=>{const db=require('./database/sqlite');const c=require('./services/clientes');const salvo=await c.salvarCliente({nome:'Cliente Cofre',telefone:'551188887777',senha:'senha-iptv',senhaApp:'senha-app',acessoApp:['Aplicativo'],acessoSenha:['senha-conexao'],tipoPlanoId:'1',diasContrato:30,valorPlano:'10,00',dataInicio:'2026-07-28T10:00',dataVencimento:'2026-08-28T23:59',status:'ativo'});const bruto=await new Promise((ok,fail)=>db.get('SELECT senha,senhaApp,acessosApp FROM clientes WHERE id=?',[salvo.id],(e,r)=>e?fail(e):ok(r)));const aberto=await c.buscarClientePorId(salvo.id);process.stdout.write(JSON.stringify({senhaCifrada:bruto.senha.startsWith('jplay:v1:'),appCifrada:bruto.senhaApp.startsWith('jplay:v1:'),acessosCifrados:bruto.acessosApp.startsWith('jplay:v1:'),senha:aberto.senha,senhaApp:aberto.senhaApp,acessoSenha:JSON.parse(aberto.acessosApp)[0].senha}));})().catch(e=>{console.error(e);process.exit(1)})`, { env: { LICENSE_ADMIN_TOKEN: 'token-cliente-seguro' } });
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { senhaCifrada: true, appCifrada: true, acessosCifrados: true, senha: 'senha-iptv', senhaApp: 'senha-app', acessoSenha: 'senha-conexao' });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('pagamento manual exige comprovante, identificador unico e registra estorno sem reduzir acesso', () => {
    const resultado = executarIsolado(`(async()=>{const db=require('./database/sqlite');await db.ready;const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,function(e){e?no(e):ok({id:this.lastID,changes:this.changes})}));const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));const plano=await run("INSERT INTO tipos_planos(nome,dias,valor) VALUES('Mensal',30,'35,00')");const cliente=await run("INSERT INTO clientes(nome,telefone,plano,tipoPlanoId,diasContrato,valorPlano,dataInicio,dataVencimento,vencimento,status) VALUES(?,?,?,?,?,?,?,?,?,?)",['Cliente Manual','5511999999999','Mensal',plano.id,30,'35,00','2026-07-28T10:00','2026-08-27T23:59','2026-08-27','ativo']);const s=require('./services/pagamentoManualService');await s.registrarCobrancaManual({referencia:'MAN-1',provedor:'paypal_manual',clienteId:cliente.id,plano:'Mensal',tipoPlanoId:plano.id,diasContrato:30,valorPlano:'35,00',valorTotal:35});const cob=await get("SELECT id FROM cobrancas_pix WHERE referencia='MAN-1'");let sem=false;try{await s.confirmarPagamentoManual(cob.id,{identificadorManual:'PAYPAL-1',conferidoPor:'admin'})}catch(e){sem=/comprovante/i.test(e.message)}await s.registrarComprovanteManual(cob.id,'teste.png');const ok=await s.confirmarPagamentoManual(cob.id,{identificadorManual:'PAYPAL-1',conferidoPor:'admin'});const dup=await s.confirmarPagamentoManual(cob.id,{identificadorManual:'PAYPAL-1',conferidoPor:'admin'});const antes=await get('SELECT dataVencimento FROM clientes WHERE id=?',[cliente.id]);await s.estornarPagamentoManual(cob.id,{motivo:'Estorno confirmado no PayPal',estornadoPor:'admin'});const depois=await get('SELECT dataVencimento FROM clientes WHERE id=?',[cliente.id]);const final=await get('SELECT status,conferidoPor,identificadorManual,estornadoPor,motivoEstorno FROM cobrancas_pix WHERE id=?',[cob.id]);const pagamento=await get('SELECT excluidoEm FROM cliente_pagamentos WHERE id=?',[ok.renovacao.pagamentoId]);process.stdout.write(JSON.stringify({sem,aprovado:ok.aprovado,duplicado:dup.duplicado,status:final.status,conferidoPor:final.conferidoPor,id:final.identificadorManual,estornadoPor:final.estornadoPor,receitaRemovida:!!pagamento.excluidoEm,acessoMantido:antes.dataVencimento===depois.dataVencimento}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            sem: true,
            aprovado: true,
            duplicado: true,
            status: 'estornado',
            conferidoPor: 'admin',
            id: 'PAYPAL-1',
            estornadoPor: 'admin',
            receitaRemovida: true,
            acessoMantido: true
        });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('migracoes formais preservam banco existente, criam backup e sao idempotentes', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const db=require('./database/sqlite');await db.ready;const all=(s,p=[])=>new Promise((ok,no)=>db.all(s,p,(e,r)=>e?no(e):ok(r)));const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));const runner=require('./database/migrations/runner');const estado=await runner.obterEstadoMigracoes(db);const backups=fs.readdirSync(path.join(db.dataDir,'backups')).filter(x=>x.startsWith('pre-migracao-')&&x.endsWith('.db'));const antes=backups.length;const segunda=await runner.executarMigracoesFormais({db,dbPath:db.dbPath,dataDir:db.dataDir});const colunas=await all('PRAGMA table_info(cobrancas_pix)');const sessoes=await get("SELECT name FROM sqlite_master WHERE type='table' AND name='sessoes_painel'");process.stdout.write(JSON.stringify({total:estado.aplicadas.filter(x=>x.versao.includes('-00')).length,backup:backups.length>0,idempotente:segunda.status,novoBackup:fs.readdirSync(path.join(db.dataDir,'backups')).filter(x=>x.startsWith('pre-migracao-')&&x.endsWith('.db')).length===antes,comprovante:colunas.some(x=>x.name==='comprovanteArquivo'),sessoes:!!sessoes}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            total: 5,
            backup: true,
            idempotente: 'sem_alteracoes',
            novoBackup: true,
            comprovante: true,
            sessoes: true
        });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('falha em migracao formal executa rollback e gera relatorio', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const db=require('./database/sqlite');await db.ready;const runner=require('./database/migrations/runner');let falhou=false;try{await runner.executarMigracoesFormais({db,dbPath:db.dbPath,dataDir:db.dataDir,lista:[{versao:'teste-rollback',nome:'Teste rollback',async up({exec}){await exec('CREATE TABLE tabela_que_deve_sumir(id INTEGER)');throw new Error('falha simulada')}}]})}catch(e){falhou=/revertida/.test(e.message)}const get=s=>new Promise((ok,no)=>db.get(s,(e,r)=>e?no(e):ok(r)));const tabela=await get("SELECT name FROM sqlite_master WHERE name='tabela_que_deve_sumir'");const versao=await get("SELECT versao FROM schema_migrations WHERE versao='teste-rollback'");const relatorio=JSON.parse(fs.readFileSync(path.join(db.dataDir,'migrations','ultimo-relatorio.json'),'utf8'));process.stdout.write(JSON.stringify({falhou,tabela:!!tabela,versao:!!versao,status:relatorio.status,backup:fs.existsSync(relatorio.backup)}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            falhou: true,
            tabela: false,
            versao: false,
            status: 'erro',
            backup: true
        });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});
