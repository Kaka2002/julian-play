module.exports = {
    versao: '2026-10-28-024-comprovantes-pagamentos',
    nome: 'Comprovantes opcionais no histórico de pagamentos',
    async up({ exec }) {
        await exec(`CREATE TABLE cliente_pagamento_comprovantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
            pagamentoId INTEGER NOT NULL REFERENCES cliente_pagamentos(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL CHECK(tipo IN ('image/jpeg','image/png','application/pdf')),
            tamanho INTEGER NOT NULL CHECK(tamanho > 0 AND tamanho <= 5242880),
            sha256 TEXT NOT NULL,
            conteudo BLOB NOT NULL,
            criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(clienteId,pagamentoId,sha256), CHECK(length(conteudo)=tamanho)
        );
        CREATE INDEX idx_pagamento_comprovantes ON cliente_pagamento_comprovantes(clienteId,pagamentoId,id);
        CREATE TRIGGER limpar_comprovantes_cliente_anonimizado AFTER UPDATE OF anonimizadoEm ON clientes
        WHEN COALESCE(NEW.anonimizadoEm,'') != ''
        BEGIN DELETE FROM cliente_pagamento_comprovantes WHERE clienteId=NEW.id; END;
        CREATE TRIGGER limpar_comprovantes_cliente_excluido AFTER DELETE ON clientes
        BEGIN DELETE FROM cliente_pagamento_comprovantes WHERE clienteId=OLD.id; END;
        CREATE TRIGGER limpar_comprovantes_pagamento_excluido AFTER DELETE ON cliente_pagamentos
        BEGIN DELETE FROM cliente_pagamento_comprovantes WHERE pagamentoId=OLD.id; END;`);
    }
};
