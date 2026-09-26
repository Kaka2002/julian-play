module.exports = {
    versao: '2026-09-26-021-aviso-bonus-indicacao',
    nome: 'Opção de aviso de bônus por indicação',
    async up({ exec }) {
        await exec('ALTER TABLE clientes ADD COLUMN avisoBonusIndicacaoAtivo INTEGER NOT NULL DEFAULT 0;');
    }
};
