module.exports = {
    versao: '2026-09-23-014-rendimentos-financeiros',
    nome: 'Lançamentos de rendimentos financeiros',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS rendimentos_financeiros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descricao TEXT NOT NULL,
            valor TEXT NOT NULL,
            dataRecebimento TEXT NOT NULL,
            instituicao TEXT,
            observacoes TEXT,
            excluidoEm TEXT,
            excluidoPor TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_rendimentos_financeiros_data ON rendimentos_financeiros(dataRecebimento DESC, id DESC)');
    }
};
