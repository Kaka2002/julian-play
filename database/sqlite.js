const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));
const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'clientes.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

const ready = new Promise((resolve) => {
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT NOT NULL,
            usuario TEXT,
            senha TEXT,
            plano TEXT,
            aparelho TEXT,
            vencimento TEXT,
            nascimento TEXT,
            tipoPlanoId INTEGER,
            diasContrato INTEGER,
            valorPlano TEXT,
            assinaturaApp TEXT,
            validadeApp TEXT,
            horasTeste TEXT,
            dataInicio TEXT,
            dataVencimento TEXT,
            appsInstalados TEXT,
            dispositivosSelecionados TEXT,
            paineisSelecionados TEXT,
            appInstalado INTEGER DEFAULT 0,
            usuarioApp TEXT,
            senhaApp TEXT,
            enderecoMac TEXT,
            idAplicativo TEXT,
            acessosApp TEXT,
            observacoes TEXT,
            origem TEXT,
            tags TEXT,
            bonusMeses INTEGER DEFAULT 0,
            status TEXT DEFAULT 'teste',
            ultimoAvisoRenovacao TEXT,
            ultimoAvisoAniversario TEXT,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS modelos_mensagem (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chave TEXT NOT NULL UNIQUE,
            plano TEXT DEFAULT 'padrao',
            titulo TEXT NOT NULL,
            texto TEXT NOT NULL,
            cor TEXT DEFAULT 'blue',
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS configuracoes (
            chave TEXT PRIMARY KEY,
            valor TEXT,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            descricao TEXT,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS dispositivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS paineis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tipos_planos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            dias INTEGER NOT NULL,
            valor TEXT,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS avisos_renovacao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            vencimento TEXT NOT NULL,
            diasAntes INTEGER NOT NULL,
            enviadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(clienteId, vencimento, diasAntes)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cliente_notas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            texto TEXT NOT NULL,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cliente_pagamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            tipoPlanoId INTEGER,
            plano TEXT NOT NULL,
            diasContrato INTEGER DEFAULT 0,
            valorPlano TEXT,
            assinaturaApp TEXT,
            valorTotal TEXT,
            formaPagamento TEXT,
            dataPagamento TEXT,
            vencimentoAnterior TEXT,
            vencimentoNovo TEXT,
            observacoes TEXT,
            mensagemEnviada INTEGER DEFAULT 0,
            erroMensagem TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE CASCADE
        )
    `);

    const colunas = {
        usuario: 'TEXT',
        senha: 'TEXT',
        plano: 'TEXT',
        aparelho: 'TEXT',
        vencimento: 'TEXT',
        nascimento: 'TEXT',
        tipoPlanoId: 'INTEGER',
        diasContrato: 'INTEGER',
        valorPlano: 'TEXT',
        assinaturaApp: 'TEXT',
        validadeApp: 'TEXT',
        horasTeste: 'TEXT',
        dataInicio: 'TEXT',
        dataVencimento: 'TEXT',
        appsInstalados: 'TEXT',
        dispositivosSelecionados: 'TEXT',
        paineisSelecionados: 'TEXT',
        appInstalado: 'INTEGER DEFAULT 0',
        usuarioApp: 'TEXT',
        senhaApp: 'TEXT',
        enderecoMac: 'TEXT',
        idAplicativo: 'TEXT',
        acessosApp: 'TEXT',
        observacoes: 'TEXT',
        origem: 'TEXT',
        tags: 'TEXT',
        bonusMeses: 'INTEGER DEFAULT 0',
        status: "TEXT DEFAULT 'teste'",
        ultimoAvisoRenovacao: 'TEXT',
        ultimoAvisoAniversario: 'TEXT',
        atualizadoEm: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };

    db.all('PRAGMA table_info(clientes)', (err, rows) => {
        if (err) {
            console.error('Erro ao verificar tabela clientes:', err);
            return;
        }

        const existentes = new Set(rows.map(row => row.name));

        Object.entries(colunas).forEach(([nome, tipo]) => {
            if (!existentes.has(nome)) {
                db.run(`ALTER TABLE clientes ADD COLUMN ${nome} ${tipo}`);
            }
        });

        migrarTelefoneDuplicado(() => resolve());
    });
});
});

function migrarTelefoneDuplicado(done) {
    db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'clientes'", (err, tabela) => {
        if (err) {
            console.error('Erro ao verificar tabela clientes:', err);
            done();
            return;
        }

        const temTelefoneUnico = String(tabela?.sql || '').toUpperCase().includes('TELEFONE TEXT NOT NULL UNIQUE');

        if (!temTelefoneUnico) {
            db.run('DROP INDEX IF EXISTS idx_clientes_telefone', () => {
                db.run('CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)', () => done());
            });
            return;
        }

        db.serialize(() => {
            db.run('ALTER TABLE clientes RENAME TO clientes_backup_unico');
            db.run(`
                CREATE TABLE clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    telefone TEXT NOT NULL,
                    usuario TEXT,
                    senha TEXT,
                    plano TEXT,
                    aparelho TEXT,
                    vencimento TEXT,
                    nascimento TEXT,
                    tipoPlanoId INTEGER,
                    diasContrato INTEGER,
                    valorPlano TEXT,
                    assinaturaApp TEXT,
                    validadeApp TEXT,
                    horasTeste TEXT,
                    dataInicio TEXT,
                    dataVencimento TEXT,
                    appsInstalados TEXT,
                    dispositivosSelecionados TEXT,
                    paineisSelecionados TEXT,
                    appInstalado INTEGER DEFAULT 0,
                    usuarioApp TEXT,
                    senhaApp TEXT,
                    enderecoMac TEXT,
                    idAplicativo TEXT,
                    acessosApp TEXT,
                    observacoes TEXT,
                    origem TEXT,
                    tags TEXT,
                    bonusMeses INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'teste',
                    ultimoAvisoRenovacao TEXT,
                    ultimoAvisoAniversario TEXT,
                    dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
                    atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            db.run(`
                INSERT INTO clientes (
                    id, nome, telefone, usuario, senha, plano, aparelho, vencimento,
                    nascimento, tipoPlanoId, diasContrato, valorPlano, assinaturaApp,
                    validadeApp, horasTeste, dataInicio, dataVencimento, appsInstalados,
                    dispositivosSelecionados, paineisSelecionados, appInstalado,
                    usuarioApp, senhaApp, observacoes, origem, tags, bonusMeses, status, ultimoAvisoRenovacao,
                    ultimoAvisoAniversario, dataCadastro, atualizadoEm
                )
                SELECT
                    id, nome, telefone, usuario, senha, plano, aparelho, vencimento,
                    nascimento, tipoPlanoId, diasContrato, valorPlano, assinaturaApp,
                    validadeApp, horasTeste, dataInicio, dataVencimento, appsInstalados,
                    dispositivosSelecionados, paineisSelecionados, appInstalado,
                    usuarioApp, senhaApp, observacoes, origem, tags, bonusMeses, status, ultimoAvisoRenovacao,
                    ultimoAvisoAniversario, dataCadastro, atualizadoEm
                FROM clientes_backup_unico
            `);
            db.run('DROP TABLE clientes_backup_unico');
            db.run('DROP INDEX IF EXISTS idx_clientes_telefone');
            db.run('CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)', () => done());
        });
    });
}

db.ready = ready;
db.dbPath = dbPath;
db.dataDir = DATA_DIR;

module.exports = db;
