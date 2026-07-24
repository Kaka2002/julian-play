const {
    obterConfiguracoes,
    salvarConfiguracao
} = require('./configuracoesPainel');
const os = require('os');
const pacote = require('../package.json');
const {
    criarBackupAutomatico,
    limparBackupsAutomaticos,
    listarBackups
} = require('./manutencao');
const { registrarEventoSistema } = require('./eventosSistema');
const { marcarPagamentoMensagem } = require('./clientes');
const { instalacaoAdministrador } = require('./licencaService');
const { avaliarSaudeOperacional } = require('./saudeOperacionalService');

const INTERVALO_MS = Number(process.env.MONITOR_INTERVALO_MS || 60000);

let agendador = null;
let executando = false;
let desconectadoDesde = null;
let alertaDesconexaoEnviado = false;
let ultimoAlertaBackupDesatualizado = '';
let reinicioSuaveTentado = false;
let novoQrTentado = false;
let ultimaAcaoRecuperacaoEm = 0;
let assinaturaUltimoAlertaOperacional = '';

function destinoWhatsapp(telefone) {
    const numero = String(telefone || '').replace(/\D/g, '');
    return numero ? `${numero}@c.us` : '';
}

async function enviarWhatsappOperacional(config, controles, mensagem) {
    const destino = destinoWhatsapp(config.alertaWhatsappControle);
    if (!destino || typeof controles.getClient !== 'function') return false;
    const client = controles.getClient();
    if (!client) return false;
    try {
        await client.sendMessage(destino, mensagem);
        return true;
    } catch (err) {
        console.log(`Monitoramento: falha ao enviar alerta operacional pelo WhatsApp: ${err.message}`);
        return false;
    }
}

function estaInstalacaoResponsavelPeloHost() {
    return process.env.JULIAN_PLAY_INSTALL_MODE === 'local' || instalacaoAdministrador();
}

async function verificarSaudeOperacional(config, agora, controles, statusWhatsApp) {
    if (String(config.alertaSaudeOperacionalAtivo ?? '1') !== '1') return;
    if (!estaInstalacaoResponsavelPeloHost()) return;

    const avaliacao = avaliarSaudeOperacional(config);
    const assinatura = avaliacao.alertas.map(item => item.codigo).sort().join(',');

    if (assinatura !== assinaturaUltimoAlertaOperacional) {
        if (avaliacao.alertas.length) {
            const mensagem = `Saude operacional ${avaliacao.nivel}: ${avaliacao.alertas.map(item => item.mensagem).join(' ')}`;
            await registrarEventoSistema('saude_operacional', avaliacao.nivel === 'critico' ? 'erro' : 'alerta', mensagem, avaliacao);
            await enviarWebhook(config.alertaWebhookUrl, { tipo: 'saude_operacional', nivel: avaliacao.nivel, mensagem, data: agora.iso, detalhes: avaliacao });
            await enviarWhatsappOperacional(config, controles, `⚠️ *ALERTA OPERACIONAL*\n\n${mensagem}`);
        } else if (assinaturaUltimoAlertaOperacional) {
            const mensagem = `Saude operacional normalizada. Disco: ${avaliacao.recursos.discoLivreGb ?? '-'} GB livres. Memoria: ${avaliacao.recursos.memoriaLivreMb} MB livres.`;
            await registrarEventoSistema('saude_operacional', 'sucesso', mensagem, avaliacao);
            await enviarWebhook(config.alertaWebhookUrl, { tipo: 'saude_operacional_normalizada', nivel: 'sucesso', mensagem, data: agora.iso, detalhes: avaliacao });
            await enviarWhatsappOperacional(config, controles, `✅ *SAÚDE NORMALIZADA*\n\n${mensagem}`);
        }
        assinaturaUltimoAlertaOperacional = assinatura;
    }

    const semana = `${agora.data.slice(0, 4)}-${Math.ceil(Number(agora.data.slice(5, 7)) * 4.35 + Number(agora.data.slice(8, 10)) / 7)}`;
    const diaSemana = new Date(`${agora.data}T12:00:00`).getDay();
    if (diaSemana === 1 && agora.hora >= '09:00' && String(config.ultimoRelatorioSaudeSemanal || '') !== semana) {
        const mensagem = `Relatorio semanal: disco ${avaliacao.recursos.discoLivreGb ?? '-'} GB livres de ${avaliacao.recursos.discoTotalGb ?? '-'} GB; memoria ${avaliacao.recursos.memoriaLivreMb} MB livres de ${avaliacao.recursos.memoriaTotalMb} MB; WhatsApp ${statusWhatsApp.conectado ? 'conectado' : 'desconectado'}.`;
        await registrarEventoSistema('saude_operacional', 'info', mensagem, avaliacao);
        await enviarWebhook(config.alertaWebhookUrl, { tipo: 'relatorio_saude_semanal', nivel: avaliacao.nivel, mensagem, data: agora.iso, detalhes: avaliacao });
        await enviarWhatsappOperacional(config, controles, `📊 *RELATÓRIO SEMANAL*\n\n${mensagem}`);
        await salvarConfiguracao('ultimoRelatorioSaudeSemanal', semana);
    }
}

