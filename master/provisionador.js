const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const { criarHashSenha } = require('../services/passwordService');
const { dataHojeSaoPaulo, adicionarDias, calcularEstadoLicenca } = require('../services/licencaCalculo');
const masterDb = require('./db');

const sourceDir = path.resolve(process.env.JULIAN_PLAY_SOURCE_DIR || path.join(__dirname, '..'));
const clientesDir = path.resolve(process.env.MASTER_CLIENTS_DIR || 'C:\\JulianPlayClientes');
const arquivadosDir = path.resolve(process.env.MASTER_ARCHIVE_DIR || path.join(clientesDir, '_arquivados'));
const caddyFragmentsDir = path.resolve(process.env.MASTER_CADDY_DIR || 'C:\\JulianPlayMaster\\caddy');
const caddyExe = process.env.CADDY_EXE || 'C:\\caddy\\caddy.exe';
const caddyConfig = process.env.CADDY_CONFIG || 'C:\\caddy\\Caddyfile';
const baseDomain = String(process.env.MASTER_BASE_DOMAIN || 'julianplay.com.br').toLowerCase();
const primeiraPorta = Number(process.env.MASTER_FIRST_PORT || 11001);

function lerConfiguracaoInstalacaoAtual() {
    const settingsPath = path.join(sourceDir, '.julian-play-install.json');
    try {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (_) {
        return {};
    }
}

function normalizarDominio(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
}

function obterSugestaoInstalacaoAdministradoraAtual() {
    const settings = lerConfiguracaoInstalacaoAtual();
    const appName = process.env.JULIAN_PLAY_APP_NAME || settings.appName || 'julian-play';
    return {
        nome: settings.nomeSistema || 'Controle de Cliente',
        slug: 'painel',
        dominio: normalizarDominio(process.env.JULIAN_PLAY_DOMAIN || settings.domain || `painel.${baseDomain}`),
        porta: Number(process.env.PORT || process.env.JULIAN_PLAY_PORT || settings.port || 10000),
        pastaDados: path.resolve(process.env.DATA_DIR || process.env.JULIAN_PLAY_DATA_DIR || settings.dataDir || sourceDir),
        processoPm2: appName,
        usuarioPainel: process.env.PANEL_USER || settings.panelUser || 'admin',
        codigoFornecedor: process.env.LICENSE_ADMIN_TOKEN || settings.licenseAdminToken || ''
    };
}

function slugificar(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

function executarComando(arquivo, args = [], timeout = 0) {
    return new Promise((resolve, reject) => {
        const extensao = path.extname(arquivo).toLowerCase();
        const executarViaCmd = process.platform === 'win32' && (extensao === '.cmd' || extensao === '.bat');
        const opcoes = { windowsHide: true, shell: executarViaCmd };
        if (timeout > 0) opcoes.timeout = timeout;

        execFile(arquivo, args, opcoes, (err, stdout, stderr) => {
            if (err) {
                err.detalhes = String(stderr || stdout || err.message).trim();
                return reject(err);
            }
            resolve(String(stdout || stderr || '').trim());
        });
    });
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
                        ok: Boolean(dados.ok),
                        estado: String(dados.estado || ''),
                        service: String(dados.service || ''),
                        whatsapp: Boolean(dados.whatsapp?.conectado),
                        whatsappStatus: String(dados.whatsapp?.status || ''),
                        numero: String(dados.whatsapp?.numero || '').replace(/\D/g, ''),
                        uptime: Number(dados.uptime || 0),
                        timestamp: String(dados.timestamp || new Date().toISOString())
                    });
                } catch (_) {
                    resolve({ online: false, whatsapp: false, numero: '', erro: 'Resposta de saúde inválida.' });
                }
            });
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve({ online: false, whatsapp: false, numero: '', erro: 'Processo sem resposta na porta local.' }));
    });
}

