module.exports = {
    versao: '2026-07-28-001-sessoes-administrativas',
    nome: 'Sessões administrativas persistentes',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS sessoes_painel (
            tokenHash TEXT PRIMARY KEY,
            usuario TEXT NOT NULL,
            criadoEm TEXT NOT NULL,
            expiraEm INTEGER NOT NULL,
            ultimoAcessoEm TEXT NOT NULL,
            ip TEXT,
            userAgent TEXT,
            revogadaEm TEXT
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_sessoes_painel_ativas ON sessoes_painel(revogadaEm, expiraEm)');
    }
};
