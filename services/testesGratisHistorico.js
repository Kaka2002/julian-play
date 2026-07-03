const db = require('../database/sqlite');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarUm(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    }));
}

function limparTexto(valor) {
    return String(valor || '').trim();
}

function normalizarTelefone(telefone) {
    const textoOriginal = limparTexto(telefone);
    let numeros = textoOriginal.replace(/\D/g, '');

    if (!numeros) return '';
    if (textoOriginal.includes('@lid') || (numeros.length > 13 && !numeros.startsWith('55'))) return '';
    if (numeros.startsWith('55') && numeros.length > 13) numeros = `55${numeros.slice(-11)}`;
    if (numeros.startsWith('55')) return numeros;
    return `55${numeros}`;
}

async function consultarHistoricoTesteGratis(telefone) {
    const telefoneNormalizado = normalizarTelefone(telefone);
    if (!telefoneNormalizado) return null;

    return buscarUm(
        'SELECT * FROM testes_gratis_historico WHERE telefone = ?',
        [telefoneNormalizado]
    );
}

async function registrarSolicitacaoTesteGratis(dados = {}) {
    const telefone = normalizarTelefone(dados.telefone);
    const nome = limparTexto(dados.nome);
    const dispositivo = limparTexto(dados.dispositivo);
    const origem = limparTexto(dados.origem || 'robo');
    const clienteId = Number.isFinite(Number(dados.clienteId)) ? Number(dados.clienteId) : null;

    if (!telefone) {
        return { ignorado: true, repetido: false, historico: null };
    }

    const existente = await consultarHistoricoTesteGratis(telefone);

    if (existente) {
        await executar(
            `UPDATE testes_gratis_historico SET
                nome = COALESCE(NULLIF(?, ''), nome),
                dispositivo = COALESCE(NULLIF(?, ''), dispositivo),
                origem = COALESCE(NULLIF(?, ''), origem),
                clienteId = COALESCE(?, clienteId),
                dataUltimaSolicitacao = CURRENT_TIMESTAMP,
                totalSolicitacoes = COALESCE(totalSolicitacoes, 1) + 1
            WHERE telefone = ?`,
            [nome, dispositivo, origem, clienteId, telefone]
        );

        return {
            ignorado: false,
            repetido: true,
            historico: await consultarHistoricoTesteGratis(telefone)
        };
    }

    const resultado = await executar(
        `INSERT INTO testes_gratis_historico (
            telefone, nome, dispositivo, origem, clienteId
        ) VALUES (?, ?, ?, ?, ?)`,
        [telefone, nome, dispositivo, origem, clienteId]
    );

    return {
        ignorado: false,
        repetido: false,
        historico: await buscarUm(
            'SELECT * FROM testes_gratis_historico WHERE id = ?',
            [resultado.id]
        )
    };
}

module.exports = {
    consultarHistoricoTesteGratis,
    registrarSolicitacaoTesteGratis
};
