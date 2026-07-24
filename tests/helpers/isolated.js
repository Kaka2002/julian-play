const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');

function criarAmbiente(prefixo = 'julian-play-test-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
    const dataDir = path.join(root, 'dados');
    const backupDir = path.join(dataDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    return { root, dataDir, backupDir };
}

function executarIsolado(codigo, opcoes = {}) {
    const ambiente = opcoes.ambiente || criarAmbiente();
    const resultado = spawnSync(process.execPath, ['-e', codigo], {
        cwd: repoRoot,
        env: { ...process.env, DATA_DIR: ambiente.dataDir, DB_PATH: path.join(ambiente.dataDir, 'clientes.db'), BACKUP_DIR: ambiente.backupDir, NODE_ENV: 'test', ...opcoes.env },
        encoding: 'utf8',
        timeout: opcoes.timeout || 30000
    });
    if (resultado.status !== 0) throw new Error(`Processo isolado falhou (${resultado.status}).\nSTDOUT:\n${resultado.stdout}\nSTDERR:\n${resultado.stderr}`);
    return { ambiente, stdout: resultado.stdout.trim(), stderr: resultado.stderr.trim() };
}

function removerAmbiente(ambiente) {
    fs.rmSync(ambiente.root, { recursive: true, force: true });
}

module.exports = { repoRoot, criarAmbiente, executarIsolado, removerAmbiente };
