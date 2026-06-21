const crypto = require('crypto');
const {
    obterConfiguracoes,
    salvarConfiguracao
} = require('./configuracoesPainel');

function dataHojeSaoPaulo() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).reduce((mapa, item) => {
        mapa[item.type] = item.value;
        return mapa;
    }, {});

    return `${partes.year}-${partes.month}-${partes.day}`;
}

function adicionarDias(dataIso, dias) {
    const data = new Date(`${dataIso}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() + Number(dias || 0));
    return data.toISOString().slice(0, 10);
}

function compararSeguro(a, b) {
    const bufferA = Buffer.from(String(a || ''));
    const bufferB = Buffer.from(String(b || ''));
    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function calcularEstadoLicenca(config = {}) {
    const bloqueioAtivo = String(config.licencaBloqueioAtivo || '0') === '1';
    const vitalicia = String(config.licencaVitalicia || '0') === '1' || config.licencaTipo === 'vitalicia';
    const vencimento = String(config.licencaVencimento || '').slice(0, 10);
    const hoje = dataHojeSaoPaulo();
    const tipo = config.licencaTipo || (vitalicia ? 'vitalicia' : vencimento ? 'assinatura' : 'nao_configurada');
    let diasRestantes = null;
    let status = 'nao_configurada';
    let rotulo = 'Não configurada';
    let permitida = !bloqueioAtivo;

    if (vitalicia && String(config.licencaCliente || '').trim()) {
        status = 'ativa';
        rotulo = 'Vitalícia';
        permitida = true;
    } else if (vencimento) {
        const hojeData = new Date(`${hoje}T00:00:00Z`);
        const vencimentoData = new Date(`${vencimento}T00:00:00Z`);
        diasRestantes = Math.ceil((vencimentoData - hojeData) / 86400000);

        if (diasRestantes < 0) {
            status = 'vencida';
            rotulo = tipo === 'avaliacao' ? 'Avaliação encerrada' : 'Vencida';
            permitida = !bloqueioAtivo;
        } else if (diasRestantes <= 7) {
            status = 'vencendo';
            rotulo = tipo === 'avaliacao' ? 'Avaliação terminando' : 'Vencendo';
            permitida = true;
        } else {
            status = 'ativa';
            rotulo = tipo === 'avaliacao' ? 'Em avaliação' : 'Ativa';
            permitida = true;
        }
    }

    return {
        cliente: config.licencaCliente || '',
        telefone: config.licencaTelefone || '',
        ativacao: config.licencaAtivacao || '',
        vencimento,
        vitalicia,
        tipo,
        periodoTesteDias: Number(config.licencaPeriodoTesteDias || 0),
        observacoes: config.licencaObservacoes || '',
        instalacaoId: config.instalacaoId || '',
        bloqueioAtivo,
        diasRestantes,
        status,
        rotulo,
        permitida
    };
}

async function garantirIdentificadorInstalacao(config) {
    if (config.instalacaoId) return config;
    const instalacaoId = crypto.randomUUID();
    await salvarConfiguracao('instalacaoId', instalacaoId);
    return { ...config, instalacaoId };
}

async function inicializarAvaliacaoPadrao(config) {
    const dias = Number(process.env.LICENSE_DEFAULT_TRIAL_DAYS || 0);
    if (String(config.licencaBloqueioAtivo || '0') === '1' || ![15, 30].includes(dias)) return config;

    const hoje = dataHojeSaoPaulo();
    await salvarConfiguracao('licencaCliente', config.licencaCliente || 'Instalação em avaliação');
    await salvarConfiguracao('licencaAtivacao', hoje);
    await salvarConfiguracao('licencaVencimento', adicionarDias(hoje, dias));
    await salvarConfiguracao('licencaVitalicia', '0');
    await salvarConfiguracao('licencaTipo', 'avaliacao');
    await salvarConfiguracao('licencaPeriodoTesteDias', String(dias));
    await salvarConfiguracao('licencaBloqueioAtivo', '1');

    return obterConfiguracoes();
}

async function obterEstadoLicenca() {
    let config = await obterConfiguracoes();
    config = await garantirIdentificadorInstalacao(config);
    config = await inicializarAvaliacaoPadrao(config);
    return calcularEstadoLicenca(config);
}

function validarCodigoFornecedor(codigo) {
    const esperado = String(process.env.LICENSE_ADMIN_TOKEN || '').trim();
    if (!esperado) {
        throw new Error('Código do fornecedor não configurado. Execute novamente o instalador do Windows.');
    }
    if (!compararSeguro(String(codigo || '').trim(), esperado)) {
        throw new Error('Código do fornecedor inválido.');
    }
}

async function atualizarLicencaComercial(dados = {}) {
    validarCodigoFornecedor(dados.codigoFornecedor);

    const cliente = String(dados.licencaCliente || '').trim();
    const tipo = String(dados.licencaTipo || '').trim();
    const hoje = dataHojeSaoPaulo();
    let ativacao = String(dados.licencaAtivacao || hoje).slice(0, 10);
    let vencimento = String(dados.licencaVencimento || '').slice(0, 10);
    let vitalicia = '0';
    let periodoTesteDias = '0';

    if (!cliente) throw new Error('Informe o cliente ou empresa da licença.');

    if (tipo === 'avaliacao_15' || tipo === 'avaliacao_30') {
        const dias = tipo === 'avaliacao_15' ? 15 : 30;
        ativacao = hoje;
        vencimento = adicionarDias(hoje, dias);
        periodoTesteDias = String(dias);
    } else if (tipo === 'vitalicia') {
        vitalicia = '1';
        vencimento = '';
    } else if (tipo === 'assinatura') {
        if (!ativacao || !vencimento) throw new Error('Informe as datas de ativação e vencimento.');
        if (vencimento < ativacao) throw new Error('A data de vencimento deve ser posterior à ativação.');
    } else {
        throw new Error('Selecione o tipo de licença.');
    }

    const tipoSalvo = tipo.startsWith('avaliacao_') ? 'avaliacao' : tipo;
    await salvarConfiguracao('licencaCliente', cliente);
    await salvarConfiguracao('licencaTelefone', dados.licencaTelefone || '');
    await salvarConfiguracao('licencaAtivacao', ativacao);
    await salvarConfiguracao('licencaVencimento', vencimento);
    await salvarConfiguracao('licencaVitalicia', vitalicia);
    await salvarConfiguracao('licencaTipo', tipoSalvo);
    await salvarConfiguracao('licencaPeriodoTesteDias', periodoTesteDias);
    await salvarConfiguracao('licencaBloqueioAtivo', '1');
    await salvarConfiguracao('licencaObservacoes', dados.licencaObservacoes || '');

    return obterEstadoLicenca();
}

async function licencaPermiteUso() {
    try {
        return (await obterEstadoLicenca()).permitida;
    } catch (err) {
        console.log('Falha ao verificar licença:', err.message);
        return false;
    }
}

async function protegerLicenca(req, res, next) {
    try {
        const licenca = await obterEstadoLicenca();
        if (licenca.permitida) return next();

        const aceitaHtml = String(req.headers.accept || '').includes('text/html');
        if (aceitaHtml || req.method === 'GET') return res.redirect('/licenca');
        return res.status(403).json({ erro: 'Licença expirada', licenca });
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    calcularEstadoLicenca,
    obterEstadoLicenca,
    atualizarLicencaComercial,
    licencaPermiteUso,
    protegerLicenca
};
