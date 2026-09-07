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

const TIPOS_EVENTOS_PRESERVADOS = [
    'pix%', 'paypal%', 'pagamento%', 'privacidade%', 'seguranca%',
    'auditoria%', 'exclusao%', 'renovacao_painel%', 'campanha_reclamacao%'
];

function filtroEventosDescartaveis() {
    return TIPOS_EVENTOS_PRESERVADOS.map(() => 'tipo NOT LIKE ?').join(' AND ');
}

function normalizarDiasRetencao(dias) {
    const valor = Number.parseInt(dias, 10);
    return valor === 180 ? 180 : 365;
}

async function obterPreviaRetencaoEventos(dias = 365) {
    const retencaoDias = normalizarDiasRetencao(dias);
    const parametros = [`-${retencaoDias} days`, ...TIPOS_EVENTOS_PRESERVADOS];
    const linhas = await buscarTodos(
        `SELECT COUNT(*) AS total, MIN(criadoEm) AS maisAntigo, MAX(criadoEm) AS maisRecente
         FROM eventos_sistema
         WHERE datetime(criadoEm) < datetime('now', ?) AND ${filtroEventosDescartaveis()}`,
        parametros
    );
    return {
        dias: retencaoDias,
        totalRemovivel: Number(linhas[0]?.total || 0),
        maisAntigo: linhas[0]?.maisAntigo || '',
        maisRecente: linhas[0]?.maisRecente || '',
        tiposPreservados: [...TIPOS_EVENTOS_PRESERVADOS]
    };
}

async function aplicarRetencaoEventos(dias = 365) {
    const previa = await obterPreviaRetencaoEventos(dias);
    if (!previa.totalRemovivel) return { ...previa, removidos: 0 };
    const resultado = await executar(
        `DELETE FROM eventos_sistema
         WHERE datetime(criadoEm) < datetime('now', ?) AND ${filtroEventosDescartaveis()}`,
        [`-${previa.dias} days`, ...TIPOS_EVENTOS_PRESERVADOS]
    );
    return { ...previa, removidos: Number(resultado.changes || 0) };
}

module.exports = {
    registrarEventoSistema,
    listarEventosSistema,
    obterPreviaRetencaoEventos,
    aplicarRetencaoEventos,
    TIPOS_EVENTOS_PRESERVADOS
};
