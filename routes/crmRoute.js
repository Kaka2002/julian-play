const express = require('express');

function criarCrmRoute(deps = {}) {
    const router = express.Router();
    const {
        desativarCache, listarLeads, listarClientes, listarPlanosComerciais,
        resumoCrm, relatorioComercial, renderizar, telaCrm, buscarLeadPorId,
        listarHistoricoLead, telaEditarLead, salvarLead, adicionarHistoricoLead,
        atualizarStatusLead, rotuloStatusLead, vincularLeadAoCliente,
        adicionarNotaCliente, salvarCliente, agoraLocalDateTime,
        montarUrlClienteMensagem, removerLead, getStatusWhatsApp, getClient,
        obterConfiguracoes, enviarMensagemWhatsAppComFallback, mensagemLeadPadrao
    } = deps;

    router.get('/crm', async (req, res) => {
        desativarCache(res);
        const filtros = { status: String(req.query.status || 'ativos'), busca: String(req.query.busca || '').trim() };
        const [leads, clientes, planos, resumo, relatorio] = await Promise.all([
            listarLeads(filtros), listarClientes(), listarPlanosComerciais(), resumoCrm(), relatorioComercial()
        ]);
        return renderizar(res, { titulo: 'CRM', conteudo: telaCrm({ leads, clientes, planos, filtros, resumo, relatorio }), mensagem: req.query.mensagem || '', ativo: 'crm' });
    });

    router.get('/crm/:id/editar', async (req, res) => {
        const [lead, historico, planos] = await Promise.all([
            buscarLeadPorId(req.params.id), listarHistoricoLead(req.params.id), listarPlanosComerciais()
        ]);
        if (!lead) return res.redirect('/crm?mensagem=Lead nao encontrado.');
        return renderizar(res, { titulo: 'Editar lead', conteudo: telaEditarLead({ lead, historico, planos }), mensagem: req.query.mensagem || '', ativo: 'crm' });
    });

    router.post('/crm/salvar', async (req, res) => {
        try { const lead = await salvarLead(req.body); return res.redirect(`/crm/${lead.id}/editar?mensagem=${encodeURIComponent('Lead salvo com sucesso.')}`); }
        catch (err) { return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`); }
    });
    router.post('/crm/:id/historico', async (req, res) => {
        try { await adicionarHistoricoLead(req.params.id, req.body.texto || '', 'nota'); return res.redirect(`/crm/${req.params.id}/editar?mensagem=${encodeURIComponent('Histórico atualizado.')}`); }
        catch (err) { return res.redirect(`/crm/${req.params.id}/editar?mensagem=${encodeURIComponent(err.message)}`); }
    });
    router.post('/crm/:id/status', async (req, res) => {
        try { await atualizarStatusLead(req.params.id, req.body.status, `Status alterado para ${rotuloStatusLead(req.body.status)}.`); return res.redirect('/crm?mensagem=Lead atualizado.'); }
        catch (err) { return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`); }
    });
    router.post('/crm/:id/converter', async (req, res) => {
        try {
            const lead = await vincularLeadAoCliente(req.params.id, req.body.clienteId);
            await adicionarNotaCliente(req.body.clienteId, `Lead convertido no CRM: ${lead.nome}${lead.telefone ? ` (${lead.telefone})` : ''}.`);
            return res.redirect('/crm?mensagem=Lead convertido e vinculado ao cliente.');
        } catch (err) { return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`); }
    });
    router.post('/crm/:id/criar-cliente', async (req, res) => {
        try {
            const lead = await buscarLeadPorId(req.params.id);
            if (!lead) return res.redirect('/crm?mensagem=Lead nao encontrado.');
            const cliente = await salvarCliente({
                nome: lead.nome, telefone: lead.telefone, origem: lead.origem,
                plano: lead.interesse || 'Lead comercial', dataInicio: agoraLocalDateTime(), dataVencimento: '',
                observacoes: `Criado a partir do CRM.${lead.observacoes ? `\n${lead.observacoes}` : ''}`,
                tags: 'Acompanhar', status: lead.status === 'teste_liberado' ? 'teste' : 'pendente'
            });
            await vincularLeadAoCliente(lead.id, cliente.id);
            await adicionarNotaCliente(cliente.id, `Cliente criado a partir do lead ${lead.nome}.`);
            return res.redirect(montarUrlClienteMensagem(cliente.id, 'Cliente criado a partir do CRM.'));
        } catch (err) { return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`); }
    });
    router.post('/crm/:id/excluir', async (req, res) => {
        try { await removerLead(req.params.id); return res.redirect('/crm?mensagem=Lead removido.'); }
        catch (err) { return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`); }
    });
    router.post('/crm/:id/enviar', async (req, res) => {
        try {
            const lead = await buscarLeadPorId(req.params.id);
            if (!lead) return res.redirect('/crm?mensagem=Lead nao encontrado.');
            const status = getStatusWhatsApp();
            const client = getClient();
            if (!client || !status.conectado) return res.redirect('/crm?mensagem=WhatsApp nao esta conectado.');
            const [config, planos] = await Promise.all([obterConfiguracoes(), listarPlanosComerciais()]);
            const envio = await enviarMensagemWhatsAppComFallback(client, lead.telefone, mensagemLeadPadrao(lead, config, planos), 'Envio comercial para lead');
            await adicionarHistoricoLead(lead.id, `Mensagem comercial enviada pelo WhatsApp para ${envio.destino}.`, 'whatsapp');
            return res.redirect('/crm?mensagem=Mensagem comercial enviada.');
        } catch (err) { return res.redirect(`/crm?mensagem=${encodeURIComponent(err.message)}`); }
    });

    return router;
}

module.exports = criarCrmRoute;
