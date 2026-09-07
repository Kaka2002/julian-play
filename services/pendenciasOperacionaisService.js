const db = require('../database/sqlite');
const { listarDivergenciasFinanceiras } = require('./conciliacaoFinanceiraService');
const { listarGruposClientesDuplicados } = require('./clientesDuplicadosService');

const PRIORIDADE_PESO = { critica: 0, alta: 1, media: 2, baixa: 3 };

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

function instante(valor) {
    if (!valor) return null;
    const texto = String(valor).trim();
    const data = new Date(texto.length === 10 ? `${texto}T23:59:59` : texto);
    return Number.isNaN(data.getTime()) ? null : data;
}

function diasAte(valor, agora) {
    const data = instante(valor);
    if (!data) return null;
    return Math.ceil((data.getTime() - agora.getTime()) / 86400000);
}

function criarItem(dados) {
    return {
        chave: `${dados.tipo}:${dados.id}`,
        area: dados.area,
        tipo: dados.tipo,
        prioridade: dados.prioridade,
        titulo: dados.titulo,
        detalhe: dados.detalhe || '',
        clienteId: dados.clienteId || null,
        prazo: dados.prazo || '',
        href: dados.href
    };
}

function pendenciasClientes(clientes, agora) {
    const itens = [];
    for (const cliente of clientes) {
        const vencimento = cliente.dataVencimento || cliente.vencimento;
        const dias = diasAte(vencimento, agora);
        if (dias === null || !['ativo', 'teste', 'pendente'].includes(cliente.status)) continue;
        const teste = cliente.status === 'teste';
        if (dias < 0) {
            itens.push(criarItem({
                id: cliente.id, tipo: teste ? 'teste_vencido' : 'cliente_vencido', area: 'clientes',
                prioridade: dias <= -7 ? 'critica' : 'alta', clienteId: cliente.id,
                titulo: `${cliente.nome} ${teste ? 'está com o teste vencido' : 'está vencido'}`,
                detalhe: `Vencimento há ${Math.abs(dias)} dia(s).`, prazo: vencimento,
                href: `/clientes/${cliente.id}/editar#renovar`
            }));
        } else if (dias <= 7) {
            itens.push(criarItem({
                id: cliente.id, tipo: teste ? 'teste_vencendo' : 'cliente_vencendo', area: 'clientes',
                prioridade: dias <= 1 ? 'alta' : 'media', clienteId: cliente.id,
                titulo: `${cliente.nome} ${dias === 0 ? 'vence hoje' : `vence em ${dias} dia(s)`}`,
                detalhe: teste ? 'Teste grátis próximo do encerramento.' : 'Renovação próxima.',
                prazo: vencimento, href: `/clientes/${cliente.id}/editar#renovar`
            }));
        }
    }
    return itens;
}

function pendenciasAtendimentos(atendimentos, agora) {
    return atendimentos.flatMap(item => {
        const prazo = instante(item.proximoContato);
        const atrasado = prazo && prazo.getTime() <= agora.getTime();
        if (!atrasado && item.prioridade !== 'urgente') return [];
        return [criarItem({
            id: item.id, tipo: 'atendimento', area: 'atendimentos', clienteId: item.clienteId,
            prioridade: atrasado && item.prioridade === 'urgente' ? 'critica' : 'alta',
            titulo: `Atendimento ${item.prioridade === 'urgente' ? 'urgente' : 'atrasado'}: ${item.clienteNome}`,
            detalhe: item.descricao || `Motivo: ${item.motivo}.`, prazo: item.proximoContato,
            href: '/atendimentos'
        })];
    });
}

function pendenciasLeads(leads, agora) {
    return leads.flatMap(lead => {
        const prazo = instante(lead.proximoContato);
        const atrasado = prazo && prazo.getTime() <= agora.getTime();
        const aguardando = lead.status === 'aguardando_pagamento';
        if (!atrasado && !aguardando && lead.prioridade !== 'urgente') return [];
        return [criarItem({
            id: lead.id, tipo: 'lead', area: 'crm',
            prioridade: atrasado && lead.prioridade === 'urgente' ? 'critica' : 'alta',
            titulo: `${atrasado ? 'Contato atrasado' : aguardando ? 'Pagamento aguardado' : 'Lead urgente'}: ${lead.nome}`,
            detalhe: lead.interesse ? `Interesse: ${lead.interesse}.` : 'Revisar oportunidade comercial.',
            prazo: lead.proximoContato, href: `/crm/${lead.id}/editar`
        })];
    });
}