function chamarApiInstalacao(instalacao, metodo, caminho, corpo = null, timeout = 6000) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const payload = corpo ? JSON.stringify(corpo) : '';
        const req = http.request({
            host: '127.0.0.1',
            port: Number(instalacao.porta),
            path: caminho,
            method: metodo,
            timeout,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'x-master-token': instalacao.codigoFornecedor
            }
        }, (res) => {
            let resposta = '';
            res.setEncoding('utf8');
            res.on('data', trecho => { resposta += trecho; });
            res.on('end', () => {
                let dados = {};
                try { dados = resposta ? JSON.parse(resposta) : {}; } catch (_) { dados = { erro: resposta }; }
                if (res.statusCode >= 200 && res.statusCode < 300) return resolve(dados);
                reject(new Error(dados.erro || `Instalação respondeu HTTP ${res.statusCode}.`));
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Instalação demorou para responder.'));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function listarInstalacoes() {
    const [instalacoes, eventosRecentes] = await Promise.all([
        masterDb.buscarTodos('SELECT * FROM instalacoes ORDER BY datetime(criadoEm) DESC, id DESC'),
        listarEventosRecentesInstalacoes(3)
    ]);
    return Promise.all(instalacoes.map(async (instalacao) => {
        const dbPath = path.join(instalacao.pastaDados, 'clientes.db');
        const usoDiscoBytes = tamanhoDiretorio(instalacao.pastaDados);
        const eventosDaInstalacao = eventosRecentes.get(Number(instalacao.id)) || [];
        if (!fs.existsSync(dbPath) || instalacao.status === 'arquivado') return { ...instalacao, usoDiscoBytes, eventosRecentes: eventosDaInstalacao };
        try {
            const [config, saude, resumoComercial] = await Promise.all([
                lerConfiguracoesTenant(dbPath),
                consultarSaude(instalacao.porta),
                lerResumoComercialTenant(dbPath)
            ]);
            return {
                ...instalacao,
                usoDiscoBytes,
                bancoEncontrado: true,
                configuracoesTenant: config,
                resumoComercial,
                estadoLicenca: calcularEstadoLicenca(config),
                saude,
                eventosRecentes: eventosDaInstalacao
            };
        } catch (_) {
            return { ...instalacao, usoDiscoBytes, bancoEncontrado: fs.existsSync(dbPath), eventosRecentes: eventosDaInstalacao };
        }
    }));
}

async function buscarInstalacao(id) {
    return masterDb.buscarUm('SELECT * FROM instalacoes WHERE id = ?', [id]);
}

function instalacaoAdministradora(instalacao = {}) {
    return ['admin', 'administrador', 'fornecedor'].includes(String(instalacao.perfilLicenca || '').trim().toLowerCase());
}

function exigirInstalacaoCliente(instalacao) {
    if (instalacaoAdministradora(instalacao)) {
        throw new Error('Esta ação é permitida somente para instalações de clientes.');
    }
}

async function registrarEventoInstalacao(instalacaoId, tipo, mensagem, detalhes = '') {
    await masterDb.executar(
        `INSERT INTO eventos_instalacao (instalacaoId, tipo, mensagem, detalhes)
        VALUES (?, ?, ?, ?)`,
        [
            instalacaoId ? Number(instalacaoId) : null,
            String(tipo || 'evento').trim().slice(0, 80),
            String(mensagem || '').trim().slice(0, 500),
            String(detalhes || '').trim().slice(0, 1000)
        ]
    );
}

async function listarEventosRecentesInstalacoes(limitePorInstalacao = 3) {
    const limite = Math.max(1, Math.min(Number(limitePorInstalacao) || 3, 8));
    const eventos = await masterDb.buscarTodos(
        `SELECT * FROM eventos_instalacao
        ORDER BY datetime(criadoEm) DESC, id DESC
        LIMIT 300`
    );
    const porInstalacao = new Map();

    for (const evento of eventos) {
        const chave = Number(evento.instalacaoId || 0);
        if (!chave) continue;
        const lista = porInstalacao.get(chave) || [];
        if (lista.length >= limite) continue;
        lista.push(evento);
        porInstalacao.set(chave, lista);
    }

    return porInstalacao;
}

function listarEventosInstalacao(id, limite = 80) {
    const quantidade = Math.max(10, Math.min(Number(limite) || 80, 300));
    return masterDb.buscarTodos(
        `SELECT * FROM eventos_instalacao
        WHERE instalacaoId = ?
        ORDER BY datetime(criadoEm) DESC, id DESC
        LIMIT ?`,
        [id, quantidade]
    );
}

async function proximaPorta() {
    const row = await masterDb.buscarUm('SELECT MAX(porta) AS maior FROM instalacoes');
    return Math.max(primeiraPorta, Number(row?.maior || 0) + 1);
}

async function slugEmUso(slug) {
    const row = await masterDb.buscarUm('SELECT id FROM instalacoes WHERE slug = ? LIMIT 1', [slug]);
    return Boolean(row);
}

function escreverArquivoSeguro(caminho, conteudo) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, conteudo, { encoding: 'utf8', mode: 0o600 });
}

