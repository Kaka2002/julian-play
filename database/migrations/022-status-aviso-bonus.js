module.exports = {
    versao: '2026-09-26-022-status-aviso-bonus',
    nome: 'Estado do aviso de bônus por indicação',
    async up({ exec }) {
        await exec(`ALTER TABLE clientes ADD COLUMN statusAvisoBonus TEXT NOT NULL DEFAULT 'nao_programado';
            UPDATE clientes SET statusAvisoBonus = 'programado' WHERE avisoBonusIndicacaoAtivo = 1;`);
    }
};
