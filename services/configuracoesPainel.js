const db = require('../database/sqlite');
const { criarHashSenha } = require('./passwordService');
const { deveProteger, estaProtegido, proteger, revelar } = require('./cofreSegredosService');

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
        mercadoPagoWhatsappControle: '',
        paypalAtivo: '0',
        paypalModo: 'api',
        paypalLinkManual: '',
        paypalEmailManual: '',
        paypalAmbiente: 'sandbox',
        paypalClientId: '',
        paypalClientSecret: '',
        paypalRetornoUrl: '',
        paypalWebhookId: '',
        backupAutomaticoAtivo: '1',
        backupAutomaticoHora: '03:00',
        backupRetencaoDias: '30',
        backupRetencaoSemanas: '12',
        backupRetencaoMeses: '12',
        backupTesteRestauracaoMensalAtivo: '1',
        ultimoTesteRestauracaoMensal: '',
        ultimoBackupRecuperavel: '',
        backupExternoAtivo: '0',
        backupExternoPasta: '',
        backupExternoMaximo: '5',
        ultimoBackupExterno: '',
        alertaWhatsAppMinutos: '5',
        alertaWebhookUrl: '',
        alertaWhatsappControle: '',
        alertaSaudeOperacionalAtivo: '1',
        alertaDiscoAtencaoGb: '8',
        alertaDiscoCriticoGb: '5',
        alertaMemoriaAtencaoMb: '1024',
        alertaMemoriaCriticaMb: '512',
        ultimoRelatorioSaudeSemanal: '',
        whatsappProtecaoAtiva: '0',
        whatsappProtecaoMotivo: '',
        whatsappProtecaoAtivadaEm: '',
        whatsappBloquearNovoQrAutomatico: '1',
        ultimoBackupAutomatico: '',
        roboPalavrasChave: 'oi, ola, olá, menu, Planos, planos, Plano, plano, preço, preco, teste, grátis, gratis',
        roboMensagemDesconhecida: 'Mensagem ignorada sem palavra-chave para iniciar atendimento.',
        roboAtendimentoHumanoMinutos: '30',
        roboResponderMensagensAtivo: '1',
        roboEnviarMensagensPainelAtivo: '1',
        roboRespostaHumanizadaAtiva: '1',
        roboRespostaTempoMinimoSegundos: '3',
        roboRespostaTempoMaximoSegundos: '8',
        roboFilaMensagensAtiva: '1',
        roboFilaIntervaloMinimoSegundos: '2',
        roboFilaIntervaloMaximoSegundos: '5',
        campanhaExigirConsentimento: '1',
        campanhaLimiteDiario: '100',
        campanhaLimiteSemanalCliente: '1',
        campanhaHoraInicio: '09:00',
        campanhaHoraFim: '20:00',
        campanhaSomenteDiasUteis: '1',
        campanhaPausaErroPercentual: '20',
        campanhaPausaErroMinimo: '5',
        painelUsuario: '',
        painelSenhaHash: ''
    };

    const migracoes = [];
    rows.forEach((row) => {
        const valor = row.valor || '';
        config[row.chave] = revelar(row.chave, valor);
        if (valor && deveProteger(row.chave) && !estaProtegido(valor) && proteger(row.chave, valor) !== valor) {
            migracoes.push(executar('UPDATE configuracoes SET valor = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE chave = ?', [proteger(row.chave, valor), row.chave]));
        }
    });
    await Promise.all(migracoes);

    return config;
}

function salvarConfiguracao(chave, valor) {
    return executar(
        `INSERT INTO configuracoes (chave, valor, atualizadoEm)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chave) DO UPDATE SET
            valor = excluded.valor,
            atualizadoEm = CURRENT_TIMESTAMP`,
        [chave, proteger(chave, valor)]
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
        if (senha.length < 12) {
            throw new Error('A senha do painel precisa ter pelo menos 12 caracteres.');
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
    const responderMensagensAtivo = String(dados.roboResponderMensagensAtivo || '') === '1' ? '1' : '0';
    const enviarMensagensPainelAtivo = String(dados.roboEnviarMensagensPainelAtivo || '') === '1' ? '1' : '0';
    const respostaHumanizadaAtiva = String(dados.roboRespostaHumanizadaAtiva || '') === '1' ? '1' : '0';
    const tempoMinimo = Math.max(0, Math.min(60, Number.parseInt(dados.roboRespostaTempoMinimoSegundos || 3, 10) || 0));
    const tempoMaximoBruto = Math.max(0, Math.min(60, Number.parseInt(dados.roboRespostaTempoMaximoSegundos || 8, 10) || 0));
    const tempoMaximo = Math.max(tempoMinimo, tempoMaximoBruto);
    const filaMensagensAtiva = String(dados.roboFilaMensagensAtiva || '') === '1' ? '1' : '0';
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
    await salvarConfiguracao('roboResponderMensagensAtivo', responderMensagensAtivo);
    await salvarConfiguracao('roboEnviarMensagensPainelAtivo', enviarMensagensPainelAtivo);
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
    const whatsappControle = String(dados.mercadoPagoWhatsappControle || '').replace(/\D/g, '');
    const accessToken = accessTokenInformado || String(configAtual.mercadoPagoAccessToken || '');
    const webhookSecret = webhookSecretInformado || String(configAtual.mercadoPagoWebhookSecret || '');

    if (provedor === 'mercado_pago' && !accessToken) throw new Error('Informe o Access Token do Mercado Pago.');
    if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) throw new Error('A URL do webhook do Mercado Pago precisa usar HTTPS.');
    if (emailPagador && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPagador)) throw new Error('Informe um e-mail padrao valido para o pagador.');
    if (whatsappControle && !/^\d{10,15}$/.test(whatsappControle)) {
        throw new Error('Informe o WhatsApp de controle com DDI, DDD e numero.');
    }

    await salvarConfiguracao('pixProvedor', provedor);
    await salvarConfiguracao('mercadoPagoAccessToken', accessToken);
    await salvarConfiguracao('mercadoPagoWebhookSecret', webhookSecret);
    await salvarConfiguracao('mercadoPagoWebhookUrl', webhookUrl);
    await salvarConfiguracao('mercadoPagoEmailPagador', emailPagador);
    await salvarConfiguracao('mercadoPagoWhatsappControle', whatsappControle);
    return obterConfiguracoes();
}