function tamanhoDiretorio(caminho) {
    if (!fs.existsSync(caminho)) return 0;
    let total = 0;
    for (const item of fs.readdirSync(caminho, { withFileTypes: true })) {
        const alvo = path.join(caminho, item.name);
        try {
            total += item.isDirectory() ? tamanhoDiretorio(alvo) : fs.statSync(alvo).size;
        } catch (_) { /* Arquivo pode estar em uso durante a leitura. */ }
    }
    return total;
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
                JULIAN_PLAY_APP_NAME: instalacao.processoPm2,
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
                LICENSE_ROLE: instalacao.perfilLicenca || 'cliente',
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
    const slugBase = slugificar(dados.slug || nome);
    const usuarioPainel = String(dados.usuarioPainel || 'admin').trim();
    const senha = String(dados.senhaPainel || '');
    const whatsappEsperado = String(dados.whatsappEsperado || '').replace(/\D/g, '');
    const tipo = String(dados.tipoLicenca || 'avaliacao_15');
    const perfilLicenca = ['admin', 'administrador', 'fornecedor'].includes(String(dados.perfilLicenca || '').trim().toLowerCase())
        ? 'admin'
        : 'cliente';
    const diasAvaliacao = tipo === 'avaliacao_30' ? 30 : tipo === 'avaliacao_15' ? 15 : 0;
    const horaEnvio = Number(dados.horaEnvio ?? 9);
    const minutoEnvio = Number(dados.minutoEnvio ?? 0);

    if (!nome) throw new Error('Informe o nome do cliente.');
    if (!slugBase) throw new Error('Informe um identificador válido para a URL.');
    if (!usuarioPainel) throw new Error('Informe o usuário do painel.');
    if (senha.length < 8) throw new Error('A senha inicial precisa ter pelo menos 8 caracteres.');
    if (whatsappEsperado.length < 10 || whatsappEsperado.length > 15) throw new Error('Informe o WhatsApp que sera conectado ao robo, com DDD.');
    if (!Number.isInteger(horaEnvio) || horaEnvio < 0 || horaEnvio > 23) throw new Error('Informe uma hora de envio entre 0 e 23.');
    if (!Number.isInteger(minutoEnvio) || minutoEnvio < 0 || minutoEnvio > 59) throw new Error('Informe um minuto de envio entre 0 e 59.');
    if (await slugEmUso(slugBase)) throw new Error('Este identificador da URL já está em uso. Informe outro identificador para criar uma nova instalação.');

    const slug = slugBase;
    const porta = await proximaPorta();
    const pastaDados = path.join(clientesDir, slug);
    const dominio = `${slug}.${baseDomain}`;
    const processoPm2 = `julian-${slug}`;
    const codigoFornecedor = crypto.randomBytes(16).toString('hex').toUpperCase();

    let resultado;
    try {
        resultado = await masterDb.executar(
            `INSERT INTO instalacoes
            (nome, slug, dominio, porta, pastaDados, processoPm2, usuarioPainel, tipoLicenca, diasAvaliacao,
             codigoFornecedor, whatsappEsperado, horaEnvio, minutoEnvio, perfilLicenca)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nome, slug, dominio, porta, pastaDados, processoPm2, usuarioPainel, tipo, diasAvaliacao,
                codigoFornecedor, whatsappEsperado, horaEnvio, minutoEnvio, perfilLicenca]
        );
    } catch (err) {
        if (String(err.message || '').includes('SQLITE_CONSTRAINT')) {
            throw new Error('Não foi possível reservar um identificador livre para esta instalação. Tente novamente com outro identificador da URL.');
        }
        throw err;
    }
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
        await registrarEventoInstalacao(instalacao.id, 'criacao', 'Instalação criada e robô iniciado.', `Domínio: ${dominio}. Porta: ${porta}.`);
        return { ...(await buscarInstalacao(instalacao.id)), senhaInicial: senha };
    } catch (err) {
        await atualizarStatus(instalacao.id, 'erro', err.detalhes || err.message);
        await registrarEventoInstalacao(instalacao.id, 'erro', 'Erro ao criar instalação.', err.detalhes || err.message);
        throw err;
    }
}

async function vincularInstalacaoAdministradoraAtual(dados = {}) {
    const sugestao = obterSugestaoInstalacaoAdministradoraAtual();
    const nome = String(dados.nome || sugestao.nome).trim();
    const slug = slugificar(dados.slug || sugestao.slug);
    const dominio = normalizarDominio(dados.dominio || sugestao.dominio);
    const porta = Number(dados.porta || sugestao.porta);
    const pastaDados = path.resolve(String(dados.pastaDados || sugestao.pastaDados));
    const processoPm2 = String(dados.processoPm2 || sugestao.processoPm2).trim();
    const usuarioPainel = String(dados.usuarioPainel || sugestao.usuarioPainel || 'admin').trim();
    const codigoFornecedor = String(dados.codigoFornecedor || sugestao.codigoFornecedor || '').trim();

    if (!nome) throw new Error('Informe o nome da instalação administradora.');
    if (!slug) throw new Error('Informe um identificador válido para a URL.');
    if (!dominio) throw new Error('Informe o domínio da instalação administradora.');
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('Informe uma porta válida.');
    if (!processoPm2) throw new Error('Informe o nome do processo PM2.');
    if (!usuarioPainel) throw new Error('Informe o usuário do painel.');
    if (!fs.existsSync(pastaDados)) throw new Error('A pasta de dados informada não foi encontrada.');
    if (!fs.existsSync(path.join(pastaDados, 'clientes.db'))) throw new Error('O banco clientes.db não foi encontrado na pasta informada.');

    const existente = await masterDb.buscarUm(
        'SELECT * FROM instalacoes WHERE slug = ? OR pastaDados = ? OR processoPm2 = ? LIMIT 1',
        [slug, pastaDados, processoPm2]
    );

    let id;
    if (existente) {
        id = existente.id;
        await masterDb.executar(
            `UPDATE instalacoes SET nome = ?, slug = ?, dominio = ?, porta = ?, pastaDados = ?, processoPm2 = ?,
             usuarioPainel = ?, tipoLicenca = 'vitalicia', diasAvaliacao = 0, codigoFornecedor = ?,
             status = 'ativo', detalheStatus = ?, perfilLicenca = 'admin', atualizadoEm = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [nome, slug, dominio, porta, pastaDados, processoPm2, usuarioPainel, codigoFornecedor,
                'Instalação administradora vinculada ao Painel Mestre.', id]
        );
    } else {
        const resultado = await masterDb.executar(
            `INSERT INTO instalacoes
            (nome, slug, dominio, porta, pastaDados, processoPm2, usuarioPainel, tipoLicenca, diasAvaliacao,
             codigoFornecedor, whatsappEsperado, horaEnvio, minutoEnvio, perfilLicenca, status, detalheStatus)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'vitalicia', 0, ?, '', 9, 0, 'admin', 'ativo', ?)`,
            [nome, slug, dominio, porta, pastaDados, processoPm2, usuarioPainel, codigoFornecedor,
                'Instalação administradora vinculada ao Painel Mestre.']
        );
        id = resultado.id;
    }

    await salvarConfiguracoesTenant(path.join(pastaDados, 'clientes.db'), {
        licencaCliente: nome,
        licencaAtivacao: dataHojeSaoPaulo(),
        licencaTipo: 'vitalicia',
        licencaVitalicia: '1',
        licencaVencimento: '',
        licencaPeriodoTesteDias: '0',
        licencaBloqueioAtivo: '1',
        licencaSuspensa: '0'
    });
    await registrarEventoInstalacao(id, 'admin', 'Instalação administradora vinculada ao Painel Mestre.', dominio);

    return buscarInstalacao(id);
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

function lerResumoComercialTenant(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
        const buscarTodos = (sql, params = []) => new Promise((ok, falha) => {
            db.all(sql, params, (err, rows) => err ? falha(err) : ok(rows || []));
        });
        const buscarUm = (sql, params = []) => new Promise((ok, falha) => {
            db.get(sql, params, (err, row) => err ? falha(err) : ok(row || {}));
        });
        const hoje = dataHojeSaoPaulo();
        const amanha = adicionarDias(hoje, 1);
        const seteDias = adicionarDias(hoje, 7);
        const vencimentoEfetivo = "COALESCE(NULLIF(dataVencimento, ''), CASE WHEN TRIM(COALESCE(vencimento, '')) <> '' THEN vencimento || 'T23:59:59' ELSE '' END)";
        const whereVencimento = `TRIM(${vencimentoEfetivo}) <> ''
            AND date(substr(replace(${vencimentoEfetivo}, 'T', ' '), 1, 10)) BETWEEN date(?) AND date(?)`;

        Promise.all([
            buscarUm(`SELECT COUNT(*) AS total FROM tipos_planos
                WHERE ativo = 1 AND TRIM(COALESCE(valor, '')) <> '' AND CAST(REPLACE(valor, ',', '.') AS REAL) > 0`),
            buscarUm('SELECT COUNT(*) AS total FROM paineis WHERE ativo = 1'),
            buscarUm("SELECT COUNT(*) AS total FROM clientes WHERE lower(COALESCE(status, '')) = 'teste' AND " + whereVencimento, [hoje, amanha]),
            buscarTodos(`SELECT nome, telefone, ${vencimentoEfetivo} AS vencimento
                FROM clientes
                WHERE lower(COALESCE(status, '')) = 'teste' AND ${whereVencimento}
                ORDER BY datetime(replace(${vencimentoEfetivo}, 'T', ' ')) ASC
                LIMIT 3`, [hoje, amanha]),
            buscarUm("SELECT COUNT(*) AS total FROM clientes WHERE lower(COALESCE(status, '')) <> 'teste' AND " + whereVencimento, [hoje, seteDias]),
            buscarTodos(`SELECT nome, telefone, ${vencimentoEfetivo} AS vencimento
                FROM clientes
                WHERE lower(COALESCE(status, '')) <> 'teste' AND ${whereVencimento}
                ORDER BY datetime(replace(${vencimentoEfetivo}, 'T', ' ')) ASC
                LIMIT 3`, [hoje, seteDias]),
            buscarUm("SELECT COUNT(*) AS total FROM cliente_pagamentos WHERE COALESCE(excluidoEm, '') = ''")
        ]).then(([planos, paineis, testes, testesLista, renovacoes, renovacoesLista, pagamentos]) => {
            db.close();
            resolve({
                planosComValor: Number(planos?.total || 0),
                paineisAtivos: Number(paineis?.total || 0),
                testesVencendo: Number(testes?.total || 0),
                testesVencendoLista: testesLista,
                renovacoes7Dias: Number(renovacoes?.total || 0),
                renovacoes7DiasLista: renovacoesLista,
                pagamentosRegistrados: Number(pagamentos?.total || 0)
            });
        }).catch((err) => {
            db.close(() => reject(err));
        });
    });
}

