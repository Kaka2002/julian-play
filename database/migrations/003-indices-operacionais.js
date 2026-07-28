module.exports = {
    versao: '2026-07-28-003-indices-operacionais',
    nome: 'Índices operacionais e de auditoria',
    async up({ exec }) {
        await exec('CREATE INDEX IF NOT EXISTS idx_eventos_sistema_tipo_data ON eventos_sistema(tipo, criadoEm DESC)');
        await exec('CREATE INDEX IF NOT EXISTS idx_cobrancas_status_data ON cobrancas_pix(status, criadoEm DESC)');
        await exec('CREATE INDEX IF NOT EXISTS idx_pagamentos_cliente_data ON cliente_pagamentos(clienteId, criadoEm DESC)');
    }
};