async function enviarConfirmacoesPixPendentes(controles = {}, statusWhatsApp = {}) {
    if (!statusWhatsApp.conectado || typeof controles.getClient !== 'function') return;
    const client = controles.getClient();
    if (!client) return;

    const { listarConfirmacoesPixPendentes } = require('./mercadoPagoService');
    const confirmacoes = await listarConfirmacoesPixPendentes();

    for (const confirmacao of confirmacoes) {
        const destino = destinoWhatsapp(confirmacao.telefone);
        if (!destino) {
            await marcarPagamentoMensagem(confirmacao.pagamentoId, false, 'Cliente sem telefone valido para WhatsApp.');
            continue;
        }

        const mensagem = `✅ *PAGAMENTO PIX CONFIRMADO*\n\nOlá, *${confirmacao.nome || 'cliente'}*! Seu pagamento foi confirmado automaticamente.\n\n*Plano:* ${confirmacao.plano}\n*Valor:* R$ ${confirmacao.valorTotal}\n*Novo vencimento:* ${confirmacao.vencimentoNovo}\n\nObrigado!`;
        try {
            await client.sendMessage(destino, mensagem);
            await marcarPagamentoMensagem(confirmacao.pagamentoId, true, '');
            console.log(`[mercado-pago] Confirmacao do PIX enviada ao cliente ${confirmacao.clienteId}.`);
        } catch (err) {
            await marcarPagamentoMensagem(confirmacao.pagamentoId, false, err.message);
            console.error(`[mercado-pago] PIX confirmado, mas a mensagem ao cliente ${confirmacao.clienteId} falhou: ${err.message}`);
        }
    }
}

async function enviarConfirmacoesPixControlePendentes(config = {}, controles = {}, statusWhatsApp = {}) {
    const numeroControle = String(config.mercadoPagoWhatsappControle || '').replace(/\D/g, '');
    if (!numeroControle || !statusWhatsApp.conectado || typeof controles.getClient !== 'function') return;
    const client = controles.getClient();
    if (!client) return;

    const {
        listarConfirmacoesPixControlePendentes,
        marcarConfirmacaoPixControle
    } = require('./mercadoPagoService');
    const confirmacoes = await listarConfirmacoesPixControlePendentes();
    const destino = destinoWhatsapp(numeroControle);

    for (const confirmacao of confirmacoes) {
        const mensagem = `💰 *PIX RECEBIDO E CONFIRMADO*\n\n*Cliente:* ${confirmacao.nome || `Cliente ${confirmacao.clienteId}`}\n*Telefone:* ${confirmacao.telefone || '-'}\n*Plano:* ${confirmacao.plano}\n*Valor:* R$ ${confirmacao.valorTotal}\n*Novo vencimento:* ${confirmacao.vencimentoNovo}\n*Mercado Pago:* ${confirmacao.provedorPagamentoId || '-'}\n\nO cliente foi renovado automaticamente.`;
        try {
            await client.sendMessage(destino, `${mensagem}\n\n*Painel IPTV/P2P:* ${confirmacao.protocolosPainel || 'sem renovacao externa configurada'}`);
            await marcarConfirmacaoPixControle(confirmacao.cobrancaId, true, '');
            console.log(`[mercado-pago] Aviso de controle enviado para a cobranca ${confirmacao.cobrancaId}.`);
        } catch (err) {
            await marcarConfirmacaoPixControle(confirmacao.cobrancaId, false, err.message);
            console.error(`[mercado-pago] Falha ao enviar aviso de controle da cobranca ${confirmacao.cobrancaId}: ${err.message}`);
        }
    }
}

function agoraSaoPaulo() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date()).reduce((mapa, item) => {
        mapa[item.type] = item.value;
        return mapa;
    }, {});

    return {
        data: `${partes.year}-${partes.month}-${partes.day}`,
        hora: `${partes.hour}:${partes.minute}`,
        iso: `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}`
    };
}