async function suspenderInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    exigirInstalacaoCliente(instalacao);
    await salvarConfiguracoesTenant(path.join(instalacao.pastaDados, 'clientes.db'), {
        licencaBloqueioAtivo: '1',
        licencaSuspensa: '1'
    });
    await atualizarStatus(id, 'suspenso', 'Licença suspensa pelo Painel Mestre.');
    await registrarEventoInstalacao(id, 'licenca', 'Licença suspensa pelo Painel Mestre.');
}

async function tornarVitalicia(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    exigirInstalacaoCliente(instalacao);
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
    await registrarEventoInstalacao(id, 'licenca', 'Instalação convertida em licença vitalícia.');
}

function obterPeriodoLicencaComercial(tipo) {
    const normalizado = String(tipo || '').toLowerCase();
    if (normalizado === 'mensal') return { tipo: 'mensal', dias: 30, rotulo: 'Mensal' };
    if (normalizado === 'semestral') return { tipo: 'semestral', dias: 180, rotulo: 'Semestral' };
    if (normalizado === 'anual') return { tipo: 'anual', dias: 365, rotulo: 'Anual' };
    if (normalizado === 'vitalicia') return { tipo: 'vitalicia', dias: 0, rotulo: 'Vitalícia' };
    throw new Error('Selecione uma licença mensal, semestral, anual ou vitalícia.');
}

