const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));
const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'clientes.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

const ready = new Promise((resolve) => {
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT NOT NULL,
            ddiTelefone TEXT DEFAULT '55',
            paisTelefone TEXT DEFAULT 'BR',
            usuario TEXT,
            senha TEXT,
            plano TEXT,
            aparelho TEXT,
            vencimento TEXT,
            nascimento TEXT,
            tipoPlanoId INTEGER,
            diasContrato INTEGER,
            valorPlano TEXT,
            assinaturaApp TEXT,
            validadeApp TEXT,
            dataValidadeApp TEXT,
            horasTeste TEXT,
            dataInicio TEXT,
            dataVencimento TEXT,
            appsInstalados TEXT,
            dispositivosSelecionados TEXT,
            paineisSelecionados TEXT,
            conexoesPainel INTEGER DEFAULT 0,
            appInstalado INTEGER DEFAULT 0,
            usuarioApp TEXT,
            senhaApp TEXT,
            enderecoMac TEXT,
            idAplicativo TEXT,
            acessosApp TEXT,
            observacoes TEXT,
            origem TEXT,
            tags TEXT,
            bonusMeses INTEGER DEFAULT 0,
            status TEXT DEFAULT 'teste',
            ultimoAvisoRenovacao TEXT,
            ultimoAvisoAniversario TEXT,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS modelos_mensagem (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chave TEXT NOT NULL UNIQUE,
            plano TEXT DEFAULT 'padrao',
            titulo TEXT NOT NULL,
            texto TEXT NOT NULL,
            cor TEXT DEFAULT 'blue',
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS configuracoes (
            chave TEXT PRIMARY KEY,
            valor TEXT,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            descricao TEXT,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS dispositivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS paineis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tipos_planos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            dias INTEGER NOT NULL,
            valor TEXT,
            ativo INTEGER DEFAULT 1,
            dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS avisos_renovacao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            vencimento TEXT NOT NULL,
            diasAntes INTEGER NOT NULL,
            enviadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(clienteId, vencimento, diasAntes)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cliente_notas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            texto TEXT NOT NULL,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cliente_atendimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            motivo TEXT NOT NULL,
            prioridade TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'aberto',
            descricao TEXT,
            proximoContato TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolvidoEm TEXT,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE CASCADE
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_cliente_atendimentos_status ON cliente_atendimentos(status, prioridade, proximoContato)');
    db.run('CREATE INDEX IF NOT EXISTS idx_cliente_atendimentos_cliente ON cliente_atendimentos(clienteId, criadoEm DESC)');

    db.run(`
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT,
            origem TEXT,
            interesse TEXT,
            status TEXT DEFAULT 'novo',
            prioridade TEXT DEFAULT 'normal',
            valorEstimado TEXT,
            proximoContato TEXT,
            ultimoContato TEXT,
            motivoPerda TEXT,
            observacoes TEXT,
            clienteId INTEGER,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            convertidoEm TEXT,
            perdidoEm TEXT,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE SET NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS lead_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            leadId INTEGER NOT NULL,
            tipo TEXT DEFAULT 'nota',
            texto TEXT NOT NULL,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(leadId) REFERENCES leads(id) ON DELETE CASCADE
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, prioridade, proximoContato)');
    db.run('CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone)');
    db.run('CREATE INDEX IF NOT EXISTS idx_lead_historico_lead ON lead_historico(leadId, criadoEm DESC)');

    db.run(`
        CREATE TABLE IF NOT EXISTS testes_gratis_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telefone TEXT NOT NULL UNIQUE,
            nome TEXT,
            dispositivo TEXT,
            origem TEXT,
            clienteId INTEGER,
            dataPrimeiroTeste DATETIME DEFAULT CURRENT_TIMESTAMP,
            dataUltimaSolicitacao DATETIME DEFAULT CURRENT_TIMESTAMP,
            totalSolicitacoes INTEGER DEFAULT 1
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cliente_pagamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER NOT NULL,
            tipoPlanoId INTEGER,
            plano TEXT NOT NULL,
            diasContrato INTEGER DEFAULT 0,
            valorPlano TEXT,
            assinaturaApp TEXT,
            valorTotal TEXT,
            formaPagamento TEXT,
            dataPagamento TEXT,
            vencimentoAnterior TEXT,
            vencimentoNovo TEXT,
            observacoes TEXT,
            mensagemEnviada INTEGER DEFAULT 0,
            erroMensagem TEXT,
            excluidoEm TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cliente_interacoes_robo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clienteId INTEGER,
            telefone TEXT,
            tipo TEXT DEFAULT 'whatsapp',
            titulo TEXT,
            resumo TEXT,
            destino TEXT,
            status TEXT DEFAULT 'registrado',
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(clienteId) REFERENCES clientes(id) ON DELETE SET NULL
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_cliente_interacoes_robo_cliente ON cliente_interacoes_robo(clienteId, criadoEm DESC)');
    db.run('CREATE INDEX IF NOT EXISTS idx_cliente_interacoes_robo_telefone ON cliente_interacoes_robo(telefone, criadoEm DESC)');

    db.run(`
        CREATE TABLE IF NOT EXISTS eventos_sistema (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            nivel TEXT DEFAULT 'info',
            mensagem TEXT NOT NULL,
            detalhes TEXT,
            criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const colunas = {
        ddiTelefone: "TEXT DEFAULT '55'",
        paisTelefone: "TEXT DEFAULT 'BR'",
        usuario: 'TEXT',
        senha: 'TEXT',
        plano: 'TEXT',
        aparelho: 'TEXT',
        vencimento: 'TEXT',
        nascimento: 'TEXT',
        tipoPlanoId: 'INTEGER',
        diasContrato: 'INTEGER',
        valorPlano: 'TEXT',
        assinaturaApp: 'TEXT',
        validadeApp: 'TEXT',
        dataValidadeApp: 'TEXT',
        horasTeste: 'TEXT',
        dataInicio: 'TEXT',
        dataVencimento: 'TEXT',
        appsInstalados: 'TEXT',
        dispositivosSelecionados: 'TEXT',
        paineisSelecionados: 'TEXT',
        conexoesPainel: 'INTEGER DEFAULT 0',
        appInstalado: 'INTEGER DEFAULT 0',
        usuarioApp: 'TEXT',
        senhaApp: 'TEXT',
        enderecoMac: 'TEXT',
        idAplicativo: 'TEXT',
        acessosApp: 'TEXT',
        observacoes: 'TEXT',
        origem: 'TEXT',
        tags: 'TEXT',
        bonusMeses: 'INTEGER DEFAULT 0',
        status: "TEXT DEFAULT 'teste'",
        ultimoAvisoRenovacao: 'TEXT',
        ultimoAvisoAniversario: 'TEXT',
        atualizadoEm: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };

    db.all('PRAGMA table_info(clientes)', (err, rows) => {
        if (err) {
            console.error('Erro ao verificar tabela clientes:', err);
            return;
        }

        const existentes = new Set(rows.map(row => row.name));

        Object.entries(colunas).forEach(([nome, tipo]) => {
            if (!existentes.has(nome)) {
                db.run(`ALTER TABLE clientes ADD COLUMN ${nome} ${tipo}`);
            }
        });

        migrarTelefoneDuplicado(() => migrarPagamentos(() => migrarCatalogos(() => resolve())));
    });
});
});

function adicionarColunaSeNaoExiste(tabela, coluna, definicao, done) {
    db.all(`PRAGMA table_info(${tabela})`, (err, rows = []) => {
        if (err) {
            console.error(`Erro ao verificar tabela ${tabela}:`, err);
            done();
            return;
        }

        const existentes = new Set(rows.map(row => row.name));
        if (!existentes.has(coluna)) {
            db.run(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`, () => done());
            return;
        }

        done();
    });
}

function migrarCatalogos(done) {
    const tarefas = [
        ['apps', 'ativo', 'INTEGER DEFAULT 1'],
        ['apps', 'dataCadastro', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['apps', 'atualizadoEm', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['dispositivos', 'ativo', 'INTEGER DEFAULT 1'],
        ['dispositivos', 'dataCadastro', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['dispositivos', 'atualizadoEm', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['paineis', 'ativo', 'INTEGER DEFAULT 1'],
        ['paineis', 'dataCadastro', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['paineis', 'atualizadoEm', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['tipos_planos', 'valor', 'TEXT'],
        ['tipos_planos', 'ativo', 'INTEGER DEFAULT 1'],
        ['tipos_planos', 'dataCadastro', 'DATETIME DEFAULT CURRENT_TIMESTAMP'],
        ['tipos_planos', 'atualizadoEm', 'DATETIME DEFAULT CURRENT_TIMESTAMP']
    ];

    function proxima(indice = 0) {
        if (indice >= tarefas.length) {
            done();
            return;
        }

        const [tabela, coluna, definicao] = tarefas[indice];
        adicionarColunaSeNaoExiste(tabela, coluna, definicao, () => proxima(indice + 1));
    }

    proxima();
}

function migrarPagamentos(done) {
    db.all('PRAGMA table_info(cliente_pagamentos)', (err, rows = []) => {
        if (err) {
            console.error('Erro ao verificar tabela cliente_pagamentos:', err);
            done();
            return;
        }

        const existentes = new Set(rows.map(row => row.name));
        if (!existentes.has('excluidoEm')) {
            db.run('ALTER TABLE cliente_pagamentos ADD COLUMN excluidoEm TEXT', () => done());
            return;
        }

        done();
    });
}

function migrarTelefoneDuplicado(done) {
    db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'clientes'", (err, tabela) => {
        if (err) {
            console.error('Erro ao verificar tabela clientes:', err);
            done();
            return;
        }

        const temTelefoneUnico = String(tabela?.sql || '').toUpperCase().includes('TELEFONE TEXT NOT NULL UNIQUE');

        if (!temTelefoneUnico) {
            db.run('DROP INDEX IF EXISTS idx_clientes_telefone', () => {
                db.run('CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)', () => done());
            });
            return;
        }

        db.serialize(() => {
            db.run('ALTER TABLE clientes RENAME TO clientes_backup_unico');
            db.run(`
                CREATE TABLE clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    telefone TEXT NOT NULL,
                    ddiTelefone TEXT DEFAULT '55',
                    paisTelefone TEXT DEFAULT 'BR',
                    usuario TEXT,
                    senha TEXT,
                    plano TEXT,
                    aparelho TEXT,
                    vencimento TEXT,
                    nascimento TEXT,
                    tipoPlanoId INTEGER,
                    diasContrato INTEGER,
                    valorPlano TEXT,
                    assinaturaApp TEXT,
                    validadeApp TEXT,
                    horasTeste TEXT,
                    dataInicio TEXT,
                    dataVencimento TEXT,
                    appsInstalados TEXT,
                    dispositivosSelecionados TEXT,
                    paineisSelecionados TEXT,
                    conexoesPainel INTEGER DEFAULT 0,
                    appInstalado INTEGER DEFAULT 0,
                    usuarioApp TEXT,
                    senhaApp TEXT,
                    enderecoMac TEXT,
                    idAplicativo TEXT,
                    acessosApp TEXT,
                    observacoes TEXT,
                    origem TEXT,
                    tags TEXT,
                    bonusMeses INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'teste',
                    ultimoAvisoRenovacao TEXT,
                    ultimoAvisoAniversario TEXT,
                    dataCadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
                    atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            db.run(`
                INSERT INTO clientes (
                    id, nome, telefone, ddiTelefone, paisTelefone, usuario, senha, plano, aparelho, vencimento,
                    nascimento, tipoPlanoId, diasContrato, valorPlano, assinaturaApp,
                    validadeApp, horasTeste, dataInicio, dataVencimento, appsInstalados,
                    dispositivosSelecionados, paineisSelecionados, conexoesPainel, appInstalado,
                    usuarioApp, senhaApp, observacoes, origem, tags, bonusMeses, status, ultimoAvisoRenovacao,
                    ultimoAvisoAniversario, dataCadastro, atualizadoEm
                )
                SELECT
                    id, nome, telefone, '55', 'BR', usuario, senha, plano, aparelho, vencimento,
                    nascimento, tipoPlanoId, diasContrato, valorPlano, assinaturaApp,
                    validadeApp, horasTeste, dataInicio, dataVencimento, appsInstalados,
                    dispositivosSelecionados, paineisSelecionados, 0, appInstalado,
                    usuarioApp, senhaApp, observacoes, origem, tags, bonusMeses, status, ultimoAvisoRenovacao,
                    ultimoAvisoAniversario, dataCadastro, atualizadoEm
                FROM clientes_backup_unico
            `);
            db.run('DROP TABLE clientes_backup_unico');
            db.run('DROP INDEX IF EXISTS idx_clientes_telefone');
            db.run('CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)', () => done());
        });
    });
}

db.ready = ready;
db.dbPath = dbPath;
db.dataDir = DATA_DIR;

module.exports = db;
