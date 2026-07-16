const {
    obterConfiguracoes,
    salvarConfiguracao
} = require('./configuracoesPainel');
const {
    criarBackupAutomatico,
    limparBackupsAutomaticos
} = require('./manutencao');
const { registrarEventoSistema } = require('./eventosSistema');

const INTERVALO_MS = Number(process.env.MONITOR_INTERVALO_MS || 60000);

let agendador = null;
let executando = false;
let desconectadoDesde = null;
let alertaDesconexaoEnviado = false;
let reinicioSuaveTentado = false;
let novoQrTentado = false;
let ultimaAcaoRecuperacaoEm = 0;

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

async function enviarWebhook(url, evento) {
    if (!url) return false;

    try {
        const resposta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: evento.mensagem,
                ...evento
            }),
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

        await verificarBackup(config, agora);
        await verificarWhatsAppInteligente(config, agora, statusWhatsApp, controles);
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
    testarWebhookAlertas
};
