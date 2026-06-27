const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const { criarHashSenha } = require('../services/passwordService');
const { calcularEstadoLicenca } = require('../services/licencaCalculo');
const masterDb = require('./db');

const sourceDir = path.resolve(process.env.JULIAN_PLAY_SOURCE_DIR || path.join(__dirname, '..'));
const clientesDir = path.resolve(process.env.MASTER_CLIENTS_DIR || 'C:\\JulianPlayClientes');
const arquivadosDir = path.resolve(process.env.MASTER_ARCHIVE_DIR || path.join(clientesDir, '_arquivados'));
const caddyFragmentsDir = path.resolve(process.env.MASTER_CADDY_DIR || 'C:\\JulianPlayMaster\\caddy');
const caddyExe = process.env.CADDY_EXE || 'C:\\caddy\\caddy.exe';
const caddyConfig = process.env.CADDY_CONFIG || 'C:\\caddy\\Caddyfile';
const baseDomain = String(process.env.MASTER_BASE_DOMAIN || 'julianplay.com.br').toLowerCase();
const primeiraPorta = Number(process.env.MASTER_FIRST_PORT || 11001);

function slugificar(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

function executarComando(arquivo, args = []) {
    return new Promise((resolve, reject) => {
        const extensao = path.extname(arquivo).toLowerCase();
        const executarViaCmd = process.platform === 'win32' && (extensao === '.cmd' || extensao === '.bat');
        const comando = executarViaCmd ? (process.env.ComSpec || 'cmd.exe') : arquivo;
        const argumentos = executarViaCmd ? ['/d', '/s', '/c', `"${arquivo}" ${args.map(argumentoCmd).join(' ')}`] : args;

        execFile(comando, argumentos, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
                err.detalhes = String(stderr || stdout || err.message).trim();
                return reject(err);
            }
            resolve(String(stdout || stderr || '').trim());
        });
    });
}

function argumentoCmd(valor) {
    const texto = String(valor ?? '');
    if (!/[ \t"&|<>^]/.test(texto)) return texto;
    return `"${texto.replace(/"/g, '\\"')}"`;
}

function consultarSaude(porta) {
    return new Promise((resolve) => {
        const http = require('http');
        const req = http.get({ host: '127.0.0.1', port: Number(porta), path: '/health', timeout: 1500 }, (res) => {
            let corpo = '';
            res.setEncoding('utf8');
            res.on('data', trecho => { corpo += trecho; });
            res.on('end', () => {
                try {
                    const dados = JSON.parse(corpo);
                    resolve({
                        online: res.statusCode === 200,
                        whatsapp: Boolean(dados.whatsapp?.conectado),
                        numero: String(dados.whatsapp?.numero || '').replace(/\D/g, '')
                    });
                } catch (_) {
                    resolve({ online: false, whatsapp: false, numero: '' });
                }
            });
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve({ online: false, whatsapp: false, numero: '' }));
    });
}

async function listarInstalacoes() {
    const instalacoes = await masterDb.buscarTodos('SELECT * FROM instalacoes ORDER BY datetime(criadoEm) DESC, id DESC');
    return Promise.all(instalacoes.map(async (instalacao) => {
        const dbPath = path.join(instalacao.pastaDados, 'clientes.db');
        if (!fs.existsSync(dbPath) || instalacao.status === 'arquivado') return instalacao;
        try {
            const [config, saude] = await Promise.all([
                lerConfiguracoesTenant(dbPath),
                consultarSaude(instalacao.porta)
            ]);
            return { ...instalacao, estadoLicenca: calcularEstadoLicenca(config), saude };
        } catch (_) {
            return instalacao;
        }
    }));
}

async function buscarInstalacao(id) {
    return masterDb.buscarUm('SELECT * FROM instalacoes WHERE id = ?', [id]);
}

async function proximaPorta() {
    const row = await masterDb.buscarUm('SELECT MAX(porta) AS maior FROM instalacoes');
    return Math.max(primeiraPorta, Number(row?.maior || 0) + 1);
}

function escreverArquivoSeguro(caminho, conteudo) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, conteudo, { encoding: 'utf8', mode: 0o600 });
}

function configuracaoPm2(instalacao, senhaHash) {
    const dias = Number(instalacao.diasAvaliacao || 0);
    const app = {
        apps: [{
            name: instalacao.processoPm2,
            cwd: sourceDir,
            script: path.join(sourceDir, 'bot.js'),
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            restart_delay: 10000,
            kill_timeout: 30000,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                PORT: String(instalacao.porta),
                DATA_DIR: instalacao.pastaDados,
                PANEL_USER: instalacao.usuarioPainel,
                PANEL_PASSWORD_HASH: senhaHash,
                PANEL_COOKIE_SECURE: '1',
                TRUST_PROXY: '1',
                LICENSE_ADMIN_TOKEN: instalacao.codigoFornecedor,
                LICENSE_DEFAULT_TRIAL_DAYS: String(dias),
                LICENSE_DEFAULT_MODE: dias ? 'avaliacao' : 'vitalicia',
                LICENSE_CUSTOMER_NAME: instalacao.nome,
                RENOVACAO_HORA_ENVIO: String(instalacao.horaEnvio),
                RENOVACAO_MINUTO_ENVIO: String(instalacao.minutoEnvio)
            }
        }]
    };

    return `module.exports = ${JSON.stringify(app, null, 2)};\n`;
}

