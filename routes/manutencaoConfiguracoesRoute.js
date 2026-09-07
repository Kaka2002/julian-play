const express = require('express');
const fs = require('fs');
const path = require('path');

function criarManutencaoConfiguracoesRoute(deps = {}) {
    const router = express.Router();
    const {
        bloquearManutencaoRestritaCliente, bloquearMonitoramentoOperacional,
        confirmarSenhaAcaoCritica, atualizarLicencaComercial, salvarConfiguracoesRobo,
        lerUploadMultipart, extensaoLogoPermitida, validarImagemUpload, assetsDir,
        chaveImagemCampanhaAmizade, obterConfiguracoes, salvarImagemRobo,
        removerArquivoImagemTenant, salvarConfiguracoesPix, salvarConfiguracoesProvedorPix,
        salvarConfiguracoesPayPal, salvarConfiguracoesMonitoramento, testarWebhookAlertas,
        getClient, getStatusWhatsApp, exigirEnvioPainelPermitido, salvarConfiguracoesAcesso,
        logControleClientes
    } = deps;

    router.post('/manutencao/licenca', bloquearManutencaoRestritaCliente, async (req, res) => {
        try {
            await atualizarLicencaComercial(req.body);
            logControleClientes('Licença da instalação atualizada', {
                cliente: req.body.licencaCliente, vencimento: req.body.licencaVencimento,
                tipo: req.body.licencaTipo
            });
            return res.redirect('/manutencao?mensagem=Licença salva com sucesso');
        } catch (err) {
            logControleClientes('Erro ao salvar licença da instalação', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar licença: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/robo', bloquearManutencaoRestritaCliente, async (req, res) => {
        try {
            await salvarConfiguracoesRobo(req.body);
            logControleClientes('Configuracao do robo atualizada', {
                nomeEmpresa: req.body.nomeEmpresaRobo,
                responderMensagens: String(req.body.roboResponderMensagensAtivo || '') === '1',
                enviarMensagensPainel: String(req.body.roboEnviarMensagensPainelAtivo || '') === '1'
            });
            return res.redirect('/manutencao?mensagem=Configuração do robô salva com sucesso');
        } catch (err) {
            logControleClientes('Erro ao salvar configuração do robô', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar configuração do robô: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/robo/imagem/:chave', bloquearManutencaoRestritaCliente, async (req, res) => {
        try {
            const upload = await lerUploadMultipart(req, { campo: 'imagem' });
            if (!extensaoLogoPermitida(upload.filename)) {
                return res.redirect('/manutencao?mensagem=Use uma imagem PNG, JPG, WEBP, GIF ou SVG');
            }
            validarImagemUpload(upload.filename, upload.buffer);
            fs.mkdirSync(assetsDir, { recursive: true });
            const extensao = path.extname(upload.filename).toLowerCase();
            const chave = String(req.params.chave || '');
            if (chave === chaveImagemCampanhaAmizade && !['.png', '.jpg', '.jpeg'].includes(extensao)) {
                return res.redirect('/manutencao?mensagem=Para campanha, use imagem PNG ou JPG');
            }
            const configAnterior = await obterConfiguracoes();
            const arquivoAnterior = configAnterior[chave] || '';
            const nomeArquivo = `${chave}-${Date.now()}${extensao}`;
            fs.writeFileSync(path.join(assetsDir, nomeArquivo), upload.buffer);
            await salvarImagemRobo(chave, nomeArquivo);
            if (arquivoAnterior && arquivoAnterior !== nomeArquivo) removerArquivoImagemTenant(arquivoAnterior);
            logControleClientes('Imagem do robo atualizada', { chave, arquivo: nomeArquivo });
            return res.redirect('/manutencao?mensagem=Imagem do robô atualizada com sucesso');
        } catch (err) {
            logControleClientes('Erro ao salvar imagem do robo', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar imagem do robô: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/robo/imagem/:chave/limpar', bloquearManutencaoRestritaCliente, async (req, res) => {
        try {
            const chave = String(req.params.chave || '');
            const config = await obterConfiguracoes();
            const arquivoAnterior = config[chave] || '';
            await salvarImagemRobo(chave, '');
            const arquivoRemovido = removerArquivoImagemTenant(arquivoAnterior);
            logControleClientes('Imagem do robo removida', { chave, arquivo: arquivoAnterior, arquivoRemovido });
            return res.redirect('/manutencao?mensagem=Imagem removida das mensagens do robô');
        } catch (err) {
            logControleClientes('Erro ao remover imagem do robo', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao remover imagem do robô: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/pix', confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            await salvarConfiguracoesPix(req.body);
            logControleClientes('Configuracao PIX atualizada', { camposAlterados: 'pixChave,pixNome,pixCidade,pixTxid' });
            return res.redirect('/manutencao?mensagem=PIX salvo com sucesso');
        } catch (err) {
            logControleClientes('Erro ao salvar PIX', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar PIX: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/pix-provedor', confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            await salvarConfiguracoesProvedorPix(req.body);
            logControleClientes('Provedor de confirmacao PIX atualizado', {
                provedor: req.body.pixProvedor,
                credenciais: req.body.mercadoPagoAccessToken ? 'atualizadas' : 'mantidas',
                webhook: req.body.mercadoPagoWebhookUrl ? 'configurado' : 'vazio'
            });
            return res.redirect('/manutencao?mensagem=Provedor PIX salvo com sucesso');
        } catch (err) {
            logControleClientes('Erro ao salvar provedor PIX', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar provedor PIX: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/paypal', confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            await salvarConfiguracoesPayPal(req.body);
            logControleClientes('Configuracao PayPal atualizada', {
                ativo: String(req.body.paypalAtivo || '') === '1', ambiente: req.body.paypalAmbiente,
                credenciais: req.body.paypalClientId || req.body.paypalClientSecret ? 'atualizadas' : 'mantidas'
            });
            return res.redirect('/manutencao?mensagem=PayPal salvo com sucesso');
        } catch (err) {
            logControleClientes('Erro ao salvar PayPal', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar PayPal: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/monitoramento', bloquearMonitoramentoOperacional, confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            await salvarConfiguracoesMonitoramento(req.body);
            logControleClientes('Monitoramento comercial atualizado', {
                backupAtivo: Boolean(req.body.backupAutomaticoAtivo), horario: req.body.backupAutomaticoHora,
                retencao: req.body.backupRetencaoDias, backupExternoAtivo: Boolean(req.body.backupExternoAtivo),
                backupExternoMaximo: req.body.backupExternoMaximo, alertaMinutos: req.body.alertaWhatsAppMinutos
            });
            return res.redirect('/manutencao?mensagem=Monitoramento salvo com sucesso');
        } catch (err) {
            logControleClientes('Erro ao salvar monitoramento comercial', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar monitoramento: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/monitoramento/testar', bloquearMonitoramentoOperacional, async (req, res) => {
        try {
            const canais = [];
            if (String(req.body.alertaWebhookUrl || '').trim()) {
                await testarWebhookAlertas(req.body.alertaWebhookUrl);
                canais.push('webhook');
            }
            const numero = String(req.body.alertaWhatsappControle || '').replace(/\D/g, '');
            if (numero) {
                await exigirEnvioPainelPermitido('teste da Central de Saúde');
                const client = getClient();
                const status = getStatusWhatsApp();
                if (!client || !status.conectado) throw new Error('WhatsApp nao esta conectado para enviar o alerta de teste.');
                await client.sendMessage(`${numero}@c.us`, '✅ *TESTE DA CENTRAL DE SAÚDE*\n\nOs alertas operacionais por WhatsApp estão configurados corretamente.');
                canais.push('WhatsApp');
            }
            if (!canais.length) throw new Error('Informe um webhook ou WhatsApp de controle para testar.');
            logControleClientes('Alerta operacional de teste enviado', { canais });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Alerta de teste enviado por ${canais.join(' e ')}.`)}`);
        } catch (err) {
            logControleClientes('Erro ao testar webhook de alertas', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao enviar teste: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/acesso', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            await salvarConfiguracoesAcesso(req.body);
            logControleClientes('Acesso ao painel atualizado', { usuario: req.body.painelUsuario });
            return res.redirect('/logout');
        } catch (err) {
            logControleClientes('Erro ao salvar acesso ao painel', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao salvar acesso: ${err.message}`)}`);
        }
    });

    return router;
}

module.exports = criarManutencaoConfiguracoesRoute;
