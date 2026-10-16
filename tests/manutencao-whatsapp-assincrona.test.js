const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const criarRota = require('../routes/manutencaoWhatsappRoute');

test('QR e reconexão respondem antes da inicialização e não repetem operação concorrente', async () => {
    let concluir;
    let chamadas = 0;
    let mudouNumero = false;
    const espera = new Promise(ok => { concluir = ok; });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(criarRota({
        gerarNovoQrCodeWhatsApp: async () => { chamadas++; await espera; return { status: 'aguardando_qr' }; },
        recuperarWhatsAppAutomaticamente: async () => { chamadas++; return { status: 'reconectando' }; },
        logControleClientes: () => {}, instalacaoAdministrador: () => false,
        validarNumeroWhatsappRobo: () => 'teste', salvarNumeroWhatsappRoboConfigurado: () => { mudouNumero = true; }
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(ok => server.on('listening', ok));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const post = rota => fetch(base + rota, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(2000) });
        const qr = await post('/manutencao/whatsapp/novo-qr');
        assert.equal(qr.status, 302); assert.equal(qr.headers.get('location'), '/qr');
        await post('/manutencao/whatsapp/novo-qr');
        await post('/manutencao/whatsapp/reconectar');
        await post('/manutencao/whatsapp/numero');
        assert.equal(chamadas, 1); assert.equal(mudouNumero, false);
        concluir(); await new Promise(ok => setImmediate(ok));
        const recuperacao = await post('/manutencao/whatsapp/reconectar');
        assert.equal(recuperacao.status, 302); assert.equal(chamadas, 2);
    } finally { concluir(); server.closeAllConnections(); await new Promise(ok => server.close(ok)); }
});
