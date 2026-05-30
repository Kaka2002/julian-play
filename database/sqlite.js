const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'clientes.db');
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
            status TEXT DEFAULT 'teste',
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
        status: "TEXT DEFAULT 'teste'",
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
