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
        res.once?.('close', () => {
            if (!res.writableFinished) {
                const duracaoMs = Math.round(Number(process.hrtime.bigint() - inicio) / 1e6);
                console.warn(`[navegacao-interrompida] pagina=${req.path} duracaoMs=${duracaoMs} correlationId=${correlationId}`);
            }
        });
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

function responderPagina(acao) {
    return (req, res, next) => Promise.resolve().then(() => acao(req, res, next)).catch(erro => {
        const codigo = /^SQLITE_[A-Z_]+$/.test(erro?.code || '') ? erro.code : 'erro_interno';
        const correlationId = idSeguro(res.getHeader('x-correlation-id'));
        console.error(`[navegacao-falha] pagina=${req.route?.path || '/clientes'} codigo=${codigo} correlationId=${correlationId}`);
        if (res.headersSent) return next(erro);
        if (res.destroyed) return;
        res.setHeader('Retry-After', '5');
        res.status(503).type('html').send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Painel temporariamente indisponível</title><h1>Não foi possível abrir o Painel agora.</h1><p>Aguarde alguns segundos e tente novamente.</p><a href="/clientes">Tentar novamente</a></html>');
    });
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

module.exports = { middlewareCorrelacao, obterContextoObservabilidade, compararVersoes, responderPagina };
