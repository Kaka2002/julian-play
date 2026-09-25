const { obterConfiguracoes } = require('./configuracoesPainel');
const { buscarClientePorNomeOuTelefone, listarClientes, listarPagamentosFinanceiro } = require('./clientes');
const db = require('../database/sqlite');
const { listarDespesasFinanceiras } = require('./despesasFinanceirasService');
const { listarRendimentosFinanceiros } = require('./rendimentosFinanceirosService');
const { registrarEventoSistema } = require('./eventosSistema');
const { listarCobrancasManuais, confirmarPagamentoManual } = require('./pagamentoManualService');
const confirmacoesPendentes = new Map();
const contextosClientes = new Map();
const TEMPO_CONTEXTO_CLIENTE_MS = 30 * 60 * 1000;

function normalizar(texto = '') {
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function telefoneNumerico(valor = '') { return String(valor).replace(/\D/g, ''); }
function moedaNumero(valor) {
    const texto = String(valor || '0').replace(/R\$\s*/gi, '').replace(/\s/g, '');
    const numero = Number(texto.includes(',') ?texto.replace(/\./g, '').replace(',', '.') :texto);
    return Number.isFinite(numero) ?numero : 0;
}
function moeda(valor) { return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function mesAtual() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7); }
function numerosAutorizados(config = {}) {
    return String(config.assistenteWhatsappNumerosAutorizados || '').split(/[\s,;]+/).map(telefoneNumerico).filter(Boolean);
}
function autorizado(config, telefone) {
    if (String(config.assistenteWhatsappAtivo || '0') !== '1') return false;
    return numerosAutorizados(config).includes(telefoneNumerico(telefone));
}
function ajuda() {
    return `🤖 *ASSISTENTE DE GESTÃO*\n\nConsultas exclusivas da gestão podem ser enviadas diretamente:\n• o que preciso resolver hoje?\n• resumo do mês\n• clientes vencidos\n• quem vence nos próximos 3 dias?\n• quanto tenho para receber?\n• consultar cliente Nome ou telefone\n• comprovantes pendentes\n\nApós consultar um cliente, pergunte “ele está em dia?” ou “quando vence?”.\n\nUse “menu gestão” somente para abrir esta ajuda, pois “menu” continua sendo do robô comercial.\n\nEste modo só consulta dados; não registra pagamentos, não gera cobranças e não altera clientes.`;
}
function dataBrasil(valor = '') {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ?'não informado' :data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
function tokenConfirmacao(id) { return `CONFIRMAR ${Number(id)}`; }
function chaveData(valor) { return String(valor || '').slice(0, 10); }
function hojeSaoPaulo() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
function adicionarDias(data, dias) {
    const resultado = new Date(`${data}T12:00:00`);
    resultado.setDate(resultado.getDate() + dias);
    return resultado.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
function valorCliente(cliente = {}) { return moedaNumero(cliente.valorPlano) + moedaNumero(cliente.assinaturaApp); }
function listarClientesParaRadar() {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(`SELECT nome, status, plano, dataVencimento, vencimento
            FROM clientes
            WHERE anonimizadoEm IS NULL OR anonimizadoEm = ''
            ORDER BY nome COLLATE NOCASE ASC`, (err, clientes) => err ?reject(err) :resolve(clientes || []));
    }));
}
function registrarContextoCliente(telefone, cliente) {
    if (!cliente?.nome) return;
    contextosClientes.set(telefoneNumerico(telefone), { nome: cliente.nome, expiraEm: Date.now() + TEMPO_CONTEXTO_CLIENTE_MS });
}
function obterContextoCliente(telefone) {
    const chave = telefoneNumerico(telefone);
    const contexto = contextosClientes.get(chave);
    if (!contexto || contexto.expiraEm < Date.now()) {
        contextosClientes.delete(chave);
        return null;
    }
    return contexto;
}
function ehPedidoResumo(pedido) {
    return pedido.includes('resumo') || pedido.includes('como esta meu mes') || pedido.includes('como esta o mes') ||
        /\b(faturamento|balanco)\b/.test(pedido) || /\b(financeiro|saldo)\b.*\bmes\b/.test(pedido) ||
        /quanto.*\b(recebi|entrou|faturei|ganhei)\b/.test(pedido);
}
function ehPedidoVencimento(pedido) {
    return pedido.includes('vencimento') || /\b(quem|quais clientes?)\b.*\bvence/.test(pedido) ||
        /\bclientes?\b.*\bpara vencer\b/.test(pedido);
}
function ehPedidoInadimplentes(pedido) { return /\b(vencido|vencidos|inadimplente|inadimplentes|atrasado|atrasados|em atraso)\b/.test(pedido); }
function extrairDiasProximosVencimentos(pedido) {
    const correspondencia = pedido.match(/proxim(?:o|os|as)\s+(\d{1,2})\s+dias?/);
    return correspondencia ?Math.max(1, Math.min(30, Number(correspondencia[1]))) : 0;
}
function ehPedidoTotalPendente(pedido) {
    return /\ba receber\b/.test(pedido) || /\b(total|quanto)\b.*\b(receber|pendente)\b/.test(pedido);
}
function ehPedidoRadarDiario(pedido) {
    return pedido === 'o que preciso resolver hoje' || pedido === 'o que preciso resolver hoje?' ||
        pedido === 'pendencias de hoje' || pedido === 'pendencias hoje' || pedido === 'radar de hoje' ||
        pedido === 'resumo operacional de hoje';
}
function extrairTermoCliente(pedido) {
    let termo = '';
    const direto = pedido.match(/^(?:consultar|buscar|ver|dados|situacao|status) (?:do |da )?cliente\s+(.+)$/) || pedido.match(/^cliente\s+(.+)$/);
    const vencimento = pedido.match(/^(?:quando|qual dia) vence (?:o |a )?(?:cliente )?(.+)$/);
    const situacao = pedido.match(/^cliente\s+(.+?)\s+(?:esta|ta)\s+(?:em dia|atrasado|ativo|inativo)$/);
    termo = direto?.[1] || vencimento?.[1] || situacao?.[1] || '';
    return termo.trim();
}
function ehPedidoCliente(pedido) { return Boolean(extrairTermoCliente(pedido)); }
function ehPerguntaSobreClienteAtual(pedido) {
    return /\b(ele|ela|dele|dela)\b/.test(pedido) || /^(quando vence|qual.*plano|situacao|status)/.test(pedido);
}
function extrairPedidoGestao(texto) {
    const pedido = normalizar(texto);
    if (pedido.startsWith('gestao ')) return pedido.slice('gestao '.length).trim();
    if (pedido.endsWith(' gestao')) return pedido.slice(0, -' gestao'.length).trim();
    if (ehPedidoRadarDiario(pedido) || ehPedidoResumo(pedido) || ehPedidoVencimento(pedido) || ehPedidoCliente(pedido) || ehPedidoInadimplentes(pedido) || ehPedidoTotalPendente(pedido) || extrairDiasProximosVencimentos(pedido)) return pedido;
    if (pedido === 'comprovantes pendentes' || pedido === 'comprovantes') return pedido;
    if (/^confirmar (comprovante )?\d+$/.test(pedido)) return pedido;
    return '';
}

