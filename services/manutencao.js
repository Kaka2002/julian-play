const fs = require('fs');
const path = require('path');
const db = require('../database/sqlite');
const packageInfo = require('../package.json');
const { obterConfiguracoes } = require('./configuracoesPainel');

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

function dataISOHoje() {
    const data = new Date();
    data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
    return data.toISOString().slice(0, 10);
}

function calcularLicenca(config = {}) {
    const vencimento = String(config.licencaVencimento || '').slice(0, 10);
    const hoje = dataISOHoje();
    let diasRestantes = null;
    let status = 'nao_configurada';
    let rotulo = 'Não configurada';

    if (vencimento) {
        const hojeData = new Date(`${hoje}T00:00:00`);
        const vencimentoData = new Date(`${vencimento}T00:00:00`);
        diasRestantes = Math.ceil((vencimentoData - hojeData) / 86400000);

        if (diasRestantes < 0) {
            status = 'vencida';
            rotulo = 'Vencida';
        } else if (diasRestantes <= 7) {
            status = 'vencendo';
            rotulo = 'Vencendo';
        } else {
            status = 'ativa';
            rotulo = 'Ativa';
        }
    }

    return {
        cliente: config.licencaCliente || '',
        telefone: config.licencaTelefone || '',
        ativacao: config.licencaAtivacao || '',
        vencimento,
        observacoes: config.licencaObservacoes || '',
        diasRestantes,
        status,
        rotulo
    };
}

async function criarBackupManual() {
    await db.ready;

    if (!fs.existsSync(db.dbPath)) {
        throw new Error('Banco de dados não encontrado para backup.');
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

async function restaurarBackup(nomeBackup) {
    await db.ready;

    const nomeSeguro = path.basename(String(nomeBackup || ''));
    if (!nomeSeguro || !nomeSeguro.toLowerCase().endsWith('.db')) {
        throw new Error('Backup invalido para restauracao.');
    }

    const origem = path.join(BACKUP_DIR, nomeSeguro);
    if (!fs.existsSync(origem)) {
        throw new Error('Arquivo de backup nao encontrado.');
    }

    if (!fs.existsSync(db.dbPath)) {
        throw new Error('Banco atual não encontrado para criar cópia de segurança.');
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const nomeAntesRestaurar = `antes-restaurar-${timestampArquivo()}.db`;
    const caminhoAntesRestaurar = path.join(BACKUP_DIR, nomeAntesRestaurar);

    fs.copyFileSync(db.dbPath, caminhoAntesRestaurar);
    fs.copyFileSync(origem, db.dbPath);

    return {
        restaurado: nomeSeguro,
        backupAnterior: nomeAntesRestaurar
    };
}

async function obterStatusSistema(statusWhatsApp = {}) {
    await db.ready;

    const bancoExiste = fs.existsSync(db.dbPath);
    const statBanco = bancoExiste ? fs.statSync(db.dbPath) : null;
    const backups = listarBackups();
    const config = await obterConfiguracoes();

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
        config,
        licenca: calcularLicenca(config),
        whatsapp: statusWhatsApp
    };
}

module.exports = {
    criarBackupManual,
    restaurarBackup,
    obterStatusSistema,
    formatarBytes
};
