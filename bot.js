const express = require('express');
const path = require('path');
const authRoute = require('./routes/authRoute');
const qrRoute = require('./routes/qrRoute');
const clientesRoute = require('./routes/clientesRoute');
const privacidadeRoute = require('./routes/privacidadeRoute');
const pagamentosRoute = require('./routes/pagamentosRoute');
const criarCampanhasRoute = require('./routes/campanhasRoute');
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
const { middlewareCorrelacao, compararVersoes } = require('./services/observabilidadeService');
const packageInfo = require('./package.json');
const bancoAplicacao = require('./database/sqlite');
const { MessageMedia } = require('whatsapp-web.js');
const { configurarExecutorFilaPersistente } = require('./services/filaMensagensService');
const { criarGerenciadorTravaProcesso } = require('./services/travaProcessoService');

let bancoPronto = false;
bancoAplicacao.ready.then(() => { bancoPronto = true; }).catch(err => {
    console.error('Banco nao ficou pronto:', err.message);
});

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
const PROCESS_LOCK_WAIT_MS = Math.min(30000, Math.max(0, Number(process.env.PROCESS_LOCK_WAIT_MS || 30000)));
const travaProcesso = criarGerenciadorTravaProcesso({
    caminho: PROCESS_LOCK_PATH,
    instancia: INSTANCE_NAME
});

function adquirirTravaProcesso() {
    const resultado = travaProcesso.adquirir({ tempoEsperaMs: PROCESS_LOCK_WAIT_MS });
    if (!resultado.adquirida) {
        const pidAtual = resultado.registroAnterior?.pid || 'desconhecido';
        const espera = resultado.aguardouMs ? ` Aguardou ${Math.ceil(resultado.aguardouMs / 1000)} segundo(s) pela troca.` : '';
        console.error(`${INSTANCE_NAME} ja esta rodando no PID ${pidAtual}. Encerre o processo antigo antes de iniciar outro.${espera}`);
        process.exit(1);
    }

    if (resultado.aguardouMs) {
        console.log(`Trava de processo liberada apos ${Math.ceil(resultado.aguardouMs / 1000)} segundo(s) para ${INSTANCE_NAME}.`);
    }

    if (resultado.substituiuObsoleta) {
        console.log(`Trava de processo obsoleta substituida para ${INSTANCE_NAME}.`);
    }
}

function liberarTravaProcesso() {
    try {
        travaProcesso.liberar();
    } catch (err) {
        console.log('Nao foi possivel liberar trava do processo:', err.message);
    }
}

