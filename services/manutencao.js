const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const db = require('../database/sqlite');
const packageInfo = require('../package.json');
const { obterConfiguracoes } = require('./configuracoesPainel');
const { listarEventosSistema, registrarEventoSistema } = require('./eventosSistema');
const { calcularEstadoLicenca } = require('./licencaCalculo');
const { obterStatusFilaMensagens } = require('./filaMensagensService');
const { listarAtendimentosHumanos } = require('./conversaService');
const { obterEstadoMigracoes } = require('../database/migrations/runner');

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

function minutosDesde(valor) {
    if (!valor) return null;
    const data = new Date(valor).getTime();
    if (!data) return null;
    return Math.floor((Date.now() - data) / 60000);
}

function calcularRiscoWhatsApp(statusWhatsApp = {}, fila = {}) {
    const pontos = [];
    let score = 0;
    const conectado = Boolean(statusWhatsApp.conectado);

    if (!conectado) {
        score += statusWhatsApp.temQr ? 2 : 3;
        pontos.push(statusWhatsApp.temQr ? 'Aguardando leitura de QR Code.' : 'WhatsApp desconectado.');
    }

    const minutosQr = minutosDesde(statusWhatsApp.ultimoQrEm);
    if (!conectado && minutosQr !== null && minutosQr <= 30) {
        score += 1;
        pontos.push(`QR Code gerado há ${minutosQr} minuto(s).`);
    }

    if (!conectado && Number(statusWhatsApp.eventosInternosIgnoradosTotal || 0) > 50) {
        score += 1;
        pontos.push('Muitos eventos internos ignorados nesta execução.');
    }

    if (Number(statusWhatsApp.conversasNaoIndividuaisIgnoradasTotal || 0) > 20) {
        score += 1;
        pontos.push('Muitas mensagens de grupos/newsletters foram ignoradas.');
    }

    if (Number(fila.pendentes || 0) > 5) {
        score += 2;
        pontos.push('Fila de WhatsApp com muitos envios pendentes.');
    }

    if (fila.ultimoErro) {
        score += 2;
        pontos.push(`Último erro de envio: ${fila.ultimoErro}`);
    }

    const nivel = score >= 4 ? 'alto' : score >= 2 ? 'atenção' : 'baixo';
    const recomendacao = nivel === 'alto'
        ? 'Evite disparos em massa agora e verifique QR Code, conexão e logs.'
        : nivel === 'atenção'
            ? 'Acompanhe antes de fazer muitos envios.'
            : 'Operação normal.';

    return {
        nivel,
        score,
        pontos,
        recomendacao
    };
}

function listarBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    return fs.readdirSync(BACKUP_DIR)
        .filter(nome => nome.toLowerCase().endsWith('.db'))
        .map(nome => {
            const caminho = path.join(BACKUP_DIR, nome);
            const stat = fs.statSync(caminho);
            let manifesto = null;
            try { manifesto = JSON.parse(fs.readFileSync(`${caminho}.json`, 'utf8')); } catch (_) { /* Backup antigo. */ }

            return {
                nome,
                caminho,
                tamanho: stat.size,
                tamanhoFormatado: formatarBytes(stat.size),
                criadoEm: stat.mtime,
                integridade: manifesto?.integridade || 'nao_verificado',
                hashSha256: manifesto?.hashSha256 || '',
                verificadoEm: manifesto?.verificadoEm || '',
                restauracaoTeste: manifesto?.restauracaoTeste || 'nao_testada'
            };
        })
        .sort((a, b) => b.criadoEm - a.criadoEm);
}

function hashArquivo(caminho) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(caminho).on('error', reject).on('data', bloco => hash.update(bloco)).on('end', () => resolve(hash.digest('hex')));
    });
}

function quickCheckArquivo(caminho) {
    return new Promise((resolve, reject) => {
        const banco = new sqlite3.Database(caminho, sqlite3.OPEN_READONLY, (erro) => {
            if (erro) return reject(erro);
            banco.get('PRAGMA quick_check', (err, row) => {
                const resultado = String(row?.quick_check || Object.values(row || {})[0] || '');
                banco.close();
                if (err) return reject(err);
                if (resultado.toLowerCase() !== 'ok') return reject(new Error(resultado || 'Integridade SQLite invalida.'));
                resolve('ok');
            });
        });
    });
}

