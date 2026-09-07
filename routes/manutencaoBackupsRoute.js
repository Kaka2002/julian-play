const express = require('express');
const path = require('path');

function criarManutencaoBackupsRoute(deps = {}) {
    const router = express.Router();
    const {
        renderizar, telaManutencao, obterStatusSistema, getStatusWhatsApp,
        bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica,
        obterConfiguracoes, criarBackupManualComCopiaExterna,
        executarExercicioRestauracaoMensal, otimizarBancoDados,
        limparEventosAntigosComBackup,
        executarDiagnosticoSistema, testarWebhookAlertas, restaurarBackup,
        exportarBackupCriptografado, copiarBackupExterno, logControleClientes
    } = deps;

    router.get('/manutencao', async (req, res) => {
        const status = await obterStatusSistema(getStatusWhatsApp());
        return renderizar(res, {
            titulo: 'Manutenção', conteudo: telaManutencao(status),
            mensagem: req.query.mensagem || '', ativo: 'manutencao'
        });
    });

    router.post('/manutencao/backup', bloquearManutencaoRestritaCliente, async (_req, res) => {
        try {
            const resultado = await criarBackupManualComCopiaExterna(await obterConfiguracoes());
            const backup = resultado.backup;
            logControleClientes('Backup manual criado', {
                arquivo: backup.nome, copiaExterna: resultado.copiaExterna || '',
                erroCopiaExterna: resultado.erroCopiaExterna || ''
            });
            let mensagem = `Backup criado: ${backup.nome}`;
            if (resultado.copiaExterna) mensagem += `; cópia externa criada em ${resultado.copiaExterna}`;
            else if (resultado.erroCopiaExterna) mensagem += `; o backup local está preservado, mas a cópia externa falhou: ${resultado.erroCopiaExterna}`;
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
        } catch (err) {
            logControleClientes('Erro ao criar backup manual', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao criar backup: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/backups/testar-restauracao', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (_req, res) => {
        try {
            const resultado = await executarExercicioRestauracaoMensal();
            logControleClientes('Exercício de restauração concluído', resultado);
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Restauração de teste aprovada: ${resultado.backup}`)}`);
        } catch (err) {
            logControleClientes('Erro no exercício de restauração', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro no teste de restauração: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/banco/otimizar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (_req, res) => {
        try {
            const resultado = await otimizarBancoDados(await obterConfiguracoes());
            logControleClientes('Banco otimizado com backup verificado', resultado);
            let mensagem = `Banco otimizado. Espaço liberado: ${resultado.liberadosFormatado}. Backup: ${resultado.backup}.`;
            if (resultado.avisoCopiaExterna) mensagem += ` A cópia externa falhou, mas o backup local foi preservado: ${resultado.avisoCopiaExterna}`;
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
        } catch (err) {
            logControleClientes('Erro ao otimizar banco', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao otimizar banco: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/diagnostico', bloquearManutencaoRestritaCliente, async (_req, res) => {
        try {
            const resultado = await executarDiagnosticoSistema(getStatusWhatsApp(), testarWebhookAlertas);
            logControleClientes('Diagnóstico do sistema executado', { status: resultado.status });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(resultado.mensagem)}`);
        } catch (err) {
            logControleClientes('Erro ao executar diagnóstico do sistema', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao executar diagnóstico: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/eventos/limpar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            const resultado = await limparEventosAntigosComBackup(req.body.diasRetencao, await obterConfiguracoes());
            logControleClientes('Retenção de eventos executada', resultado);
            let mensagem = `${resultado.removidos} evento(s) operacional(is) antigo(s) removido(s). Backup: ${resultado.backup}.`;
            if (resultado.avisoCopiaExterna) mensagem += ` A cópia externa falhou, mas o backup local foi preservado: ${resultado.avisoCopiaExterna}`;
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(mensagem)}`);
        } catch (err) {
            logControleClientes('Erro na retenção de eventos', { erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro na retenção de eventos: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/restaurar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            const resultado = await restaurarBackup(req.body.backup);
            logControleClientes('Backup restaurado', { backup: resultado.restaurado, backupAnterior: resultado.backupAnterior });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Backup restaurado: ${resultado.restaurado}. Foi criada uma cópia do banco anterior: ${resultado.backupAnterior}. Reinicie o PM2 para recarregar tudo.`)}`);
        } catch (err) {
            logControleClientes('Erro ao restaurar backup', { backup: req.body.backup, erro: err.message });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Erro ao restaurar backup: ${err.message}`)}`);
        }
    });

    router.post('/manutencao/backups/exportar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            const arquivo = await exportarBackupCriptografado(req.body.backup, req.body.senhaExportacao);
            logControleClientes('Backup criptografado exportado', { backup: req.body.backup });
            return res.download(arquivo, path.basename(arquivo));
        } catch (err) { return res.redirect(`/manutencao?mensagem=${encodeURIComponent(err.message)}`); }
    });

    router.post('/manutencao/backups/copiar', bloquearManutencaoRestritaCliente, confirmarSenhaAcaoCritica, async (req, res) => {
        try {
            const destino = await copiarBackupExterno(req.body.backup, req.body.pastaExterna);
            logControleClientes('Backup copiado para armazenamento externo', { backup: req.body.backup, destino });
            return res.redirect(`/manutencao?mensagem=${encodeURIComponent(`Backup copiado para ${destino}`)}`);
        } catch (err) { return res.redirect(`/manutencao?mensagem=${encodeURIComponent(err.message)}`); }
    });

    return router;
}

module.exports = criarManutencaoBackupsRoute;
