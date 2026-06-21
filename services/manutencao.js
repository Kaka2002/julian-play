const fs = require('fs');
const path = require('path');
const db = require('../database/sqlite');
const packageInfo = require('../package.json');
const { obterConfiguracoes } = require('./configuracoesPainel');
const { listarEventosSistema, registrarEventoSistema } = require('./eventosSistema');
const { calcularEstadoLicenca } = require('./licencaService');

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

function calcularLicenca(config = {}) {
    return calcularEstadoLicenca(config);
}

function verificarBancoDados() {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get('PRAGMA quick_check', (err, row) => {
            if (err) return reject(err);
            const resultado = String(row?.quick_check || Object.values(row || {})[0] || '');
            if (resultado.toLowerCase() !== 'ok') {
                return reject(new Error(resultado || 'Falha na verificação de integridade.'));
            }
            resolve(true);
        });
    }));
}

function criarResultadoDiagnostico(nome, status, mensagem) {
    return { nome, status, mensagem };
}

async function executarDiagnosticoSistema(statusWhatsApp = {}, testarWebhook = null) {
    const config = await obterConfiguracoes();
    const licenca = calcularLicenca(config);
    const verificacoes = [];

    try {
        await verificarBancoDados();
        verificacoes.push(criarResultadoDiagnostico('Banco de dados', 'ok', 'Integridade verificada com sucesso.'));
    } catch (err) {
        verificacoes.push(criarResultadoDiagnostico('Banco de dados', 'erro', err.message));
    }

    let backupDiagnostico = null;
    try {
        backupDiagnostico = await criarBackup('diagnostico');
        fs.unlinkSync(backupDiagnostico.caminho);
        verificacoes.push(criarResultadoDiagnostico('Backup', 'ok', 'Criação e remoção do backup de teste concluídas.'));
    } catch (err) {
        if (backupDiagnostico?.caminho && fs.existsSync(backupDiagnostico.caminho)) {
            try { fs.unlinkSync(backupDiagnostico.caminho); } catch (_) { /* Mantém o diagnóstico original. */ }
        }
        verificacoes.push(criarResultadoDiagnostico('Backup', 'erro', err.message));
    }

    try {
        const disco = fs.statfsSync(db.dataDir);
        const livres = Number(disco.bavail) * Number(disco.bsize);
        const status = livres < 250 * 1024 * 1024 ? 'erro' : livres < 1024 * 1024 * 1024 ? 'atencao' : 'ok';
        verificacoes.push(criarResultadoDiagnostico('Espaço em disco', status, `${formatarBytes(livres)} disponíveis.`));
    } catch (err) {
        verificacoes.push(criarResultadoDiagnostico('Espaço em disco', 'atencao', `Não foi possível consultar: ${err.message}`));
    }

    verificacoes.push(criarResultadoDiagnostico(
        'WhatsApp',
        statusWhatsApp.conectado ? 'ok' : 'erro',
        statusWhatsApp.conectado ? 'Conectado e disponível.' : `Desconectado (${statusWhatsApp.status || 'status desconhecido'}).`
    ));

    const acessoConfigurado = Boolean(config.painelUsuario && config.painelSenhaHash);
    verificacoes.push(criarResultadoDiagnostico(
        'Acesso administrativo',
        acessoConfigurado ? 'ok' : 'erro',
        acessoConfigurado ? 'Usuário e senha configurados no banco.' : 'Configure o usuário e a senha do painel.'
    ));

    const pixConfigurado = Boolean(config.pixChave && config.pixNome && config.pixCidade);
    verificacoes.push(criarResultadoDiagnostico(
        'PIX',
        pixConfigurado ? 'ok' : 'atencao',
        pixConfigurado ? 'Dados de recebimento configurados.' : 'Complete os dados PIX para cobranças.'
    ));

    const statusLicenca = licenca.status === 'ativa'
        ? 'ok'
        : licenca.status === 'vencendo' || licenca.status === 'nao_configurada'
            ? 'atencao'
            : 'erro';
    verificacoes.push(criarResultadoDiagnostico('Licença', statusLicenca, `${licenca.rotulo}${licenca.diasRestantes !== null ? `: ${licenca.diasRestantes} dia(s)` : ''}.`));

    if (config.alertaWebhookUrl && typeof testarWebhook === 'function') {
        try {
            await testarWebhook(config.alertaWebhookUrl);
            verificacoes.push(criarResultadoDiagnostico('Webhook', 'ok', 'Alerta de diagnóstico recebido pelo serviço externo.'));
        } catch (err) {
            verificacoes.push(criarResultadoDiagnostico('Webhook', 'erro', err.message));
        }
    } else {
        verificacoes.push(criarResultadoDiagnostico('Webhook', 'atencao', 'Nenhum webhook configurado.'));
    }

    const temErro = verificacoes.some(item => item.status === 'erro');
    const temAtencao = verificacoes.some(item => item.status === 'atencao');
    const statusGeral = temErro ? 'erro' : temAtencao ? 'atencao' : 'ok';
    const mensagem = statusGeral === 'ok'
        ? 'Diagnóstico concluído: sistema saudável.'
        : statusGeral === 'atencao'
            ? 'Diagnóstico concluído com pontos de atenção.'
            : 'Diagnóstico encontrou itens que precisam de correção.';

    await registrarEventoSistema('diagnostico', statusGeral === 'atencao' ? 'alerta' : statusGeral, mensagem, {
        status: statusGeral,
        verificacoes
    });

    return { status: statusGeral, mensagem, verificacoes };
}

async function criarBackup(prefixo = 'clientes') {
    await db.ready;

    if (!fs.existsSync(db.dbPath)) {
        throw new Error('Banco de dados não encontrado para backup.');
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const nome = `${prefixo}-${timestampArquivo()}.db`;
    const destino = path.join(BACKUP_DIR, nome);

    fs.copyFileSync(db.dbPath, destino);

    return {
        nome,
        caminho: destino,
        tamanho: fs.statSync(destino).size
    };
}

function criarBackupManual() {
    return criarBackup('clientes');
}

function criarBackupAutomatico() {
    return criarBackup('clientes-auto');
}

function limparBackupsAutomaticos(retencaoDias = 30) {
    if (!fs.existsSync(BACKUP_DIR)) return 0;

    const limite = Date.now() - Math.max(1, Number(retencaoDias || 30)) * 86400000;
    let removidos = 0;

    listarBackups().forEach((backup) => {
        if (!backup.nome.startsWith('clientes-auto-')) return;
        if (backup.criadoEm.getTime() >= limite) return;

        fs.unlinkSync(backup.caminho);
        removidos += 1;
    });

    return removidos;
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
    const eventos = await listarEventosSistema(20);
    const ultimoEventoDiagnostico = eventos.find(evento => evento.tipo === 'diagnostico');
    let diagnostico = null;

    if (ultimoEventoDiagnostico?.detalhes) {
        try {
            diagnostico = JSON.parse(ultimoEventoDiagnostico.detalhes);
            diagnostico.mensagem = ultimoEventoDiagnostico.mensagem;
            diagnostico.criadoEm = ultimoEventoDiagnostico.criadoEm;
        } catch (_) {
            diagnostico = null;
        }
    }

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
        eventos,
        diagnostico,
        config,
        licenca: calcularLicenca(config),
        whatsapp: statusWhatsApp
    };
}

module.exports = {
    criarBackupManual,
    criarBackupAutomatico,
    limparBackupsAutomaticos,
    restaurarBackup,
    executarDiagnosticoSistema,
    obterStatusSistema,
    formatarBytes
};
