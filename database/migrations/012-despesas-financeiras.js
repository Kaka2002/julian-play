module.exports = {
    versao: '2026-09-19-012-despesas-financeiras',
    nome: 'Lançamentos de despesas financeiras',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS despesas_financeiras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descricao TEXT NOT NULL,
            categoria TEXT NOT NULL DEFAULT 'Outros',
            valor TEXT NOT NULL,
            dataPagamento TEXT NOT NULL,
            formaPagamento TEXT,
            observacoes TEXT,
            excluidoEm TEXT,
            excluidoPor TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_despesas_financeiras_data ON despesas_financeiras(dataPagamento DESC, id DESC)');
    }
};
