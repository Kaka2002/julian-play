const { obterConfiguracoes } = require('./configuracoesPainel');
const { buscarClientePorNomeOuTelefone, listarPagamentosFinanceiro } = require('./clientes');
const { listarDespesasFinanceiras } = require('./despesasFinanceirasService');
const { listarRendimentosFinanceiros } = require('./rendimentosFinanceirosService');
const { registrarEventoSistema } = require('./eventosSistema');
const { listarCobrancasManuais, confirmarPagamentoManual } = require('./pagamentoManualService');
const confirmacoesPendentes = new Map();

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
    return `🤖 *ASSISTENTE DE GESTÃO*\n\nConsultas disponíveis:\n• resumo do mês\n• vencimentos hoje\n• vencimentos amanhã\n• consultar cliente Nome ou telefone\n\nEste modo só consulta dados; não registra pagamentos, não gera cobranças e não altera clientes.`;
}
function dataBrasil(valor = '') {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ?'não informado' :data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
function tokenConfirmacao(id) { return `CONFIRMAR ${Number(id)}`; }

async function responderConsulta({ texto, telefone }) {
    const config = await obterConfiguracoes();
    if (!autorizado(config, telefone)) return null;
    const pedido = normalizar(texto);
    let resposta = '';

    if (['ajuda', 'comandos', 'menu', 'assistente'].includes(pedido)) resposta = `${ajuda()}\n• comprovantes pendentes\n• confirmar comprovante <número>`;
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
    else if (pedido.includes('resumo') || pedido.includes('como esta meu mes') || pedido.includes('como esta o mes')) {
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
    } else if (pedido.includes('vencimento')) {
        const deslocamento = pedido.includes('amanha') ?1 : 0;
        const data = new Date();
        data.setDate(data.getDate() + deslocamento);
        const chave = data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const { listarClientes } = require('./clientes');
        const clientes = (await listarClientes()).filter(cliente => String(cliente.dataVencimento || cliente.vencimento || '').slice(0, 10) === chave);
        resposta = clientes.length
            ? `📅 *VENCIMENTOS ${deslocamento ?'DE AMANHÃ' :'DE HOJE'}*\n\n${clientes.slice(0, 20).map(cliente => `• ${cliente.nome} — ${cliente.plano || 'Plano não informado'}`).join('\n')}${clientes.length > 20 ?`\n\n+ ${clientes.length - 20} cliente(s)` :''}`
            : `📅 Nenhum vencimento encontrado ${deslocamento ?'amanhã' :'hoje'}.`;
    } else if (pedido.startsWith('consultar cliente ') || pedido.startsWith('cliente ')) {
        const termo = pedido.replace(/^(consultar )?cliente\s+/, '').trim();
        const cliente = termo ?await buscarClientePorNomeOuTelefone(termo) : null;
        resposta = cliente
            ? `🔎 *CLIENTE*\n\nNome: *${cliente.nome}*\nStatus: *${cliente.status || '-'}*\nPlano: *${cliente.plano || '-'}*\nVencimento: *${dataBrasil(cliente.dataVencimento || cliente.vencimento)}*`
            : '🔎 Não encontrei esse cliente. Envie “consultar cliente” seguido do nome ou telefone.';
    } else return ajuda();

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

module.exports = { responderConsulta, ehAssistenteAutorizado, obterTelefoneAssistenteAutorizado, autorizado, normalizar };
