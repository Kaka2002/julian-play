const { spawn } = require('child_process');

const RESTART_DELAY_MS = Number(process.env.RESTART_DELAY_MS || 5000);
let child = null;
let stopping = false;

function startBot() {
    child = spawn(process.execPath, ['bot.js'], {
        stdio: 'inherit',
        env: process.env
    });

    child.on('exit', (code, signal) => {
        child = null;

        if (stopping) {
            process.exit(code || 0);
            return;
        }

        console.log(`Bot finalizado. code=${code} signal=${signal}`);
        console.log(`Reiniciando em ${RESTART_DELAY_MS}ms...`);

        setTimeout(startBot, RESTART_DELAY_MS);
    });
}

function shutdown(signal) {
    stopping = true;
    console.log(`Supervisor recebeu ${signal}. Encerrando bot...`);

    if (child) {
        child.kill(signal);
        return;
    }

    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startBot();
