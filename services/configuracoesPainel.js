const db = require('../database/sqlite');
const { criarHashSenha } = require('./passwordService');

function executar(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    }));
}

function buscarTodos(sql, params = []) {
    return db.ready.then(() => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    }));
}

async function obterConfiguracoes() {
    const rows = await buscarTodos('SELECT chave, valor FROM configuracoes');
    const config = {
        nomeSistema: 'Controle de Cliente IPTV e P2P',
        logoUrl: '',
        licencaCliente: '',
        licencaTelefone: '',
        licencaAtivacao: '',
        licencaVencimento: '',
        licencaVitalicia: '0',
        licencaTipo: '',
        licencaPeriodoTesteDias: '0',
        licencaBloqueioAtivo: '0',
        licencaSuspensa: '0',
        instalacaoId: '',
        licencaObservacoes: '',
        licencaCodigoAtivacao: '',
        licencaServidorUrl: '',
        licencaUltimaConsultaRemota: '',
        licencaMachineFingerprint: '',
        nomeEmpresaRobo: '',
        imagemRoboMenu: '',
        imagemRoboPlanos: '',
        imagemRoboTeste: '',
        imagemRoboTesteLiberado: '',
        imagemRoboRenovacao: '',
        imagemRoboAtivacao: '',
        imagemRoboErro: '',
        imagemRoboEncerramento: '',
        imagemCampanhaAmizade: '',
        pixChave: '',
        pixNome: '',
        pixCidade: '',
        pixTxid: '',
        pixProvedor: 'manual',
        mercadoPagoAccessToken: '',
        mercadoPagoWebhookSecret: '',
        mercadoPagoWebhookUrl: '',
        mercadoPagoEmailPagador: '',
        backupAutomaticoAtivo: '1',
        backupAutomaticoHora: '03:00',
        backupRetencaoDias: '30',
        alertaWhatsAppMinutos: '5',
        alertaWebhookUrl: '',
        ultimoBackupAutomatico: '',
        roboPalavrasChave: 'oi, ola, olá, menu, Planos, planos, Plano, plano, preço, preco, teste, grátis, gratis',
        roboMensagemDesconhecida: 'Mensagem ignorada sem palavra-chave para iniciar atendimento.',
        roboAtendimentoHumanoMinutos: '30',
        roboRespostaHumanizadaAtiva: '1',
        roboRespostaTempoMinimoSegundos: '3',
        roboRespostaTempoMaximoSegundos: '8',
        roboFilaMensagensAtiva: '1',
        roboFilaIntervaloMinimoSegundos: '2',
        roboFilaIntervaloMaximoSegundos: '5',
        painelUsuario: '',
        painelSenhaHash: ''
    };

    rows.forEach((row) => {
        config[row.chave] = row.valor || '';
    });

    return config;
}

function salvarConfiguracao(chave, valor) {
    return executar(
        `INSERT INTO configuracoes (chave, valor, atualizadoEm)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chave) DO UPDATE SET
            valor = excluded.valor,
            atualizadoEm = CURRENT_TIMESTAMP`,
        [chave, valor]
    );
}

async function salvarConfiguracoesAcesso(dados = {}) {
    const usuario = String(dados.painelUsuario || '').trim();
    const senha = String(dados.painelSenha || '');
    const confirmarSenha = String(dados.painelConfirmarSenha || '');

    if (!usuario) {
        throw new Error('Informe o usuario de acesso ao painel.');
    }

    await salvarConfiguracao('painelUsuario', usuario);

    if (senha || confirmarSenha) {
        if (senha.length < 8) {
            throw new Error('A senha do painel precisa ter pelo menos 8 caracteres.');
        }

        if (senha !== confirmarSenha) {
            throw new Error('A confirmacao da senha nao confere.');
        }

        await salvarConfiguracao('painelSenhaHash', criarHashSenha(senha));
    }

    return obterConfiguracoes();
}

