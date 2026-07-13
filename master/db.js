const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDir = process.env.MASTER_DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'master.db');
fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(dbPath);
const ready = new Promise((resolve, reject) => {
    db.serialize(() => {
        function finalizarMigracao() {
            db.run(`CREATE TABLE IF NOT EXISTS eventos_instalacao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instalacaoId INTEGER,
                tipo TEXT NOT NULL,
                mensagem TEXT NOT NULL,
                detalhes TEXT,
                criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(instalacaoId) REFERENCES instalacoes(id) ON DELETE SET NULL
            )`, (eventoErr) => {
                if (eventoErr) return reject(eventoErr);
                db.run('CREATE INDEX IF NOT EXISTS idx_eventos_instalacao_data ON eventos_instalacao(instalacaoId, criadoEm DESC)', (indiceErr) => {
                    if (indiceErr) return reject(indiceErr);
                    resolve();
                });
            });
        }

        db.run(`CREATE TABLE IF NOT EXISTS instalacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            dominio TEXT NOT NULL UNIQUE,
            porta INTEGER NOT NULL UNIQUE,
            pastaDados TEXT NOT NULL,
            processoPm2 TEXT NOT NULL UNIQUE,
            usuarioPainel TEXT NOT NULL,
            tipoLicenca TEXT NOT NULL,
            diasAvaliacao INTEGER DEFAULT 0,
            codigoFornecedor TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'provisionando',
            detalheStatus TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) return reject(err);
            db.all('PRAGMA table_info(instalacoes)', (pragmaErr, colunas) => {
                if (pragmaErr) return reject(pragmaErr);
                const existentes = new Set((colunas || []).map(coluna => coluna.name));
                const novas = [
                    ['whatsappEsperado', "TEXT NOT NULL DEFAULT ''"],
                    ['horaEnvio', 'INTEGER NOT NULL DEFAULT 9'],
                    ['minutoEnvio', 'INTEGER NOT NULL DEFAULT 0'],
                    ['perfilLicenca', "TEXT NOT NULL DEFAULT 'cliente'"],
                    ['observacaoOperacional', "TEXT NOT NULL DEFAULT ''"]
                ].filter(([nome]) => !existentes.has(nome));
                if (!novas.length) return finalizarMigracao();

                let pendentes = novas.length;
                novas.forEach(([nome, definicao]) => {
                    db.run(`ALTER TABLE instalacoes ADD COLUMN ${nome} ${definicao}`, (alterErr) => {
                        if (alterErr) return reject(alterErr);
                        pendentes -= 1;
                        if (!pendentes) finalizarMigracao();
                    });
                });
            });
        });
    });
});

function executar(sql, params = []) {
    return ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarUm(sql, params = []) {
    return ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    }));
}

function buscarTodos(sql, params = []) {
    return ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    }));
}

module.exports = { db, ready, dataDir, dbPath, executar, buscarUm, buscarTodos };