async function verificarArquivoBackup(caminho, testarRestauracao = true) {
    const stat = fs.statSync(caminho);
    await quickCheckArquivo(caminho);
    let restauracaoTeste = 'nao_testada';
    if (testarRestauracao) {
        const temporario = path.join(os.tmpdir(), `julian-backup-test-${crypto.randomUUID()}.db`);
        try { fs.copyFileSync(caminho, temporario); await quickCheckArquivo(temporario); restauracaoTeste = 'aprovada'; }
        finally { try { fs.unlinkSync(temporario); } catch (_) { /* temporario opcional */ } }
    }
    const manifesto = { versao: 1, arquivo: path.basename(caminho), tamanho: stat.size, criadoEm: stat.mtime.toISOString(),
        hashSha256: await hashArquivo(caminho), integridade: 'ok', restauracaoTeste, verificadoEm: new Date().toISOString() };
    fs.writeFileSync(`${caminho}.json`, JSON.stringify(manifesto, null, 2));
    return manifesto;
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
        verificacoes.push(criarResultadoDiagnostico('Webhook', 'ok', 'Webhook opcional nao configurado.'));
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
    const manifesto = await verificarArquivoBackup(destino, true);
    await registrarEventoSistema('backup_verificado', 'sucesso', `Backup verificado: ${nome}.`, manifesto);
    return {
        nome,
        caminho: destino,
        tamanho: fs.statSync(destino).size,
        ...manifesto
    };
}

async function exportarBackupCriptografado(nomeBackup, senha) {
    const nome = path.basename(String(nomeBackup || ''));
    if (!nome.endsWith('.db') || String(senha || '').length < 10) throw new Error('Informe um backup valido e senha com pelo menos 10 caracteres.');
    const origem = path.join(BACKUP_DIR, nome); if (!fs.existsSync(origem)) throw new Error('Backup nao encontrado.');
    await verificarArquivoBackup(origem, true);
    const arquivoInstalacao = path.join(__dirname, '..', '.julian-play-install.json');
    let configuracaoInstalacao = '';
    try { configuracaoInstalacao = fs.readFileSync(arquivoInstalacao, 'utf8'); } catch (_) { /* Instalações provisionadas usam o ambiente PM2. */ }
    const pacote = Buffer.from(JSON.stringify({
        formato: 'JPLAYBK2',
        criadoEm: new Date().toISOString(),
        bancoNome: nome,
        bancoBase64: fs.readFileSync(origem).toString('base64'),
        recuperacao: {
            configuracaoInstalacao,
            licenseAdminToken: String(process.env.LICENSE_ADMIN_TOKEN || ''),
            julianSecretKey: String(process.env.JULIAN_SECRET_KEY || '')
        }
    }), 'utf8');
    const salt=crypto.randomBytes(16), iv=crypto.randomBytes(12), chave=crypto.scryptSync(senha,salt,32), cifra=crypto.createCipheriv('aes-256-gcm',chave,iv);
    const criptografado=Buffer.concat([cifra.update(pacote),cifra.final()]); const tag=cifra.getAuthTag();
    const destino=path.join(BACKUP_DIR,`${nome}.jplaybackup`);
    fs.writeFileSync(destino,Buffer.concat([Buffer.from('JPLAYBK2'),salt,iv,tag,criptografado]));
    await registrarEventoSistema('backup_exportado', 'info', `Kit de recuperação criptografado exportado: ${path.basename(destino)}.`, { arquivo:nome, tamanho:fs.statSync(destino).size, formato:'JPLAYBK2' });
    return destino;
}