function montarPayloadWebhook(evento = {}) {
    const agora = agoraSaoPaulo();
    const detalhes = evento.detalhes && typeof evento.detalhes === 'object'
        ? evento.detalhes
        : {};

    return {
        content: evento.mensagem || 'Evento do Controle de Clientes',
        sistema: 'Controle de Clientes Julian Play',
        app: pacote.name || 'julian-play',
        versao: pacote.version || '',
        ambiente: process.env.NODE_ENV || 'production',
        servidor: os.hostname(),
        pid: process.pid,
        porta: process.env.PORT || process.env.APP_PORT || '',
        timezone: 'America/Sao_Paulo',
        data: evento.data || agora.iso,
        dataSaoPaulo: agora.iso,
        dataServidor: new Date().toISOString(),
        tipo: evento.tipo || 'evento',
        nivel: evento.nivel || 'info',
        mensagem: evento.mensagem || '',
        statusWhatsApp: evento.statusWhatsApp || null,
        detalhes: {
            ...detalhes,
            origem: detalhes.origem || 'monitoramento_comercial'
        }
    };
}

async function enviarWebhook(url, evento) {
    if (!url) return false;

    try {
        const resposta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(montarPayloadWebhook(evento)),
            signal: AbortSignal.timeout(15000)
        });

        if (!resposta.ok) {
            throw new Error(`HTTP ${resposta.status}`);
        }

        return true;
    } catch (err) {
        console.log(`Monitoramento: falha ao enviar webhook: ${err.message}`);
        return false;
    }
}

async function testarWebhookAlertas(url) {
    const webhook = String(url || '').trim();

    if (!webhook) {
        throw new Error('Informe a URL HTTPS do webhook antes de testar.');
    }

    if (!/^https:\/\//i.test(webhook)) {
        throw new Error('O webhook de alerta precisa usar HTTPS.');
    }

    const agora = agoraSaoPaulo();
    const resposta = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content: 'Teste de alerta concluído. O monitoramento do Controle de Clientes está configurado corretamente.',
            tipo: 'alerta_teste',
            nivel: 'info',
            mensagem: 'Teste de alerta concluído. O monitoramento do Controle de Clientes está configurado corretamente.',
            data: agora.iso
        }),
        signal: AbortSignal.timeout(15000)
    });

    if (!resposta.ok) {
        throw new Error(`O serviço recusou o teste (HTTP ${resposta.status}).`);
    }

    await registrarEventoSistema(
        'monitoramento',
        'sucesso',
        'Alerta de teste enviado ao webhook com sucesso.'
    );

    return true;
}

async function verificarBackup(config, agora) {
    const ultimo = listarBackups()[0];
    const desatualizado = !ultimo || Date.now() - ultimo.criadoEm.getTime() > 36 * 60 * 60 * 1000;
    if (desatualizado && ultimoAlertaBackupDesatualizado !== agora.data) {
        ultimoAlertaBackupDesatualizado = agora.data;
        const mensagem = ultimo ?`Último backup tem mais de 36 horas: ${ultimo.nome}.` : 'Nenhum backup verificável foi encontrado.';
        await registrarEventoSistema('backup_desatualizado', 'alerta', mensagem);
        await enviarWebhook(config.alertaWebhookUrl, { tipo:'backup_desatualizado', nivel:'alerta', mensagem, data:agora.iso });
    }
    if (String(config.backupAutomaticoAtivo) !== '1') return;
    if (agora.hora < String(config.backupAutomaticoHora || '03:00')) return;
    if (String(config.ultimoBackupAutomatico || '').slice(0, 10) === agora.data) return;

    try {
        const backup = await criarBackupAutomatico();
        const removidos = limparBackupsAutomaticos(config.backupRetencaoDias || 30);

        await salvarConfiguracao('ultimoBackupAutomatico', agora.iso);
        await registrarEventoSistema('backup', 'sucesso', `Backup automático criado: ${backup.nome}`, {
            arquivo: backup.nome,
            tamanho: backup.tamanho,
            removidos
        });
        console.log(`Monitoramento: backup automatico criado: ${backup.nome}`);
    } catch (err) {
        await registrarEventoSistema('backup', 'erro', `Falha no backup automático: ${err.message}`);
        await enviarWebhook(config.alertaWebhookUrl, {
            tipo: 'backup_erro',
            nivel: 'erro',
            mensagem: `Falha no backup automático: ${err.message}`,
            data: agora.iso
        });
    }
}

