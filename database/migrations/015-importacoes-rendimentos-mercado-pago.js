module.exports = {
    versao: '2026-09-23-015-importacoes-rendimentos-mercado-pago',
    nome: 'Controle de importações de rendimentos Mercado Pago',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS rendimentos_mercado_pago_importados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identificadorExterno TEXT NOT NULL UNIQUE,
            rendimentoId INTEGER NOT NULL,
            arquivoRelatorio TEXT NOT NULL,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
};