function aplicarRetencaoBackupsExternos(pastaExterna, maximoBackups = 5) {
    const pastaInformada = String(pastaExterna || '').trim();
    const maximo = Math.max(1, Math.min(100, Number.parseInt(maximoBackups, 10) || 5));
    if (!pastaInformada || !path.isAbsolute(pastaInformada)) throw new Error('Informe uma pasta externa absoluta.');
    const pasta = path.resolve(pastaInformada);
    if (!fs.existsSync(pasta)) return { removidos: 0, mantidos: 0, maximo, pasta };

    const backups = fs.readdirSync(pasta)
        .filter(nome => /^clientes(?:-auto)?-\d{8}-\d{6}\.db$/.test(nome))
        .map(nome => {
            const caminho = path.join(pasta, nome);
            const stat = fs.statSync(caminho);
            return { nome, caminho, criadoEm: stat.mtimeMs };
        })
        .sort((a, b) => b.criadoEm - a.criadoEm || b.nome.localeCompare(a.nome));

    let removidos = 0;
    for (const backup of backups.slice(maximo)) {
        fs.unlinkSync(backup.caminho);
        try { fs.unlinkSync(`${backup.caminho}.json`); } catch (_) { /* manifesto opcional */ }
        removidos += 1;
    }

    return {
        removidos,
        mantidos: Math.min(backups.length, maximo),
        maximo,
        pasta
    };
}

async function copiarBackupExterno(nomeBackup, pastaExterna, maximoBackups = 5) {
    const nome=path.basename(String(nomeBackup||'')); const origem=path.join(BACKUP_DIR,nome);
    if(!nome.endsWith('.db')||!fs.existsSync(origem))throw new Error('Backup nao encontrado.');
    const pastaInformada=String(pastaExterna||'').trim(); if(!pastaInformada||!path.isAbsolute(pastaInformada))throw new Error('Informe uma pasta externa absoluta.');
    const destinoBase=path.resolve(pastaInformada);
    await verificarArquivoBackup(origem,true); fs.mkdirSync(destinoBase,{recursive:true});
    const destino=path.join(destinoBase,nome); fs.copyFileSync(origem,destino); fs.copyFileSync(`${origem}.json`,`${destino}.json`);
    const retencao = aplicarRetencaoBackupsExternos(destinoBase, maximoBackups);
    await registrarEventoSistema('backup_copia_externa','info',`Backup copiado para armazenamento externo: ${nome}.`,{destino:destinoBase,retencao}); return destino;
}

function criarBackupManual() {
    return criarBackup('clientes');
}

function criarBackupAutomatico() {
    return criarBackup('clientes-auto');
}

async function criarBackupManualComCopiaExterna(config = {}) {
    const backup = await criarBackupManual();
    const copiaExternaSolicitada = String(config.backupExternoAtivo) === '1';
    let copiaExterna = '';
    let erroCopiaExterna = '';

    if (copiaExternaSolicitada) {
        try {
            copiaExterna = await copiarBackupExterno(
                backup.nome,
                config.backupExternoPasta,
                config.backupExternoMaximo || 5
            );
        } catch (err) {
            erroCopiaExterna = String(err?.message || err || 'Falha desconhecida.');
            await registrarEventoSistema(
                'backup_copia_externa',
                'erro',
                `Backup local criado, mas a copia externa falhou: ${erroCopiaExterna}`,
                { arquivo: backup.nome, pasta: String(config.backupExternoPasta || '') }
            );
        }
    }

    return {
        backup,
        copiaExternaSolicitada,
        copiaExterna,
        erroCopiaExterna
    };
}

