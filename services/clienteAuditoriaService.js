const db = require('../database/sqlite');

const CAMPOS_AUDITAVEIS = {
    plano: 'Plano', tipoPlanoId: 'Tipo de plano', diasContrato: 'Dias do contrato',
    valorPlano: 'Valor do plano', assinaturaApp: 'Assinatura do app', dataInicio: 'Início',
    dataVencimento: 'Vencimento', vencimento: 'Vencimento legado', status: 'Status',
    appsInstalados: 'Aplicativos', dispositivosSelecionados: 'Dispositivos',
    paineisSelecionados: 'Painéis', acessosApp: 'Conexões de acesso', appInstalado: 'App instalado',
    enderecoMac: 'Endereço MAC', idAplicativo: 'ID do aplicativo', origem: 'Origem',
    indicadoPor: 'Indicado por', bonusMeses: 'Bônus disponíveis',
    whatsappMarketingConsentimento: 'Autorização de marketing', whatsappOptOutEm: 'Bloqueio de marketing'
};

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => db.run(sql, params, function fim(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
    })));
}

function listar(clienteId, limite = 100) {
    return db.ready.then(() => new Promise((resolve, reject) => db.all(
        `SELECT * FROM cliente_auditoria WHERE clienteId = ?
         ORDER BY datetime(criadoEm) DESC, id DESC LIMIT ?`,
        [clienteId, Math.max(1, Math.min(200, Number(limite) || 100))],
        (err, rows) => err ? reject(err) : resolve(rows || [])
    )));
}

function valorComparavel(valor) {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor).trim();
    if (!texto) return '';
    try {
        const json = JSON.parse(texto);
        if (Array.isArray(json)) return JSON.stringify(json);
    } catch (_) {}
    return texto;
}

function valorSeguro(campo, valor) {
    if (campo === 'acessosApp') {
        try {
            const acessos = JSON.parse(String(valor || '[]'));
            return JSON.stringify(acessos.map(item => ({
                app: item.app || '', dispositivo: item.dispositivo || '', painel: item.painel || '',
                usuario: item.usuario || '', enderecoMac: item.enderecoMac || '', idAplicativo: item.idAplicativo || ''
            })));
        } catch (_) { return '[conexões alteradas]'; }
    }
    return valorComparavel(valor).slice(0, 2000);
}

async function registrarAlteracoes(clienteId, anterior = {}, novo = {}, contexto = {}) {
    const alteracoes = [];
    for (const [campo, rotulo] of Object.entries(CAMPOS_AUDITAVEIS)) {
        const antes = valorComparavel(anterior[campo]);
        const depois = valorComparavel(novo[campo]);
        if (antes !== depois) alteracoes.push({ campo, rotulo, antes: valorSeguro(campo, antes), depois: valorSeguro(campo, depois) });
    }
    for (const item of alteracoes) {
        await executar(`INSERT INTO cliente_auditoria
            (clienteId, tipo, campo, valorAnterior, valorNovo, responsavel, origem, motivo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            clienteId, contexto.tipo || 'alteracao', item.rotulo, item.antes, item.depois,
            String(contexto.responsavel || 'sistema').slice(0, 120),
            String(contexto.origem || 'painel').slice(0, 80), String(contexto.motivo || '').slice(0, 500)
        ]);
    }
    return alteracoes.length;
}

async function registrarEvento(clienteId, tipo, motivo, contexto = {}) {
    return executar(`INSERT INTO cliente_auditoria
        (clienteId, tipo, responsavel, origem, motivo) VALUES (?, ?, ?, ?, ?)`, [
        clienteId, tipo, String(contexto.responsavel || 'sistema').slice(0, 120),
        String(contexto.origem || 'painel').slice(0, 80), String(motivo || '').slice(0, 500)
    ]);
}

module.exports = { listarAuditoriaCliente: listar, registrarAlteracoesCliente: registrarAlteracoes, registrarEventoCliente: registrarEvento };
