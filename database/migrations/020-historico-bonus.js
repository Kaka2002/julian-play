module.exports = {
    versao: '2026-09-26-020-historico-bonus',
    nome: 'Origem e consumo dos créditos de bônus',
    async up({ exec }) {
        await exec(`CREATE TABLE bonus_creditos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, clienteId INTEGER NOT NULL,
            campanhaChave TEXT NOT NULL DEFAULT 'nao_identificada',
            origem TEXT NOT NULL DEFAULT 'ajuste', indicacaoCreditoId INTEGER UNIQUE,
            meses INTEGER NOT NULL CHECK(meses > 0), saldo INTEGER NOT NULL CHECK(saldo >= 0),
            indicado TEXT NOT NULL DEFAULT '', criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            identificadoEm TEXT, responsavel TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX idx_bonus_creditos_cliente ON bonus_creditos(clienteId, id);
        CREATE TABLE bonus_operacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, clienteId INTEGER NOT NULL,
            saldoAntes INTEGER NOT NULL, saldoDepois INTEGER NOT NULL,
            tipo TEXT NOT NULL DEFAULT 'ajuste', pagamentoId INTEGER,
            vencimento TEXT, criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE bonus_baixas (
            operacaoId INTEGER NOT NULL, creditoId INTEGER NOT NULL,
            meses INTEGER NOT NULL CHECK(meses > 0), PRIMARY KEY(operacaoId, creditoId)
        );
        CREATE TABLE bonus_identificacoes (
            chave TEXT PRIMARY KEY, clienteId INTEGER NOT NULL,
            creditoId INTEGER NOT NULL, meses INTEGER NOT NULL,
            campanhaChave TEXT NOT NULL, criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO bonus_creditos (clienteId, meses, saldo, origem)
            SELECT id, bonusMeses, bonusMeses, 'saldo_anterior' FROM clientes WHERE bonusMeses > 0;
        CREATE TRIGGER bonus_credito_indicacao AFTER INSERT ON indicacao_creditos BEGIN
            INSERT INTO bonus_creditos (clienteId, campanhaChave, origem, indicacaoCreditoId, meses, saldo, criadoEm)
            VALUES (NEW.indicadorClienteId, NEW.campanhaChave, 'indicacao', NEW.id, NEW.meses, NEW.meses, NEW.criadoEm);
        END;
        CREATE TRIGGER bonus_saldo_inicial AFTER INSERT ON clientes WHEN NEW.bonusMeses > 0 BEGIN
            INSERT INTO bonus_creditos (clienteId, meses, saldo) VALUES (NEW.id, NEW.bonusMeses, NEW.bonusMeses);
        END;
        CREATE TRIGGER bonus_saldo_aumento AFTER UPDATE OF bonusMeses ON clientes
        WHEN NEW.bonusMeses > COALESCE(OLD.bonusMeses, 0) BEGIN
            INSERT INTO bonus_creditos (clienteId, meses, saldo, campanhaChave, origem)
            SELECT NEW.id, NEW.bonusMeses - COALESCE(SUM(saldo), 0), NEW.bonusMeses - COALESCE(SUM(saldo), 0),
                CASE WHEN COALESCE(NEW.ultimoAvisoAniversario, '') <> COALESCE(OLD.ultimoAvisoAniversario, '') THEN 'aniversario' ELSE 'nao_identificada' END,
                'ajuste'
            FROM bonus_creditos WHERE clienteId = NEW.id
            HAVING NEW.bonusMeses > COALESCE(SUM(saldo), 0);
        END;
        CREATE TRIGGER bonus_saldo_baixa AFTER UPDATE OF bonusMeses ON clientes
        WHEN NEW.bonusMeses < OLD.bonusMeses BEGIN
            INSERT INTO bonus_operacoes (clienteId, saldoAntes, saldoDepois, vencimento)
            VALUES (NEW.id, OLD.bonusMeses, NEW.bonusMeses, NEW.dataVencimento);
            INSERT INTO bonus_baixas (operacaoId, creditoId, meses)
            SELECT (SELECT MAX(id) FROM bonus_operacoes WHERE clienteId = NEW.id), b.id,
                MIN(b.saldo, OLD.bonusMeses - NEW.bonusMeses - COALESCE((SELECT SUM(a.saldo) FROM bonus_creditos a WHERE a.clienteId = NEW.id AND (a.criadoEm < b.criadoEm OR (a.criadoEm = b.criadoEm AND a.id < b.id))), 0))
            FROM bonus_creditos b WHERE b.clienteId = NEW.id AND b.saldo > 0
                AND OLD.bonusMeses - NEW.bonusMeses > COALESCE((SELECT SUM(a.saldo) FROM bonus_creditos a WHERE a.clienteId = NEW.id AND (a.criadoEm < b.criadoEm OR (a.criadoEm = b.criadoEm AND a.id < b.id))), 0);
            UPDATE bonus_creditos SET saldo = saldo - COALESCE((SELECT meses FROM bonus_baixas
                WHERE creditoId = bonus_creditos.id AND operacaoId = (SELECT MAX(id) FROM bonus_operacoes WHERE clienteId = NEW.id)), 0)
                WHERE clienteId = NEW.id;
        END;`);
    }
};
