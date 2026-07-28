module.exports = {
    versao: '2026-07-28-005-estruturas-historicas',
    nome: 'Formalização das estruturas históricas de privacidade',
    async up({ adicionarColuna, exec }) {
        await adicionarColuna('clientes', 'whatsappMarketingConsentimento', 'INTEGER DEFAULT 0');
        await adicionarColuna('clientes', 'whatsappMarketingConsentidoEm', 'TEXT');
        await adicionarColuna('clientes', 'whatsappOptOutEm', 'TEXT');
        await exec('CREATE INDEX IF NOT EXISTS idx_clientes_marketing ON clientes(whatsappMarketingConsentimento, whatsappOptOutEm, status)');
    }
};