function fragmentoCaddy(instalacao) {
    return `${instalacao.dominio} {\n    reverse_proxy 127.0.0.1:${instalacao.porta}\n    encode gzip\n}\n`;
}

async function recarregarCaddy() {
    if (!fs.existsSync(caddyExe) || !fs.existsSync(caddyConfig)) {
        return 'Caddy não encontrado; configure o domínio manualmente.';
    }
    await executarComando(caddyExe, ['reload', '--config', caddyConfig]);
    return '';
}

async function atualizarStatus(id, status, detalhe = '') {
    await masterDb.executar(
        'UPDATE instalacoes SET status = ?, detalheStatus = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?',
        [status, detalhe, id]
    );
}

async function criarInstalacao(dados = {}) {
    const nome = String(dados.nome || '').trim();
    const slug = slugificar(dados.slug || nome);
    const usuarioPainel = String(dados.usuarioPainel || 'admin').trim();
    const senha = String(dados.senhaPainel || '');
    const whatsappEsperado = String(dados.whatsappEsperado || '').replace(/\D/g, '');
    const tipo = String(dados.tipoLicenca || 'avaliacao_15');
    const diasAvaliacao = tipo === 'avaliacao_30' ? 30 : tipo === 'avaliacao_15' ? 15 : 0;
    const horaEnvio = Number(dados.horaEnvio ?? 9);
    const minutoEnvio = Number(dados.minutoEnvio ?? 0);

    if (!nome) throw new Error('Informe o nome do cliente.');
    if (!slug) throw new Error('Informe um identificador válido para a URL.');
    if (!usuarioPainel) throw new Error('Informe o usuário do painel.');
    if (senha.length < 8) throw new Error('A senha inicial precisa ter pelo menos 8 caracteres.');
    if (whatsappEsperado.length < 10 || whatsappEsperado.length > 15) throw new Error('Informe o WhatsApp que sera conectado ao robo, com DDD.');
    if (!Number.isInteger(horaEnvio) || horaEnvio < 0 || horaEnvio > 23) throw new Error('Informe uma hora de envio entre 0 e 23.');
    if (!Number.isInteger(minutoEnvio) || minutoEnvio < 0 || minutoEnvio > 59) throw new Error('Informe um minuto de envio entre 0 e 59.');

    const porta = await proximaPorta();
    const pastaDados = path.join(clientesDir, slug);
    const dominio = `${slug}.${baseDomain}`;
    const processoPm2 = `julian-${slug}`;
    const codigoFornecedor = crypto.randomBytes(16).toString('hex').toUpperCase();

    const resultado = await masterDb.executar(
        `INSERT INTO instalacoes
        (nome, slug, dominio, porta, pastaDados, processoPm2, usuarioPainel, tipoLicenca, diasAvaliacao,
         codigoFornecedor, whatsappEsperado, horaEnvio, minutoEnvio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, slug, dominio, porta, pastaDados, processoPm2, usuarioPainel, tipo, diasAvaliacao,
            codigoFornecedor, whatsappEsperado, horaEnvio, minutoEnvio]
    );
    const instalacao = await buscarInstalacao(resultado.id);

    try {
        fs.mkdirSync(clientesDir, { recursive: true });
        fs.mkdirSync(pastaDados, { recursive: false });
        const ecossistema = path.join(pastaDados, 'ecosystem.config.cjs');
        escreverArquivoSeguro(ecossistema, configuracaoPm2(instalacao, criarHashSenha(senha)));
        escreverArquivoSeguro(path.join(caddyFragmentsDir, `${slug}.caddy`), fragmentoCaddy(instalacao));
        await executarComando('pm2.cmd', ['start', ecossistema, '--only', processoPm2]);
        const bancoTenant = path.join(pastaDados, 'clientes.db');
        for (let tentativa = 0; tentativa < 60 && !fs.existsSync(bancoTenant); tentativa += 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!fs.existsSync(bancoTenant)) throw new Error('O banco isolado não foi criado dentro do tempo esperado. Consulte os logs do processo.');
        await executarComando('pm2.cmd', ['save', '--force']);
        const avisoCaddy = await recarregarCaddy();
        await atualizarStatus(instalacao.id, 'ativo', avisoCaddy);
        return { ...(await buscarInstalacao(instalacao.id)), senhaInicial: senha };
    } catch (err) {
        await atualizarStatus(instalacao.id, 'erro', err.detalhes || err.message);
        throw err;
    }
}

function salvarConfiguracoesTenant(dbPath, valores) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.serialize(() => {
            const stmt = db.prepare(`INSERT INTO configuracoes (chave, valor, atualizadoEm)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizadoEm = CURRENT_TIMESTAMP`);
            Object.entries(valores).forEach(([chave, valor]) => stmt.run(chave, String(valor)));
            stmt.finalize((err) => db.close(() => err ? reject(err) : resolve()));
        });
    });
}

function lerConfiguracoesTenant(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.all('SELECT chave, valor FROM configuracoes', (err, rows) => {
            db.close();
            if (err) return reject(err);
            resolve((rows || []).reduce((config, row) => {
                config[row.chave] = row.valor || '';
                return config;
            }, {}));
        });
    });
}

async function suspenderInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    await salvarConfiguracoesTenant(path.join(instalacao.pastaDados, 'clientes.db'), {
        licencaBloqueioAtivo: '1',
        licencaSuspensa: '1'
    });
    await atualizarStatus(id, 'suspenso', 'Licença suspensa pelo Painel Mestre.');
}

async function tornarVitalicia(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    await salvarConfiguracoesTenant(path.join(instalacao.pastaDados, 'clientes.db'), {
        licencaCliente: instalacao.nome,
        licencaTipo: 'vitalicia',
        licencaVitalicia: '1',
        licencaVencimento: '',
        licencaBloqueioAtivo: '1',
        licencaSuspensa: '0'
    });
    await masterDb.executar(
        `UPDATE instalacoes SET tipoLicenca = 'vitalicia', diasAvaliacao = 0,
         status = 'ativo', detalheStatus = '', atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
    );
}

