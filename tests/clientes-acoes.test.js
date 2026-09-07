const test = require('node:test');
const assert = require('node:assert/strict');
const criarRoute = require('../routes/clientesAcoesRoute');

function preparar(deps = {}) {
    const router = criarRoute({
        montarUrlClienteMensagem: (id, mensagem) => `${id}:${mensagem}`,
        montarUrlListaClientesMensagem: mensagem => mensagem,
        logControleClientes() {},
        ...deps
    });
    return async (metodo, caminho, req = {}) => {
        const route = router.stack.find(item => item.route?.path === caminho && item.route.methods[metodo]);
        assert.ok(route, `Rota ausente: ${metodo} ${caminho}`);
        const res = { redirect(url) { this.url = url; }, status(code) { this.code = code; return this; } };
        await route.route.stack[0].handle({ params: { id: '7' }, body: {}, query: {}, ...req }, res);
        return res;
    };
}

test('cadastro encaminha status, consentimento e autoria ao servico central', async () => {
    let recebido;
    const executar = preparar({
        buscarAlertasCadastroCliente: async () => [],
        salvarCliente: async (dados, auditoria) => { recebido = { dados, auditoria }; return { ...dados, id: 7 }; },
        clienteEhTeste: () => false
    });
    const body = { id: '7', status: 'inativo', whatsappMarketingConsentimento: '0', motivoAlteracao: 'Solicitacao' };
    const res = await executar('post', '/clientes/salvar', { body, usuarioPainel: 'operador-teste' });
    assert.equal(recebido.dados, body);
    assert.deepEqual(recebido.auditoria, { responsavel: 'operador-teste', origem: 'painel_cliente', motivo: 'Solicitacao' });
    assert.match(res.url, /clientes\/todos/);
});

test('ficha carrega historicos e elegibilidade de exclusao do mesmo cliente', async () => {
    const ids = [];
    let tela;
    const lista = async id => { ids.push(id); return []; };
    const executar = preparar({
        buscarClientePorId: async () => ({ id: 7 }), obterListasCliente: async () => ({}),
        listarNotasCliente: lista, listarPagamentosCliente: lista, listarAtendimentosCliente: lista,
        listarAuditoriaCliente: lista, listarInteracoesCliente: async cliente => lista(cliente.id),
        buscarAlertasCadastroCliente: async () => [], obterConfiguracoes: async () => ({}),
        verificarExclusaoDefinitivaCliente: async id => { ids.push(id); return { permitida: false }; },
        formularioCliente: (cliente, listas, opcoes) => { tela = opcoes; return 'ficha'; },
        renderizar: async () => {}
    });
    await executar('get', '/clientes/:id/editar', { query: { linha: '2' } });
    assert.deepEqual(ids, [7, 7, 7, 7, 7, 7]);
    assert.equal(tela.exclusaoDefinitiva.permitida, false);
    assert.equal(tela.paginaLinha, '2');
});

test('renovacao duplicada e bloqueada dentro da instancia e isolada entre instancias', async () => {
    let renovacoes = 0;
    const deps = {
        renovarCliente: async () => { renovacoes++; return { cliente: { id: 7 }, pagamentoId: 1 }; },
        registrarEventoCliente: async () => {}
    };
    const executar = preparar(deps);
    await executar('post', '/clientes/:id/renovar');
    const repetida = await executar('post', '/clientes/:id/renovar');
    assert.equal(renovacoes, 1);
    assert.match(repetida.url, /duplicado/);
    await preparar(deps)('post', '/clientes/:id/renovar');
    assert.equal(renovacoes, 2);
});

test('renovacao permite tentar novamente apos falha do servico', async () => {
    let tentativas = 0;
    const executar = preparar({
        renovarCliente: async () => { if (++tentativas === 1) throw Error('falha simulada'); return { cliente: { id: 7 } }; },
        registrarEventoCliente: async () => {}
    });
    await executar('post', '/clientes/:id/renovar');
    const res = await executar('post', '/clientes/:id/renovar');
    assert.equal(tentativas, 2);
    assert.match(res.url, /sucesso/);
});

test('bonus nao altera saldo quando o WhatsApp esta desconectado', async () => {
    const executar = preparar({
        buscarClientePorId: async () => ({ id: 7 }), getStatusWhatsApp: () => ({ conectado: false }),
        getClient: () => null, aplicarBonusCliente: async () => assert.fail('Nao deve aplicar bonus')
    });
    const res = await executar('post', '/clientes/:id/aplicar-bonus');
    assert.match(res.url, /Bônus não aplicado/);
});

test('exclusao direta continua encaminhando para privacidade sem remover dados', async () => {
    const res = await preparar()('post', '/clientes/:id/excluir');
    assert.match(res.url, /exclusao direta foi desativada/);
});

test('roteador principal monta as acoes uma unica vez com dependencias reais', () => {
    const { executarIsolado, removerAmbiente } = require('./helpers/isolated');
    const resultado = executarIsolado(`(async()=>{const router=require('./routes/clientesRoute');const db=require('./database/sqlite');await db.ready;const rotas=[];function visitar(r){for(const l of r.stack||[]){if(l.route)rotas.push(l.route.path);else if(l.handle?.stack)visitar(l.handle)}}visitar(router);process.stdout.write(JSON.stringify({salvar:rotas.filter(p=>p==='/clientes/salvar').length,editar:rotas.filter(p=>p==='/clientes/:id/editar').length,renovar:rotas.filter(p=>p==='/clientes/:id/renovar').length}));process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})`, { env: { DISABLE_WHATSAPP: '1' } });
    try { assert.deepEqual(JSON.parse(resultado.stdout), { salvar: 1, editar: 1, renovar: 1 }); }
    finally { removerAmbiente(resultado.ambiente); }
});