async function ativarLicencaComercial(id, tipoLicenca = 'mensal') {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    exigirInstalacaoCliente(instalacao);

    const periodo = obterPeriodoLicencaComercial(tipoLicenca);
    const hoje = dataHojeSaoPaulo();
    const vencimento = periodo.dias ? adicionarDias(hoje, periodo.dias) : '';

    await salvarConfiguracoesTenant(path.join(instalacao.pastaDados, 'clientes.db'), {
        licencaCliente: instalacao.nome,
        licencaAtivacao: hoje,
        licencaTipo: periodo.tipo,
        licencaVitalicia: periodo.tipo === 'vitalicia' ? '1' : '0',
        licencaVencimento: vencimento,
        licencaPeriodoTesteDias: '0',
        licencaBloqueioAtivo: '1',
        licencaSuspensa: '0'
    });

    await masterDb.executar(
        `UPDATE instalacoes SET tipoLicenca = ?, diasAvaliacao = 0,
         status = 'ativo', detalheStatus = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [periodo.tipo, vencimento ? `${periodo.rotulo} ativa até ${vencimento}.` : `${periodo.rotulo} ativa.`, id]
    );
    await registrarEventoInstalacao(
        id,
        'licenca',
        vencimento ? `${periodo.rotulo} ativada até ${vencimento}.` : `${periodo.rotulo} ativada.`
    );

    return { ...periodo, vencimento };
}

async function prorrogarAvaliacao(id, dias = 15) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    exigirInstalacaoCliente(instalacao);
    const quantidadeDias = Number(dias);
    if (![15, 30].includes(quantidadeDias)) throw new Error('Escolha uma prorrogação de 15 ou 30 dias.');

    const dbPath = path.join(instalacao.pastaDados, 'clientes.db');
    const config = await lerConfiguracoesTenant(dbPath);
    const hoje = dataHojeSaoPaulo();
    const vencimentoAtual = String(config.licencaVencimento || '').slice(0, 10);
    const dataBase = vencimentoAtual && vencimentoAtual >= hoje ? vencimentoAtual : hoje;
    const novoVencimento = adicionarDias(dataBase, quantidadeDias);

    await salvarConfiguracoesTenant(dbPath, {
        licencaCliente: instalacao.nome,
        licencaAtivacao: config.licencaAtivacao || hoje,
        licencaVencimento: novoVencimento,
        licencaVitalicia: '0',
        licencaTipo: 'avaliacao',
        licencaPeriodoTesteDias: String(quantidadeDias),
        licencaBloqueioAtivo: '1',
        licencaSuspensa: '0'
    });

    await masterDb.executar(
        `UPDATE instalacoes SET tipoLicenca = ?, diasAvaliacao = ?,
         status = 'ativo', detalheStatus = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [`avaliacao_${quantidadeDias}`, quantidadeDias, `Avaliação prorrogada até ${novoVencimento}.`, id]
    );
    await registrarEventoInstalacao(id, 'licenca', `Avaliação prorrogada por ${quantidadeDias} dias, até ${novoVencimento}.`);

    return novoVencimento;
}

