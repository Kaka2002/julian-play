const test = require('node:test');
const assert = require('node:assert/strict');
const { executarIsolado, removerAmbiente } = require('./helpers/isolated');

const codigoPerfil = `const { instalacaoAdministrador }=require('./services/licencaService'); process.stdout.write(JSON.stringify(instalacaoAdministrador()));`;
const perfis = [
    ['Painel Mestre', { LICENSE_ROLE:'admin', JULIAN_PLAY_APP_NAME:'julian-master' }, true],
    ['painel administrador', { LICENSE_ROLE:'administrador', JULIAN_PLAY_APP_NAME:'julian-play' }, true],
    ['cliente comercial no servidor', { LICENSE_ROLE:'cliente', LICENSE_CUSTOMER_NAME:'Empresa X', JULIAN_PLAY_APP_NAME:'julian-empresa-x' }, false],
    ['instalacao local', { LICENSE_ROLE:'cliente', LICENSE_CUSTOMER_NAME:'Empresa Local', JULIAN_PLAY_APP_NAME:'julian-play-cliente' }, false]
];

for (const [nome, env, esperado] of perfis) test(`reconhece ${nome}`, () => {
    const r=executarIsolado(codigoPerfil,{env}); try { assert.equal(JSON.parse(r.stdout),esperado); } finally { removerAmbiente(r.ambiente); }
});

test('instalacao nova inicia empresa, imagens e PIX vazios', () => {
    const r=executarIsolado(`(async()=>{const c=require('./services/configuracoesPainel');const db=require('./database/sqlite');const x=await c.obterConfiguracoes();const k=['nomeEmpresaRobo','imagemRoboMenu','imagemRoboPlanos','imagemRoboTeste','imagemRoboTesteLiberado','imagemRoboRenovacao','imagemRoboAtivacao','imagemRoboErro','imagemRoboEncerramento','imagemCampanhaAmizade','pixChave','pixNome','pixCidade','pixTxid'];process.stdout.write(JSON.stringify(k.map(i=>x[i])));db.close()})().catch(e=>{console.error(e);process.exit(1)})`);
    try { JSON.parse(r.stdout).forEach(v=>assert.equal(v,'')); } finally { removerAmbiente(r.ambiente); }
});

test('configuracoes existentes prevalecem e DATA_DIRs ficam isolados', () => {
    const a=executarIsolado(`(async()=>{const c=require('./services/configuracoesPainel');const db=require('./database/sqlite');await c.salvarConfiguracao('nomeEmpresaRobo','Persistida');await c.salvarConfiguracao('pixChave','existente');db.close()})().catch(e=>{console.error(e);process.exit(1)})`);
    const b=executarIsolado(`(async()=>{const c=require('./services/configuracoesPainel');const db=require('./database/sqlite');process.stdout.write(JSON.stringify(await c.obterConfiguracoes()));db.close()})().catch(e=>{console.error(e);process.exit(1)})`);
    try {
        const reaberto=executarIsolado(`(async()=>{const c=require('./services/configuracoesPainel');const db=require('./database/sqlite');process.stdout.write(JSON.stringify(await c.obterConfiguracoes()));db.close()})().catch(e=>{console.error(e);process.exit(1)})`,{ambiente:a.ambiente});
        assert.equal(JSON.parse(reaberto.stdout).nomeEmpresaRobo,'Persistida'); assert.equal(JSON.parse(reaberto.stdout).pixChave,'existente');
        assert.equal(JSON.parse(b.stdout).nomeEmpresaRobo,''); assert.equal(JSON.parse(b.stdout).pixChave,'');
    } finally { removerAmbiente(a.ambiente); removerAmbiente(b.ambiente); }
});