async function verificarWhatsApp(config, agora, statusWhatsApp = {}) {
    if (statusWhatsApp.conectado) {
        if (alertaDesconexaoEnviado) {
            const mensagem = 'WhatsApp reconectado e operando normalmente.';
            await registrarEventoSistema('whatsapp', 'sucesso', mensagem, { status: statusWhatsApp.status });
            await enviarWebhook(config.alertaWebhookUrl, {
                tipo: 'whatsapp_reconectado',
                nivel: 'sucesso',
                mensagem,
                data: agora.iso
            });
        }

        desconectadoDesde = null;
        alertaDesconexaoEnviado = false;
        return;
    }

    if (!desconectadoDesde) desconectadoDesde = Date.now();
    if (alertaDesconexaoEnviado) return;

    const limiteMs = Math.max(1, Number(config.alertaWhatsAppMinutos || 5)) * 60000;
    if (Date.now() - desconectadoDesde < limiteMs) return;

    alertaDesconexaoEnviado = true;
    const mensagem = `WhatsApp desconectado há pelo menos ${config.alertaWhatsAppMinutos || 5} minuto(s). Status: ${statusWhatsApp.status || 'desconhecido'}.`;

    await registrarEventoSistema('whatsapp', 'alerta', mensagem, {
        status: statusWhatsApp.status,
        desconectadoDesde: new Date(desconectadoDesde).toISOString()
    });
    await enviarWebhook(config.alertaWebhookUrl, {
        tipo: 'whatsapp_desconectado',
        nivel: 'alerta',
        mensagem,
        data: agora.iso
    });
    console.log(`Monitoramento: ${mensagem}`);
}

function minutosDesde(valor) {
    if (!valor) return null;
    const data = new Date(valor).getTime();
    if (!data) return null;
    return Math.floor((Date.now() - data) / 60000);
}

async function recuperarWhatsAppSeNecessario(config, agora, statusWhatsApp = {}, controles = {}, desconectadoMs = 0) {
    if (String(config.whatsappAutoRecuperacaoAtiva ?? '1') === '0') return;
    if (typeof controles.recuperarWhatsAppAutomaticamente !== 'function') return;

    const intervaloMs = Math.max(3, Number(config.whatsappAutoRecuperacaoIntervaloMinutos || 5)) * 60000;
    if (ultimaAcaoRecuperacaoEm && Date.now() - ultimaAcaoRecuperacaoEm < intervaloMs) return;

    const minimoReinicioMs = Math.max(1, Number(config.whatsappAutoRecuperacaoMinutos || 3)) * 60000;
    const minimoNovoQrMs = Math.max(3, Number(config.whatsappAutoNovoQrMinutos || 8)) * 60000;
    const status = String(statusWhatsApp.status || '');
    const minutosQr = minutosDesde(statusWhatsApp.ultimoQrEm);
    const qrAntigo = minutosQr !== null && minutosQr >= Math.max(10, Number(config.whatsappAutoNovoQrAposMinutos || 15));
    const statusCritico = ['sessao_presa', 'falha_autenticacao', 'chrome_em_uso', 'erro'].includes(status);

    if (!reinicioSuaveTentado && desconectadoMs >= minimoReinicioMs && status !== 'aguardando_qr') {
        reinicioSuaveTentado = true;
        ultimaAcaoRecuperacaoEm = Date.now();
        const motivo = `WhatsApp ${status || 'desconectado'} detectado pelo monitor. Reinicio automatico sem apagar sessao.`;

        await registrarEventoSistema('whatsapp', 'alerta', motivo, {
            acao: 'reinicio_automatico',
            status,
            data: agora.iso
        });
        await controles.recuperarWhatsAppAutomaticamente({ limparSessao: false, motivo });
        console.log(`Monitoramento: ${motivo}`);
        return;
    }

    if (
        !novoQrTentado &&
        desconectadoMs >= minimoNovoQrMs &&
        (statusCritico || !statusWhatsApp.temQr || qrAntigo)
    ) {
        if (String(config.whatsappBloquearNovoQrAutomatico ?? '1') === '1') {
            novoQrTentado = true;
            const motivo = 'Novo QR Code automatico bloqueado por seguranca. A sessao existente foi preservada; gere outro QR somente por acao manual.';
            await registrarEventoSistema('whatsapp', 'alerta', motivo, {
                acao: 'novo_qr_automatico_bloqueado',
                status,
                temQr: Boolean(statusWhatsApp.temQr),
                data: agora.iso
            });
            console.log(`Monitoramento: ${motivo}`);
            return;
        }

        novoQrTentado = true;
        ultimaAcaoRecuperacaoEm = Date.now();
        const motivo = `WhatsApp sem recuperacao apos ${Math.round(desconectadoMs / 60000)} minuto(s). Novo QR Code automatico solicitado.`;

        await registrarEventoSistema('whatsapp', 'alerta', motivo, {
            acao: 'novo_qr_automatico',
            status,
            temQr: Boolean(statusWhatsApp.temQr),
            minutosQr,
            data: agora.iso
        });
        await controles.recuperarWhatsAppAutomaticamente({ limparSessao: true, motivo });
        console.log(`Monitoramento: ${motivo}`);
    }
}