function caminhoDentro(caminho, raiz) {
    const alvo = path.resolve(caminho);
    const base = `${path.resolve(raiz)}${path.sep}`;
    return alvo.startsWith(base) && alvo !== path.resolve(raiz);
}

async function arquivarInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (!caminhoDentro(instalacao.pastaDados, clientesDir)) throw new Error('Pasta da instalação fora da área permitida.');

    try { await executarComando('pm2.cmd', ['delete', instalacao.processoPm2]); } catch (_) { /* Processo já ausente. */ }
    await executarComando('pm2.cmd', ['save', '--force']);
    const fragmento = path.join(caddyFragmentsDir, `${instalacao.slug}.caddy`);
    if (fs.existsSync(fragmento)) fs.unlinkSync(fragmento);
    try { await recarregarCaddy(); } catch (_) { /* Registro já foi removido do disco. */ }

    fs.mkdirSync(arquivadosDir, { recursive: true });
    const destino = path.join(arquivadosDir, `${instalacao.slug}-${Date.now()}`);
    if (fs.existsSync(instalacao.pastaDados)) fs.renameSync(instalacao.pastaDados, destino);
    await masterDb.executar(
        `UPDATE instalacoes SET pastaDados = ?, status = 'arquivado', detalheStatus = 'Arquivado com segurança', atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [destino, id]
    );
}

async function excluirDefinitivamente(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao || instalacao.status !== 'arquivado') throw new Error('Somente instalações arquivadas podem ser excluídas.');
    if (!caminhoDentro(instalacao.pastaDados, arquivadosDir)) throw new Error('Pasta arquivada fora da área permitida.');
    if (fs.existsSync(instalacao.pastaDados)) fs.rmSync(instalacao.pastaDados, { recursive: true, force: true });
    await masterDb.executar('DELETE FROM instalacoes WHERE id = ?', [id]);
}

module.exports = {
    sourceDir,
    clientesDir,
    arquivadosDir,
    caddyFragmentsDir,
    baseDomain,
    listarInstalacoes,
    criarInstalacao,
    suspenderInstalacao,
    tornarVitalicia,
    arquivarInstalacao,
    excluirDefinitivamente
};
