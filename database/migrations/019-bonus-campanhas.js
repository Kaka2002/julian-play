module.exports = {
    versao: '2026-09-26-019-bonus-campanhas',
    nome: 'Crédito automático de indicação por campanha',
    async up({ exec }) {
        // Vínculos antigos pertenciam à regra de dois indicados, não à campanha de um.
        await exec("ALTER TABLE programa_indicacoes ADD COLUMN campanhaChave TEXT NOT NULL DEFAULT 'campanha_indique_ganhe_tres_meses'");
        await exec(`CREATE TABLE indicacao_creditos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            indicadorClienteId INTEGER NOT NULL,
            campanhaChave TEXT NOT NULL,
            meses INTEGER NOT NULL,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await exec('ALTER TABLE programa_indicacoes ADD COLUMN creditoId INTEGER');
        await exec('CREATE INDEX idx_indicacoes_campanha ON programa_indicacoes(campanhaChave, status)');
    }
};
