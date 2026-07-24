const express = require('express');
const fs = require('fs');
const path = require('path');
const authRoute = require('./routes/authRoute');
const qrRoute = require('./routes/qrRoute');
const clientesRoute = require('./routes/clientesRoute');
const licencaRoute = require('./routes/licencaRoute');
const adminInternoRoute = require('./routes/adminInternoRoute');
const webhookRoute = require('./routes/webhookRoute');
const { medirRecursosOperacionais } = require('./services/saudeOperacionalService');
const {
    iniciarWhatsApp,
    encerrarWhatsApp,
    getClient,
    getStatusWhatsApp,
    verificarSaudeWhatsApp,
    recuperarWhatsAppAutomaticamente
} = require('./config/whatsapp');
const { iniciarAgendadorRenovacao } = require('./services/renovacaoAutomatica');
const { iniciarMonitoramentoComercial } = require('./services/monitoramentoComercial');
const { protegerPainel } = require('./services/authService');
const { protegerLicenca } = require('./services/licencaService');
const { csrfMiddleware, cabecalhosSeguranca } = require('./services/securityService');

process.on('unhandledRejection', (err) => {
    const mensagem = err && err.message ? err.message : String(err);

    if (
        mensagem.includes('Execution context was destroyed') ||
        mensagem.includes('Runtime.callFunctionOn timed out') ||
        mensagem.includes('ProtocolError') ||
        mensagem.includes('auth timeout') ||
        mensagem.includes('Target closed') ||
        mensagem.includes('Session closed') ||
        mensagem.includes('Navigating frame was detached')
    ) {
        console.log('WhatsApp Web demorou/recarregou durante a inicializacao. Aguardando estabilizar...');
        return;
    }

    console.log('Erro nao tratado:', err);
});

const app = express();
if (process.env.TRUST_PROXY === '1' || process.env.RENDER) {
    app.set('trust proxy', 1);
}
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : __dirname);
const INSTANCE_NAME = String(
    process.env.JULIAN_PLAY_APP_NAME
    || process.env.JULIAN_INSTANCE_NAME
    || path.basename(path.resolve(DATA_DIR))
    || 'julian-play'
).replace(/[^a-zA-Z0-9_-]/g, '-');
const PROCESS_LOCK_PATH = path.join(DATA_DIR, `.${INSTANCE_NAME}.pid`);

function processoExiste(pid) {
    if (!pid || Number(pid) === process.pid) return false;

    try {
        process.kill(Number(pid), 0);
        return true;
    } catch {
        return false;
    }
}

function adquirirTravaProcesso() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (fs.existsSync(PROCESS_LOCK_PATH)) {
        const pidAtual = Number(fs.readFileSync(PROCESS_LOCK_PATH, 'utf8'));

        if (processoExiste(pidAtual)) {
            console.error(`${INSTANCE_NAME} ja esta rodando no PID ${pidAtual}. Encerre o processo antigo antes de iniciar outro.`);
            process.exit(1);
        }
    }

    fs.writeFileSync(PROCESS_LOCK_PATH, String(process.pid));
}

function liberarTravaProcesso() {
    try {
        if (!fs.existsSync(PROCESS_LOCK_PATH)) return;

        const pidAtual = Number(fs.readFileSync(PROCESS_LOCK_PATH, 'utf8'));
        if (pidAtual === process.pid) {
            fs.unlinkSync(PROCESS_LOCK_PATH);
        }
    } catch (err) {
        console.log('Nao foi possivel liberar trava do processo:', err.message);
    }
}

adquirirTravaProcesso();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.disable('x-powered-by');
app.use(cabecalhosSeguranca);
app.use(csrfMiddleware({ isento: req => req.path.startsWith('/webhooks/') || req.path.startsWith('/api/admin/') || req.is('application/json') }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/tenant-assets', express.static(path.join(DATA_DIR, 'assets')));
app.use('/', authRoute);
app.use('/api/admin', adminInternoRoute);
app.use('/', webhookRoute);

app.get('/health', (req, res) => {
    const whatsapp = getStatusWhatsApp();
    const memoria = process.memoryUsage();
    const recursos = medirRecursosOperacionais();
    res.status(200).json({
        ok: true,
        estado: whatsapp.conectado ? 'operacional' : 'degradado',
        service: 'julian-play',
        whatsapp: {
            conectado: Boolean(whatsapp.conectado),
            status: whatsapp.status,
            numero: whatsapp.numeroConectado || '',
            mensagensRecebidasTotal: whatsapp.mensagensRecebidasTotal || 0,
            ultimaMensagemRecebidaEm: whatsapp.ultimaMensagemRecebidaEm || null,
            ultimaMensagemRecebidaDe: whatsapp.ultimaMensagemRecebidaDe || '',
            ultimoEnvioRoboEm: whatsapp.ultimoEnvioRoboEm || null,
            ultimoEnvioRoboPara: whatsapp.ultimoEnvioRoboPara || '',
            eventosInternosIgnoradosTotal: whatsapp.eventosInternosIgnoradosTotal || 0,
            conversasNaoIndividuaisIgnoradasTotal: whatsapp.conversasNaoIndividuaisIgnoradasTotal || 0,
            ultimoEventoIgnoradoEm: whatsapp.ultimoEventoIgnoradoEm || null,
            ultimaVerificacaoSaude: whatsapp.ultimaVerificacaoSaude || null,
            ultimaRecuperacaoWhatsApp: whatsapp.ultimaRecuperacaoWhatsApp || null,
            recuperacaoEmAndamento: Boolean(whatsapp.recuperacaoEmAndamento)
        },
        memoria: {
            rss: memoria.rss,
            heapUsado: memoria.heapUsed,
            heapTotal: memoria.heapTotal
        },
        operacional: recursos,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.use(protegerPainel);
app.use(protegerLicenca);
app.use('/licenca', licencaRoute);
app.use('/', clientesRoute);
app.use('/', qrRoute);

const PORT = process.env.PORT || 10000;

const server = app.listen(PORT, () => {
    console.log(`Monitor na porta ${PORT}`);
    iniciarWhatsApp();
    iniciarAgendadorRenovacao({ getClient, getStatusWhatsApp });
    iniciarMonitoramentoComercial({
        getClient,
        getStatusWhatsApp,
        verificarSaudeWhatsApp,
        recuperarWhatsAppAutomaticamente
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Porta ${PORT} ja esta em uso. Encerre o outro processo antes de iniciar o julian-play.`);
        process.exit(1);
    }

    console.error('Erro ao iniciar servidor:', err);
    process.exit(1);
});

async function desligar(signal) {
    console.log(`Recebido ${signal}. Encerrando WhatsApp...`);
    await encerrarWhatsApp();
    liberarTravaProcesso();
    process.exit(0);
}

process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));
process.on('exit', liberarTravaProcesso);
