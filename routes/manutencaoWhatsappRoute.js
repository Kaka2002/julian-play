const express = require('express');

function criarManutencaoWhatsappRoute(deps = {}) {
    const router = express.Router();
    const {
        salvarProtecaoWhatsapp, logControleClientes, gerarNovoQrCodeWhatsApp,
        recuperarWhatsAppAutomaticamente, instalacaoAdministrador,
        validarNumeroWhatsappRobo, salvarNumeroWhatsappRoboConfigurado
    } = deps;

    router.post('/manutencao/whatsapp/protecao', async (req, res) => {
        try {
            const protecao = await salvarProtecaoWhatsapp({
                whatsappProtecaoAtiva: String(req.body.whatsappProtecaoAtiva || '') === '1',
                whatsappBloquearNovoQrAutomatico: String(req.body.whatsappBloquearNovoQrAutomatico || '') === '1',
                whatsappProtecaoMotivo: req.body.whatsappProtecaoMotivo
            });
            logControleClientes('Protecao do WhatsApp atualizada', {
                ativa: protecao.ativa, bloquearNovoQrAutomatico: protecao.bloquearNovoQrAutomatico,
                motivo: protecao.motivo
            });
            const mensagem = protecao.ativa
                ? 'Protecao ativada. Envios proativos foram pausados; respostas aos clientes continuam liberadas.'
                : 'Protecao desativada. Envios proativos voltaram a ser permitidos.';
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
        } catch (err) {
            logControleClientes('Erro ao salvar protecao do WhatsApp', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar protecao: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/whatsapp/novo-qr', async (_req, res) => {
        try {
            const resultado = await gerarNovoQrCodeWhatsApp({ motivo: 'Solicitado pelo painel de manutencao' });
            logControleClientes('Sessao do WhatsApp reiniciada para gerar novo QR Code', { status: resultado.status, authDataPath: resultado.authDataPath });
            return res.redirect('/qr');
        } catch (err) {
            logControleClientes('Erro ao reiniciar sessao do WhatsApp para novo QR Code', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao gerar novo QR Code: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/whatsapp/reconectar', async (_req, res) => {
        try {
            const resultado = await recuperarWhatsAppAutomaticamente({ limparSessao: false, motivo: 'Recuperacao segura solicitada pelo painel de manutencao' });
            logControleClientes('Recuperacao segura do WhatsApp solicitada pelo painel de manutencao', { status: resultado.status, motivo: resultado.motivo || '' });
            const mensagem = resultado.status === 'ignorado'
                ? 'A recuperacao do WhatsApp ja esta em andamento. Aguarde alguns segundos e atualize esta pagina.'
                : 'Reconexao segura iniciada. A sessao atual foi preservada; aguarde alguns segundos e confira o status do WhatsApp.';
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
        } catch (err) {
            logControleClientes('Erro na recuperacao segura do WhatsApp pelo painel de manutencao', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao tentar reconectar o WhatsApp: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/whatsapp/numero', async (req, res) => {
        if (instalacaoAdministrador()) {
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent('A troca do WhatsApp desta instalacao deve ser feita pelo Painel Mestre.')}`);
        }
        try {
            const numero = validarNumeroWhatsappRobo(req.body.numeroWhatsappRobo);
            salvarNumeroWhatsappRoboConfigurado(numero);
            const resultado = await gerarNovoQrCodeWhatsApp({ motivo: `Numero do WhatsApp do robo alterado para ${numero} pelo painel de manutencao` });
            logControleClientes('Numero do WhatsApp do robo alterado', { numero, status: resultado.status, authDataPath: resultado.authDataPath });
            return res.redirect('/qr');
        } catch (err) {
            logControleClientes('Erro ao alterar numero do WhatsApp do robo', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao alterar WhatsApp do robo: ${err.message}`)}`);
        }
    });

    return router;
}

module.exports = criarManutencaoWhatsappRoute;
