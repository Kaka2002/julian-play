module.exports = {
    versao: '2026-09-19-013-comprovantes-pix-whatsapp',
    nome: 'Comprovantes PIX recebidos pelo WhatsApp',
    async up({ exec }) {
        await exec(`CREATE INDEX IF NOT EXISTS idx_cobrancas_pix_comprovantes_whatsapp
            ON cobrancas_pix(provedor, status, criadoEm DESC)`);
    }
};
