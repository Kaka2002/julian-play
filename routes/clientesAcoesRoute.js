const express = require('express');

// Telas e servicos sao injetados; nenhuma instalacao ou banco e aberto aqui.
function criarClientesAcoesRoute(deps = {}) {
    const router = express.Router();
    const renovacoesRecentes = new Map();
    const RENOVACAO_SUBMISSAO_DUPLICADA_MS = 120000;
    const {
        CHAVE_MODELO_TESTE_EXPIRADO_ASSINATURA,
        CODIGO_TESTE_EXPIRADO_PLANOS_MANUAL,
        adicionarNotaCliente,
        agendarEncerramentoTeste,
        aguardarComTimeout,
        aplicarBonusCliente,
        atualizarPagamentoCliente,
        avisoRenovacaoProgramadoExiste,
        buscarAlertasCadastroCliente,
        buscarClientePorId,
        buscarModeloPorId,
        buscarPagamentoCliente,
        buscarPlanoPorNome,
        calcularDiasRestantes,
        camposFaltandoTesteLiberado,
        clienteAniversarioPendente,
        clienteEhTeste,
        clientePodeReceberReativacao,
        clienteTesteExpirado,
        criarCobrancaPayPal,
        dadosTesteLiberadoDoCliente,
        enviarCampanhaAmizadeManualPorId,
        enviarMensagemWhatsAppComFallback,
        enviarQRCodePIXParaDestino,
        escapar,
        formatarTelefoneCampanha,
        formularioCliente,
        formularioPagamentoCliente,
        getClient,
        getStatusWhatsApp,
        lerAcessosApp,
        lerListaSalva,
        listarAtendimentosCliente,
        listarAuditoriaCliente,
        listarInteracoesCliente,
        listarModelos,
        listarNotasCliente,
        listarPagamentosCliente,
        logControleClientes,
        marcarPagamentoMensagem,
        modeloManualEnviaPix,
        montarMensagemAssinaturaConfirmada,
        montarMensagemBonusAplicado,
        montarMensagemModeloManual,
        montarMensagemPlanosTesteExpiradoManual,
        montarMensagemPorModelo,
        montarMensagemReativacaoCliente,
        montarMensagemRenovacaoConfirmada,
        montarMensagemTesteLiberado,
        montarUrlClienteMensagem,
        montarUrlListaClientesMensagem,
        numeroMoeda,
        obterConfiguracoes,
        obterListasCliente,
        obterPlanosRenovacaoManual,
        prepararPlanoPixCliente,
        prepararPlanoPixDoPlanoCliente,
        prepararPlanoPixPlanoAtual,
        primeiroAcessoApp,
        registrarAvisoRenovacaoProgramado,
        registrarBonusAniversario,
        registrarEventoCliente,
        registrarPagamentoAssinaturaInicial,
        removerPagamentoCliente,
        renderizar,
        renovarCliente,
        resolverDestinoWhatsApp,
        retornoCampanha,
        salvarCliente,
        telaEnviarModeloCliente,
        telefoneCampanhaAmizade,
        valorPrimeiroItem,
        vencimentoExpirou,
        verificarExclusaoDefinitivaCliente
    } = deps;

router.get('/clientes/novo', async (req, res) => {
    const listas = await obterListasCliente();

    await renderizar(res, {
        titulo: 'Novo cliente',
        conteudo: formularioCliente({ status: 'ativo' }, listas),
        ativo: 'clientes'
    });
});

router.get('/clientes/:id/enviar-modelo', async (req, res) => {
    const [cliente, modelos] = await Promise.all([
        buscarClientePorId(req.params.id),
        listarModelos()
    ]);

    if (!cliente) {
        return res.redirect('/clientes?mensagem=Cliente não encontrado');
    }

    const modelosAtivos = modelos.filter(modelo => (
        Number(modelo.ativo) !== 0 && modelo.chave !== CHAVE_MODELO_TESTE_EXPIRADO_ASSINATURA
    ));

    await renderizar(res, {
        titulo: 'Enviar modelo',
        conteudo: telaEnviarModeloCliente({ cliente, modelos: modelosAtivos }),
        mensagem: req.query.mensagem || '',
        ativo: 'clientes'
    });
});

router.get('/clientes/:id/editar', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes?mensagem=Cliente não encontrado');
    }

    const [listas, notas, pagamentos, alertas, atendimentos, interacoesRobo, auditoria, exclusaoDefinitiva, config] = await Promise.all([
        obterListasCliente(),
        listarNotasCliente(cliente.id),
        listarPagamentosCliente(cliente.id),
        buscarAlertasCadastroCliente(cliente),
        listarAtendimentosCliente(cliente.id),
        listarInteracoesCliente(cliente, 60),
        listarAuditoriaCliente(cliente.id, 100),
        verificarExclusaoDefinitivaCliente(cliente.id),
        obterConfiguracoes()
    ]);

    await renderizar(res, {
        titulo: 'Editar cliente',
        conteudo: formularioCliente(cliente, listas, {
            notas,
            pagamentos,
            alertas,
            atendimentos,
            interacoesRobo,
            auditoria,
            exclusaoDefinitiva,
            config,
            paginaHistorico: req.query.historico || req.query.pagina,
            paginaLinha: req.query.linha,
            historicoPorPagina: req.query.historicoPorPagina,
            linhaPorPagina: req.query.linhaPorPagina
        }),
        mensagem: req.query.mensagem || '',
        ativo: 'clientes'
    });
});

