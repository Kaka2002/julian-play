module.exports={
    versao:'2026-10-28-025-validade-campanhas',
    nome:'Edicoes e validade das campanhas de indicacao',
    async up({exec}){await exec(`
        CREATE TABLE indicacao_campanhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, modeloChave TEXT NOT NULL,
            titulo TEXT NOT NULL, meses INTEGER NOT NULL, indicados INTEGER NOT NULL,
            pagamentos INTEGER NOT NULL, inicioEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            validadeEm TEXT, encerradaEm TEXT, status TEXT NOT NULL DEFAULT 'ativa'
        );
        ALTER TABLE modelos_mensagem ADD COLUMN campanhaEdicaoId INTEGER;
        ALTER TABLE programa_indicacoes ADD COLUMN campanhaEdicaoId INTEGER;
        ALTER TABLE programa_indicacoes ADD COLUMN pagamentoAteId INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE programa_indicacoes ADD COLUMN assinaturaInicialRegistrada INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE indicacao_creditos ADD COLUMN campanhaEdicaoId INTEGER;
        ALTER TABLE campanhas ADD COLUMN campanhaEdicaoId INTEGER;
        CREATE INDEX idx_indicacoes_edicao ON programa_indicacoes(campanhaEdicaoId,status);
        CREATE INDEX idx_campanha_telefone_envio ON campanha_itens(campanhaId,telefone,status);
        CREATE TABLE campanha_destinatarios (
            campanhaEdicaoId INTEGER NOT NULL, telefone TEXT NOT NULL, estado TEXT NOT NULL,
            criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(campanhaEdicaoId,telefone)
        );
        CREATE TRIGGER limpar_destinatario_campanha_anon AFTER UPDATE OF anonimizadoEm ON clientes
        WHEN COALESCE(NEW.anonimizadoEm,'')<>'' BEGIN DELETE FROM campanha_destinatarios WHERE telefone IN (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(OLD.telefone,'+',''),' ',''),'-',''),'(',''),')',''),'55'||REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(OLD.telefone,'+',''),' ',''),'-',''),'(',''),')','')); END;
        CREATE TRIGGER limpar_destinatario_campanha_exclusao AFTER DELETE ON clientes
        BEGIN DELETE FROM campanha_destinatarios WHERE telefone IN (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(OLD.telefone,'+',''),' ',''),'-',''),'(',''),')',''),'55'||REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(OLD.telefone,'+',''),' ',''),'-',''),'(',''),')','')); END;
        INSERT INTO indicacao_campanhas(modeloChave,titulo,meses,indicados,pagamentos,status)
        SELECT chave, CASE WHEN chave='campanha_amizade_presente' THEN 'Amizade que vale presente — 1 mês' ELSE 'Indique e ganhe 3 meses — 3 meses' END,
            CASE WHEN chave='campanha_amizade_presente' THEN 1 ELSE 3 END,
            CASE WHEN chave='campanha_amizade_presente' THEN 1 ELSE 2 END,
            CASE WHEN chave='campanha_amizade_presente' THEN 1 ELSE 2 END,'legada'
        FROM modelos_mensagem WHERE chave IN ('campanha_amizade_presente','campanha_indique_ganhe_tres_meses');
        UPDATE modelos_mensagem SET campanhaEdicaoId=(SELECT id FROM indicacao_campanhas e WHERE e.modeloChave=modelos_mensagem.chave LIMIT 1)
        WHERE plano='campanha';
        UPDATE programa_indicacoes SET campanhaEdicaoId=(SELECT id FROM indicacao_campanhas e WHERE e.modeloChave=programa_indicacoes.campanhaChave LIMIT 1);
        UPDATE indicacao_creditos SET campanhaEdicaoId=(SELECT id FROM indicacao_campanhas e WHERE e.modeloChave=indicacao_creditos.campanhaChave LIMIT 1);
    `);}
};
