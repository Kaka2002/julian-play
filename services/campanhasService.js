const db = require('../database/sqlite');
const { revelarCredenciais } = require('./credenciaisClienteService');

function executar(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }

            resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function buscarTodos(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(rows || []);
        });
    });
}

function buscarUm(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(row || null);
        });
    });
}

async function criarCampanha(dados = {}) {
    const resultado = await executar(`
        INSERT INTO campanhas (
            nome, modeloChave, publico, imagem, status, total, enviados,
            ignorados, erros, jaEnviados, loteAtual, totalLotes,
            proximoLoteEm, mensagem, detalhes, iniciadaEm, finalizadaEm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        dados.nome || 'Campanha',
        dados.modeloChave || '',
        dados.publico || '',
        dados.imagem || '',
        dados.status || 'preparando',
        Number(dados.total || 0),
        Number(dados.enviados || 0),
        Number(dados.ignorados || 0),
        Number(dados.erros || 0),
        Number(dados.jaEnviados || 0),
        Number(dados.loteAtual || 0),
        Number(dados.totalLotes || 0),
        dados.proximoLoteEm || '',
        dados.mensagem || '',
        dados.detalhes ? JSON.stringify(dados.detalhes) : '',
        dados.iniciadaEm || new Date().toISOString(),
        dados.finalizadaEm || ''
    ]);

    return buscarCampanha(resultado.id);
}

async function atualizarCampanha(id, dados = {}) {
    if (!id) return null;

    const camposPermitidos = [
        'status',
        'total',
        'enviados',
        'ignorados',
        'erros',
        'jaEnviados',
        'loteAtual',
        'totalLotes',
        'proximoLoteEm',
        'mensagem',
        'detalhes',
        'finalizadaEm'
    ];
    const campos = [];
    const params = [];

    for (const campo of camposPermitidos) {
        if (!Object.prototype.hasOwnProperty.call(dados, campo)) continue;

        campos.push(`${campo} = ?`);
        params.push(campo === 'detalhes' && typeof dados[campo] !== 'string'
            ? JSON.stringify(dados[campo])
            : dados[campo]);
    }

    if (!campos.length) return buscarCampanha(id);

    campos.push('atualizadoEm = CURRENT_TIMESTAMP');
    params.push(id);

    await executar(`UPDATE campanhas SET ${campos.join(', ')} WHERE id = ?`, params);
    return buscarCampanha(id);
}

async function registrarItemCampanha(campanhaId, cliente, dados = {}) {
    if (!campanhaId || !cliente) return null;

    const resultado = await executar(`
        INSERT INTO campanha_itens (
            campanhaId, clienteId, clienteNome, telefone, destino, status, motivo, enviadoEm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        campanhaId,
        cliente.id || null,
        cliente.nome || 'Cliente sem nome',
        dados.telefone || cliente.telefone || '',
        dados.destino || '',
        dados.status || 'pendente',
        dados.motivo || '',
        dados.enviadoEm || ''
    ]);

    return resultado.id;
}

async function atualizarItemCampanha(id, dados = {}) {
    if (!id) return null;

    const camposPermitidos = [
        'destino',
        'status',
        'motivo',
        'enviadoEm'
    ];
    const campos = [];
    const params = [];

    for (const campo of camposPermitidos) {
        if (!Object.prototype.hasOwnProperty.call(dados, campo)) continue;
        campos.push(`${campo} = ?`);
        params.push(dados[campo]);
    }

    if (!campos.length) return null;

    campos.push('atualizadoEm = CURRENT_TIMESTAMP');
    params.push(id);

    await executar(`UPDATE campanha_itens SET ${campos.join(', ')} WHERE id = ?`, params);
    return id;
}

function buscarCampanha(id) {
    return buscarUm('SELECT * FROM campanhas WHERE id = ?', [id]);
}

function listarCampanhas(limite = 30) {
    return buscarTodos(`
        SELECT *
        FROM campanhas
        ORDER BY COALESCE(NULLIF(iniciadaEm, ''), criadoEm) DESC, id DESC
        LIMIT ?
    `, [Number(limite || 30)]);
}

function listarItensCampanha(campanhaId, limite = 200) {
    return buscarTodos(`
        SELECT *
        FROM campanha_itens
        WHERE campanhaId = ?
        ORDER BY id ASC
        LIMIT ?
    `, [campanhaId, Number(limite || 200)]);
}

function listarItensCampanhaPorStatus(campanhaId, status = 'pendente', limite = 1000) {
    return buscarTodos(`
        SELECT
            ci.*,
            c.nome,
            c.ddiTelefone,
            c.paisTelefone,
            c.usuario,
            c.senha,
            c.plano,
            c.aparelho,
            c.vencimento,
            c.nascimento,
            c.tipoPlanoId,
            c.diasContrato,
            c.valorPlano,
            c.assinaturaApp,
            c.validadeApp,
            c.dataValidadeApp,
            c.horasTeste,
            c.dataInicio,
            c.dataVencimento,
            c.appsInstalados,
            c.dispositivosSelecionados,
            c.paineisSelecionados,
            c.conexoesPainel,
            c.appInstalado,
            c.usuarioApp,
            c.senhaApp,
            c.enderecoMac,
            c.idAplicativo,
            c.acessosApp,
            c.observacoes,
            c.origem,
            c.tags,
            c.bonusMeses,
            c.status AS clienteStatus,
            c.ultimoAvisoRenovacao,
            c.ultimoAvisoAniversario,
            c.dataCadastro,
            c.atualizadoEm AS clienteAtualizadoEm
        FROM campanha_itens ci
        LEFT JOIN clientes c ON c.id = ci.clienteId
        WHERE ci.campanhaId = ?
            AND ci.status = ?
        ORDER BY ci.id ASC
        LIMIT ?
    `, [campanhaId, status, Number(limite || 1000)]).then(rows => rows.map(revelarCredenciais));
}

function contarItensCampanhaPorStatus(campanhaId) {
    return buscarTodos(`
        SELECT status, COUNT(*) AS total
        FROM campanha_itens
        WHERE campanhaId = ?
        GROUP BY status
    `, [campanhaId]);
}

async function buscarCampanhaRetomavel(id = null) {
    const params = [];
    let filtro = '';

    if (id) {
        filtro = 'AND c.id = ?';
        params.push(id);
    }

    return buscarUm(`
        SELECT c.*
        FROM campanhas c
        WHERE c.modeloChave = 'campanha_amizade_presente'
            AND c.status IN ('em_andamento', 'pausada', 'erro', 'interrompida')
            AND EXISTS (
                SELECT 1
                FROM campanha_itens ci
                WHERE ci.campanhaId = c.id
                    AND ci.status = 'pendente'
            )
            ${filtro}
        ORDER BY COALESCE(NULLIF(c.iniciadaEm, ''), c.criadoEm) DESC, c.id DESC
        LIMIT 1
    `, params);
}

module.exports = {
    criarCampanha,
    atualizarCampanha,
    registrarItemCampanha,
    atualizarItemCampanha,
    buscarCampanha,
    listarCampanhas,
    listarItensCampanha,
    listarItensCampanhaPorStatus,
    contarItensCampanhaPorStatus,
    buscarCampanhaRetomavel
};