function chaveSemana(data) {
    const utc = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
    const dia = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dia);
    const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const semana = Math.ceil((((utc - inicioAno) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

function listarBackupsDaPasta(pasta) {
    if (!fs.existsSync(pasta)) return [];
    return fs.readdirSync(pasta)
        .filter(nome => nome.startsWith('clientes-auto-') && nome.endsWith('.db'))
        .map(nome => {
            const caminho = path.join(pasta, nome);
            const stat = fs.statSync(caminho);
            return { nome, caminho, criadoEm: stat.mtime };
        })
        .sort((a, b) => b.criadoEm - a.criadoEm);
}

function aplicarPoliticaRetencaoBackups(opcoes = {}) {
    const pasta = path.resolve(opcoes.pasta || BACKUP_DIR);
    const dias = Math.max(1, Number(opcoes.dias || 30));
    const semanas = Math.max(1, Number(opcoes.semanas || 12));
    const meses = Math.max(1, Number(opcoes.meses || 12));
    const agora = opcoes.agora instanceof Date ? opcoes.agora : new Date();
    const backups = listarBackupsDaPasta(pasta);
    const manter = new Set();
    const diasVistos = new Set();
    const semanasVistas = new Set();
    const mesesVistos = new Set();

    for (const backup of backups) {
        const idadeDias = Math.floor((agora.getTime() - backup.criadoEm.getTime()) / 86400000);
        const chaveDia = backup.criadoEm.toISOString().slice(0, 10);
        const semana = chaveSemana(backup.criadoEm);
        const chaveMes = backup.criadoEm.toISOString().slice(0, 7);
        const idadeSemanas = Math.floor(idadeDias / 7);
        const idadeMeses = (agora.getUTCFullYear() - backup.criadoEm.getUTCFullYear()) * 12
            + agora.getUTCMonth() - backup.criadoEm.getUTCMonth();

        if (idadeDias < dias && !diasVistos.has(chaveDia)) {
            manter.add(backup.caminho);
            diasVistos.add(chaveDia);
        }
        if (idadeSemanas < semanas && !semanasVistas.has(semana)) {
            manter.add(backup.caminho);
            semanasVistas.add(semana);
        }
        if (idadeMeses < meses && !mesesVistos.has(chaveMes)) {
            manter.add(backup.caminho);
            mesesVistos.add(chaveMes);
        }
    }

    let removidos = 0;
    for (const backup of backups) {
        if (manter.has(backup.caminho)) continue;
        fs.unlinkSync(backup.caminho);
        try { fs.unlinkSync(`${backup.caminho}.json`); } catch (_) { /* manifesto opcional */ }
        removidos += 1;
    }
    return { removidos, mantidos: manter.size, dias, semanas, meses, pasta };
}

function limparBackupsAutomaticos(retencaoDias = 30) {
    return aplicarPoliticaRetencaoBackups({ dias: retencaoDias }).removidos;
}

async function executarExercicioRestauracaoMensal(nomeBackup = '') {
    const backup = nomeBackup
        ? listarBackups().find(item => item.nome === path.basename(nomeBackup))
        : listarBackups().find(item => item.integridade === 'ok');
    if (!backup) throw new Error('Nenhum backup verificado disponível para o exercício de restauração.');

    const pastaTeste = fs.mkdtempSync(path.join(os.tmpdir(), 'julian-restauracao-mensal-'));
    const restaurado = path.join(pastaTeste, 'clientes-restaurado.db');
    const iniciadoEm = new Date().toISOString();
    try {
        fs.copyFileSync(backup.caminho, restaurado);
        await quickCheckArquivo(restaurado);
        const diagnostico = await new Promise((resolve, reject) => {
            const banco = new sqlite3.Database(restaurado, (erro) => {
                if (erro) return reject(erro);
                banco.get(`SELECT
                    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table') AS tabelas,
                    (SELECT COUNT(*) FROM clientes) AS clientes`, (err, row) => {
                    banco.close();
                    err ? reject(err) : resolve(row);
                });
            });
        });
        const relatorio = {
            status: 'aprovado',
            backup: backup.nome,
            hashSha256: await hashArquivo(restaurado),
            iniciadoEm,
            concluidoEm: new Date().toISOString(),
            tabelas: Number(diagnostico.tabelas || 0),
            clientes: Number(diagnostico.clientes || 0)
        };
        fs.writeFileSync(path.join(BACKUP_DIR, 'ultimo-exercicio-restauracao.json'), JSON.stringify(relatorio, null, 2));
        const manifesto = JSON.parse(fs.readFileSync(`${backup.caminho}.json`, 'utf8'));
        manifesto.ultimoExercicioRestauracao = relatorio;
        fs.writeFileSync(`${backup.caminho}.json`, JSON.stringify(manifesto, null, 2));
        await registrarEventoSistema('backup_restauracao_mensal', 'sucesso',
            `Exercício mensal de restauração aprovado: ${backup.nome}.`, relatorio);
        return relatorio;
    } finally {
        fs.rmSync(pastaTeste, { recursive: true, force: true });
    }
}

function obterRelatorioUltimaRestauracao() {
    try {
        return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'ultimo-exercicio-restauracao.json'), 'utf8'));
    } catch (_) {
        return null;
    }
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
    await verificarArquivoBackup(origem, true);

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

    const memoria = process.memoryUsage();
    const bancoExiste = fs.existsSync(db.dbPath);
    const statBanco = bancoExiste ? fs.statSync(db.dbPath) : null;
    const backups = listarBackups();
    const ultimaRestauracaoTestada = obterRelatorioUltimaRestauracao();
    const migracoes = await obterEstadoMigracoes(db);
    const config = await obterConfiguracoes();
    const eventos = await listarEventosSistema(15);
    const filaMensagens = obterStatusFilaMensagens();
    const atendimentoHumanoMs = Math.max(1, Number.parseInt(config.roboAtendimentoHumanoMinutos || 30, 10) || 30) * 60 * 1000;
    const atendimentosHumanos = listarAtendimentosHumanos({ atendimentoHumanoMs });
    const riscoWhatsApp = calcularRiscoWhatsApp(statusWhatsApp, filaMensagens);
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
        memoria: {
            rss: memoria.rss,
            rssFormatado: formatarBytes(memoria.rss),
            heapUsado: memoria.heapUsed,
            heapUsadoFormatado: formatarBytes(memoria.heapUsed),
            heapTotal: memoria.heapTotal,
            heapTotalFormatado: formatarBytes(memoria.heapTotal)
        },
        dataDir: db.dataDir,
        dbPath: db.dbPath,
        bancoExiste,
        bancoTamanho: statBanco?.size || 0,
        bancoTamanhoFormatado: formatarBytes(statBanco?.size || 0),
        backupDir: BACKUP_DIR,
        totalBackups: backups.length,
        ultimoBackup: backups[0] || null,
        backupRecente: Boolean(backups[0] && Date.now() - backups[0].criadoEm.getTime() <= 36 * 60 * 60 * 1000),
        ultimoBackupRecuperavel: ultimaRestauracaoTestada?.status === 'aprovado' ? ultimaRestauracaoTestada : null,
        migracoes,
        backups: backups.slice(0, 6),
        eventos,
        diagnostico,
        config,
        licenca: calcularLicenca(config),
        whatsapp: statusWhatsApp,
        filaMensagens,
        atendimentosHumanos,
        riscoWhatsApp,
        recuperacaoWhatsApp: statusWhatsApp.ultimaRecuperacaoWhatsApp || null,
        verificacaoSaudeWhatsApp: statusWhatsApp.ultimaVerificacaoSaude || null,
        saudeRobo: {
            whatsappConectado: Boolean(statusWhatsApp.conectado),
            whatsappStatus: statusWhatsApp.status || '',
            numeroConectado: statusWhatsApp.numeroConectado || '',
            mensagensRecebidasTotal: statusWhatsApp.mensagensRecebidasTotal || 0,
            ultimaMensagemRecebidaEm: statusWhatsApp.ultimaMensagemRecebidaEm || null,
            ultimaMensagemRecebidaDe: statusWhatsApp.ultimaMensagemRecebidaDe || '',
            ultimoEnvioRoboEm: statusWhatsApp.ultimoEnvioRoboEm || null,
            ultimoEnvioRoboPara: statusWhatsApp.ultimoEnvioRoboPara || '',
            eventosIgnoradosTotal: Number(statusWhatsApp.eventosInternosIgnoradosTotal || 0) + Number(statusWhatsApp.conversasNaoIndividuaisIgnoradasTotal || 0),
            eventosInternosIgnoradosTotal: statusWhatsApp.eventosInternosIgnoradosTotal || 0,
            conversasNaoIndividuaisIgnoradasTotal: statusWhatsApp.conversasNaoIndividuaisIgnoradasTotal || 0,
            ultimoEventoIgnoradoEm: statusWhatsApp.ultimoEventoIgnoradoEm || null
        }
    };
}

module.exports = {
    criarBackupManual,
    criarBackupManualComCopiaExterna,
    criarBackupAutomatico,
    limparBackupsAutomaticos,
    aplicarPoliticaRetencaoBackups,
    aplicarRetencaoBackupsExternos,
    executarExercicioRestauracaoMensal,
    obterRelatorioUltimaRestauracao,
    restaurarBackup,
    executarDiagnosticoSistema,
    obterStatusSistema,
    formatarBytes
    ,listarBackups
    ,verificarArquivoBackup
    ,exportarBackupCriptografado
    ,copiarBackupExterno
};
