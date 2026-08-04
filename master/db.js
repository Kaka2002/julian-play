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
                    db.run(`CREATE TABLE IF NOT EXISTS licencas_locais (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        instalacaoId TEXT NOT NULL UNIQUE,
                        cliente TEXT NOT NULL,
                        telefone TEXT,
                        machineFingerprint TEXT,
                        tipo TEXT NOT NULL,
                        ativacao TEXT,
                        vencimento TEXT,
                        vitalicia TEXT NOT NULL DEFAULT '0',
                        suspensa TEXT NOT NULL DEFAULT '0',
                        codigo TEXT,
                        observacoes TEXT,
                        ultimoStatus TEXT,
                        ultimoPingEm DATETIME,
                        apagada TEXT NOT NULL DEFAULT '0',
                        apagadaEm DATETIME,
                        transferida TEXT NOT NULL DEFAULT '0',
                        transferidaEm DATETIME,
                        transferidaPara TEXT,
                        criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
                        atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
                    )`, (licencaErr) => {
                        if (licencaErr) return reject(licencaErr);
                        db.all('PRAGMA table_info(licencas_locais)', (pragmaLicencaErr, colunasLicenca) => {
                            if (pragmaLicencaErr) return reject(pragmaLicencaErr);
                            const colunasAtuais = new Set((colunasLicenca || []).map(coluna => coluna.name));
                            const novasLicencas = [
                                ['apagada', "TEXT NOT NULL DEFAULT '0'"],
                                ['apagadaEm', 'DATETIME'],
                                ['machineFingerprint', 'TEXT'],
                                ['transferida', "TEXT NOT NULL DEFAULT '0'"],
                                ['transferidaEm', 'DATETIME'],
                                ['transferidaPara', 'TEXT']
                            ].filter(([nome]) => !colunasAtuais.has(nome));

                            function finalizarLicencasLocais() {
                                db.run('CREATE INDEX IF NOT EXISTS idx_licencas_locais_instalacao ON licencas_locais(instalacaoId)', (licencaIndiceErr) => {
                                    if (licencaIndiceErr) return reject(licencaIndiceErr);
                                    db.run(`CREATE TABLE IF NOT EXISTS eventos_licenca_local (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        instalacaoId TEXT NOT NULL,
                                        tipo TEXT NOT NULL,
                                        mensagem TEXT NOT NULL,
                                        detalhes TEXT,
                                        criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
                                    )`, (eventoLicencaErr) => {
                                        if (eventoLicencaErr) return reject(eventoLicencaErr);
                                        db.run('CREATE INDEX IF NOT EXISTS idx_eventos_licenca_local ON eventos_licenca_local(instalacaoId, criadoEm DESC)', (indiceEventoLicencaErr) => {
                                            if (indiceEventoLicencaErr) return reject(indiceEventoLicencaErr);
                                            resolve();
                                        });
                                    });
                                });
                            }

                            if (!novasLicencas.length) return finalizarLicencasLocais();

                            let pendentesLicencas = novasLicencas.length;
                            novasLicencas.forEach(([nome, definicao]) => {
                                db.run(`ALTER TABLE licencas_locais ADD COLUMN ${nome} ${definicao}`, (alterLicencaErr) => {
                                    if (alterLicencaErr) return reject(alterLicencaErr);
                                    pendentesLicencas -= 1;
                                    if (!pendentesLicencas) finalizarLicencasLocais();
                                });
                            });
                        });
                    });
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

let encerramento = null;
function encerrar() {
    if (!encerramento) {
        encerramento = ready.then(() => new Promise((resolve, reject) => {
            db.close(err => err ? reject(err) : resolve());
        }));
    }
    return encerramento;
}

module.exports = { db, ready, dataDir, dbPath, executar, buscarUm, buscarTodos, encerrar };
