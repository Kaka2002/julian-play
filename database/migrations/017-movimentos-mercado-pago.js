module.exports = {
    versao: '2026-09-23-017-movimentos-mercado-pago',
    nome: 'Histórico de movimentações importadas do Mercado Pago',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS movimentos_mercado_pago (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identificadorExterno TEXT NOT NULL UNIQUE,
            dataMovimento TEXT NOT NULL,
            tipoRegistro TEXT NOT NULL DEFAULT '',
            descricao TEXT NOT NULL DEFAULT '',
            credito TEXT NOT NULL DEFAULT '0,00',
            debito TEXT NOT NULL DEFAULT '0,00',
            arquivoRelatorio TEXT NOT NULL,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_movimentos_mercado_pago_data ON movimentos_mercado_pago(dataMovimento);`);
    }
};