async function reiniciarInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (instalacao.status === 'arquivado') throw new Error('Instalações arquivadas não podem ser reiniciadas.');

    await executarComando('pm2.cmd', ['restart', instalacao.processoPm2, '--update-env']);
    await atualizarStatus(id, 'ativo', 'Robô reiniciado pelo Painel Mestre.');
    await registrarEventoInstalacao(id, 'robo', 'Robô reiniciado pelo Painel Mestre.');
}

async function pararInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (instalacao.status === 'arquivado') throw new Error('Instalações arquivadas não podem ser paradas.');

    await executarComando('pm2.cmd', ['stop', instalacao.processoPm2]);
    await executarComando('pm2.cmd', ['save', '--force']);
    await atualizarStatus(id, 'parado', 'Robô parado com segurança pelo Painel Mestre.');
    await registrarEventoInstalacao(id, 'robo', 'Robô parado com segurança pelo Painel Mestre.');
}

async function iniciarInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (instalacao.status === 'arquivado') throw new Error('Instalações arquivadas não podem ser iniciadas.');

    await executarComando('pm2.cmd', ['start', instalacao.processoPm2, '--update-env']);
    await executarComando('pm2.cmd', ['save', '--force']);
    await atualizarStatus(id, 'ativo', 'Robô iniciado pelo Painel Mestre. Aguardando conexão do WhatsApp.');
    await registrarEventoInstalacao(id, 'robo', 'Robô iniciado pelo Painel Mestre.');
}

async function trocarWhatsappInstalacao(id, novoNumero = '') {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (instalacao.status === 'arquivado') throw new Error('Instalações arquivadas não podem trocar o WhatsApp.');
    exigirInstalacaoCliente(instalacao);

    const whatsappEsperado = String(novoNumero || '').replace(/\D/g, '');
    if (whatsappEsperado.length < 10 || whatsappEsperado.length > 15) {
        throw new Error('Informe o novo WhatsApp com código do país, DDD e número.');
    }

    await executarComando('pm2.cmd', ['stop', instalacao.processoPm2]);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const pastaAuth = path.join(instalacao.pastaDados, '.wwebjs_auth');
    const sessaoAtual = path.join(pastaAuth, 'session-julianplay');
    let backupSessao = '';
    if (fs.existsSync(sessaoAtual)) {
        backupSessao = path.join(pastaAuth, `session-julianplay-backup-${Date.now()}`);
        fs.renameSync(sessaoAtual, backupSessao);
    }

    await masterDb.executar(
        `UPDATE instalacoes SET whatsappEsperado = ?, status = 'ativo', detalheStatus = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?`,
        [whatsappEsperado, 'WhatsApp alterado. Aguardando leitura do novo QR Code.', id]
    );
    await registrarEventoInstalacao(id, 'whatsapp', `WhatsApp alterado para ${whatsappEsperado}.`, backupSessao ? `Sessão anterior movida para ${backupSessao}.` : '');

    try {
        await executarComando('pm2.cmd', ['start', instalacao.processoPm2, '--update-env']);
        await executarComando('pm2.cmd', ['save', '--force']);
    } catch (err) {
        await atualizarStatus(id, 'erro', `WhatsApp atualizado, mas o robô não iniciou: ${err.detalhes || err.message}`);
        await registrarEventoInstalacao(id, 'erro', 'WhatsApp atualizado, mas o robô não iniciou.', err.detalhes || err.message);
        throw err;
    }

    return { whatsappEsperado, backupSessao };
}

