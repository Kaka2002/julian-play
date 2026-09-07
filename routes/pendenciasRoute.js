const express = require('express');

function criarPendenciasRoute(deps = {}) {
    const router = express.Router();
    const { listarPendenciasOperacionais, obterStatusSistema, getStatusWhatsApp,
        renderizar, escapar, desativarCache, paginarItens, paginaAtual, quantidadePorPagina } = deps;

    function option(valor, atual, texto) {
        return `<option value="${valor}" ${valor === atual ? 'selected' : ''}>${texto}</option>`;
    }

    function rotuloArea(area) {
        const nomes = { clientes: 'Clientes', financeiro: 'Financeiro', atendimentos: 'Atendimentos',
            crm: 'CRM', whatsapp: 'WhatsApp', paineis: 'Painéis', campanhas: 'Campanhas', manutencao: 'Manutenção' };
        return nomes[area] || area;
    }

    function formatarPrazo(valor) {
        if (!valor) return '';
        const texto = String(valor);
        const data = new Date(texto.length === 10 ? `${texto}T12:00:00` : texto);
        if (Number.isNaN(data.getTime())) return texto;
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo', dateStyle: 'short',
            ...(texto.length > 10 ? { timeStyle: 'short' } : {})
        }).format(data);
    }

    function tela({ itens, resumo, filtros, paginacao }) {
        const classes = { critica: 'error', alta: 'warn', media: 'info', baixa: 'muted' };
        const nomes = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
        return `<section class="page-title"><div><h1>Central de Pendências</h1><div class="subtitle">Prioridades operacionais calculadas a partir das áreas do sistema</div></div></section>
        <section class="metrics">
            <article class="metric"><div><span class="metric-label">Críticas</span><strong class="metric-value">${resumo.critica}</strong></div></article>
            <article class="metric"><div><span class="metric-label">Altas</span><strong class="metric-value">${resumo.alta}</strong></div></article>
            <article class="metric"><div><span class="metric-label">Médias</span><strong class="metric-value">${resumo.media}</strong></div></article>
            <article class="metric"><div><span class="metric-label">Total aberto</span><strong class="metric-value">${resumo.total}</strong></div></article>
        </section>
        <section class="panel">
            <div class="panel-head"><div><h2 class="panel-title">Trabalho a resolver</h2><div class="subtitle">A pendência desaparece quando a situação for resolvida na área de origem.</div></div></div>
            <form class="pending-filters" method="get" action="/pendencias">
                <input name="busca" value="${escapar(filtros.busca)}" placeholder="Buscar cliente ou problema" aria-label="Buscar pendência">
                <select name="prioridade" aria-label="Filtrar prioridade">${option('todas', filtros.prioridade, 'Todas as prioridades')}${option('critica', filtros.prioridade, 'Críticas')}${option('alta', filtros.prioridade, 'Altas')}${option('media', filtros.prioridade, 'Médias')}</select>
                <select name="area" aria-label="Filtrar área">${option('todas', filtros.area, 'Todas as áreas')}${['clientes','financeiro','atendimentos','crm','whatsapp','paineis','campanhas','manutencao'].map(area => option(area, filtros.area, area.charAt(0).toUpperCase() + area.slice(1))).join('')}</select>
                <select name="porPagina" aria-label="Quantidade por página">${[6,10,20,40,60,80,100].map(n => option(String(n), String(paginacao.porPagina), `${n} por página`)).join('')}</select>
                <button class="button" type="submit">Filtrar</button>
            </form>
            ${itens.length ? `<div class="pending-list">${itens.map(item => `<article class="pending-item">
                <div><span class="badge ${classes[item.prioridade]}">${nomes[item.prioridade]}</span> <span class="badge muted">Área responsável: ${escapar(rotuloArea(item.area))}</span>
                    <h3>${escapar(item.titulo)}</h3><p>${escapar(item.detalhe)}</p>${item.prazo ? `<small>Prazo ou atualização: ${escapar(formatarPrazo(item.prazo))}</small>` : ''}</div>
                <a class="button secondary" href="${escapar(item.href)}">Resolver</a>
            </article>`).join('')}</div>` : '<div class="empty">Nenhuma pendência encontrada para estes filtros.</div>'}
            ${paginacao.totalPaginas > 1 ? `<div class="pagination"><span class="pagination-info">${paginacao.total} pendência(s)</span><div>${Array.from({length:paginacao.totalPaginas},(_,i)=>{const p=i+1;const q=new URLSearchParams({...filtros,pagina:String(p),porPagina:String(paginacao.porPagina)});return `<a class="page-link ${p===paginacao.pagina?'active':''}" href="/pendencias?${q}">${p}</a>`;}).join('')}</div></div>` : ''}
        </section>`;
    }

    router.get('/pendencias', async (req, res) => {
        desativarCache(res);
        const filtros = {
            busca: String(req.query.busca || '').trim(),
            prioridade: String(req.query.prioridade || 'todas'),
            area: String(req.query.area || 'todas')
        };
        const whatsapp = getStatusWhatsApp();
        const sistema = await obterStatusSistema(whatsapp);
        const resultado = await listarPendenciasOperacionais(filtros, { operacional: { whatsapp, sistema } });
        const paginacao = paginarItens(resultado.itens, paginaAtual(req.query.pagina), quantidadePorPagina(req.query.porPagina, 20));
        return renderizar(res, { titulo: 'Central de Pendências', conteudo: tela({
            itens: paginacao.itens, resumo: resultado.resumo, filtros, paginacao
        }), ativo: 'pendencias' });
    });

    return router;
}

module.exports = criarPendenciasRoute;
