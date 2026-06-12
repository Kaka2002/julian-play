const express = require('express');
const fs = require('fs');
const path = require('path');
const authRoute = require('./routes/authRoute');
const qrRoute = require('./routes/qrRoute');
const clientesRoute = require('./routes/clientesRoute');
const {
    iniciarWhatsApp,
    encerrarWhatsApp,
    getClient,
    getStatusWhatsApp
} = require('./config/whatsapp');
const { iniciarAgendadorRenovacao } = require('./services/renovacaoAutomatica');
const { protegerPainel } = require('./services/authService');

process.on('unhandledRejection', (err) => {
    const mensagem = err && err.message ? err.message : String(err);

    if (
        mensagem.includes('Execution context was destroyed') ||
        mensagem.includes('Runtime.callFunctionOn timed out') ||
        mensagem.includes('ProtocolError') ||
        mensagem.includes('auth timeout')
    ) {
        console.log('WhatsApp Web demorou/recarregou durante a inicializacao. Aguardando estabilizar...');
        return;
    }

    console.log('Erro nao tratado:', err);
});

const app = express();
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : __dirname);
const PROCESS_LOCK_PATH = path.join(DATA_DIR, '.julian-play.pid');

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
            console.error(`julian-play ja esta rodando no PID ${pidAtual}. Encerre o processo antigo antes de iniciar outro.`);
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
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/', authRoute);

app.get('/health', (req, res) => {
    res.status(200).json({
        ok: true,
        service: 'julian-play',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.use(protegerPainel);
app.use('/', clientesRoute);
app.use('/', qrRoute);

const PORT = process.env.PORT || 10000;

const server = app.listen(PORT, () => {
    console.log(`Monitor na porta ${PORT}`);
    iniciarWhatsApp();
    iniciarAgendadorRenovacao({ getClient, getStatusWhatsApp });
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