async function responderConsulta({ texto, telefone }) {
    const config = await obterConfiguracoes();
    if (!autorizado(config, telefone)) return null;
    const textoNormalizado = normalizar(texto);
    const contextoCliente = obterContextoCliente(telefone);
    const pedido = extrairPedidoGestao(texto) || (contextoCliente && ehPerguntaSobreClienteAtual(textoNormalizado) ?'__cliente_atual__' :'');
    if (!pedido) return null;
    let resposta = '';

    if (['ajuda', 'comandos', 'menu', 'assistente'].includes(pedido)) resposta = `${ajuda()}\n• comprovantes pendentes\n• confirmar comprovante <número>`;
    else if (ehPedidoRadarDiario(pedido)) {
        const hoje = hojeSaoPaulo();
        const limite = adicionarDias(hoje, 3);
        const [pagamentosHoje, cobrancas, clientes] = await Promise.all([
            listarPagamentosFinanceiro({ dataInicio: hoje, dataFim: hoje, status: 'validos' }),
            listarCobrancasManuais({ status: 'aguardando_conferencia' }),
            listarClientesParaRadar()
        ]);
        const recebimentos = pagamentosHoje.reduce((soma, item) => soma + moedaNumero(item.valorTotal), 0);
        const clientesComerciais = clientes.filter(cliente => !/teste/i.test(cliente.plano || ''));
        const vencidos = clientesComerciais.filter(cliente => cliente.status === 'expirado');
        const vencemHoje = clientesComerciais.filter(cliente => cliente.status === 'ativo' && chaveData(cliente.dataVencimento || cliente.vencimento) === hoje);
        const proximos = clientesComerciais.filter(cliente => {
            const vencimento = chaveData(cliente.dataVencimento || cliente.vencimento);
            return cliente.status === 'ativo' && vencimento > hoje && vencimento <= limite;
        });
        const prioridades = [
            ...cobrancas.slice(0, 3).map(cobranca => `• Conferir comprovante #${cobranca.id} — ${cobranca.clienteNome}`),
            ...vencidos.slice(0, 3).map(cliente => `• Cliente vencido: ${cliente.nome}`),
            ...vencemHoje.slice(0, 3).map(cliente => `• Vence hoje: ${cliente.nome}`)
        ];
        resposta = `📌 *RADAR DE HOJE — ${dataBrasil(hoje)}*\n\nRecebido hoje: *${moeda(recebimentos)}* (${pagamentosHoje.length} pagamento(s))\nComprovantes para conferir: *${cobrancas.length}*\nClientes vencidos: *${vencidos.length}*\nVencem hoje: *${vencemHoje.length}*\nVencem nos próximos 3 dias: *${proximos.length}*\n\n${prioridades.length ?`*Prioridades:*\n${prioridades.join('\n')}` :'✅ Nenhuma prioridade encontrada hoje.'}\n\nEste radar só organiza a consulta. Confirme os comprovantes e recebimentos no banco antes de qualquer ação.`;
    }
    else if (pedido === 'comprovantes pendentes' || pedido === 'comprovantes') {
        const cobrancas = await listarCobrancasManuais({ status: 'aguardando_conferencia' });
        resposta = cobrancas.length
            ? `🧾 *COMPROVANTES PENDENTES*\n\n${cobrancas.slice(0, 10).map(c => `• #${c.id} — ${c.clienteNome} — ${moeda(c.valorTotal)}\n  Plano: ${c.plano}`).join('\n')}\n\nApós conferir no banco, envie “confirmar comprovante <número>”.`
            : '🧾 Não há comprovantes aguardando conferência.';
    } else if (/^confirmar comprovante \d+$/.test(pedido)) {
        const id = Number(pedido.match(/\d+$/)[0]);
        const cobranca = (await listarCobrancasManuais({ status: 'aguardando_conferencia' })).find(item => Number(item.id) === id);
        if (cobranca) confirmacoesPendentes.set(`${telefoneNumerico(telefone)}:${cobranca.id}`, Date.now() + 10 * 60 * 1000);
        resposta = cobranca ? `⚠️ *CONFIRA ANTES NO BANCO*\n\n#${cobranca.id} — ${cobranca.clienteNome}\nValor: *${moeda(cobranca.valorTotal)}*\nPlano: ${cobranca.plano}\n\nApós confirmar valor e transação, envie exatamente:\n*${tokenConfirmacao(cobranca.id)}*` : 'Não encontrei esse comprovante aguardando conferência.';
    } else if (/^confirmar \d+$/.test(pedido)) {
        const id = Number(pedido.match(/\d+$/)[0]);
        const chaveConfirmacao = `${telefoneNumerico(telefone)}:${id}`;
        if (Number(confirmacoesPendentes.get(chaveConfirmacao) || 0) < Date.now()) return 'Peça primeiro a prévia com “confirmar comprovante <número>”.';
        confirmacoesPendentes.delete(chaveConfirmacao);
        const identificador = `ASSIST-WA-${id}-${Date.now()}`;
        const resultado = await confirmarPagamentoManual(id, { identificadorManual: identificador, conferidoPor: `WhatsApp ${telefoneNumerico(telefone)}` });
        resposta = resultado.duplicado ? '✅ Esse pagamento já estava confirmado.' : `✅ Pagamento #${id} confirmado e cliente renovado.`;
    }
    else if (ehPedidoInadimplentes(pedido)) {
        const clientes = await listarClientes({ status: 'inadimplente' });
        const total = clientes.reduce((soma, cliente) => soma + valorCliente(cliente), 0);
        resposta = clientes.length
            ? `⏰ *CLIENTES VENCIDOS*\n\n${clientes.slice(0, 20).map(cliente => `• ${cliente.nome} — ${dataBrasil(cliente.dataVencimento || cliente.vencimento)} — ${moeda(valorCliente(cliente))}`).join('\n')}${clientes.length > 20 ?`\n\n+ ${clientes.length - 20} cliente(s)` :''}\n\nTotal mensal cadastrado: *${moeda(total)}*`
            : '⏰ Não há clientes vencidos no momento.';
    } else if (ehPedidoTotalPendente(pedido)) {
        const clientes = await listarClientes({ status: 'inadimplente' });
        const total = clientes.reduce((soma, cliente) => soma + valorCliente(cliente), 0);
        resposta = `💰 *A RECEBER — CLIENTES VENCIDOS*\n\nClientes: *${clientes.length}*\nValor mensal cadastrado: *${moeda(total)}*\n\nEste total é uma projeção pelos valores atuais dos contratos vencidos; confirme cada recebimento no banco.`;
    } else if (extrairDiasProximosVencimentos(pedido)) {
        const dias = extrairDiasProximosVencimentos(pedido);
        const hoje = hojeSaoPaulo();
        const limite = adicionarDias(hoje, dias);
        const clientes = (await listarClientes()).filter(cliente => {
            const vencimento = chaveData(cliente.dataVencimento || cliente.vencimento);
            return cliente.status === 'ativo' && !/teste/i.test(cliente.plano || '') && vencimento >= hoje && vencimento <= limite;
        });
        resposta = clientes.length
            ? `📅 *VENCIMENTOS NOS PRÓXIMOS ${dias} DIA(S)*\n\n${clientes.slice(0, 20).map(cliente => `• ${cliente.nome} — ${dataBrasil(cliente.dataVencimento || cliente.vencimento)} — ${cliente.plano || 'Plano não informado'}`).join('\n')}${clientes.length > 20 ?`\n\n+ ${clientes.length - 20} cliente(s)` :''}`
            : `📅 Nenhum vencimento encontrado nos próximos ${dias} dia(s).`;
    } else if (ehPedidoResumo(pedido)) {
        const mes = mesAtual();
        const [pagamentos, despesas, rendimentos] = await Promise.all([
            listarPagamentosFinanceiro({ mes, status: 'validos' }),
            listarDespesasFinanceiras({ mes, status: 'validas' }),
            listarRendimentosFinanceiros({ mes, status: 'validos' })
        ]);
        const recebido = pagamentos.reduce((soma, item) => soma + moedaNumero(item.valorTotal), 0);
        const gasto = despesas.reduce((soma, item) => soma + moedaNumero(item.valor), 0);
        const rendimento = rendimentos.reduce((soma, item) => soma + moedaNumero(item.valor), 0);
        resposta = `📊 *RESUMO DE ${mes}*\n\nRecebido: *${moeda(recebido)}* (${pagamentos.length} pagamento(s))\nRendimentos: *${moeda(rendimento)}*\nDespesas: *${moeda(gasto)}*\nSaldo: *${moeda(recebido + rendimento - gasto)}*`;
    } else if (ehPedidoVencimento(pedido)) {
        const deslocamento = pedido.includes('amanha') ?1 : 0;
        const data = new Date();
        data.setDate(data.getDate() + deslocamento);
        const chave = data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const clientes = (await listarClientes()).filter(cliente => String(cliente.dataVencimento || cliente.vencimento || '').slice(0, 10) === chave);
        resposta = clientes.length
            ? `📅 *VENCIMENTOS ${deslocamento ?'DE AMANHÃ' :'DE HOJE'}*\n\n${clientes.slice(0, 20).map(cliente => `• ${cliente.nome} — ${cliente.plano || 'Plano não informado'}`).join('\n')}${clientes.length > 20 ?`\n\n+ ${clientes.length - 20} cliente(s)` :''}`
            : `📅 Nenhum vencimento encontrado ${deslocamento ?'amanhã' :'hoje'}.`;
    } else if (ehPedidoCliente(pedido) || pedido === '__cliente_atual__') {
        const termo = pedido === '__cliente_atual__' ?contextoCliente?.nome :extrairTermoCliente(pedido);
        const cliente = termo ?await buscarClientePorNomeOuTelefone(termo) : null;
        if (cliente) registrarContextoCliente(telefone, cliente);
        resposta = cliente
            ? `🔎 *CLIENTE*\n\nNome: *${cliente.nome}*\nStatus: *${cliente.status || '-'}*\nPlano: *${cliente.plano || '-'}*\nVencimento: *${dataBrasil(cliente.dataVencimento || cliente.vencimento)}*`
            : '🔎 Não encontrei esse cliente. Envie “consultar cliente” seguido do nome ou telefone.';
    } else return null;

    await registrarEventoSistema('assistente_whatsapp_consulta', 'info', 'Consulta administrativa respondida pelo WhatsApp.', {
        telefone: telefoneNumerico(telefone), comando: pedido.slice(0, 160)
    });
    return resposta;
}

async function ehAssistenteAutorizado(telefone) {
    return autorizado(await obterConfiguracoes(), telefone);
}

async function obterTelefoneAssistenteAutorizado({ telefone, client } = {}) {
    const config = await obterConfiguracoes();
    if (String(config.assistenteWhatsappAtivo || '0') !== '1') return '';

    const recebido = String(telefone || '').trim();
    const numeros = numerosAutorizados(config);
    const numerico = telefoneNumerico(recebido);
    if (numeros.includes(numerico)) return numerico;
    if (!recebido.endsWith('@lid') || typeof client?.getNumberId !== 'function') return '';

    for (const numero of numeros) {
        try {
            const contato = await client.getNumberId(numero);
            if (String(contato?._serialized || '').trim() === recebido) return numero;
        } catch (err) {
            console.log(`Não foi possível verificar o número autorizado do assistente: ${err.message}`);
        }
    }
    return '';
}

module.exports = { responderConsulta, ehAssistenteAutorizado, obterTelefoneAssistenteAutorizado, autorizado, normalizar, ehPedidoResumo, ehPedidoVencimento, extrairTermoCliente };
