const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./clientes.db');

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY,
            telefone TEXT,
            nome TEXT,
            estado TEXT,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

});

module.exports = db;