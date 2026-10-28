module.exports = {
    versao: '2026-10-28-023-assinaturas-responsavel',
    nome: 'Reconhecimento de assinaturas do mesmo responsável',
    async up({ exec }) {
        await exec(`CREATE TABLE cliente_assinaturas_vinculos (
            clienteA INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
            clienteB INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
            telefone TEXT NOT NULL,
            criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(clienteA, clienteB), CHECK(clienteA < clienteB)
        );
        CREATE TRIGGER limpar_vinculos_cliente_atualizado
        AFTER UPDATE OF telefone, anonimizadoEm ON clientes
        WHEN COALESCE(OLD.telefone,'') != COALESCE(NEW.telefone,'') OR COALESCE(NEW.anonimizadoEm,'') != ''
        BEGIN DELETE FROM cliente_assinaturas_vinculos WHERE clienteA=NEW.id OR clienteB=NEW.id; END;
        CREATE TRIGGER limpar_vinculos_cliente_excluido AFTER DELETE ON clientes
        BEGIN DELETE FROM cliente_assinaturas_vinculos WHERE clienteA=OLD.id OR clienteB=OLD.id; END;`);
    }
};