function pendenciasCobrancas(cobrancas) {
    const finais = new Set(['aprovado', 'estornado', 'cancelled', 'canceled', 'rejected', 'refunded', 'charged_back']);
    return cobrancas.filter(item => !finais.has(String(item.status || '').toLowerCase())).map(item => {
        const erro = ['erro', 'erro_renovacao', 'valor_divergente'].includes(item.status);
        const manual = ['paypal_manual', 'manual'].includes(item.provedor);
        return criarItem({
            id: item.id, tipo: 'cobranca', area: 'financeiro', clienteId: item.clienteId,
            prioridade: erro ? 'critica' : item.status === 'aguardando_conferencia' ? 'alta' : 'media',
            titulo: `${erro ? 'Falha em cobrança' : 'Cobrança pendente'}: ${item.clienteNome}`,
            detalhe: item.erro || `${item.provedor} · ${item.status} · R$ ${item.valorTotal}`,
            prazo: item.atualizadoEm || item.criadoEm,
            href: manual ? '/pagamentos-manuais' : '/financeiro'
        });
    });
}

function pendenciasFilas(mensagens, renovacoes) {
    return [
        ...mensagens.map(item => criarItem({
            id: item.id, tipo: 'mensagem', area: 'whatsapp',
            prioridade: item.status === 'incerto' ? 'critica' : 'alta',
            titulo: item.status === 'incerto' ? 'Envio com resultado incerto' : 'Mensagem com falha',
            detalhe: item.erro || item.descricao || `Destino ${item.destino}`,
            prazo: item.atualizadoEm, href: '/manutencao'
        })),
        ...renovacoes.map(item => criarItem({
            id: item.id, tipo: 'renovacao_painel', area: 'paineis', clienteId: item.clienteId,
            prioridade: 'critica', titulo: `Renovação de painel com falha: ${item.clienteNome}`,
            detalhe: item.erro || `Painel ${item.painelNome}.`, prazo: item.atualizadoEm,
            href: `/paineis/${item.painelId}/editar`
        }))
    ];
}

function pendenciasCampanhas(campanhas) {
    return campanhas.map(item => criarItem({
        id: item.id, tipo: 'campanha', area: 'campanhas',
        prioridade: Number(item.erros || 0) > 0 ? 'alta' : 'media',
        titulo: `${item.status === 'pausada' ? 'Campanha pausada' : 'Campanha com falhas'}: ${item.nome}`,
        detalhe: item.mensagem || `${item.erros || 0} erro(s) registrado(s).`,
        prazo: item.atualizadoEm, href: `/campanhas?id=${item.id}`
    }));
}

function adicionarPendenciasOperacionais(itens, operacional = {}) {
    const statusWhatsApp = operacional.whatsapp || {};
    const statusSistema = operacional.sistema || {};
    if (!statusWhatsApp.conectado) {
        itens.push(criarItem({ id: 'conexao', tipo: 'whatsapp_desconectado', area: 'whatsapp', prioridade: 'critica',
            titulo: 'WhatsApp desconectado', detalhe: 'Mensagens e automações dependentes da conexão estão interrompidas.', href: '/qr' }));
    }
    if (statusSistema.backupRecente === false) {
        itens.push(criarItem({ id: 'backup', tipo: 'backup_atrasado', area: 'manutencao', prioridade: 'critica',
            titulo: 'Backup verificado atrasado', detalhe: 'Não existe backup verificado nas últimas 36 horas.', href: '/manutencao' }));
    }
    return itens;
}

