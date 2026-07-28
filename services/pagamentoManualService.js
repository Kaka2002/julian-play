const db = require('../database/sqlite');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

async function registrarCobrancaManual(dados = {}) {
    if (!dados.referencia || !dados.clienteId || Number(dados.valorTotal || 0) <= 0) {
        throw new Error('Dados incompletos para registrar cobrança manual.');
    }
    await executar(
        `INSERT INTO cobrancas_pix (
            referencia, provedor, clienteId, plano, tipoPlanoId, diasContrato,
            valorPlano, assinaturaApp, valorTotal, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aguardando_comprovante')`,
        [
            dados.referencia,
            dados.provedor || 'manual',
            dados.clienteId,
            dados.plano || 'Plano',
            dados.tipoPlanoId || '',
            Number(dados.diasContrato || 0),
            dados.valorPlano || '',
            dados.assinaturaApp || '0,00',
            dados.valorTotal
        ]
    );
    return { referencia: dados.referencia, status: 'aguardando_comprovante' };
}

module.exports = { registrarCobrancaManual };
