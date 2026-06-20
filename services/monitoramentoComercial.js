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

async function executarMonitoramento(getStatusWhatsApp) {
    if (executando) return;
    executando = true;

    try {
        const config = await obterConfiguracoes();
        const agora = agoraSaoPaulo();
        const statusWhatsApp = getStatusWhatsApp ? getStatusWhatsApp() : {};

        await verificarBackup(config, agora);
        await verificarWhatsApp(config, agora, statusWhatsApp);
    } catch (err) {
        console.log(`Monitoramento comercial: ${err.message}`);
    } finally {
        executando = false;
    }
}

function iniciarMonitoramentoComercial({ getStatusWhatsApp } = {}) {
    if (agendador) return;

    setTimeout(() => executarMonitoramento(getStatusWhatsApp), 15000);
    agendador = setInterval(() => executarMonitoramento(getStatusWhatsApp), INTERVALO_MS);
    console.log('Monitoramento comercial iniciado: backup automático e saúde do WhatsApp.');
}

module.exports = {
    iniciarMonitoramentoComercial,
    executarMonitoramento,
    agoraSaoPaulo
};
