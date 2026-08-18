const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const migrations = [
    require('./001-sessoes-administrativas'),
    require('./002-pagamentos-manuais-auditaveis'),
    require('./003-indices-operacionais'),
    require('./004-governanca-campanhas'),
    require('./005-estruturas-historicas'),
    require('./006-campanhas-eventos-historicos'),
    require('./007-aniversario-dia-mes'),
    require('./008-fila-mensagens-persistente'),
    require('./009-governanca-privacidade'),
    require('./010-indicacao-cliente')
];

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function concluido(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, alteracoes: this.changes });
        });
    });
}

function exec(db, sql) {
    return new Promise((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}

function quickCheck(caminho) {
    return new Promise((resolve, reject) => {
        const teste = new sqlite3.Database(caminho, sqlite3.OPEN_READONLY, erro => {
            if (erro) return reject(erro);
            teste.get('PRAGMA quick_check', (err, row) => {
                const valor = String(row?.quick_check || Object.values(row || {})[0] || '');
                teste.close();
                if (err) return reject(err);
                valor.toLowerCase() === 'ok' ? resolve() : reject(new Error(valor || 'Backup pré-migração inválido.'));
            });
        });
    });
}

function carimbo() {
    return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

async function criarBackupPreMigracao(dbPath, dataDir) {
    const pasta = path.join(dataDir, 'backups');
    fs.mkdirSync(pasta, { recursive: true });
    const destino = path.join(pasta, `pre-migracao-${carimbo()}-${crypto.randomBytes(4).toString('hex')}.db`);
    fs.copyFileSync(dbPath, destino, fs.constants.COPYFILE_EXCL);
    await quickCheck(destino);
    const conteudo = fs.readFileSync(destino);
    fs.writeFileSync(`${destino}.json`, JSON.stringify({
        versao: 1,
        arquivo: path.basename(destino),
        tamanho: conteudo.length,
        criadoEm: new Date().toISOString(),
        hashSha256: crypto.createHash('sha256').update(conteudo).digest('hex'),
        integridade: 'ok',
        restauracaoTeste: 'aprovada',
        finalidade: 'pre_migracao',
        verificadoEm: new Date().toISOString()
    }, null, 2));
    return destino;
}

function fonteMigracaoCanonica(migracao) {
    return migracao.up.toString().replace(/\r\n?/g, '\n');
}

function calcularChecksumMigracao(migracao, fonte) {
    return crypto.createHash('sha256')
        .update(`${migracao.versao}\n${migracao.nome}\n${fonte}`)
        .digest('hex');
}

function checksumMigracao(migracao) {
    return calcularChecksumMigracao(migracao, fonteMigracaoCanonica(migracao));
}

function checksumMigracaoLegadoCrlf(migracao) {
    return calcularChecksumMigracao(
        migracao,
        fonteMigracaoCanonica(migracao).replace(/\n/g, '\r\n')
    );
}

function classificarChecksumMigracao(migracao, checksumRegistrado) {
    if (!checksumRegistrado || checksumRegistrado === checksumMigracao(migracao)) return 'atual';
    if (checksumRegistrado === checksumMigracaoLegadoCrlf(migracao)) return 'legado_crlf';
    throw new Error(`Checksum divergente na migração já aplicada: ${migracao.versao}.`);
}

async function adicionarColuna(db, tabela, coluna, definicao) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tabela) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(coluna)) {
        throw new Error('Identificador inválido na migração.');
    }
    const colunas = await all(db, `PRAGMA table_info(${tabela})`);
    if (!colunas.some(item => item.name === coluna)) {
        await exec(db, `ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
    }
}

async function garantirMetadados(db) {
    const colunas = await all(db, 'PRAGMA table_info(schema_migrations)');
    const nomes = new Set(colunas.map(item => item.name));
    if (!nomes.has('nome')) await exec(db, 'ALTER TABLE schema_migrations ADD COLUMN nome TEXT');
    if (!nomes.has('checksum')) await exec(db, 'ALTER TABLE schema_migrations ADD COLUMN checksum TEXT');
    if (!nomes.has('duracaoMs')) await exec(db, 'ALTER TABLE schema_migrations ADD COLUMN duracaoMs INTEGER');
}

async function executarMigracoesFormais({ db, dbPath, dataDir, lista = migrations }) {
    const aplicadasBasicas = await all(db, 'SELECT versao FROM schema_migrations');
    const versoesAplicadas = new Set(aplicadasBasicas.map(item => item.versao));
    const pendentes = lista.filter(item => !versoesAplicadas.has(item.versao));
    const colunasControle = await all(db, 'PRAGMA table_info(schema_migrations)');
    const possuiChecksum = colunasControle.some(item => item.name === 'checksum');
    const aplicadasComChecksum = possuiChecksum
        ? await all(db, 'SELECT versao, checksum FROM schema_migrations')
        : [];
    const checksumsLegados = [];

    for (const migracao of lista) {
        const registrada = aplicadasComChecksum.find(item => item.versao === migracao.versao);
        if (registrada?.checksum && classificarChecksumMigracao(migracao, registrada.checksum) === 'legado_crlf') {
            checksumsLegados.push({ migracao, checksumRegistrado: registrada.checksum });
        }
    }

    const relatorio = {
        iniciadoEm: new Date().toISOString(),
        banco: dbPath,
        backup: '',
        pendentes: pendentes.map(item => item.versao),
        aplicadas: [],
        checksumsNormalizados: [],
        status: 'sem_alteracoes'
    };
    if (!pendentes.length && !checksumsLegados.length) {
        return relatorio;
    }

    relatorio.backup = await criarBackupPreMigracao(dbPath, dataDir);
    await garantirMetadados(db);

    if (checksumsLegados.length) {
        try {
            await exec(db, 'BEGIN IMMEDIATE');
            for (const item of checksumsLegados) {
                const resultado = await run(db, `UPDATE schema_migrations
                    SET checksum = ? WHERE versao = ? AND checksum = ?`, [
                    checksumMigracao(item.migracao),
                    item.migracao.versao,
                    item.checksumRegistrado
                ]);
                if (resultado.alteracoes !== 1) {
                    throw new Error(`O checksum de ${item.migracao.versao} mudou durante a normalização.`);
                }
                relatorio.checksumsNormalizados.push(item.migracao.versao);
            }
            await exec(db, 'COMMIT');
        } catch (err) {
            await exec(db, 'ROLLBACK').catch(() => {});
            relatorio.status = 'erro';
            relatorio.erro = { etapa: 'normalizacao_checksum', mensagem: err.message };
            relatorio.concluidoEm = new Date().toISOString();
            gravarRelatorio(dataDir, relatorio);
            throw new Error(`Normalização segura dos checksums falhou e foi revertida: ${err.message}`);
        }
    }

    for (const migracao of pendentes) {
        const inicio = Date.now();
        try {
            await exec(db, 'BEGIN IMMEDIATE');
            await migracao.up({
                exec: sql => exec(db, sql),
                run: (sql, params) => run(db, sql, params),
                all: (sql, params) => all(db, sql, params),
                adicionarColuna: (tabela, coluna, definicao) => adicionarColuna(db, tabela, coluna, definicao)
            });
            const duracaoMs = Date.now() - inicio;
            await run(db, `INSERT INTO schema_migrations
                (versao, nome, checksum, duracaoMs, aplicadoEm)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [
                migracao.versao, migracao.nome, checksumMigracao(migracao), duracaoMs
            ]);
            await exec(db, 'COMMIT');
            relatorio.aplicadas.push({ versao: migracao.versao, nome: migracao.nome, duracaoMs });
        } catch (err) {
            await exec(db, 'ROLLBACK').catch(() => {});
            relatorio.status = 'erro';
            relatorio.erro = { versao: migracao.versao, mensagem: err.message };
            relatorio.concluidoEm = new Date().toISOString();
            gravarRelatorio(dataDir, relatorio);
            throw new Error(`Migração ${migracao.versao} falhou e foi revertida: ${err.message}`);
        }
    }

    relatorio.status = 'sucesso';
    relatorio.concluidoEm = new Date().toISOString();
    gravarRelatorio(dataDir, relatorio);
    return relatorio;
}

function gravarRelatorio(dataDir, relatorio) {
    const pasta = path.join(dataDir, 'migrations');
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'ultimo-relatorio.json'), JSON.stringify(relatorio, null, 2));
}

async function obterEstadoMigracoes(db) {
    const rows = await all(db, `SELECT versao, nome, checksum, duracaoMs, aplicadoEm
        FROM schema_migrations ORDER BY aplicadoEm DESC, versao DESC`);
    return {
        total: rows.length,
        ultima: rows[0] || null,
        aplicadas: rows
    };
}

module.exports = {
    migrations,
    executarMigracoesFormais,
    obterEstadoMigracoes,
    criarBackupPreMigracao,
    checksumMigracao,
    checksumMigracaoLegadoCrlf
};
