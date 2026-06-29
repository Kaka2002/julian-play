const crypto = require('crypto');
const {
    obterConfiguracoes,
    salvarConfiguracao
} = require('./configuracoesPainel');
const { dataHojeSaoPaulo, adicionarDias, calcularEstadoLicenca } = require('./licencaCalculo');

function compararSeguro(a, b) {
    const bufferA = Buffer.from(String(a || ''));
    const bufferB = Buffer.from(String(b || ''));
    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

async function garantirIdentificadorInstalacao(config) {
    if (config.instalacaoId) return config;
    const instalacaoId = crypto.randomUUID();
    await salvarConfiguracao('instalacaoId', instalacaoId);
    return { ...config, instalacaoId };
}

async function inicializarAvaliacaoPadrao(config) {
    const dias = Number(process.env.LICENSE_DEFAULT_TRIAL_DAYS || 0);
    const modo = String(process.env.LICENSE_DEFAULT_MODE || '').trim().toLowerCase();
    if (String(config.licencaBloqueioAtivo || '0') === '1') return config;

    if (modo === 'vitalicia') {
        await salvarConfiguracao('licencaCliente', process.env.LICENSE_CUSTOMER_NAME || 'Cliente licenciado');
        await salvarConfiguracao('licencaAtivacao', dataHojeSaoPaulo());
        await salvarConfiguracao('licencaVencimento', '');
        await salvarConfiguracao('licencaVitalicia', '1');
        await salvarConfiguracao('licencaTipo', 'vitalicia');
        await salvarConfiguracao('licencaPeriodoTesteDias', '0');
        await salvarConfiguracao('licencaBloqueioAtivo', '1');
        await salvarConfiguracao('licencaSuspensa', '0');
        return obterConfiguracoes();
    }

    if (![15, 30].includes(dias)) return config;

    const hoje = dataHojeSaoPaulo();
    await salvarConfiguracao('licencaCliente', process.env.LICENSE_CUSTOMER_NAME || config.licencaCliente || 'Instalação em avaliação');
    await salvarConfiguracao('licencaAtivacao', hoje);
    await salvarConfiguracao('licencaVencimento', adicionarDias(hoje, dias));
    await salvarConfiguracao('licencaVitalicia', '0');
    await salvarConfiguracao('licencaTipo', 'avaliacao');
    await salvarConfiguracao('licencaPeriodoTesteDias', String(dias));
    await salvarConfiguracao('licencaBloqueioAtivo', '1');
    await salvarConfiguracao('licencaSuspensa', '0');

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
    const periodosComerciais = {
        mensal: 30,
        semestral: 180,
        anual: 365
    };
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
    } else if (Object.prototype.hasOwnProperty.call(periodosComerciais, tipo)) {
        vencimento = adicionarDias(ativacao || hoje, periodosComerciais[tipo]);
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
    await salvarConfiguracao('licencaSuspensa', '0');
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
