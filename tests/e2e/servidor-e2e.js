const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = path.join(os.tmpdir(), 'julian-play-e2e');
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

Object.assign(process.env, {
    PORT: '11999',
    DATA_DIR: dataDir,
    DB_PATH: path.join(dataDir, 'clientes-e2e.db'),
    PANEL_USER: 'e2e-admin',
    PANEL_PASSWORD: 'Senha-E2E-Segura-2026',
    LICENSE_ROLE: 'admin',
    JULIAN_PLAY_APP_NAME: 'julian-play-e2e',
    LICENSE_ADMIN_TOKEN: 'token-e2e-isolado-nao-usar-em-producao',
    DISABLE_WHATSAPP: '1',
    NODE_ENV: 'test'
});

async function executar() {
    const db = require('../../database/sqlite');
    await db.ready;
    await new Promise((resolve, reject) => db.run(
        `INSERT INTO clientes
            (nome, telefone, plano, vencimento, dataVencimento, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['Cliente E2E Vencido', '5511999990000', 'Mensal', '2026-07-20 23:59', '2026-07-20 23:59', 'ativo'],
        err => err ? reject(err) : resolve()
    ));
    const planos = await require('../../services/tiposPlanos').listarTiposPlanos();
    await require('../../services/clientes').salvarCliente({
        nome: 'Cliente E2E Bonus', telefone: '5511999990001', status: 'ativo',
        tipoPlanoId: planos.find(p => p.nome === 'Mensal').id, plano: 'Mensal', diasContrato: 30,
        valorPlano: '35,00', bonusMeses: 3, dataInicio: '2098-12-01T23:59', dataVencimento: '2099-01-01T23:59'
    });
    for (const nome of ['Assinatura E2E Casa', 'Assinatura E2E Bar']) {
        await new Promise((ok,erro)=>db.run("INSERT INTO clientes(nome,telefone,status) VALUES(?,'5511988887777','inativo')",[nome],e=>e?erro(e):ok()));
    }
    await require('../../services/clientes').salvarCliente({
        nome:'Cliente E2E Comprovante',telefone:'5511977776666',status:'ativo',
        tipoPlanoId:planos.find(p=>p.nome==='Mensal').id,plano:'Mensal',diasContrato:30,
        valorPlano:'35,00',dataInicio:'2098-12-01T23:59',dataVencimento:'2099-01-01T23:59'
    });
    await require('../../services/crmService').salvarLead({
        nome:'Lead E2E Layout',telefone:'5511966665555',status:'em_conversa',origem:'Teste isolado',
        observacoes:'Aguardar retorno do interessado e conferir pagamento antes da assinatura. '.repeat(8)+'ReferenciaSemEspacos'.repeat(15)
    });
    await require('../../services/appsDispositivos').salvarPainel({nome:'Aura E2E isolado',tipoIntegracao:'sigma_reseller',apiUrl:'https://auratvpainel.com/api/reseller-api/v1',apiToken:'sigma-token-e2e-ficticio',renovacaoAutomatica:'0'});
    const sigma=require('../../services/sigmaResellerService');
    const criarSigma=sigma.criarClienteSigma;
    sigma.criarClienteSigma=(painel)=>criarSigma(painel,async(url,op)=>{
        if(painel.apiToken!=='sigma-token-e2e-ficticio'||op.method!=='GET')throw new Error('E2E Sigma isolado recusou a chamada');
        const data=url.endsWith('/me')?{id:'revenda-e2e',creditsBalance:7}:url.includes('/customers/by-username/')?{id:'assinatura-e2e',username:'assinatura-ficticia-e2e',status:'ACTIVE',connections:2,expires_at:'2099-01-01T23:59:59Z',password:'SEGREDO-NAO-EXIBIR'}:[{id:'catalogo-e2e',name:'Mensal ficticio',connections:2,credits:1}];
        return new Response(JSON.stringify({data,meta:{last_page:1}}),{headers:{'content-type':'application/json'}});
    });
    // Acoes e creditos continuam reais; apenas o disparo periodico e isolado.
    // Evita transacoes de fundo concorrendo com login e formularios do E2E.
    require('../../services/indicacoesService').iniciarCreditosIndicacoes = () => {};
    require('../../bot');
}

executar().catch((err) => {
    console.error(err);
    process.exit(1);
});
