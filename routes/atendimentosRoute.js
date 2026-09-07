const express = require('express');

function criarAtendimentosRoute(deps = {}) {
    const router = express.Router();
    const {
        desativarCache, listarAtendimentos, listarClientes, resumoAtendimentos,
        renderizar, telaAtendimentos, criarAtendimento, adicionarNotaCliente,
        rotuloMotivoAtendimento, montarUrlClienteMensagem,
        atualizarStatusAtendimento, rotuloStatusAtendimento,
        buscarAtendimentoPorId, removerAtendimento, getStatusWhatsApp,
        getClient, enviarMensagemWhatsAppComFallback, mensagemAtendimentoPadrao
    } = deps;

    router.get('/atendimentos', async (req, res) => {
        desativarCache(res);
        const filtros = {
            status: String(req.query.status || 'abertos'),
            busca: String(req.query.busca || '').trim()
        };
        const [atendimentos, clientes, resumo] = await Promise.all([
            listarAtendimentos(filtros), listarClientes(), resumoAtendimentos()
        ]);
        return renderizar(res, {
            titulo: 'Atendimentos',
            conteudo: telaAtendimentos({ atendimentos, clientes, filtros, resumo }),
            mensagem: req.query.mensagem || '', ativo: 'atendimentos'
        });
    });

    router.post('/atendimentos', async (req, res) => {
        try {
            const atendimento = await criarAtendimento(req.body);
            await adicionarNotaCliente(atendimento.clienteId, `Atendimento aberto: ${rotuloMotivoAtendimento(atendimento.motivo)}${atendimento.descricao ? ` - ${atendimento.descricao}` : ''}`);
            return res.redirect('/atendimentos?mensagem=Atendimento aberto com sucesso.');
        } catch (err) { return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`); }
    });

    router.post('/clientes/:id/atendimentos', async (req, res) => {
        try {
            const atendimento = await criarAtendimento({ ...req.body, clienteId: req.params.id });
            await adicionarNotaCliente(atendimento.clienteId, `Atendimento aberto: ${rotuloMotivoAtendimento(atendimento.motivo)}${atendimento.descricao ? ` - ${atendimento.descricao}` : ''}`);
            return res.redirect(`${montarUrlClienteMensagem(req.params.id, 'Atendimento aberto com sucesso.')}#atendimentos`);
        } catch (err) { return res.redirect(`${montarUrlClienteMensagem(req.params.id, err.message)}#atendimentos`); }
    });

    router.post('/atendimentos/:id/status', async (req, res) => {
        try {
            const atendimento = await atualizarStatusAtendimento(req.params.id, req.body.status);
            await adicionarNotaCliente(atendimento.clienteId, `Atendimento atualizado para ${rotuloStatusAtendimento(atendimento.status)}: ${rotuloMotivoAtendimento(atendimento.motivo)}.`);
            return res.redirect('/atendimentos?mensagem=Atendimento atualizado.');
        } catch (err) { return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`); }
    });

    router.post('/atendimentos/:id/excluir', async (req, res) => {
        try {
            const atendimento = await buscarAtendimentoPorId(req.params.id);
            await removerAtendimento(req.params.id);
            if (atendimento?.clienteId) {
                await adicionarNotaCliente(atendimento.clienteId, `Atendimento removido: ${rotuloMotivoAtendimento(atendimento.motivo)}.`);
            }
            return res.redirect('/atendimentos?mensagem=Atendimento removido.');
        } catch (err) { return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`); }
    });

    router.post('/atendimentos/:id/enviar', async (req, res) => {
        try {
            const atendimento = await buscarAtendimentoPorId(req.params.id);
            if (!atendimento) return res.redirect('/atendimentos?mensagem=Atendimento nao encontrado.');
            const status = getStatusWhatsApp();
            const client = getClient();
            if (!client || !status.conectado) return res.redirect('/atendimentos?mensagem=WhatsApp nao esta conectado.');
            const envio = await enviarMensagemWhatsAppComFallback(
                client, atendimento.clienteTelefone, mensagemAtendimentoPadrao(atendimento),
                'Envio de acompanhamento de atendimento'
            );
            await adicionarNotaCliente(atendimento.clienteId, `Acompanhamento de atendimento enviado pelo WhatsApp para ${envio.destino}.`);
            return res.redirect('/atendimentos?mensagem=Acompanhamento enviado ao cliente.');
        } catch (err) { return res.redirect(`/atendimentos?mensagem=${encodeURIComponent(err.message)}`); }
    });

    return router;
}

module.exports = criarAtendimentosRoute;
