module.exports = {
    versao: '2026-09-23-016-conciliacao-saldo-financeiro',
    nome: 'Conciliação de saldo financeiro mensal',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS conciliacoes_saldo_financeiro (
            mes TEXT PRIMARY KEY,
            saldoInicial TEXT NOT NULL DEFAULT '0,00',
            saldoBanco TEXT NOT NULL DEFAULT '0,00',
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
};