router.get('/clientes/:id/pagamentos/:pagamentoId/editar', async (req, res) => {
    const [cliente, pagamento] = await Promise.all([
        buscarClientePorId(req.params.id),
        buscarPagamentoCliente(req.params.id, req.params.pagamentoId)
    ]);

    if (!cliente || !pagamento) {
        return res.redirect(montarUrlClienteMensagem(req.params.id, 'Pagamento não encontrado para edição.'));
    }

    await renderizar(res, {
        titulo: 'Editar pagamento',
        conteudo: formularioPagamentoCliente(cliente, pagamento),
        mensagem: req.query.mensagem || '',
        ativo: 'clientes'
    });
});

router.post('/clientes/salvar', async (req, res) => {
    try {
        const novoCadastro = !req.body.id;
        const alertas = await buscarAlertasCadastroCliente(req.body);
        const clienteSalvo = await salvarCliente(req.body, {
            responsavel: req.usuarioPainel || 'sistema',
            origem: 'painel_cliente',
            motivo: req.body.motivoAlteracao || ''
        });
        const novaNota = String(req.body.novaNotaTexto || req.body.novaNotaPadrao || '').trim();
        const adicionandoNota = req.body.acao === 'adicionarNota';

        if (clienteSalvo?.id && novaNota) {
            await adicionarNotaCliente(clienteSalvo.id, novaNota);
            logControleClientes('Nota adicionada no salvamento', {
                clienteId: clienteSalvo.id,
                nome: clienteSalvo.nome
            });
        }

        logControleClientes(req.body.id ?'Cliente editado' : 'Cliente cadastrado', {
            id: clienteSalvo?.id,
            nome: clienteSalvo?.nome,
            telefone: clienteSalvo?.telefone,
            plano: clienteSalvo?.plano,
            status: clienteSalvo?.status
        });

        const mensagemAlerta = alertas.length
            ?'Cliente salvo. Atenção: existe histórico problemático para nome ou telefone parecido.'
            : 'Cliente salvo com sucesso';

        if (adicionandoNota && clienteSalvo?.id) {
            return res.redirect(montarUrlClienteMensagem(clienteSalvo.id, novaNota
                ?'Nota adicionada ao histórico e cliente salvo'
                : 'Cliente salvo. Nenhuma nota foi informada.'));
        }

        if (clienteEhTeste(clienteSalvo) && clienteSalvo?.id) {
            return res.redirect(montarUrlListaClientesMensagem(alertas.length
                ?mensagemAlerta
                : 'Cliente teste salvo com sucesso. O teste liberado nao foi reenviado.'));
        }

        if (novoCadastro && clienteSalvo?.id) {
            const mensagemNovoCliente = alertas.length
                ? `${mensagemAlerta} Use o botão abaixo para enviar a confirmação da assinatura.`
                : 'Cliente cadastrado com sucesso. Use o botão abaixo para enviar a confirmação da assinatura.';
            return res.redirect(`${montarUrlClienteMensagem(clienteSalvo.id, mensagemNovoCliente)}#confirmacao-assinatura`);
        }

        if (alertas.length && clienteSalvo?.id) {
            return res.redirect(montarUrlClienteMensagem(clienteSalvo.id, mensagemAlerta));
        }

        res.redirect(`/clientes/todos?mensagem=${encodeURIComponent(mensagemAlerta)}`);
    } catch (err) {
        logControleClientes('Erro ao salvar cliente', {
            erro: err.message,
            nome: req.body?.nome
        });
        res.status(400);
        const listas = await obterListasCliente();
        await renderizar(res, {
            titulo: 'Salvar cliente',
            conteudo: `${formularioCliente(req.body, listas)}<div class="notice">${escapar(err.message)}</div>`,
            ativo: 'clientes'
        });
    }
});