async function verificarWhatsAppInteligente(config, agora, statusWhatsApp = {}, controles = {}) {
    let statusAtual = { ...statusWhatsApp };

    if (typeof controles.verificarSaudeWhatsApp === 'function') {
        const saude = await controles.verificarSaudeWhatsApp();
        if (statusAtual.conectado && !saude.ok) {
            statusAtual = {
                ...statusAtual,
                conectado: false,
                status: 'sessao_presa',
                diagnosticoSaude: saude
            };
        }
    }

    if (statusAtual.conectado) {
        if (alertaDesconexaoEnviado) {
            const mensagem = 'WhatsApp reconectado e operando normalmente.';
            await registrarEventoSistema('whatsapp', 'sucesso', mensagem, { status: statusAtual.status });
            await enviarWebhook(config.alertaWebhookUrl, {
                tipo: 'whatsapp_reconectado',
                nivel: 'sucesso',
                mensagem,
                data: agora.iso
            });
        }

        desconectadoDesde = null;
        alertaDesconexaoEnviado = false;
        reinicioSuaveTentado = false;
        novoQrTentado = false;
        ultimaAcaoRecuperacaoEm = 0;
        return;
    }

    if (!desconectadoDesde) desconectadoDesde = Date.now();
    const limiteMs = Math.max(1, Number(config.alertaWhatsAppMinutos || 5)) * 60000;
    const desconectadoMs = Date.now() - desconectadoDesde;

    await recuperarWhatsAppSeNecessario(config, agora, statusAtual, controles, desconectadoMs);

    if (alertaDesconexaoEnviado) return;
    if (desconectadoMs < limiteMs) return;

    alertaDesconexaoEnviado = true;
    const mensagem = `WhatsApp desconectado ha pelo menos ${config.alertaWhatsAppMinutos || 5} minuto(s). Status: ${statusAtual.status || 'desconhecido'}.`;

    await registrarEventoSistema('whatsapp', 'alerta', mensagem, {
        status: statusAtual.status,
        desconectadoDesde: new Date(desconectadoDesde).toISOString(),
        diagnosticoSaude: statusAtual.diagnosticoSaude || null
    });
    await enviarWebhook(config.alertaWebhookUrl, {
        tipo: 'whatsapp_desconectado',
        nivel: 'alerta',
        mensagem,
        data: agora.iso
    });
    console.log(`Monitoramento: ${mensagem}`);
}

async function executarMonitoramento(controles = {}) {
    if (executando) return;
    executando = true;

    try {
        const config = await obterConfiguracoes();
        const agora = agoraSaoPaulo();
        const statusWhatsApp = typeof controles.getStatusWhatsApp === 'function' ? controles.getStatusWhatsApp() : {};

        await verificarSaudeOperacional(config, agora, controles, statusWhatsApp);
        await verificarBackup(config, agora);
        await verificarWhatsAppInteligente(config, agora, statusWhatsApp, controles);
        if (
            process.env.JULIAN_PLAY_INSTALL_MODE === 'local'
            && config.pixProvedor === 'mercado_pago'
            && config.mercadoPagoAccessToken
        ) {
            const { verificarCobrancasPendentesMercadoPago } = require('./mercadoPagoService');
            await verificarCobrancasPendentesMercadoPago();
            await enviarConfirmacoesPixPendentes(controles, statusWhatsApp);
        }
        if (config.pixProvedor === 'mercado_pago' && config.mercadoPagoWhatsappControle) {
            await enviarConfirmacoesPixControlePendentes(config, controles, statusWhatsApp);
        }
        const { processarFilaRenovacoes } = require('./renovacaoPainelService');
        await processarFilaRenovacoes();
    } catch (err) {
        console.log(`Monitoramento comercial: ${err.message}`);
    } finally {
        executando = false;
    }
}

function iniciarMonitoramentoComercial(controles = {}) {
    if (agendador) return;

    setTimeout(() => executarMonitoramento(controles), 15000);
    agendador = setInterval(() => executarMonitoramento(controles), INTERVALO_MS);
    console.log('Monitoramento comercial iniciado: backup automático e saúde do WhatsApp.');
}

module.exports = {
    iniciarMonitoramentoComercial,
    executarMonitoramento,
    agoraSaoPaulo,
    enviarWebhook,
    testarWebhookAlertas
};
