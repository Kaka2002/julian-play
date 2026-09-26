const db = require('../database/sqlite');
const sqlite3 = require('sqlite3');

const ORIGENS = {
    campanha_amizade_presente: 'Campanha antiga — 1 indicado / 1 mês',
    campanha_indique_ganhe_tres_meses: 'Campanha — 2 indicados / 3 meses',
    aniversario: 'Aniversário',
    outro: 'Outro bônus',
    nao_identificada: 'Origem não identificada'
};

async function comTransacaoBonus(acao) {
    await db.ready;
    const conexao = await new Promise((resolve, reject) => {
        const banco = new sqlite3.Database(db.dbPath, erro => erro ? reject(erro) : resolve(banco));
    });
    conexao.configure('busyTimeout', 5000);
    const run = (sql, params = []) => new Promise((resolve, reject) => conexao.run(sql, params, function(err) {
        err ? reject(err) : resolve({ id: this.lastID, changes: this.changes });
    }));
    const all = (sql, params = []) => new Promise((resolve, reject) => conexao.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
    const get = async (sql, params) => (await all(sql, params))[0];
    let iniciou = false;
    try {
        await run('BEGIN IMMEDIATE'); iniciou = true;
        const resultado = await acao({ run, all, get });
        await run('COMMIT'); iniciou = false;
        return resultado;
    } catch (erro) {
        if (iniciou) await run('ROLLBACK');
        throw erro;
    } finally { await new Promise(resolve => conexao.close(resolve)); }
}

async function listarHistoricoBonus(clienteId) {
    await db.ready;
    const all = (sql, params) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
    const [creditos, baixas, anteriores] = await Promise.all([
        all(`SELECT b.*, (SELECT GROUP_CONCAT(c.nome, ', ') FROM programa_indicacoes i
            JOIN clientes c ON c.id = i.indicadoClienteId WHERE i.creditoId = b.indicacaoCreditoId) AS indicados
            FROM bonus_creditos b WHERE b.clienteId = ? ORDER BY b.id`, [clienteId]),
        all(`SELECT o.*, baixa.creditoId, baixa.meses, c.campanhaChave FROM bonus_baixas baixa
            JOIN bonus_operacoes o ON o.id = baixa.operacaoId JOIN bonus_creditos c ON c.id = baixa.creditoId
            WHERE o.clienteId = ? ORDER BY o.id DESC`, [clienteId]),
        all(`SELECT i.* FROM indicacao_creditos i WHERE i.indicadorClienteId = ?
            AND NOT EXISTS (SELECT 1 FROM bonus_creditos b WHERE b.indicacaoCreditoId = i.id) ORDER BY i.id`, [clienteId])
    ]);
    return { creditos, baixas, anteriores };
}

async function identificarOrigemBonus(clienteId, dados, responsavel = '') {
    const id = Number(clienteId), creditoId = Number(dados.creditoId), meses = Number(dados.meses);
    const campanha = String(dados.campanhaChave || '');
    const chave = String(dados.chave || '');
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(creditoId) || creditoId < 1 || !Number.isInteger(meses) || meses < 1)
        throw new Error('Informe o crédito e a quantidade inteira de meses.');
    if (!ORIGENS[campanha] || campanha === 'nao_identificada') throw new Error('Selecione a origem do bônus.');
    if (!/^[a-f0-9-]{36}$/i.test(chave)) throw new Error('Atualize a ficha antes de identificar o bônus.');
    return comTransacaoBonus(async ({ run, get }) => {
        const anterior = await get('SELECT * FROM bonus_identificacoes WHERE chave = ?', [chave]);
        if (anterior) {
            if (anterior.clienteId !== id || anterior.creditoId !== creditoId || anterior.meses !== meses || anterior.campanhaChave !== campanha)
                throw new Error('Esta identificação já foi utilizada. Atualize a ficha.');
            return;
        }
        const credito = await get('SELECT * FROM bonus_creditos WHERE id = ? AND clienteId = ?', [creditoId, id]);
        if (!credito || credito.campanhaChave !== 'nao_identificada' || credito.saldo < meses)
            throw new Error('Saldo sem origem insuficiente ou já identificado. Atualize a ficha.');
        const indicado = String(dados.indicado || '').trim().slice(0, 160);
        // Somente reclassifica o saldo: não altera clientes.bonusMeses nem cria pagamento.
        if (credito.meses === meses && credito.saldo === meses) {
            await run(`UPDATE bonus_creditos SET campanhaChave = ?, indicado = ?, identificadoEm = CURRENT_TIMESTAMP, responsavel = ? WHERE id = ?`,
                [campanha, indicado, String(responsavel).slice(0, 100), creditoId]);
        } else {
            await run('UPDATE bonus_creditos SET meses = meses - ?, saldo = saldo - ? WHERE id = ?', [meses, meses, creditoId]);
            await run(`INSERT INTO bonus_creditos (clienteId, campanhaChave, origem, meses, saldo, indicado, criadoEm, identificadoEm, responsavel)
                VALUES (?, ?, 'saldo_identificado', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
                [id, campanha, meses, meses, indicado, credito.criadoEm, String(responsavel).slice(0, 100)]);
        }
        await run('INSERT INTO bonus_identificacoes (chave, clienteId, creditoId, meses, campanhaChave) VALUES (?, ?, ?, ?, ?)', [chave, id, creditoId, meses, campanha]);
        await run('INSERT INTO cliente_notas (clienteId, texto) VALUES (?, ?)', [id,
            `${meses} mês(es) de saldo existente identificado(s): ${ORIGENS[campanha]}. Responsável: ${responsavel || 'operador'}. Nenhum crédito adicional concedido.`]);
    });
}

module.exports = { ORIGENS, comTransacaoBonus, listarHistoricoBonus, identificarOrigemBonus };
