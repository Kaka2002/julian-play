const db = require('../database/sqlite');
const { normalizarTelefone } = require('./clientes');

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
            resolve(rows || []);
        });
    }));
}

function telefoneLimpo(valor) {
    return normalizarTelefone(String(valor || '').replace(/@.*/, ''));
}

function resumoCurto(texto, limite = 240) {
    const limpo = String(texto || '')
        .replace(/\s+/g, ' ')
        .replace(/[*_~`]/g, '')
        .trim();

    if (limpo.length <= limite) return limpo;
    return `${limpo.slice(0, limite - 3)}...`;
}

async function buscarClientePorTelefone(telefone) {
    const numero = telefoneLimpo(telefone);
    if (!numero) return null;

    const candidatos = await buscarTodos(
        `SELECT id, nome, telefone FROM clientes
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone, '+', ''), ' ', ''), '-', ''), '(', '') LIKE ?
        ORDER BY id DESC
        LIMIT 1`,
        [`%${numero.slice(-8)}%`]
    );

    return candidatos[0] || null;
}

async function registrarInteracaoRobo({
    clienteId = null,
    telefone = '',
    tipo = 'whatsapp',
    titulo = 'Mensagem do robô',
    resumo = '',
    destino = '',
    status = 'registrado'
} = {}) {
    const telefoneNormalizado = telefoneLimpo(telefone || destino);
    let idCliente = clienteId || null;

    if (!idCliente && telefoneNormalizado) {
        const cliente = await buscarClientePorTelefone(telefoneNormalizado);
        idCliente = cliente?.id || null;
    }

    return executar(
        `INSERT INTO cliente_interacoes_robo
            (clienteId, telefone, tipo, titulo, resumo, destino, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            idCliente,
            telefoneNormalizado,
            String(tipo || 'whatsapp').slice(0, 40),
            String(titulo || 'Mensagem do robô').slice(0, 120),
            resumoCurto(resumo),
            String(destino || '').slice(0, 120),
            String(status || 'registrado').slice(0, 40)
        ]
    );
}

function registrarInteracaoRoboSilenciosa(dados = {}) {
    registrarInteracaoRobo(dados).catch((err) => {
        console.log('Não foi possível registrar histórico do robô:', err.message);
    });
}

async function listarInteracoesCliente(cliente = {}, limite = 12) {
    const telefone = telefoneLimpo(cliente.telefone);
    const params = [cliente.id || 0];
    let filtroTelefone = '';

    if (telefone) {
        filtroTelefone = ' OR telefone = ?';
        params.push(telefone);
    }

    params.push(Math.max(1, Math.min(50, Number(limite) || 12)));

    return buscarTodos(
        `SELECT * FROM cliente_interacoes_robo
        WHERE clienteId = ?${filtroTelefone}
        ORDER BY datetime(criadoEm) DESC, id DESC
        LIMIT ?`,
        params
    );
}

module.exports = {
    registrarInteracaoRobo,
    registrarInteracaoRoboSilenciosa,
    listarInteracoesCliente
};