router.post('/clientes/:id/enviar-confirmacao-assinatura', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente não encontrado.'));
    }

    if (clienteEhTeste(cliente)) {
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'A confirmação de assinatura não é usada para clientes de teste grátis.'));
    }

    const faltando = [];
    if (!String(cliente.nome || '').trim()) faltando.push('nome');
    if (!String(cliente.telefone || '').trim()) faltando.push('WhatsApp');
    if (!String(cliente.plano || '').trim()) faltando.push('plano');
    if (!String(cliente.dataVencimento || cliente.vencimento || '').trim()) faltando.push('data de vencimento');

    if (faltando.length) {
        return res.redirect(montarUrlClienteMensagem(
            cliente.id,
            `Preencha antes de enviar a confirmação: ${faltando.join(', ')}.`
        ));
    }

    const valorAssinatura = numeroMoeda(cliente.valorPlano) + numeroMoeda(cliente.assinaturaApp);
    if (valorAssinatura <= 0) {
        return res.redirect(montarUrlClienteMensagem(
            cliente.id,
            'Informe o valor do plano ou da assinatura app antes de enviar a confirmacao e registrar no financeiro.'
        ));
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        logControleClientes('Confirmacao de assinatura nao enviada', {
            clienteId: cliente.id,
            motivo: 'WhatsApp desconectado'
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado. A confirmação não foi enviada.'));
    }

    try {
        const mensagem = montarMensagemAssinaturaConfirmada(cliente);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(client, cliente.telefone, mensagem, 'Envio da confirmacao da assinatura');
        const destino = envioWhatsApp.destino;
        // Envio registrado pelo fallback de WhatsApp.
        const envio = await aguardarComTimeout(
            Promise.resolve({ id: { _serialized: envioWhatsApp.mensagemId }, ack: envioWhatsApp.ack }),
            90000,
            'Envio da confirmacao da assinatura'
        );

        if (!envio) {
            throw new Error('O WhatsApp não confirmou o envio da mensagem.');
        }

        // Mensagem registrada pelo fallback de WhatsApp.

        let pagamentoFinanceiro = null;
        try {
            pagamentoFinanceiro = await registrarPagamentoAssinaturaInicial(cliente.id);
        } catch (erroFinanceiro) {
            logControleClientes('Confirmacao enviada sem registrar financeiro', {
                clienteId: cliente.id,
                erro: erroFinanceiro.message
            });
            return res.redirect(montarUrlClienteMensagem(
                cliente.id,
                `Confirmacao enviada, mas nao foi possivel registrar no financeiro: ${erroFinanceiro.message}`
            ));
        }
        logControleClientes('Confirmacao de assinatura enviada', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: cliente.plano,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            pagamentoId: pagamentoFinanceiro?.pagamentoId,
            financeiroCriado: pagamentoFinanceiro?.criado
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'Confirmação da assinatura enviada ao cliente com sucesso.'));
    } catch (err) {
        logControleClientes('Erro ao enviar confirmacao de assinatura', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Não foi possível enviar a confirmação: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-pix-plano', async (req, res) => {
    try {
        const cliente = await buscarClientePorId(req.params.id);

        if (!cliente) {
            return res.redirect(montarUrlClienteMensagem(req.params.id, 'Cliente não encontrado.'));
        }

        const status = getStatusWhatsApp();
        const client = getClient();

        if (!client || !status.conectado) {
            return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado para enviar o PIX do plano.'));
        }

        const planoBase = buscarPlanoPorNome(cliente.plano) || {
            nome: cliente.plano || 'Plano',
            valor: cliente.valorPlano || '0,00'
        };
        const planoPix = prepararPlanoPixDoPlanoCliente(cliente, planoBase);
        const destino = await resolverDestinoWhatsApp(client, cliente.telefone);

        const enviado = await enviarQRCodePIXParaDestino(client, destino, planoPix, {
            tipo: 'renovacao',
            nomeCliente: cliente.nome || 'cliente',
            clienteId: cliente.id,
            plano: cliente.plano,
            tipoPlanoId: cliente.tipoPlanoId,
            diasContrato: cliente.diasContrato,
            valorPlano: cliente.valorPlano,
            assinaturaApp: '0,00'
        });

        if (!enviado) {
            throw new Error('Não foi possível enviar o QR Code PIX.');
        }

        await adicionarNotaCliente(
            cliente.id,
            `PIX do plano enviado manualmente: ${planoPix.nome}, R$ ${planoPix.valor}.`
        );
        logControleClientes('PIX do plano enviado ao cliente', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: planoPix.nome,
            valor: planoPix.valor,
            destino
        });

        return res.redirect(montarUrlClienteMensagem(cliente.id, 'PIX do plano enviado ao cliente.'));
    } catch (err) {
        logControleClientes('Erro ao enviar PIX do plano', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, `Não foi possível enviar o PIX do plano: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-paypal-plano', async (req, res) => {
    try {
        const cliente = await buscarClientePorId(req.params.id);
        if (!cliente) {
            return res.redirect(montarUrlClienteMensagem(req.params.id, 'Cliente não encontrado.'));
        }

        const status = getStatusWhatsApp();
        const client = getClient();
        if (!client || !status.conectado) {
            return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado para enviar o PayPal do plano.'));
        }

        const planoBase = buscarPlanoPorNome(cliente.plano) || {
            nome: cliente.plano || 'Plano',
            valor: cliente.valorPlano || '0,00'
        };
        const plano = prepararPlanoPixDoPlanoCliente(cliente, planoBase);
        if (numeroMoeda(plano.valor) <= 0) {
            throw new Error('O plano atual está sem valor de cobrança.');
        }

        const cobranca = await criarCobrancaPayPal(plano, {
            tipo: 'renovacao',
            nomeCliente: cliente.nome || 'cliente',
            clienteId: cliente.id,
            plano: cliente.plano,
            tipoPlanoId: cliente.tipoPlanoId,
            diasContrato: cliente.diasContrato,
            valorPlano: cliente.valorPlano,
            assinaturaApp: '0,00'
        });
        const mensagem = `💳 *PAYPAL - RENOVAÇÃO ${plano.nome}*
--------------------
👤 *Cliente:* ${cliente.nome || 'cliente'}
💰 *Valor:* R$ ${plano.valor}

${cobranca.link
    ? `Abra o link abaixo e conclua o pagamento pelo PayPal:\n${cobranca.link}`
    : `No aplicativo ou site do PayPal, escolha *Enviar pagamento* e envie para:\n📧 *${cobranca.email}*`}

${cobranca.manual
    ? `⚠️ Após pagar, envie o comprovante neste WhatsApp. A renovação será liberada depois da conferência.
🔖 *Referência:* ${cobranca.referencia}`
    : '✅ A confirmação é automática. Não é necessário enviar comprovante.'}`;
        const envio = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio manual do link PayPal'
        );

        await adicionarNotaCliente(
            cliente.id,
            `Link PayPal do plano enviado manualmente: ${plano.nome}, R$ ${plano.valor}.`
        );
        logControleClientes('PayPal do plano enviado ao cliente', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: plano.nome,
            valor: plano.valor,
            destino: envio.destino,
            ordemPayPal: cobranca.ordemId
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'Link PayPal do plano enviado ao cliente.'));
    } catch (err) {
        logControleClientes('Erro ao enviar PayPal do plano', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(
            req.params.id,
            `Não foi possível enviar o PayPal do plano: ${err.message}`
        ));
    }
});

router.post('/clientes/:id/renovar', async (req, res) => {
    const chaveRenovacao = [
        req.params.id,
        req.body.tipoPlanoId || '',
        req.body.plano || '',
        req.body.diasContrato || '',
        req.body.valorPlano || '',
        req.body.assinaturaApp || '',
        req.body.formaPagamento || '',
        req.body.dataPagamento || ''
    ].join('|');

    try {
        const agora = Date.now();
        const renovacaoRecente = renovacoesRecentes.get(chaveRenovacao);

        if (renovacaoRecente && agora - renovacaoRecente < RENOVACAO_SUBMISSAO_DUPLICADA_MS) {
            return res.redirect(montarUrlClienteMensagem(req.params.id, 'Renovação já estava sendo registrada. O envio duplicado foi ignorado.'));
        }

        renovacoesRecentes.set(chaveRenovacao, agora);

        const resultado = await renovarCliente({
            ...req.body,
            clienteId: req.params.id
        });
        const clienteAtualizado = resultado.cliente;
        await registrarEventoCliente(clienteAtualizado.id, 'renovacao', `Renovação registrada: ${resultado.plano}; vencimento ${resultado.vencimentoNovo}; valor ${resultado.valorTotal}.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'painel_cliente'
        });
        const deveEnviar = Boolean(req.body.enviarMensagem);
        let mensagemRetorno = 'Renovação registrada com sucesso';

        logControleClientes('Renovação registrada', {
            clienteId: clienteAtualizado?.id,
            nome: clienteAtualizado?.nome,
            plano: resultado.plano,
            valor: resultado.valorTotal,
            vencimento: resultado.vencimentoNovo
        });

        if (deveEnviar) {
            const status = getStatusWhatsApp();
            const client = getClient();

            if (!client || !status.conectado) {
                await marcarPagamentoMensagem(resultado.pagamentoId, false, 'WhatsApp desconectado');
                mensagemRetorno = 'Renovação registrada, mas o WhatsApp não está conectado para enviar a confirmação.';
            } else {
                try {
                    const mensagem = montarMensagemRenovacaoConfirmada(clienteAtualizado, resultado);
                    const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
                        client,
                        clienteAtualizado.telefone,
                        mensagem,
                        'Envio de renovação confirmada'
                    );

                    await marcarPagamentoMensagem(resultado.pagamentoId, true);
                    mensagemRetorno = 'Renovação registrada e confirmação enviada ao cliente.';
                    logControleClientes('Renovacao enviada ao cliente', {
                        clienteId: clienteAtualizado.id,
                        destino: envioWhatsApp.destino,
                        mensagemId: envioWhatsApp.mensagemId,
                        ack: envioWhatsApp.ack
                    });
                } catch (erroEnvio) {
                    await marcarPagamentoMensagem(resultado.pagamentoId, false, erroEnvio.message);
                    mensagemRetorno = `Renovação registrada, mas não foi possível enviar a confirmação: ${erroEnvio.message}`;
                    logControleClientes('Erro ao enviar renovação', {
                        clienteId: clienteAtualizado.id,
                        erro: erroEnvio.message
                    });
                }
            }
        }

        return res.redirect(montarUrlClienteMensagem(clienteAtualizado.id, mensagemRetorno));
    } catch (err) {
        renovacoesRecentes.delete(chaveRenovacao);
        logControleClientes('Erro ao renovar cliente', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/enviar-reativacao', async (req, res) => {
    try {
        const cliente = await buscarClientePorId(req.params.id);

        if (!cliente) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('Cliente não encontrado.')}`);
        }

        if (!clientePodeReceberReativacao(cliente)) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('Este cliente não está vencido para receber reativação.')}`);
        }

        const planoPix = buscarPlanoPorNome(cliente.plano);

        if (!planoPix) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('O plano deste cliente não possui QR Code configurado para reativação.')}`);
        }

        const pixCliente = prepararPlanoPixCliente(cliente, planoPix);
        const status = getStatusWhatsApp();
        const client = getClient();

        if (!client || !status.conectado) {
            return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('WhatsApp não está conectado para enviar a reativação.')}`);
        }

        const mensagem = montarMensagemReativacaoCliente(cliente, pixCliente);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio de reativacao'
        );
        const destino = envioWhatsApp.destino;

        const qrEnviado = await enviarQRCodePIXParaDestino(client, destino, pixCliente.plano, {
            tipo: 'renovacao',
            nomeCliente: cliente.nome,
            clienteId: cliente.id,
            plano: cliente.plano,
            tipoPlanoId: cliente.tipoPlanoId,
            diasContrato: cliente.diasContrato,
            valorPlano: pixCliente.valorPlano,
            assinaturaApp: pixCliente.incluirApp ? pixCliente.valorApp : '0,00'
        });

        if (!qrEnviado) {
            throw new Error('A mensagem foi enviada, mas não foi possível enviar o QR Code PIX.');
        }

        await adicionarNotaCliente(cliente.id, `Mensagem de reativação com QR Code enviada para o plano ${cliente.plano}.`);
        logControleClientes('Reativacao enviada ao cliente', {
            clienteId: cliente.id,
            nome: cliente.nome,
            plano: cliente.plano,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack
        });

        return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('Mensagem de reativação com QR Code enviada ao cliente.')}`);
    } catch (err) {
        logControleClientes('Erro ao enviar reativacao', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent(`Erro ao enviar reativação: ${err.message}`)}`);
    }
});

