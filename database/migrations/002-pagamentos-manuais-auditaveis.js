const colunas = {
    moeda: "TEXT DEFAULT 'BRL'",
    comprovanteArquivo: 'TEXT',
    comprovanteRecebidoEm: 'TEXT',
    conferidoPor: 'TEXT',
    conferidoEm: 'TEXT',
    identificadorManual: 'TEXT',
    vencimentoAnterior: 'TEXT',
    vencimentoNovo: 'TEXT',
    estornadoEm: 'TEXT',
    estornadoPor: 'TEXT',
    motivoEstorno: 'TEXT'
};

module.exports = {
    versao: '2026-07-28-002-pagamentos-manuais-auditaveis',
    nome: 'Auditoria de pagamentos manuais',
    async up({ adicionarColuna, exec }) {
        for (const [nome, definicao] of Object.entries(colunas)) {
            await adicionarColuna('cobrancas_pix', nome, definicao);
        }
        await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cobrancas_identificador_manual
            ON cobrancas_pix(provedor, identificadorManual)
            WHERE identificadorManual IS NOT NULL AND identificadorManual <> ''`);
    }
};
