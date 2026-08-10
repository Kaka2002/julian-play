const db = require('../database/sqlite');
const { proteger, revelar, estaProtegido } = require('./cofreSegredosService');
const avisosCredenciaisIndisponiveis = new Set();

function revelarCampoSeguro(chave, valor) {
    try {
        return revelar(chave, valor || '');
    } catch (err) {
        const aviso = `${chave}:${String(valor || '').slice(0, 32)}`;
        if (!avisosCredenciaisIndisponiveis.has(aviso)) {
            avisosCredenciaisIndisponiveis.add(aviso);
            console.warn(`Credencial preservada, mas indisponivel para leitura (${chave}): ${err.message}`);
        }
        return '';
    }
}

function protegerCredenciais(cliente = {}) {
    return {
        ...cliente,
        senha: proteger('cliente.senha', cliente.senha || ''),
        senhaApp: proteger('cliente.senhaApp', cliente.senhaApp || ''),
        acessosApp: proteger('cliente.acessosApp', cliente.acessosApp || '')
    };
}

function revelarCredenciais(cliente) {
    if (!cliente) return cliente;
    return {
        ...cliente,
        senha: revelarCampoSeguro('cliente.senha', cliente.senha),
        senhaApp: revelarCampoSeguro('cliente.senhaApp', cliente.senhaApp),
        acessosApp: revelarCampoSeguro('cliente.acessosApp', cliente.acessosApp)
    };
}

async function migrarCredenciaisExistentes() {
    await db.ready;
    const rows = await new Promise((resolve, reject) => db.all(
        `SELECT id, senha, senhaApp, acessosApp FROM clientes
         WHERE COALESCE(senha, '') != '' OR COALESCE(senhaApp, '') != '' OR COALESCE(acessosApp, '') != ''`,
        (err, itens) => err ? reject(err) : resolve(itens || [])
    ));
    const pendentes = rows.map(protegerCredenciais).filter((item, indice) => {
        const original = rows[indice];
        return item.senha !== original.senha || item.senhaApp !== original.senhaApp || item.acessosApp !== original.acessosApp;
    });
    if (!pendentes.length) return { migrados: 0 };
    await new Promise((resolve, reject) => db.serialize(() => {
        db.run('BEGIN IMMEDIATE TRANSACTION');
        const stmt = db.prepare('UPDATE clientes SET senha=?, senhaApp=?, acessosApp=? WHERE id=?');
        for (const item of pendentes) stmt.run(item.senha, item.senhaApp, item.acessosApp, item.id);
        stmt.finalize((err) => {
            if (err) return db.run('ROLLBACK', () => reject(err));
            db.run('COMMIT', erro => erro ? reject(erro) : resolve());
        });
    }));
    await new Promise((resolve, reject) => db.run(
        `INSERT OR IGNORE INTO schema_migrations (versao) VALUES ('2026-07-28-credenciais-clientes')`,
        err => err ? reject(err) : resolve()
    ));
    return { migrados: pendentes.length };
}

module.exports = { protegerCredenciais, revelarCredenciais, migrarCredenciaisExistentes, estaProtegido };