router.post('/clientes/:id/pagamentos/:pagamentoId/excluir', async (req, res) => {
    try {
        const pagamento = await removerPagamentoCliente(req.params.id, req.params.pagamentoId);
        await registrarEventoCliente(req.params.id, 'pagamento_removido', `Pagamento ${req.params.pagamentoId} removido do histórico financeiro.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'financeiro'
        });
        logControleClientes('Pagamento removido do historico', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            valor: pagamento.valorTotal
        });

        return res.redirect(montarUrlClienteMensagem(req.params.id, 'Pagamento removido do histórico financeiro.'));
    } catch (err) {
        logControleClientes('Erro ao remover pagamento', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/pagamentos/:pagamentoId/salvar', async (req, res) => {
    try {
        const pagamento = await atualizarPagamentoCliente(req.params.id, req.params.pagamentoId, req.body);
        await registrarEventoCliente(req.params.id, 'pagamento_alterado', `Pagamento ${req.params.pagamentoId} atualizado no histórico financeiro.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'financeiro'
        });
        logControleClientes('Pagamento editado no historico', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            valor: pagamento.valorTotal
        });

        return res.redirect(montarUrlClienteMensagem(req.params.id, 'Pagamento atualizado no histórico financeiro.'));
    } catch (err) {
        logControleClientes('Erro ao editar pagamento', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/pagamentos/:pagamentoId/mensagem-enviada', async (req, res) => {
    try {
        await marcarPagamentoMensagem(req.params.pagamentoId, true);
        await adicionarNotaCliente(req.params.id, 'Confirmação de renovação marcada manualmente como enviada.');

        return res.redirect(`${montarUrlClienteMensagem(req.params.id, 'Mensagem marcada como enviada no histórico.')}#renovar`);
    } catch (err) {
        logControleClientes('Erro ao marcar mensagem de pagamento como enviada', {
            clienteId: req.params.id,
            pagamentoId: req.params.pagamentoId,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/notas', async (req, res) => {
    try {
        await adicionarNotaCliente(req.params.id, req.body.texto || req.body.notaPadrao);
        logControleClientes('Nota adicionada', { clienteId: req.params.id });
        res.redirect(montarUrlClienteMensagem(req.params.id, 'Nota adicionada ao histórico do cliente'));
    } catch (err) {
        logControleClientes('Erro ao adicionar nota', {
            clienteId: req.params.id,
            erro: err.message
        });
        res.redirect(montarUrlClienteMensagem(req.params.id, err.message));
    }
});

router.post('/clientes/:id/aplicar-bonus', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes/todos?mensagem=Cliente não encontrado');
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        return res.redirect(montarUrlClienteMensagem(cliente.id, 'WhatsApp não está conectado. Bônus não aplicado.'));
    }

    try {
        const meses = Number.parseInt(req.body.quantidade || 1, 10);
        const aniversarioPendente = clienteAniversarioPendente(cliente);
        const saldoAplicavel = (Number.parseInt(cliente.bonusMeses || 0, 10) || 0) + (aniversarioPendente ? 1 : 0);
        if (!Number.isInteger(meses) || meses < 1 || meses > saldoAplicavel) {
            throw new Error(`Saldo de bônus insuficiente. Disponível: ${saldoAplicavel}.`);
        }

        const resultadoEnvio = {
            meses,
            saldoRestante: saldoAplicavel - meses,
            dataVencimento: cliente.dataVencimento || cliente.vencimento
        };
        const mensagem = montarMensagemBonusAplicado(cliente, resultadoEnvio);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio de bonus aplicado'
        );
        const destino = envioWhatsApp.destino;
        if (aniversarioPendente) {
            const anoAtual = Number(new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo', year: 'numeric'
            }).format(new Date()));
            await registrarBonusAniversario(cliente.id, anoAtual);
        }

        const resultado = await aplicarBonusCliente(cliente.id, meses);
        const clienteAtualizado = resultado.cliente;
        await registrarEventoCliente(cliente.id, 'bonus_aplicado', `${meses} bônus aplicado(s); saldo atual ${resultado.saldoRestante}.`, {
            responsavel: req.usuarioPainel || 'sistema', origem: 'painel_cliente', motivo: req.body.observacaoBonus || ''
        });

        if (String(req.body.observacaoBonus || '').trim()) {
            await adicionarNotaCliente(cliente.id, `Observação da bonificação: ${req.body.observacaoBonus}`);
        }

        logControleClientes('Bonus aplicado e enviado ao cliente', {
            clienteId: clienteAtualizado.id,
            nome: clienteAtualizado.nome,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            meses: resultado.meses,
            saldoRestante: resultado.saldoRestante,
            vencimento: resultado.dataVencimento
        });

        return res.redirect(montarUrlClienteMensagem(cliente.id, `Bônus aplicado: ${resultado.meses} mês(es). Mensagem enviada ao cliente.`));
    } catch (err) {
        logControleClientes('Erro ao aplicar bonus', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, err.message));
    }
});

