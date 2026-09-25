module.exports = {
    versao: '2026-09-25-018-programa-indicacoes',
    nome: 'Programa de indicação com revisão manual',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS programa_indicacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            indicadorClienteId INTEGER NOT NULL,
            indicadoClienteId INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'ativa',
            motivoCancelamento TEXT DEFAULT '',
            beneficioLiberadoEm TEXT DEFAULT '',
            beneficioMeses INTEGER NOT NULL DEFAULT 3,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(indicadorClienteId, indicadoClienteId),
            CHECK(indicadorClienteId <> indicadoClienteId)
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_programa_indicacoes_indicador ON programa_indicacoes(indicadorClienteId, status)');
        await exec('CREATE INDEX IF NOT EXISTS idx_programa_indicacoes_indicado ON programa_indicacoes(indicadoClienteId, status)');
    }
};
