const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

test('upload multipart ignora o campo CSRF e extrai o arquivo real', () => {
    const { extrairArquivoMultipart, validarCsrfMultipart } = require('../services/uploadMultipartService');
    const boundary = 'julian-play-boundary';
    const csrf = 'a'.repeat(64);
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('imagem-de-teste')
    ]);
    const corpo = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="_csrf"\r\n\r\n${csrf}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="Logo 1.png"\r\nContent-Type: image/png\r\n\r\n`),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const upload = extrairArquivoMultipart(corpo, boundary, 'logo');
    assert.equal(upload.filename, 'Logo 1.png');
    assert.equal(upload.campo, 'logo');
    assert.equal(upload.campos._csrf, csrf);
    assert.deepEqual(upload.buffer, png);
    assert.doesNotThrow(() => validarCsrfMultipart({ headers: { cookie: `julian_csrf=${csrf}` } }, upload));
    assert.throws(
        () => validarCsrfMultipart({ headers: { cookie: `julian_csrf=${'b'.repeat(64)}` } }, upload),
        /expirada ou invalida/i
    );
});

test('upload de imagem rejeita texto com extensao PNG', () => {
    const { validarImagemUpload } = require('../services/uploadMultipartService');
    assert.throws(
        () => validarImagemUpload('logo.png', Buffer.from('a'.repeat(64))),
        /imagem valida/
    );
});

test('tela do WhatsApp permite voltar ao painel', () => {
    const fs = require('fs');
    const rota = fs.readFileSync(path.join(__dirname, '..', 'routes', 'qrRoute.js'), 'utf8');
    assert.match(rota,/class="voltar-painel" href="\/clientes">Voltar ao painel/);
});

test('inicializacao do WhatsApp possui recuperacao segura e limitada', () => {
    const fs = require('fs');
    const whatsapp = fs.readFileSync(path.join(__dirname, '..', 'config', 'whatsapp.js'), 'utf8');
    const bot = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
    assert.match(whatsapp, /WWEBJS_RECONEXAO_MAX_TENTATIVAS/);
    assert.match(whatsapp, /Reconexao automatica interrompida/);
    assert.match(whatsapp, /agendarReconexao\(\);/);
    assert.match(bot, /agendarSupervisaoInicialWhatsApp/);
    assert.match(bot, /\[45000, 120000\]/);
    assert.match(bot, /limparSessao: false/);
});

test('manutencao oferece recuperacao segura do WhatsApp sem apagar a sessao', () => {
    const fs = require('fs');
    const rota = fs.readFileSync(path.join(__dirname, '..', 'routes', 'clientesRoute.js'), 'utf8');
    assert.match(rota, /action="\/manutencao\/whatsapp\/reconectar"/);
    assert.match(rota, /router\.post\('\/manutencao\/whatsapp\/reconectar'/);
    assert.match(rota, /recuperarWhatsAppAutomaticamente\(\{\s*limparSessao: false,/);
});

test('pagina de campanhas exibe campanhas disponiveis e permite disparo', () => {
    const fs = require('fs');
    const rota = fs.readFileSync(path.join(__dirname, '..', 'routes', 'clientesRoute.js'), 'utf8');
    assert.match(rota, /Campanhas disponíveis/);
    assert.match(rota, /action="\/clientes\/disparar-amizade-presente"/);
    assert.match(rota, /totalElegiveis/);
    assert.match(rota, /Fora do horário permitido/);
    assert.match(rota, /Aguarde a janela permitida/);

    const rotaDisparo = rota.slice(rota.indexOf("router.post('/clientes/disparar-amizade-presente'"));
    assert.ok(
        rotaDisparo.indexOf('if (!campanhaDentroHorario(config))') < rotaDisparo.indexOf('const campanha = await criarCampanha'),
        'o horário deve ser validado antes de criar o histórico da campanha'
    );
});

test('aniversario aceita somente dia e mes sem inventar ano', () => {
    const aniversario = require('../utils/aniversario');
    assert.equal(aniversario.normalizarAniversario('08/04'), '04-08');
    assert.equal(aniversario.normalizarAniversario('1998-04-08'), '04-08');
    assert.equal(aniversario.formatarAniversario('04-08'), '08/04');
    assert.equal(aniversario.normalizarAniversario('29/02'), '02-29');
    assert.throws(() => aniversario.normalizarAniversario('31/04'), /DD\/MM/);
});

test('cadastro e aviso anual usam aniversario sem ano', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(partes.map(x=>[x.type,x.value]));const salvo=await c.salvarCliente({nome:'Cliente Aniversario',telefone:'5511999991234',nascimento:v.day+'/'+v.month,status:'ativo'});const lista=await c.listarClientesAniversarioHoje(new Date().getFullYear());let invalida=false;try{await c.salvarCliente({nome:'Data Invalida',telefone:'5511999994321',nascimento:'31/04'})}catch(e){invalida=/DD\\/MM/.test(e.message)}process.stdout.write(JSON.stringify({nascimento:salvo.nascimento,encontrado:lista.some(x=>x.id===salvo.id),invalida}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const retorno = JSON.parse(resultado.stdout);
        assert.match(retorno.nascimento, /^\d{2}-\d{2}$/);
        assert.equal(retorno.encontrado, true);
        assert.equal(retorno.invalida, true);
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('campo de endereco MAC aceita todas as letras e numeros na tela', () => {
    const fs = require('fs');
    const rota = fs.readFileSync(path.join(__dirname, '..', 'routes', 'clientesRoute.js'), 'utf8');
    const inicio = rota.indexOf('function formatarMac(valor)');
    const fim = rota.indexOf('function atualizarPlano()', inicio);
    const codigo = rota.slice(inicio, fim);
    const formatarMac = Function(`${codigo}; return formatarMac;`)();

    assert.equal(formatarMac('g1-h2:i3.j4/k5 l6'), 'G1:H2:I3:J4:K5:L6');
    assert.equal(formatarMac('z9y8x7w6v5u4'), 'Z9:Y8:X7:W6:V5:U4');
});

test('servidor preserva endereco MAC alfanumerico ao salvar cliente', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const salvo=await c.salvarCliente({nome:'Cliente MAC',telefone:'5511999999876',enderecoMac:'z9-y8:x7.w6/v5 u4',acessoAppNome:['Aplicativo'],acessoEnderecoMac:['g1-h2:i3.j4/k5 l6'],status:'ativo'});process.stdout.write(JSON.stringify({legado:salvo.enderecoMac,acesso:JSON.parse(salvo.acessosApp)[0].enderecoMac}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            legado: 'Z9:Y8:X7:W6:V5:U4',
            acesso: 'G1:H2:I3:J4:K5:L6'
        });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('painel removido nao e reintroduzido pelas conexoes do cliente', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const base={nome:'Cliente Painel',telefone:'5511999996789',paineisSelecionados:['Painel A','Painel Sigma'],paineisSelecionadosPresentes:'1',acessoAppNome:['App A','App Sigma'],acessoPainel:['Painel A','Painel Sigma'],status:'ativo'};const criado=await c.salvarCliente(base);const atualizado=await c.salvarCliente({...base,id:criado.id,paineisSelecionados:['Painel A']});process.stdout.write(JSON.stringify({paineis:JSON.parse(atualizado.paineisSelecionados),acessos:JSON.parse(atualizado.acessosApp).map(item=>item.painel)}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            paineis: ['Painel A'],
            acessos: ['Painel A', '']
        });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('migracao remove ano de aniversarios ISO existentes', () => {
    const resultado = executarIsolado(`(async()=>{const db=require('./database/sqlite');await db.ready;const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,e=>e?no(e):ok()));const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));await run("INSERT INTO clientes(nome,telefone,nascimento) VALUES('Legado','5511999999999','1998-04-08')");await require('./database/migrations/007-aniversario-dia-mes').up({run});const cliente=await get("SELECT nascimento FROM clientes WHERE nome='Legado'");process.stdout.write(JSON.stringify(cliente));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { nascimento: '04-08' });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('cliente novo exige consentimento explicito para entrar em campanhas', () => {
    const resultado = executarIsolado(`(async()=>{const c=require('./services/clientes');const base={nome:'Cliente Teste',telefone:'5511999990000',tipoPlanoId:'1',diasContrato:30,valorPlano:'10,00',dataInicio:'2026-07-28T10:00',dataVencimento:'2026-08-28T23:59',status:'ativo'};const sem=await c.salvarCliente(base);const antes=await c.listarClientesAtivosComerciais();const com=await c.salvarCliente({...base,id:sem.id,whatsappMarketingConsentimento:'1'});const depois=await c.listarClientesAtivosComerciais();process.stdout.write(JSON.stringify({sem:sem.whatsappMarketingConsentimento,antes:antes.length,com:com.whatsappMarketingConsentimento,depois:depois.length}));})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { sem: 0, antes: 0, com: 1, depois: 1 });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('backup verificado pode ser copiado para armazenamento externo', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const m=require('./services/manutencao');const b=await m.criarBackupAutomatico();const externa=path.join(${JSON.stringify(require('os').tmpdir())},'julian-play-backup-externo-'+Date.now());const destino=await m.copiarBackupExterno(b.nome,externa);const exercicio=await m.executarExercicioRestauracaoMensal('',{caminhoArquivo:destino,origem:'externa'});process.stdout.write(JSON.stringify({db:fs.existsSync(destino),manifesto:fs.existsSync(destino+'.json'),status:exercicio.status,origem:exercicio.origem,hash:exercicio.hashSha256}));fs.rmSync(externa,{recursive:true,force:true});})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const retorno = JSON.parse(resultado.stdout);
        assert.equal(retorno.db, true);
        assert.equal(retorno.manifesto, true);
        assert.equal(retorno.status, 'aprovado');
        assert.equal(retorno.origem, 'externa');
        assert.match(retorno.hash, /^[a-f0-9]{64}$/);
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('painel diferencia copia local de copia confirmada fora do computador', () => {
    const resultado = executarIsolado(`(()=>{const m=require('./services/manutencao');const local=m.avaliarDestinoBackupExterno({backupExternoAtivo:'1',backupExternoPasta:'C:\\Backups'});const fora=m.avaliarDestinoBackupExterno({backupExternoAtivo:'1',backupExternoPasta:'C:\\Backups',backupExternoForaComputador:'1'});process.stdout.write(JSON.stringify({local:local.protegidaContraPerdaDoComputador,fora:fora.protegidaContraPerdaDoComputador,nivel:fora.nivel}))})()`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), { local: false, fora: true, nivel: 'fora_computador' });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('copia externa mantem somente os cinco backups mais recentes', () => {
    const resultado = executarIsolado(`(()=>{const fs=require('fs');const path=require('path');const os=require('os');const m=require('./services/manutencao');const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'julian-retencao-externa-'));for(let i=1;i<=7;i+=1){const nome='clientes-2026010'+i+'-00000'+i+'.db';const arquivo=path.join(pasta,nome);fs.writeFileSync(arquivo,'backup-'+i);fs.writeFileSync(arquivo+'.json',JSON.stringify({i}));const data=new Date(Date.UTC(2026,0,i));fs.utimesSync(arquivo,data,data);fs.utimesSync(arquivo+'.json',data,data)}fs.writeFileSync(path.join(pasta,'nao-remover.txt'),'preservar');const retencao=m.aplicarRetencaoBackupsExternos(pasta,5);const arquivos=fs.readdirSync(pasta);const retorno={retencao,bancos:arquivos.filter(x=>x.endsWith('.db')).sort(),manifestos:arquivos.filter(x=>x.endsWith('.db.json')).length,outro:arquivos.includes('nao-remover.txt')};fs.rmSync(pasta,{recursive:true,force:true});process.stdout.write(JSON.stringify(retorno))})()`);
    try {
        const retorno = JSON.parse(resultado.stdout);
        assert.equal(retorno.retencao.removidos, 2);
        assert.equal(retorno.retencao.mantidos, 5);
        assert.equal(retorno.retencao.maximo, 5);
        assert.deepEqual(retorno.bancos, [
            'clientes-20260103-000003.db',
            'clientes-20260104-000004.db',
            'clientes-20260105-000005.db',
            'clientes-20260106-000006.db',
            'clientes-20260107-000007.db'
        ]);
        assert.equal(retorno.manifestos, 5);
        assert.equal(retorno.outro, true);
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('backup manual atualiza automaticamente o armazenamento externo configurado', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const os=require('os');const m=require('./services/manutencao');const externa=path.join(os.tmpdir(),'julian-play-backup-manual-externo-'+Date.now());const criado=await m.criarBackupManualComCopiaExterna({backupExternoAtivo:'1',backupExternoPasta:externa});const retorno={nome:criado.backup.nome,copia:criado.copiaExterna,erro:criado.erroCopiaExterna,db:fs.existsSync(criado.copiaExterna),manifesto:fs.existsSync(criado.copiaExterna+'.json')};fs.rmSync(externa,{recursive:true,force:true});process.stdout.write(JSON.stringify(retorno));})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const retorno = JSON.parse(resultado.stdout);
        assert.match(retorno.nome, /^clientes-\d{8}-\d{6}\.db$/);
        assert.equal(retorno.erro, '');
        assert.equal(retorno.db, true);
        assert.equal(retorno.manifesto, true);
        assert.ok(retorno.copia.endsWith(retorno.nome));
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('falha da copia externa nao elimina o backup manual local', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const os=require('os');const m=require('./services/manutencao');const alvo=path.join(os.tmpdir(),'julian-play-destino-invalido-'+Date.now());fs.writeFileSync(alvo,'arquivo impede a criacao da pasta');const criado=await m.criarBackupManualComCopiaExterna({backupExternoAtivo:'1',backupExternoPasta:alvo});const retorno={local:fs.existsSync(criado.backup.caminho),copia:criado.copiaExterna,erro:criado.erroCopiaExterna};fs.rmSync(alvo,{force:true});process.stdout.write(JSON.stringify(retorno));})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const retorno = JSON.parse(resultado.stdout);
        assert.equal(retorno.local, true);
        assert.equal(retorno.copia, '');
        assert.ok(retorno.erro.length > 0);
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

test('segredo opcional com chave indisponivel nao bloqueia o acesso ao painel nem sobrescreve o cofre', () => {
    const cifrado = executarIsolado(`const c=require('./services/cofreSegredosService');process.stdout.write(c.proteger('mercadoPagoAccessToken','token-original'))`, { env: { JULIAN_SECRET_KEY: 'chave-original' } });
    const resultado = executarIsolado(`(async()=>{const db=require('./database/sqlite');await db.ready;const run=(sql,params=[])=>new Promise((ok,no)=>db.run(sql,params,e=>e?no(e):ok()));const get=(sql,params=[])=>new Promise((ok,no)=>db.get(sql,params,(e,row)=>e?no(e):ok(row)));await run("INSERT INTO configuracoes(chave,valor) VALUES('mercadoPagoAccessToken',?),('painelUsuario','admin'),('painelSenhaHash','hash')",[${JSON.stringify(cifrado.stdout)}]);const config=require('./services/configuracoesPainel');const auth=require('./services/authService');const lido=await config.obterConfiguracoes();const acesso=await config.obterConfiguracoesAcesso();const configurado=await auth.acessoConfigurado();const bruto=await get("SELECT valor FROM configuracoes WHERE chave='mercadoPagoAccessToken'");process.stdout.write(JSON.stringify({indisponivel:lido.segredosIndisponiveis,usuario:acesso.painelUsuario,senha:acesso.painelSenhaHash,configurado,preservado:bruto.valor===${JSON.stringify(cifrado.stdout)}}));db.close()})().catch(e=>{console.error(e);process.exit(1)})`, { env: { JULIAN_SECRET_KEY: 'chave-diferente' } });
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            indisponivel: ['mercadoPagoAccessToken'],
            usuario: 'admin',
            senha: 'hash',
            configurado: true,
            preservado: true
        });
    } finally {
        removerAmbiente(cifrado.ambiente);
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
        const dados = JSON.parse(resultado.stdout);
        assert.ok(dados.total >= 8);
        delete dados.total;
        assert.deepEqual(dados, {
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

test('checksum CRLF legado e normalizado com backup sem desativar a integridade', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const db=require('./database/sqlite');await db.ready;const runner=require('./database/migrations/runner');const migracao=runner.migrations[0];const legado=runner.checksumMigracaoLegadoCrlf(migracao);const atual=runner.checksumMigracao(migracao);const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,e=>e?no(e):ok()));const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));await run('UPDATE schema_migrations SET checksum=? WHERE versao=?',[legado,migracao.versao]);const antes=fs.readdirSync(path.join(db.dataDir,'backups')).filter(x=>x.startsWith('pre-migracao-')&&x.endsWith('.db')).length;const relatorio=await runner.executarMigracoesFormais({db,dbPath:db.dbPath,dataDir:db.dataDir});const registrada=await get('SELECT checksum FROM schema_migrations WHERE versao=?',[migracao.versao]);const depois=fs.readdirSync(path.join(db.dataDir,'backups')).filter(x=>x.startsWith('pre-migracao-')&&x.endsWith('.db')).length;process.stdout.write(JSON.stringify({formatosDistintos:legado!==atual,status:relatorio.status,normalizada:relatorio.checksumsNormalizados.includes(migracao.versao),checksumAtual:registrada.checksum===atual,backupCriado:depois===antes+1}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            formatosDistintos: true,
            status: 'sucesso',
            normalizada: true,
            checksumAtual: true,
            backupCriado: true
        });
    } finally {
        removerAmbiente(resultado.ambiente);
    }
});

test('checksum realmente divergente continua bloqueando a inicializacao', () => {
    const resultado = executarIsolado(`(async()=>{const fs=require('fs');const path=require('path');const db=require('./database/sqlite');await db.ready;const runner=require('./database/migrations/runner');const migracao=runner.migrations[0];const run=(s,p=[])=>new Promise((ok,no)=>db.run(s,p,e=>e?no(e):ok()));const get=(s,p=[])=>new Promise((ok,no)=>db.get(s,p,(e,r)=>e?no(e):ok(r)));await run('UPDATE schema_migrations SET checksum=? WHERE versao=?',['checksum-adulterado',migracao.versao]);const antes=fs.readdirSync(path.join(db.dataDir,'backups')).filter(x=>x.startsWith('pre-migracao-')&&x.endsWith('.db')).length;let bloqueou=false;try{await runner.executarMigracoesFormais({db,dbPath:db.dbPath,dataDir:db.dataDir})}catch(e){bloqueou=/Checksum divergente/.test(e.message)}const registrada=await get('SELECT checksum FROM schema_migrations WHERE versao=?',[migracao.versao]);const depois=fs.readdirSync(path.join(db.dataDir,'backups')).filter(x=>x.startsWith('pre-migracao-')&&x.endsWith('.db')).length;process.stdout.write(JSON.stringify({bloqueou,inalterado:registrada.checksum==='checksum-adulterado',semBackupDesnecessario:depois===antes}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        assert.deepEqual(JSON.parse(resultado.stdout), {
            bloqueou: true,
            inalterado: true,
            semBackupDesnecessario: true
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