adquirirTravaProcesso();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.disable('x-powered-by');
app.use(middlewareCorrelacao);
app.use(cabecalhosSeguranca);
app.use(csrfMiddleware({ isento: req => req.path.startsWith('/webhooks/') || req.path.startsWith('/api/admin/') || req.is('application/json') }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/tenant-assets', express.static(path.join(DATA_DIR, 'assets')));
app.use('/', authRoute);
app.use('/api/admin', adminInternoRoute);
app.use('/', webhookRoute);

app.get('/live', (req, res) => res.status(200).json({
    ok: true,
    service: 'julian-play',
    version: packageInfo.version,
    timestamp: new Date().toISOString()
}));

app.get('/ready', (req, res) => res.status(bancoPronto ? 200 : 503).json({
    ok: bancoPronto,
    ready: bancoPronto,
    service: 'julian-play',
    version: packageInfo.version,
    timestamp: new Date().toISOString()
}));

app.get('/health', (req, res) => {
    const whatsapp = getStatusWhatsApp();
    const memoria = process.memoryUsage();
    const recursos = medirRecursosOperacionais();
    const enderecoRemoto = String(req.socket?.remoteAddress || '');
    const origemLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(enderecoRemoto);
    const requisicaoPassouPorProxyPublico = Boolean(
        !origemLocal || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']
    );
    if (requisicaoPassouPorProxyPublico) {
        return res.status(200).json({
            ok: true,
            estado: whatsapp.conectado ? 'operacional' : 'degradado',
            service: 'julian-play',
            version: packageInfo.version,
            whatsapp: { conectado: Boolean(whatsapp.conectado), status: whatsapp.status },
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    }
    res.status(200).json({
        ok: true,
        estado: whatsapp.conectado ? 'operacional' : 'degradado',
        service: 'julian-play',
        instance: INSTANCE_NAME,
        version: packageInfo.version,
        latestVersion: process.env.JULIAN_PLAY_LATEST_VERSION || packageInfo.version,
        versionStatus: compararVersoes(packageInfo.version, process.env.JULIAN_PLAY_LATEST_VERSION || packageInfo.version),
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

app.get('/health/whatsapp', async (req, res) => {
    try {
        const saude = await verificarSaudeWhatsApp();
        console.log('Health-check WhatsApp executado via /health/whatsapp:', saude);
        return res.status(200).json({ ok: true, saude });
    } catch (err) {
        console.log('Erro ao executar health-check WhatsApp:', err && err.message ? err.message : String(err));
        if (err && err.stack) console.log(err.stack);
        return res.status(500).json({ ok: false, erro: err && err.message ? err.message : String(err) });
    }
});

app.use(protegerPainel);
app.use(protegerLicenca);
app.use('/pagamentos-manuais', pagamentosRoute);
app.use('/campanhas', criarCampanhasRoute({
    renderizarPaginaCampanhas: clientesRoute.renderizarPaginaCampanhas
}));
app.use('/licenca', licencaRoute);
app.use('/', privacidadeRoute);
app.use('/', clientesRoute);
app.use('/', qrRoute);

const PORT = process.env.PORT || 10000;
const whatsappDesativado = process.env.DISABLE_WHATSAPP === '1';

const server = app.listen(PORT, async () => {
    console.log(`Monitor na porta ${PORT}`);
    await bancoAplicacao.ready;
    if (typeof process.send === 'function') process.send('ready');
    if (whatsappDesativado) {
        console.log('WhatsApp e agendadores desativados neste processo.');
    } else {
        configurarExecutorFilaPersistente(async payload => {
            const clienteWhatsapp = getClient();
            if (!clienteWhatsapp || !getStatusWhatsApp().conectado) {
                throw new Error('WhatsApp ainda nao esta conectado para retomar a fila.');
            }
            if (payload.tipo === 'midia') {
                const media = new MessageMedia(
                    String(payload.midia.mimetype || 'application/octet-stream'),
                    String(payload.midia.data || ''),
                    String(payload.midia.filename || 'arquivo')
                );
                return clienteWhatsapp.sendMessage(payload.destino, media, payload.opcoesMensagem || {});
            }
            return clienteWhatsapp.sendMessage(payload.destino, payload.texto);
        });
        iniciarWhatsApp();
        iniciarAgendadorRenovacao({ getClient, getStatusWhatsApp });
        iniciarMonitoramentoComercial({
            getClient,
            getStatusWhatsApp,
            verificarSaudeWhatsApp,
            recuperarWhatsAppAutomaticamente
        });
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Porta ${PORT} ja esta em uso. Encerre o outro processo antes de iniciar o julian-play.`);
        process.exit(1);
    }

    console.error('Erro ao iniciar servidor:', err);
    process.exit(1);
});

let desligamentoEmAndamento = false;

async function desligar(signal) {
    if (desligamentoEmAndamento) return;
    desligamentoEmAndamento = true;
    console.log(`Recebido ${signal}. Encerrando WhatsApp...`);
    const limite = setTimeout(() => process.exit(1), 25000);
    limite.unref();
    try {
        await new Promise(resolve => server.close(resolve));
        if (!whatsappDesativado) await encerrarWhatsApp();
        await bancoAplicacao.encerrar();
        liberarTravaProcesso();
        process.exit(0);
    } catch (err) {
        console.error('Falha durante encerramento controlado:', err.message);
        liberarTravaProcesso();
        process.exit(1);
    }
}

process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));
process.on('message', mensagem => {
    if (mensagem === 'shutdown') desligar('shutdown do PM2');
});
process.on('exit', liberarTravaProcesso);