async function atualizarObservacaoOperacional(id, observacao = '') {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');

    const texto = String(observacao || '').trim().slice(0, 500);
    await masterDb.executar(
        `UPDATE instalacoes
        SET observacaoOperacional = ?, atualizadoEm = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [texto, id]
    );
    await registrarEventoInstalacao(
        id,
        'observacao',
        texto ? `Observação operacional salva: ${texto}` : 'Observação operacional removida.'
    );

    return texto;
}

async function obterRecursosServidor() {
    let processosChrome = null;
    if (process.platform === 'win32') {
        try {
            const saida = await executarComando('tasklist.exe', ['/FI', 'IMAGENAME eq chrome.exe', '/FO', 'CSV', '/NH'], 3000);
            processosChrome = saida.split(/\r?\n/).filter(linha => /^"chrome\.exe"/i.test(linha.trim())).length;
        } catch (_) {
            processosChrome = null;
        }
    }

    let discoLivreGb = null;
    let discoTotalGb = null;
    try {
        const disco = fs.statfsSync(sourceDir);
        discoLivreGb = Math.round((Number(disco.bavail) * Number(disco.bsize) / 1024 ** 3) * 100) / 100;
        discoTotalGb = Math.round((Number(disco.blocks) * Number(disco.bsize) / 1024 ** 3) * 100) / 100;
    } catch (_) { /* Métrica indisponível. */ }

    return {
        memoriaLivreMb: Math.round(os.freemem() / 1024 / 1024),
        memoriaTotalMb: Math.round(os.totalmem() / 1024 / 1024),
        processosChrome,
        discoLivreGb,
        discoTotalGb
    };
}

async function limparServidorSeguro(retencao = 10) {
    const quantidade = Math.max(3, Math.min(100, Number.parseInt(retencao, 10) || 10));
    const instalacoes = await masterDb.buscarTodos("SELECT * FROM instalacoes WHERE status <> 'arquivado'");
    let backupsRemovidos = 0;
    let bytesLiberados = 0;
    let sessoesArquivadasRemovidas = 0;

    for (const instalacao of instalacoes) {
        const pastaBackups = path.join(instalacao.pastaDados, 'backups');
        if (!fs.existsSync(pastaBackups) || !caminhoDentro(pastaBackups, instalacao.pastaDados)) continue;
        const backups = fs.readdirSync(pastaBackups, { withFileTypes: true })
            .filter(item => item.isFile() && item.name.toLowerCase().endsWith('.db'))
            .map(item => {
                const arquivo = path.join(pastaBackups, item.name);
                return { arquivo, stat: fs.statSync(arquivo) };
            })
            .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

        for (const backup of backups.slice(quantidade)) {
            bytesLiberados += backup.stat.size;
            fs.unlinkSync(backup.arquivo);
            backupsRemovidos += 1;
        }
    }

    if (fs.existsSync(arquivadosDir)) {
        for (const item of fs.readdirSync(arquivadosDir, { withFileTypes: true })) {
            if (!item.isDirectory()) continue;
            const pastaArquivada = path.join(arquivadosDir, item.name);
            for (const nome of ['.wwebjs_auth', '.wwebjs_cache']) {
                const alvo = path.join(pastaArquivada, nome);
                if (!fs.existsSync(alvo) || !caminhoDentro(alvo, arquivadosDir)) continue;
                bytesLiberados += tamanhoDiretorio(alvo);
                fs.rmSync(alvo, { recursive: true, force: true });
                sessoesArquivadasRemovidas += 1;
            }
        }
    }

    return { retencao: quantidade, backupsRemovidos, sessoesArquivadasRemovidas, bytesLiberados };
}

async function resetarSenhaPainel(id, senha = '') {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (instalacao.status === 'arquivado') throw new Error('Instalações arquivadas não podem ter senha alterada.');

    const novaSenha = String(senha || '');
    if (novaSenha.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');

    const ecossistema = path.join(instalacao.pastaDados, 'ecosystem.config.cjs');
    if (!fs.existsSync(instalacao.pastaDados)) throw new Error('Pasta da instalação não encontrada.');

    escreverArquivoSeguro(ecossistema, configuracaoPm2(instalacao, criarHashSenha(novaSenha)));
    await executarComando('pm2.cmd', ['restart', instalacao.processoPm2, '--update-env']);
    await atualizarStatus(id, 'ativo', 'Senha do painel redefinida pelo Painel Mestre.');
    await registrarEventoInstalacao(id, 'acesso', 'Senha do painel redefinida pelo Painel Mestre.');
}

async function gerarBackupInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (instalacao.status === 'arquivado') throw new Error('Instalações arquivadas não podem gerar backup pelo robô.');

    const resultado = await chamarApiInstalacao(instalacao, 'POST', '/api/admin/backup');
    const nomeBackup = resultado.backup?.nome || resultado.backup?.arquivo || 'backup criado';
    await atualizarStatus(id, 'ativo', `Backup solicitado pelo Painel Mestre: ${nomeBackup}.`);
    await registrarEventoInstalacao(id, 'backup', `Backup solicitado pelo Painel Mestre: ${nomeBackup}.`);
    return nomeBackup;
}

async function liberarAtendimentoInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    if (instalacao.status === 'arquivado') throw new Error('Instalações arquivadas não podem liberar atendimento.');
    exigirInstalacaoCliente(instalacao);

    const resultado = await chamarApiInstalacao(instalacao, 'POST', '/api/admin/atendimentos/liberar');
    const liberados = Number(resultado.liberados || 0);
    await atualizarStatus(id, 'ativo', `${liberados} atendimento(s) humano(s) liberado(s) pelo Painel Mestre.`);
    await registrarEventoInstalacao(id, 'atendimento', `${liberados} atendimento(s) humano(s) liberado(s) pelo Painel Mestre.`);
    return liberados;
}

async function obterLogsInstalacao(id, linhas = 120) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');

    const quantidade = Math.max(20, Math.min(Number(linhas) || 120, 300));
    const saida = await executarComando('pm2.cmd', ['logs', instalacao.processoPm2, '--lines', String(quantidade), '--nostream']);
    return {
        instalacao,
        logs: saida.replace(/\u001b\[[0-9;]*m/g, '')
    };
}

async function obterDiagnosticoInstalacao(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao) throw new Error('Instalação não encontrada.');
    const saude = instalacao.status === 'arquivado'
        ? { online: false, whatsapp: false, numero: '', erro: 'Instalação arquivada.' }
        : await consultarSaude(instalacao.porta);
    return { instalacao, saude };
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
    exigirInstalacaoCliente(instalacao);

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
    await registrarEventoInstalacao(id, 'arquivo', 'Instalação arquivada com segurança.', destino);
}

async function excluirDefinitivamente(id) {
    const instalacao = await buscarInstalacao(id);
    if (!instalacao || instalacao.status !== 'arquivado') throw new Error('Somente instalações arquivadas podem ser excluídas.');
    if (!caminhoDentro(instalacao.pastaDados, arquivadosDir)) throw new Error('Pasta arquivada fora da área permitida.');
    if (fs.existsSync(instalacao.pastaDados)) fs.rmSync(instalacao.pastaDados, { recursive: true, force: true });
    await registrarEventoInstalacao(id, 'exclusao', 'Instalação excluída definitivamente.', instalacao.pastaDados);
    await masterDb.executar('DELETE FROM instalacoes WHERE id = ?', [id]);
}

module.exports = {
    sourceDir,
    clientesDir,
    arquivadosDir,
    caddyFragmentsDir,
    baseDomain,
    obterSugestaoInstalacaoAdministradoraAtual,
    listarInstalacoes,
    listarEventosInstalacao,
    buscarInstalacao,
    vincularInstalacaoAdministradoraAtual,
    criarInstalacao,
    suspenderInstalacao,
    tornarVitalicia,
    ativarLicencaComercial,
    prorrogarAvaliacao,
    reiniciarInstalacao,
    pararInstalacao,
    iniciarInstalacao,
    trocarWhatsappInstalacao,
    atualizarObservacaoOperacional,
    obterRecursosServidor,
    limparServidorSeguro,
    resetarSenhaPainel,
    gerarBackupInstalacao,
    liberarAtendimentoInstalacao,
    obterDiagnosticoInstalacao,
    obterLogsInstalacao,
    arquivarInstalacao,
    excluirDefinitivamente
};
