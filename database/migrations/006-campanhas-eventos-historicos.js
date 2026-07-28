module.exports = {
    versao: '2026-07-28-006-campanhas-eventos-historicos',
    nome: 'Formalização das tabelas históricas de campanhas e eventos',
    async up({ exec }) {
        await exec(`CREATE TABLE IF NOT EXISTS campanhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            modeloChave TEXT,
            publico TEXT,
            imagem TEXT,
            status TEXT DEFAULT 'rascunho',
            total INTEGER DEFAULT 0,
            enviados INTEGER DEFAULT 0,
            ignorados INTEGER DEFAULT 0,
            erros INTEGER DEFAULT 0,
            jaEnviados INTEGER DEFAULT 0,
            loteAtual INTEGER DEFAULT 0,
            totalLotes INTEGER DEFAULT 0,
            proximoLoteEm TEXT,
            mensagem TEXT,
            detalhes TEXT,
            iniciadaEm TEXT,
            finalizadaEm TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await exec(`CREATE TABLE IF NOT EXISTS campanha_itens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campanhaId INTEGER NOT NULL,
            clienteId INTEGER,
            clienteNome TEXT,
            telefone TEXT,
            destino TEXT,
            status TEXT DEFAULT 'pendente',
            motivo TEXT,
            enviadoEm TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(campanhaId) REFERENCES campanhas(id) ON DELETE CASCADE,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE SET NULL
        )`);
        await exec(`CREATE TABLE IF NOT EXISTS eventos_sistema (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            nivel TEXT DEFAULT 'info',
            mensagem TEXT NOT NULL,
            detalhes TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        await exec('CREATE INDEX IF NOT EXISTS idx_campanhas_status ON campanhas(status, criadoEm DESC)');
        await exec('CREATE INDEX IF NOT EXISTS idx_campanha_itens_campanha ON campanha_itens(campanhaId, status)');
        await exec('CREATE INDEX IF NOT EXISTS idx_eventos_sistema_tipo_data ON eventos_sistema(tipo, criadoEm DESC)');
    }
};