router.post('/clientes/:id/enviar-teste-liberado', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes/todos?mensagem=Cliente não encontrado');
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        logControleClientes('Teste liberado nao enviado', {
            clienteId: cliente.id,
            motivo: 'WhatsApp desconectado'
        });
        return res.redirect(`/clientes/${cliente.id}/editar?mensagem=WhatsApp não está conectado`);
    }

    const acesso = primeiroAcessoApp(cliente);
    const dados = {
        telefone: cliente.telefone,
        nome: req.body.nome || cliente.nome,
        aparelho: req.body.aparelho || acesso.dispositivo || cliente.aparelho,
        aplicativo: req.body.aplicativo || acesso.app || valorPrimeiroItem(cliente.appsInstalados) || '',
        painel: req.body.painel || acesso.painel || valorPrimeiroItem(cliente.paineisSelecionados) || '',
        usuario: req.body.usuario || cliente.usuario,
        senha: req.body.senha || cliente.senha,
        dataInicio: req.body.dataInicio || cliente.dataInicio,
        validade: req.body.validade || cliente.dataVencimento || cliente.vencimento
    };
    const faltando = camposFaltandoTesteLiberado(dados);

    if (faltando.length) {
        logControleClientes('Teste liberado nao enviado', {
            clienteId: cliente.id,
            nome: cliente.nome,
            faltando: faltando.join(', ')
        });
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Preencha antes de enviar: ${faltando.join(', ')}.`));
    }

    try {
        const acessosAtuais = lerAcessosApp(cliente);
        const acessoTeste = {
            ...(acessosAtuais[0] || {}),
            app: dados.aplicativo,
            dispositivo: dados.aparelho,
            painel: dados.painel,
            usuario: dados.usuario,
            senha: dados.senha
        };
        const acessosAtualizados = [acessoTeste, ...acessosAtuais.slice(1)];

        const clienteAtualizado = await salvarCliente({
            ...cliente,
            id: Number(cliente.id),
            nome: dados.nome,
            telefone: cliente.telefone,
            usuario: dados.usuario,
            senha: dados.senha,
            aparelho: dados.aparelho,
            dataInicio: dados.dataInicio,
            dataVencimento: dados.validade,
            vencimento: dados.validade,
            appsInstalados: lerListaSalva(cliente.appsInstalados),
            dispositivosSelecionados: lerListaSalva(cliente.dispositivosSelecionados),
            paineisSelecionados: lerListaSalva(cliente.paineisSelecionados),
            acessoAppNome: acessosAtualizados.map(item => item.app || ''),
            acessoDispositivo: acessosAtualizados.map(item => item.dispositivo || ''),
            acessoPainel: acessosAtualizados.map(item => item.painel || ''),
            acessoUsuario: acessosAtualizados.map(item => item.usuario || ''),
            acessoSenha: acessosAtualizados.map(item => item.senha || ''),
            acessoLocalInstalacao: acessosAtualizados.map(item => item.localInstalacao || ''),
            acessoUrlAtivarAplicativo: acessosAtualizados.map(item => item.urlAtivarAplicativo || ''),
            acessoEnderecoMac: acessosAtualizados.map(item => item.enderecoMac || ''),
            acessoIdAplicativo: acessosAtualizados.map(item => item.idAplicativo || ''),
            appInstalado: cliente.appInstalado || Boolean(dados.aplicativo),
            status: 'teste'
        });
        logControleClientes('Teste liberado atualizou cliente existente', {
            id: clienteAtualizado?.id,
            nome: clienteAtualizado?.nome,
            telefone: clienteAtualizado?.telefone
        });
        const dadosAtualizados = dadosTesteLiberadoDoCliente(clienteAtualizado);
        const mensagem = montarMensagemTesteLiberado(dadosAtualizados);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            clienteAtualizado.telefone,
            mensagem,
            'Envio do teste liberado'
        );
        const destino = envioWhatsApp.destino;
        console.log(`[clientes] Teste liberado enviado para ${destino}. id=${envioWhatsApp.mensagemId || 'sem-id'}`);
        logControleClientes('Teste liberado enviado', {
            clienteId: clienteAtualizado.id,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack
        });
        agendarEncerramentoTeste(client, destino);
        return res.redirect(montarUrlListaClientesMensagem('Teste gratis liberado enviado e cadastro atualizado'));
    } catch (err) {
        console.error(`[clientes] Falha ao enviar teste liberado para cliente ${cliente.id}: ${err.message}`);
        return res.redirect(montarUrlClienteMensagem(cliente.id, `Erro ao enviar teste: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-planos-teste-expirado', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect('/clientes/todos?mensagem=Cliente nao encontrado');
    }

    if (!clienteTesteExpirado(cliente)) {
        return res.redirect(montarUrlListaClientesMensagem('Este cliente nao e um teste gratis expirado.'));
    }

    const vencimento = cliente.dataVencimento || cliente.vencimento || '';
    const jaEnviado = await avisoRenovacaoProgramadoExiste(
        cliente.id,
        vencimento,
        CODIGO_TESTE_EXPIRADO_PLANOS_MANUAL
    );

    if (jaEnviado) {
        return res.redirect(montarUrlListaClientesMensagem('A tela de planos deste teste expirado ja foi enviada uma vez.'));
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        logControleClientes('Planos de teste expirado nao enviados', {
            clienteId: cliente.id,
            motivo: 'WhatsApp desconectado'
        });
        return res.redirect(montarUrlListaClientesMensagem('WhatsApp nao esta conectado.'));
    }

    try {
        const planos = await obterPlanosRenovacaoManual();
        const mensagem = await montarMensagemPlanosTesteExpiradoManual(cliente, planos);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio dos planos do teste expirado'
        );
        const destino = envioWhatsApp.destino;

        await registrarAvisoRenovacaoProgramado(cliente.id, vencimento, CODIGO_TESTE_EXPIRADO_PLANOS_MANUAL);
        await adicionarNotaCliente(cliente.id, 'Tela de planos para teste expirado enviada manualmente pelo WhatsApp.');
        logControleClientes('Planos de teste expirado enviados', {
            clienteId: cliente.id,
            destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack
        });

        return res.redirect(montarUrlListaClientesMensagem('Tela de planos enviada para o teste expirado.'));
    } catch (err) {
        logControleClientes('Erro ao enviar planos de teste expirado', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlListaClientesMensagem(`Erro ao enviar planos: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-modelo', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente nao encontrado.'));
    }

    const modeloId = String(req.body?.modeloId || '').trim();
    if (!modeloId) {
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('Escolha um modelo para enviar.')}`);
    }

    const modelo = await buscarModeloPorId(modeloId);
    if (!modelo || Number(modelo.ativo) === 0) {
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('Modelo nao encontrado ou inativo.')}`);
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('WhatsApp nao esta conectado.')}`);
    }

    try {
        const config = await obterConfiguracoes();
        const vencimento = cliente.dataVencimento || cliente.vencimento || '';
        const dias = vencimento ? calcularDiasRestantes(vencimento) : '';
        const telefoneInstalacao = telefoneCampanhaAmizade(status, config);
        const mensagem = await montarMensagemModeloManual(cliente, modelo, {
            dias,
            telefoneWhatsApp: formatarTelefoneCampanha(telefoneInstalacao)
        });

        if (!String(mensagem || '').trim()) {
            return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent('Este modelo esta sem mensagem cadastrada.')}`);
        }

        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            `Envio manual do modelo ${modelo.titulo || modelo.id}`
        );

        let pixEnviado = null;
        let erroPix = '';
        if (modeloManualEnviaPix(modelo)) {
            try {
                const planoPix = await prepararPlanoPixPlanoAtual(cliente);
                pixEnviado = planoPix?.valorNumero > 0
                    ? await enviarQRCodePIXParaDestino(client, envioWhatsApp.destino, planoPix, {
                        tipo: 'renovacao',
                        nomeCliente: cliente.nome || 'cliente',
                        clienteId: cliente.id,
                        plano: cliente.plano,
                        tipoPlanoId: cliente.tipoPlanoId,
                        diasContrato: cliente.diasContrato,
                        valorPlano: planoPix.valor,
                        assinaturaApp: '0,00'
                    })
                    : false;
                if (!pixEnviado) erroPix = 'Plano sem valor ou falha no envio do QR Code.';
            } catch (err) {
                pixEnviado = false;
                erroPix = err.message;
            }
        }

        await adicionarNotaCliente(
            cliente.id,
            `Modelo "${modelo.titulo || modelo.id}" enviado manualmente pelo WhatsApp.${pixEnviado === true ?' PIX do plano enviado em seguida.' : pixEnviado === false ?` PIX não enviado: ${erroPix}` : ''}`
        );
        logControleClientes('Modelo manual enviado ao cliente', {
            clienteId: cliente.id,
            modeloId: modelo.id,
            modeloTitulo: modelo.titulo,
            destino: envioWhatsApp.destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            pixEnviado,
            erroPix
        });

        const mensagemRetorno = pixEnviado === true
            ? `Modelo "${modelo.titulo || modelo.id}" e PIX do plano enviados para ${cliente.nome}.`
            : pixEnviado === false
                ? `Modelo enviado para ${cliente.nome}, mas não foi possível enviar o PIX do plano.`
                : `Modelo "${modelo.titulo || modelo.id}" enviado para ${cliente.nome}.`;
        return res.redirect(montarUrlClienteMensagem(cliente.id, mensagemRetorno));
    } catch (err) {
        logControleClientes('Erro ao enviar modelo manual', {
            clienteId: cliente.id,
            modeloId: modelo.id,
            erro: err.message
        });
        return res.redirect(`/clientes/${encodeURIComponent(cliente.id)}/enviar-modelo?mensagem=${encodeURIComponent(`Erro ao enviar modelo: ${err.message}`)}`);
    }
});

router.post('/clientes/:id/enviar-aviso-vencimento', async (req, res) => {
    const cliente = await buscarClientePorId(req.params.id);

    if (!cliente) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente nao encontrado.'));
    }

    const vencimento = cliente.dataVencimento || cliente.vencimento || '';
    if (!vencimento) {
        return res.redirect(montarUrlListaClientesMensagem('Cliente sem data de vencimento cadastrada.'));
    }

    if (vencimentoExpirou(vencimento)) {
        return res.redirect(montarUrlListaClientesMensagem('Este cliente ja esta vencido. Use a cobranca de vencido no financeiro.'));
    }

    const status = getStatusWhatsApp();
    const client = getClient();

    if (!client || !status.conectado) {
        return res.redirect(montarUrlListaClientesMensagem('WhatsApp nao esta conectado.'));
    }

    try {
        const dias = Math.max(0, calcularDiasRestantes(vencimento) || 0);
        const mensagem = await montarMensagemPorModelo(cliente, dias);
        const envioWhatsApp = await enviarMensagemWhatsAppComFallback(
            client,
            cliente.telefone,
            mensagem,
            'Envio manual de vencimento proximo'
        );

        const planoPix = await prepararPlanoPixPlanoAtual(cliente);
        const pixEnviado = planoPix?.valorNumero > 0
            ? await enviarQRCodePIXParaDestino(client, envioWhatsApp.destino, planoPix, {
                tipo: 'renovacao',
                nomeCliente: cliente.nome || 'cliente',
                clienteId: cliente.id,
                plano: cliente.plano,
                tipoPlanoId: cliente.tipoPlanoId,
                diasContrato: cliente.diasContrato,
                valorPlano: planoPix.valor,
                assinaturaApp: '0,00'
            })
            : false;

        await adicionarNotaCliente(cliente.id, `Aviso manual de vencimento proximo enviado pelo WhatsApp para ${vencimento}.${pixEnviado ?' PIX do plano enviado em seguida.' : ' PIX não enviado; verifique o valor e a configuração PIX.'}`);
        logControleClientes('Aviso manual de vencimento enviado', {
            clienteId: cliente.id,
            destino: envioWhatsApp.destino,
            mensagemId: envioWhatsApp.mensagemId,
            ack: envioWhatsApp.ack,
            pixEnviado
        });

        return res.redirect(montarUrlListaClientesMensagem(pixEnviado
            ? `Aviso de vencimento e PIX do plano enviados para ${cliente.nome}.`
            : `Aviso enviado para ${cliente.nome}, mas não foi possível enviar o PIX do plano.`));
    } catch (err) {
        logControleClientes('Erro ao enviar aviso manual de vencimento', {
            clienteId: cliente.id,
            erro: err.message
        });
        return res.redirect(montarUrlListaClientesMensagem(`Erro ao enviar aviso: ${err.message}`));
    }
});

router.post('/clientes/:id/enviar-campanha-amizade', async (req, res) => {
    try {
        const { cliente } = await enviarCampanhaAmizadeManualPorId(
            req.params.id,
            'Campanha amizade que vale presente manual'
        );

        return res.redirect(montarUrlListaClientesMensagem(`Campanha enviada para ${cliente.nome}.`));
    } catch (err) {
        logControleClientes('Erro ao enviar campanha amizade manual', {
            clienteId: req.params.id,
            erro: err.message
        });
        return res.redirect(montarUrlListaClientesMensagem(`Erro ao enviar campanha: ${err.message}`));
    }
});

router.post('/clientes/disparar-amizade-presente-cliente', async (req, res) => {
    const clienteId = req.body?.clienteId;
    const retorno = retornoCampanha(req);

    if (!clienteId) {
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent('Selecione um cliente para testar a campanha.')}`);
    }

    try {
        const { cliente } = await enviarCampanhaAmizadeManualPorId(
            clienteId,
            'Campanha amizade que vale presente teste individual'
        );

        return res.redirect(`${retorno}?mensagem=${encodeURIComponent(`Campanha de teste enviada para ${cliente.nome}.`)}`);
    } catch (err) {
        logControleClientes('Erro ao enviar campanha amizade teste individual', {
            clienteId,
            erro: err.message
        });
        return res.redirect(`${retorno}?mensagem=${encodeURIComponent(`Erro ao testar campanha: ${err.message}`)}`);
    }
});

router.post('/clientes/:id/excluir', async (req, res) => {
    res.redirect(montarUrlClienteMensagem(
        req.params.id,
        'A exclusao direta foi desativada. Use a area Privacidade para exportar ou anonimizar os dados com seguranca.'
    ));
});

    return router;
}

module.exports = criarClientesAcoesRoute;
