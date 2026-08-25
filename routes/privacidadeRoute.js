const express = require('express');
const { confirmarSenhaAtual } = require('../services/authService');
const { exportarDadosCliente, anonimizarCliente, verificarExclusaoDefinitivaCliente, excluirClienteDefinitivamente } = require('../services/privacidadeService');
const { registrarEventoSistema } = require('../services/eventosSistema');

const router = express.Router();

function voltarCliente(id, mensagem) {
    return `/clientes/${encodeURIComponent(id)}/editar?mensagem=${encodeURIComponent(mensagem)}#privacidade`;
}

function carimboArquivo() {
    return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

router.post('/privacidade/clientes/:id/exportar', async (req, res) => {
    try {
        if (String(req.body.titularConfirmado || '') !== '1') {
            throw new Error('Confirme que a identidade do titular foi verificada.');
        }
        if (!await confirmarSenhaAtual(req, req.body.senhaConfirmacao)) {
            throw new Error('A senha atual do painel nao confere.');
        }

        const dados = await exportarDadosCliente(req.params.id);
        await registrarEventoSistema('privacidade_cliente', 'info', 'Dados de titular exportados', {
            clienteId: Number(req.params.id),
            usuario: req.usuarioPainel || ''
        });

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="dados-cliente-${Number(req.params.id)}-${carimboArquivo()}.json"`
        );
        return res.send(JSON.stringify(dados, null, 2));
    } catch (err) {
        await registrarEventoSistema('privacidade_cliente', 'warn', 'Exportacao de titular recusada', {
            clienteId: Number(req.params.id),
            usuario: req.usuarioPainel || '',
            erro: err.message
        }).catch(() => {});
        return res.redirect(voltarCliente(req.params.id, err.message));
    }
});

router.post('/privacidade/clientes/:id/anonimizar', async (req, res) => {
    try {
        if (String(req.body.confirmacao || '').trim().toUpperCase() !== 'ANONIMIZAR') {
            throw new Error('Digite ANONIMIZAR para confirmar a operacao.');
        }
        if (!await confirmarSenhaAtual(req, req.body.senhaConfirmacao)) {
            throw new Error('A senha atual do painel nao confere.');
        }

        await anonimizarCliente(req.params.id, {
            motivo: req.body.motivo,
            responsavel: req.usuarioPainel || ''
        });
        return res.redirect(voltarCliente(
            req.params.id,
            'Cliente anonimizado. Registros financeiros minimos foram preservados para auditoria.'
        ));
    } catch (err) {
        return res.redirect(voltarCliente(req.params.id, err.message));
    }
});

router.post('/privacidade/clientes/:id/excluir', async (req, res) => {
    try {
        const elegibilidade = await verificarExclusaoDefinitivaCliente(req.params.id);
        if (!elegibilidade.permitida) throw new Error(elegibilidade.motivo);
        const confirmacaoEsperada = elegibilidade.possuiFinanceiro ? 'EXCLUIR TUDO' : 'EXCLUIR';
        if (String(req.body.confirmacao || '').trim().toUpperCase() !== confirmacaoEsperada) {
            throw new Error(`Digite ${confirmacaoEsperada} para confirmar a exclusão definitiva.`);
        }
        if (!await confirmarSenhaAtual(req, req.body.senhaConfirmacao)) {
            throw new Error('A senha atual do painel não confere.');
        }

        await excluirClienteDefinitivamente(req.params.id, {
            motivo: req.body.motivo,
            responsavel: req.usuarioPainel || '',
            permitirComFinanceiro: elegibilidade.possuiFinanceiro
        });
        return res.redirect(`/clientes/todos?mensagem=${encodeURIComponent('Cliente excluído definitivamente.')}`);
    } catch (err) {
        return res.redirect(voltarCliente(req.params.id, err.message));
    }
});

module.exports = router;