function aplicarFiltros(itens, filtros = {}) {
    const prioridade = String(filtros.prioridade || 'todas');
    const area = String(filtros.area || 'todas');
    const busca = String(filtros.busca || '').trim().toLocaleLowerCase('pt-BR');
    return itens.filter(item => (
        (prioridade === 'todas' || item.prioridade === prioridade)
        && (area === 'todas' || item.area === area)
        && (!busca || `${item.titulo} ${item.detalhe}`.toLocaleLowerCase('pt-BR').includes(busca))
    ));
}

async function listarPendenciasOperacionais(filtros = {}, opcoes = {}) {
    const agora = opcoes.agora instanceof Date ? opcoes.agora : new Date();
    const [clientes, atendimentos, leads, cobrancas, mensagens, renovacoes, campanhas, divergenciasFinanceiras, duplicados] = await Promise.all([
        buscarTodos(`SELECT id,nome,status,vencimento,dataVencimento FROM clientes WHERE anonimizadoEm IS NULL OR anonimizadoEm = ''`),
        buscarTodos(`SELECT a.*,c.nome clienteNome FROM cliente_atendimentos a JOIN clientes c ON c.id=a.clienteId WHERE a.status IN ('aberto','em_andamento')`),
        buscarTodos(`SELECT * FROM leads WHERE status NOT IN ('ganho','perdido')`),
        buscarTodos(`SELECT c.*,cl.nome clienteNome FROM cobrancas_pix c JOIN clientes cl ON cl.id=c.clienteId ORDER BY c.id DESC LIMIT 500`),
        buscarTodos(`SELECT id,status,destino,descricao,erro,atualizadoEm FROM mensagens_saida_fila WHERE status IN ('incerto','falhou') ORDER BY id DESC LIMIT 200`),
        buscarTodos(`SELECT r.*,c.nome clienteNome,p.nome painelNome FROM renovacoes_painel_fila r JOIN clientes c ON c.id=r.clienteId JOIN paineis p ON p.id=r.painelId WHERE r.status='falha' ORDER BY r.id DESC LIMIT 200`),
        buscarTodos(`SELECT id,nome,status,erros,mensagem,atualizadoEm FROM campanhas WHERE status='pausada' OR (erros>0 AND status NOT IN ('cancelada','concluida')) ORDER BY id DESC LIMIT 100`),
        listarDivergenciasFinanceiras(),
        listarGruposClientesDuplicados()
    ]);
    const todos = [
        ...pendenciasClientes(clientes, agora), ...pendenciasAtendimentos(atendimentos, agora),
        ...pendenciasLeads(leads, agora), ...pendenciasCobrancas(cobrancas),
        ...pendenciasFilas(mensagens, renovacoes), ...pendenciasCampanhas(campanhas),
        ...divergenciasFinanceiras.map(item => criarItem({ ...item, id: item.chave, area: 'financeiro',
            prazo: item.atualizadoEm, href: '/financeiro/conciliacao' })),
        ...duplicados.map(grupo => criarItem({ id: grupo.chave, tipo: 'cliente_duplicado', area: 'clientes',
            prioridade: grupo.prioridade, clienteId: grupo.clientes[0]?.id,
            titulo: `Possíveis cadastros duplicados: ${grupo.clientes.map(item => item.nome).join(' × ')}`,
            detalhe: grupo.coincidencias.map(item => item.tipo === 'telefone' ? 'Mesmo WhatsApp' : 'Mesmo endereço MAC').join(' e '),
            prazo: grupo.clientes.reduce((maisRecente, item) => String(item.atualizadoEm || '') > maisRecente ? String(item.atualizadoEm) : maisRecente, ''),
            href: '/clientes/duplicados' }))
    ];
    adicionarPendenciasOperacionais(todos, opcoes.operacional);
    todos.sort((a, b) => (PRIORIDADE_PESO[a.prioridade] - PRIORIDADE_PESO[b.prioridade])
        || String(a.prazo || '9999').localeCompare(String(b.prazo || '9999'))
        || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const resumo = { total: todos.length, critica: 0, alta: 0, media: 0, baixa: 0 };
    todos.forEach(item => { resumo[item.prioridade] += 1; });
    return { itens: aplicarFiltros(todos, filtros), resumo };
}

module.exports = { listarPendenciasOperacionais, aplicarFiltros, diasAte };
