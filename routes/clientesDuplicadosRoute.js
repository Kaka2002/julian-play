const express = require('express');

function criarClientesDuplicadosRoute(deps = {}) {
    const router = express.Router();
    const { listarGruposClientesDuplicados, listarVinculos, alterarVinculo, renderizar, escapar, desativarCache } = deps;
    const formulario = (a,b,remover=false) => `<form method="post" action="/clientes/assinaturas-responsavel"><input type="hidden" name="clienteA" value="${a}"><input type="hidden" name="clienteB" value="${b}"><input type="hidden" name="acao" value="${remover ? 'remover' : 'vincular'}"><button class="button secondary" type="submit">${remover ? 'Desfazer vínculo' : 'Mesmo responsável, assinaturas diferentes'}</button></form>`;
    router.post('/clientes/assinaturas-responsavel', async (req,res,next) => {
        try {
            if (!['vincular','remover'].includes(req.body.acao)) return res.status(400).send('Ação inválida.');
            await alterarVinculo(req.body.clienteA,req.body.clienteB,req.body.acao === 'vincular',req.usuarioPainel || 'operador');
            return res.redirect(303,'/clientes/duplicados');
        } catch (e) {
            if (['Selecione duas assinaturas diferentes.','Assinatura não encontrada.','As assinaturas precisam ter o mesmo WhatsApp válido.'].includes(e.message)) return res.status(400).send(e.message);
            return next(e);
        }
    });
    router.get('/clientes/duplicados', async (_req, res, next) => {
        try {
            desativarCache(res);
            const [grupos,vinculos] = await Promise.all([listarGruposClientesDuplicados(),listarVinculos()]);
            const conteudo = `<section class="page-title"><div><h1>Possíveis clientes duplicados</h1>
            <div class="subtitle">Revise coincidências ou reconheça assinaturas diferentes do mesmo responsável.</div></div></section>
            <section class="panel"><div class="panel-head"><div><h2 class="panel-title">${grupos.length} grupo(s) para revisar</h2>
            <div class="subtitle">O sistema não une nem exclui clientes automaticamente. Cada assinatura mantém pagamentos, acesso e vencimento próprios. O vínculo retira somente o alerta pelo WhatsApp desse par; MAC repetido continua exigindo revisão.</div></div></div>
            ${grupos.length ? `<div class="pending-list">${grupos.map(grupo => `<article class="pending-item"><div>
                <span class="badge ${grupo.prioridade === 'alta' ? 'warn' : 'info'}">${grupo.prioridade === 'alta' ? 'Alta' : 'Média'}</span>
                <h3>${grupo.clientes.map(cliente => escapar(cliente.nome)).join(' × ')}</h3>
                <p>${grupo.coincidencias.map(item => item.tipo === 'telefone' ? 'Mesmo WhatsApp' : 'Mesmo MAC').join(' · ')}</p>
                <div class="quick-actions">${grupo.clientes.map(cliente => `<a class="button secondary" href="/clientes/${cliente.id}/editar">Revisar ${escapar(cliente.nome)}</a>`).join('')}</div>
                ${grupo.coincidencias.filter(c=>c.tipo==='telefone').map(c=>c.clientesIds.flatMap((a,i)=>c.clientesIds.slice(i+1).filter(b=>!vinculos.some(v=>v.clienteA===Math.min(a,b)&&v.clienteB===Math.max(a,b))).map(b=>`<p>${escapar(grupo.clientes.find(x=>x.id===a).nome)} / ${escapar(grupo.clientes.find(x=>x.id===b).nome)}</p>${formulario(a,b)}`)).join('')).join('')}
            </div></article>`).join('')}</div>` : '<div class="empty">Nenhuma duplicidade forte encontrada.</div>'}</section>
            <section class="panel"><h2>Assinaturas do mesmo responsável</h2><p>Use nomes como Casa e Bar para distinguir os contratos. O reconhecimento é manual e pode ser desfeito.</p>
            ${vinculos.length ? vinculos.map(v=>`<article class="pending-item"><div><h3>${escapar(v.nomeA)} × ${escapar(v.nomeB)}</h3><p>Contratos separados · mesmo responsável</p><a href="/clientes/${v.clienteA}/editar">Revisar primeira assinatura</a> · <a href="/clientes/${v.clienteB}/editar">Revisar segunda assinatura</a>${formulario(v.clienteA,v.clienteB,true)}</div></article>`).join('') : '<p>Nenhum vínculo reconhecido.</p>'}</section>`;
            return renderizar(res, { titulo: 'Possíveis clientes duplicados', conteudo, ativo: 'clientes' });
        } catch (e) { return next(e); }
    });
    return router;
}
module.exports = criarClientesDuplicadosRoute;
