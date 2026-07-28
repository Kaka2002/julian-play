const db = require('../database/sqlite');
const { obterContextoObservabilidade } = require('./observabilidadeService');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    }));
}

function registrarEventoSistema(tipo, nivel, mensagem, detalhes = {}) {
    const contexto = obterContextoObservabilidade();
    return executar(
        `INSERT INTO eventos_sistema (tipo, nivel, mensagem, detalhes)
        VALUES (?, ?, ?, ?)`,
        [
            String(tipo || 'sistema'),
            String(nivel || 'info'),
            String(mensagem || ''),
            JSON.stringify({
                ...(detalhes || {}),
                correlationId: detalhes?.correlationId || contexto.correlationId || '',
                requisicao: contexto.caminho ? { metodo: contexto.metodo, caminho: contexto.caminho } : undefined
            })
        ]
    );
}

function listarEventosSistema(limite = 30) {
    const total = Math.max(1, Math.min(100, Number(limite || 30)));
    return buscarTodos(
        `SELECT * FROM eventos_sistema
        ORDER BY datetime(criadoEm) DESC, id DESC
        LIMIT ?`,
        [total]
    );
}

module.exports = {
    registrarEventoSistema,
    listarEventosSistema
};
