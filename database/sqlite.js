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
            telefone TEXT NOT NULL UNIQUE,
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
            observacoes TEXT,
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
        observacoes: 'TEXT',
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

        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)', (indexErr) => {
            if (indexErr) {
                console.error('Erro ao criar indice de telefone:', indexErr);
            }

            resolve();
        });
    });
});
});

db.ready = ready;

module.exports = db;
