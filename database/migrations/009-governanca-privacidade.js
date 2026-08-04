module.exports = {
    versao: '2026-08-04-009-governanca-privacidade',
    nome: 'Governanca de privacidade e anonimizacao de clientes',
    async up({ adicionarColuna, exec }) {
        await adicionarColuna('clientes', 'anonimizadoEm', 'TEXT');
        await adicionarColuna('clientes', 'exclusaoSolicitadaEm', 'TEXT');
        await exec(`CREATE TABLE IF NOT EXISTS solicitacoes_privacidade (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            motivo TEXT,
            responsavel TEXT,
            resumo TEXT,
            status TEXT NOT NULL DEFAULT 'concluida',
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE RESTRICT
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_solicitacoes_privacidade_cliente ON solicitacoes_privacidade(clienteId, criadoEm DESC)');
        await exec('CREATE INDEX IF NOT EXISTS idx_clientes_anonimizado ON clientes(anonimizadoEm, status)');
    }
};
