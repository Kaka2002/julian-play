module.exports = {
    versao: '2026-08-23-011-auditoria-clientes',
    nome: 'Auditoria estruturada de alterações dos clientes',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS cliente_auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            campo TEXT,
            valorAnterior TEXT,
            valorNovo TEXT,
            responsavel TEXT,
            origem TEXT,
            motivo TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE CASCADE
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_cliente_auditoria_cliente_data ON cliente_auditoria(clienteId, criadoEm DESC, id DESC)');
    }
};
