module.exports = {
    versao: '2026-07-28-004-governanca-campanhas',
    nome: 'Governança de campanhas e reclamações',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS campanha_reclamacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campanhaId INTEGER,
            campanhaItemId INTEGER,
            clienteId INTEGER NOT NULL,
            motivo TEXT NOT NULL,
            origem TEXT DEFAULT 'painel',
            responsavel TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(campanhaId) REFERENCES campanhas(id) ON DELETE SET NULL,
            FOREIGN KEY(campanhaItemId) REFERENCES campanha_itens(id) ON DELETE SET NULL,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE CASCADE
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_campanha_reclamacoes_cliente ON campanha_reclamacoes(clienteId, criadoEm DESC)');
        await exec('CREATE INDEX IF NOT EXISTS idx_campanha_reclamacoes_campanha ON campanha_reclamacoes(campanhaId, criadoEm DESC)');
    }
};