async function salvarConfiguracoesPainel(dados = {}) {
    await salvarConfiguracao('nomeSistema', dados.nomeSistema || 'Controle de Cliente IPTV e P2P');
    await salvarConfiguracao('logoUrl', dados.logoUrl || '');

    return obterConfiguracoes();
}

async function salvarConfiguracoesRobo(dados = {}) {
    const nomeEmpresa = String(dados.nomeEmpresaRobo || '').trim();
    const palavrasChave = String(dados.roboPalavrasChave || '').trim();
    const mensagemDesconhecida = String(dados.roboMensagemDesconhecida || '').trim();
    const minutosAtendimento = Math.max(1, Math.min(1440, Number.parseInt(dados.roboAtendimentoHumanoMinutos || 30, 10) || 30));
    const respostaHumanizadaAtiva = dados.roboRespostaHumanizadaAtiva ? '1' : '0';
    const tempoMinimo = Math.max(0, Math.min(60, Number.parseInt(dados.roboRespostaTempoMinimoSegundos || 3, 10) || 0));
    const tempoMaximoBruto = Math.max(0, Math.min(60, Number.parseInt(dados.roboRespostaTempoMaximoSegundos || 8, 10) || 0));
    const tempoMaximo = Math.max(tempoMinimo, tempoMaximoBruto);
    const filaMensagensAtiva = dados.roboFilaMensagensAtiva ? '1' : '0';
    const filaMinimo = Math.max(0, Math.min(120, Number.parseInt(dados.roboFilaIntervaloMinimoSegundos || 2, 10) || 0));
    const filaMaximoBruto = Math.max(0, Math.min(180, Number.parseInt(dados.roboFilaIntervaloMaximoSegundos || 5, 10) || 0));
    const filaMaximo = Math.max(filaMinimo, filaMaximoBruto);

    if (!nomeEmpresa) {
        throw new Error('Informe o nome da empresa que aparecera nas mensagens.');
    }

    await salvarConfiguracao('nomeEmpresaRobo', nomeEmpresa);
    await salvarConfiguracao('roboPalavrasChave', palavrasChave || 'oi, ola, olá, menu, Planos, planos, Plano, plano, preço, preco, teste, grátis, gratis');
    await salvarConfiguracao('roboMensagemDesconhecida', mensagemDesconhecida || 'Mensagem ignorada sem palavra-chave para iniciar atendimento.');
    await salvarConfiguracao('roboAtendimentoHumanoMinutos', String(minutosAtendimento));
    await salvarConfiguracao('roboRespostaHumanizadaAtiva', respostaHumanizadaAtiva);
    await salvarConfiguracao('roboRespostaTempoMinimoSegundos', String(tempoMinimo));
    await salvarConfiguracao('roboRespostaTempoMaximoSegundos', String(tempoMaximo));
    await salvarConfiguracao('roboFilaMensagensAtiva', filaMensagensAtiva);
    await salvarConfiguracao('roboFilaIntervaloMinimoSegundos', String(filaMinimo));
    await salvarConfiguracao('roboFilaIntervaloMaximoSegundos', String(filaMaximo));

    return obterConfiguracoes();
}

async function salvarImagemRobo(chave, nomeArquivo) {
    const camposPermitidos = new Set([
        'imagemRoboMenu',
        'imagemRoboPlanos',
        'imagemRoboTeste',
        'imagemRoboTesteLiberado',
        'imagemRoboRenovacao',
        'imagemRoboAtivacao',
        'imagemRoboErro',
        'imagemRoboEncerramento',
        'imagemCampanhaAmizade'
    ]);

    if (!camposPermitidos.has(chave)) {
        throw new Error('Tipo de imagem do robo invalido.');
    }

    await salvarConfiguracao(chave, nomeArquivo || '');
    await salvarConfiguracao(`${chave}Desativada`, nomeArquivo ? '0' : '1');

    return obterConfiguracoes();
}

