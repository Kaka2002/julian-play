module.exports = {
    versao: '008-fila-mensagens-persistente',
    nome: 'Fila persistente para mensagens proativas do WhatsApp',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS mensagens_saida_fila (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            protocolo TEXT NOT NULL UNIQUE,
            tipo TEXT NOT NULL DEFAULT 'texto',
            destino TEXT NOT NULL,
            payloadProtegido TEXT NOT NULL,
            descricao TEXT,
            opcoes TEXT,
            status TEXT NOT NULL DEFAULT 'pendente',
            tentativas INTEGER NOT NULL DEFAULT 0,
            maxTentativas INTEGER NOT NULL DEFAULT 5,
            proximaTentativaEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            iniciadoEm DATETIME,
            concluidoEm DATETIME,
            mensagemId TEXT,
            erro TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_mensagens_saida_fila_status ON mensagens_saida_fila(status, proximaTentativaEm, id)');
    }
};
