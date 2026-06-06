const fs = require('fs');
const path = require('path');
const db = require('../database/sqlite');
const packageInfo = require('../package.json');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(db.dataDir, 'backups');

function formatarBytes(bytes = 0) {
    const valor = Number(bytes || 0);
    if (valor < 1024) return `${valor} B`;
    if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
    if (valor < 1024 * 1024 * 1024) return `${(valor / 1024 / 1024).toFixed(1)} MB`;
    return `${(valor / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function timestampArquivo() {
    const data = new Date();
    const partes = [
        data.getFullYear(),
        String(data.getMonth() + 1).padStart(2, '0'),
        String(data.getDate()).padStart(2, '0'),
        String(data.getHours()).padStart(2, '0'),
        String(data.getMinutes()).padStart(2, '0'),
        String(data.getSeconds()).padStart(2, '0')
    ];

    return `${partes[0]}${partes[1]}${partes[2]}-${partes[3]}${partes[4]}${partes[5]}`;
}

function listarBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    return fs.readdirSync(BACKUP_DIR)
        .filter(nome => nome.toLowerCase().endsWith('.db'))
        .map(nome => {
            const caminho = path.join(BACKUP_DIR, nome);
            const stat = fs.statSync(caminho);

            return {
                nome,
                caminho,
                tamanho: stat.size,
                tamanhoFormatado: formatarBytes(stat.size),
                criadoEm: stat.mtime
            };
        })
        .sort((a, b) => b.criadoEm - a.criadoEm);
}

async function criarBackupManual() {
    await db.ready;

    if (!fs.existsSync(db.dbPath)) {
        throw new Error('Banco de dados nao encontrado para backup.');
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const nome = `clientes-${timestampArquivo()}.db`;
    const destino = path.join(BACKUP_DIR, nome);

    fs.copyFileSync(db.dbPath, destino);

    return {
        nome,
        caminho: destino,
        tamanho: fs.statSync(destino).size
    };
}

async function obterStatusSistema(statusWhatsApp = {}) {
    await db.ready;

    const bancoExiste = fs.existsSync(db.dbPath);
    const statBanco = bancoExiste ? fs.statSync(db.dbPath) : null;
    const backups = listarBackups();

    return {
        versao: packageInfo.version || '1.0.0',
        nome: packageInfo.name || 'julian-play',
        uptimeSegundos: Math.floor(process.uptime()),
        dataDir: db.dataDir,
        dbPath: db.dbPath,
        bancoExiste,
        bancoTamanho: statBanco?.size || 0,
        bancoTamanhoFormatado: formatarBytes(statBanco?.size || 0),
        backupDir: BACKUP_DIR,
        totalBackups: backups.length,
        ultimoBackup: backups[0] || null,
        backups: backups.slice(0, 8),
        whatsapp: statusWhatsApp
    };
}

module.exports = {
    criarBackupManual,
    obterStatusSistema,
    formatarBytes
};