async function salvarConfiguracoesPayPal(dados = {}) {
    const configAtual = await obterConfiguracoes();
    const ativo = String(dados.paypalAtivo || '') === '1' ? '1' : '0';
    const modo = String(dados.paypalModo || 'api').trim().toLowerCase();
    const linkManual = String(dados.paypalLinkManual || '').trim();
    const emailManual = String(dados.paypalEmailManual || '').trim().toLowerCase();
    const ambiente = String(dados.paypalAmbiente || 'sandbox').trim().toLowerCase();
    const clientId = String(dados.paypalClientId || '').trim() || String(configAtual.paypalClientId || '');
    const clientSecret = String(dados.paypalClientSecret || '').trim() || String(configAtual.paypalClientSecret || '');
    const retornoUrl = String(dados.paypalRetornoUrl || '').trim().replace(/\/+$/, '');
    const webhookId = String(dados.paypalWebhookId || '').trim() || String(configAtual.paypalWebhookId || '');

    if (!['api', 'manual'].includes(modo)) throw new Error('Modo PayPal invalido.');
    if (!['sandbox', 'live'].includes(ambiente)) throw new Error('Ambiente PayPal invalido.');
    if (linkManual && !/^https:\/\//i.test(linkManual)) {
        throw new Error('O link de recebimento PayPal precisa usar HTTPS.');
    }
    if (emailManual && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailManual)) {
        throw new Error('Informe um e-mail PayPal valido.');
    }
    if (ativo === '1' && modo === 'manual' && !linkManual && !emailManual) {
        throw new Error('Informe o link ou o e-mail da sua conta PayPal.');
    }
    if (ativo === '1' && modo === 'api' && (!clientId || !clientSecret)) {
        throw new Error('Informe o Client ID e o Client Secret do PayPal.');
    }
    if (ativo === '1' && modo === 'api' && !/^https:\/\//i.test(retornoUrl)) {
        throw new Error('Informe a URL HTTPS publica desta instalacao para o retorno do PayPal.');
    }

    await salvarConfiguracao('paypalAtivo', ativo);
    await salvarConfiguracao('paypalModo', modo);
    await salvarConfiguracao('paypalLinkManual', linkManual);
    await salvarConfiguracao('paypalEmailManual', emailManual);
    await salvarConfiguracao('paypalAmbiente', ambiente);
    await salvarConfiguracao('paypalClientId', clientId);
    await salvarConfiguracao('paypalClientSecret', clientSecret);
    await salvarConfiguracao('paypalRetornoUrl', retornoUrl);
    await salvarConfiguracao('paypalWebhookId', webhookId);
    return obterConfiguracoes();
}

