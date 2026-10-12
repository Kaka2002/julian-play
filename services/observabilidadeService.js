const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const contexto = new AsyncLocalStorage();

function idSeguro(valor) {
    const texto = String(valor || '').trim();
    return /^[a-zA-Z0-9._-]{8,100}$/.test(texto) ? texto : crypto.randomUUID();
}

function middlewareCorrelacao(req, res, next) {
    const correlationId = idSeguro(req.get('x-correlation-id') || req.get('x-request-id'));
    res.setHeader('x-correlation-id', correlationId);
    const menus = new Set(['/clientes', '/clientes/todos', '/crm', '/financeiro', '/financeiro/despesas', '/financeiro/rendimentos', '/financeiro/conciliacao', '/manutencao']);
    if (req.method === 'GET' && menus.has(req.path)) {
        const inicio = process.hrtime.bigint();
        res.once?.('finish', () => {
            const duracaoMs = Math.round(Number(process.hrtime.bigint() - inicio) / 1e6);
            if (duracaoMs >= 1000) console.warn(`[navegacao-lenta] pagina=${req.path} duracaoMs=${duracaoMs} status=${res.statusCode} correlationId=${correlationId}`);
        });
    }
    contexto.run({ correlationId, metodo: req.method, caminho: req.originalUrl }, next);
}

function obterContextoObservabilidade() {
    return contexto.getStore() || {};
}

function partesVersao(valor) {
    return String(valor || '0').split('.').map(parte => Number.parseInt(parte, 10) || 0).slice(0, 3);
}

function compararVersoes(instalada, disponivel) {
    const atual = partesVersao(instalada);
    const ultima = partesVersao(disponivel);
    for (let i = 0; i < 3; i += 1) {
        if (atual[i] < ultima[i]) return 'desatualizada';
        if (atual[i] > ultima[i]) return 'adiantada';
    }
    return 'atualizada';
}

module.exports = { middlewareCorrelacao, obterContextoObservabilidade, compararVersoes };