async function salvarConfiguracoesPix(dados = {}) {
    const chave = String(dados.pixChave || '').trim();
    const nome = String(dados.pixNome || '').trim();
    const cidade = String(dados.pixCidade || '').trim();
    const txid = String(dados.pixTxid || '').trim();

    if (!chave) {
        throw new Error('Informe a chave PIX que recebera os pagamentos.');
    }

    if (!nome) {
        throw new Error('Informe o nome do recebedor do PIX.');
    }

    if (!cidade) {
        throw new Error('Informe a cidade do recebedor do PIX.');
    }

    await salvarConfiguracao('pixChave', chave);
    await salvarConfiguracao('pixNome', nome);
    await salvarConfiguracao('pixCidade', cidade);
    await salvarConfiguracao('pixTxid', txid || 'JULIANPLAY');

    return obterConfiguracoes();
}

async function salvarConfiguracoesProvedorPix(dados = {}) {
    const provedor = String(dados.pixProvedor || 'manual').trim().toLowerCase();
    const permitidos = new Set(['manual', 'mercado_pago']);
    if (!permitidos.has(provedor)) throw new Error('Provedor PIX invalido.');

    const configAtual = await obterConfiguracoes();
    const accessTokenInformado = String(dados.mercadoPagoAccessToken || '').trim();
    const webhookSecretInformado = String(dados.mercadoPagoWebhookSecret || '').trim();
    const webhookUrl = String(dados.mercadoPagoWebhookUrl || '').trim();
    const emailPagador = String(dados.mercadoPagoEmailPagador || '').trim().toLowerCase();
    const accessToken = accessTokenInformado || String(configAtual.mercadoPagoAccessToken || '');
    const webhookSecret = webhookSecretInformado || String(configAtual.mercadoPagoWebhookSecret || '');

    if (provedor === 'mercado_pago' && !accessToken) throw new Error('Informe o Access Token do Mercado Pago.');
    if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) throw new Error('A URL do webhook do Mercado Pago precisa usar HTTPS.');
    if (emailPagador && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPagador)) throw new Error('Informe um e-mail padrao valido para o pagador.');

    await salvarConfiguracao('pixProvedor', provedor);
    await salvarConfiguracao('mercadoPagoAccessToken', accessToken);
    await salvarConfiguracao('mercadoPagoWebhookSecret', webhookSecret);
    await salvarConfiguracao('mercadoPagoWebhookUrl', webhookUrl);
    await salvarConfiguracao('mercadoPagoEmailPagador', emailPagador);
    return obterConfiguracoes();
}

async function salvarConfiguracoesMonitoramento(dados = {}) {
    const hora = String(dados.backupAutomaticoHora || '03:00').trim();
    const retencao = Math.max(1, Math.min(365, Number.parseInt(dados.backupRetencaoDias || 30, 10) || 30));
    const minutos = Math.max(1, Math.min(1440, Number.parseInt(dados.alertaWhatsAppMinutos || 5, 10) || 5));
    const webhook = String(dados.alertaWebhookUrl || '').trim();

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
        throw new Error('Informe um horario valido para o backup automatico.');
    }

    if (webhook && !/^https:\/\//i.test(webhook)) {
        throw new Error('O webhook de alerta precisa usar HTTPS.');
    }

    await salvarConfiguracao('backupAutomaticoAtivo', dados.backupAutomaticoAtivo ? '1' : '0');
    await salvarConfiguracao('backupAutomaticoHora', hora);
    await salvarConfiguracao('backupRetencaoDias', String(retencao));
    await salvarConfiguracao('alertaWhatsAppMinutos', String(minutos));
    await salvarConfiguracao('alertaWebhookUrl', webhook);

    return obterConfiguracoes();
}

module.exports = {
    obterConfiguracoes,
    salvarConfiguracao,
    salvarConfiguracoesPainel,
    salvarConfiguracoesRobo,
    salvarImagemRobo,
    salvarConfiguracoesPix,
    salvarConfiguracoesProvedorPix,
    salvarConfiguracoesMonitoramento,
    salvarConfiguracoesAcesso
};