async function salvarConfiguracoesMonitoramento(dados = {}) {
    const hora = String(dados.backupAutomaticoHora || '03:00').trim();
    const retencao = Math.max(1, Math.min(365, Number.parseInt(dados.backupRetencaoDias || 30, 10) || 30));
    const retencaoSemanas = Math.max(1, Math.min(104, Number.parseInt(dados.backupRetencaoSemanas || 12, 10) || 12));
    const retencaoMeses = Math.max(1, Math.min(120, Number.parseInt(dados.backupRetencaoMeses || 12, 10) || 12));
    const minutos = Math.max(1, Math.min(1440, Number.parseInt(dados.alertaWhatsAppMinutos || 5, 10) || 5));
    const webhook = String(dados.alertaWebhookUrl || '').trim();
    const whatsappControle = String(dados.alertaWhatsappControle || '').replace(/\D/g, '');
    const discoAtencao = Math.max(2, Math.min(100, Number(dados.alertaDiscoAtencaoGb || 8)));
    const discoCritico = Math.max(1, Math.min(discoAtencao, Number(dados.alertaDiscoCriticoGb || 5)));
    const memoriaAtencao = Math.max(256, Math.min(32768, Number(dados.alertaMemoriaAtencaoMb || 1024)));
    const memoriaCritica = Math.max(128, Math.min(memoriaAtencao, Number(dados.alertaMemoriaCriticaMb || 512)));
    const backupExternoAtivo = dados.backupExternoAtivo ? '1' : '0';
    const backupExternoPasta = String(dados.backupExternoPasta || '').trim();
    const backupExternoMaximo = Math.max(1, Math.min(100, Number.parseInt(dados.backupExternoMaximo || 5, 10) || 5));
    const campanhaLimiteDiario = Math.max(1, Math.min(1000, Number.parseInt(dados.campanhaLimiteDiario || 100, 10) || 100));
    const campanhaLimiteSemanalCliente = Math.max(1, Math.min(20, Number.parseInt(dados.campanhaLimiteSemanalCliente || 1, 10) || 1));
    const campanhaHoraInicio = String(dados.campanhaHoraInicio || '09:00').trim();
    const campanhaHoraFim = String(dados.campanhaHoraFim || '20:00').trim();
    const campanhaPausaErroPercentual = Math.max(1, Math.min(100, Number.parseInt(dados.campanhaPausaErroPercentual || 20, 10) || 20));
    const campanhaPausaErroMinimo = Math.max(1, Math.min(100, Number.parseInt(dados.campanhaPausaErroMinimo || 5, 10) || 5));

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
        throw new Error('Informe um horario valido para o backup automatico.');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(campanhaHoraInicio)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(campanhaHoraFim)
        || campanhaHoraInicio >= campanhaHoraFim) {
        throw new Error('Informe um horário comercial válido para campanhas.');
    }

    if (webhook && !/^https:\/\//i.test(webhook)) {
        throw new Error('O webhook de alerta precisa usar HTTPS.');
    }
    if (whatsappControle && !/^\d{10,15}$/.test(whatsappControle)) {
        throw new Error('Informe o WhatsApp de alertas com DDI, DDD e numero.');
    }
    if (backupExternoAtivo === '1' && !/^[A-Za-z]:\\|^\\\\/.test(backupExternoPasta)) {
        throw new Error('Informe uma pasta externa absoluta, como D:\\BackupsJulianPlay ou um compartilhamento de rede.');
    }

    await salvarConfiguracao('backupAutomaticoAtivo', dados.backupAutomaticoAtivo ? '1' : '0');
    await salvarConfiguracao('backupAutomaticoHora', hora);
    await salvarConfiguracao('backupRetencaoDias', String(retencao));
    await salvarConfiguracao('backupRetencaoSemanas', String(retencaoSemanas));
    await salvarConfiguracao('backupRetencaoMeses', String(retencaoMeses));
    await salvarConfiguracao('backupTesteRestauracaoMensalAtivo', dados.backupTesteRestauracaoMensalAtivo ? '1' : '0');
    await salvarConfiguracao('backupExternoAtivo', backupExternoAtivo);
    await salvarConfiguracao('backupExternoPasta', backupExternoPasta);
    await salvarConfiguracao('backupExternoMaximo', String(backupExternoMaximo));
    await salvarConfiguracao('campanhaLimiteDiario', String(campanhaLimiteDiario));
    await salvarConfiguracao('campanhaLimiteSemanalCliente', String(campanhaLimiteSemanalCliente));
    await salvarConfiguracao('campanhaHoraInicio', campanhaHoraInicio);
    await salvarConfiguracao('campanhaHoraFim', campanhaHoraFim);
    await salvarConfiguracao('campanhaSomenteDiasUteis', dados.campanhaSomenteDiasUteis ? '1' : '0');
    await salvarConfiguracao('campanhaPausaErroPercentual', String(campanhaPausaErroPercentual));
    await salvarConfiguracao('campanhaPausaErroMinimo', String(campanhaPausaErroMinimo));
    await salvarConfiguracao('alertaWhatsAppMinutos', String(minutos));
    await salvarConfiguracao('alertaWebhookUrl', webhook);
    await salvarConfiguracao('alertaWhatsappControle', whatsappControle);
    await salvarConfiguracao('alertaSaudeOperacionalAtivo', dados.alertaSaudeOperacionalAtivo ? '1' : '0');
    await salvarConfiguracao('alertaDiscoAtencaoGb', String(discoAtencao));
    await salvarConfiguracao('alertaDiscoCriticoGb', String(discoCritico));
    await salvarConfiguracao('alertaMemoriaAtencaoMb', String(memoriaAtencao));
    await salvarConfiguracao('alertaMemoriaCriticaMb', String(memoriaCritica));

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
    salvarConfiguracoesPayPal,
    salvarConfiguracoesMonitoramento,
    salvarConfiguracoesAcesso
};
