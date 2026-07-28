const { spawn } = require('child_process');
const path = require('path');

async function aguardarServidor(processo) {
    const limite = Date.now() + 30_000;
    while (Date.now() < limite) {
        if (processo.exitCode !== null) {
            throw new Error(`Servidor E2E encerrou antes de ficar disponível (código ${processo.exitCode}).`);
        }
        try {
            const resposta = await fetch('http://127.0.0.1:11999/health');
            if (resposta.ok) return;
        } catch (_) {
            // O processo ainda está inicializando.
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Servidor E2E não ficou disponível em 30 segundos.');
}

module.exports = async () => {
    const processo = spawn(process.execPath, [path.join(__dirname, 'servidor-e2e.js')], {
        cwd: path.join(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    processo.stdout.on('data', dados => process.stdout.write(`[servidor-e2e] ${dados}`));
    processo.stderr.on('data', dados => process.stderr.write(`[servidor-e2e] ${dados}`));
    await aguardarServidor(processo);

    return async () => {
        if (processo.exitCode === null) {
            processo.kill('SIGTERM');
            await Promise.race([
                new Promise(resolve => processo.once('exit', resolve)),
                new Promise(resolve => setTimeout(resolve, 5_000))
            ]);
        }
    };
};
