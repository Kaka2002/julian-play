module.exports = {
    versao: '2026-08-18-010-indicacao-cliente',
    nome: 'Identificação da indicação de cliente',
    async up({ adicionarColuna, exec }) {
        await adicionarColuna('clientes', 'indicadoPor', 'TEXT');
        await exec('CREATE INDEX IF NOT EXISTS idx_clientes_indicado_por ON clientes(indicadoPor COLLATE NOCASE)');
    }
};
