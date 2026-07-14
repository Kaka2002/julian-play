const crypto = require('crypto');
const {
    obterConfiguracoes,
    salvarConfiguracao
} = require('./configuracoesPainel');
const { dataHojeSaoPaulo, adicionarDias, calcularEstadoLicenca } = require('./licencaCalculo');

const LICENCA_CODIGO_PREFIXO = 'JPLAY-LIC-';
const INTERVALO_CONSULTA_REMOTA_MS = 15 * 60 * 1000;

function base64UrlEncode(valor) {
    return Buffer.from(String(valor), 'utf8').toString('base64url');
}

function base64UrlDecode(valor) {
    return Buffer.from(String(valor || ''), 'base64url').toString('utf8');
}

function obterSegredoLicenca() {
    const segredo = String(process.env.LICENSE_SIGNING_SECRET || process.env.LICENSE_ADMIN_TOKEN || '').trim();
    if (!segredo) {
        throw new Error('Segredo de licença não configurado. Configure LICENSE_SIGNING_SECRET ou LICENSE_ADMIN_TOKEN.');
    }
    return segredo;
}

function assinarPayloadLicenca(payloadBase64) {
    return crypto
        .createHmac('sha256', obterSegredoLicenca())
        .update(payloadBase64)
        .digest('base64url');
}

function gerarCodigoLicenca(dados = {}) {
    const instalacaoId = String(dados.instalacaoId || '').trim();
    const cliente = String(dados.licencaCliente || dados.cliente || '').trim();
    const tipo = String(dados.licencaTipo || dados.tipo || '').trim();
    const ativacao = String(dados.licencaAtivacao || dataHojeSaoPaulo()).slice(0, 10);
    const vencimento = String(dados.licencaVencimento || dados.vencimento || '').slice(0, 10);
    const vitalicia = String(dados.licencaVitalicia || '').trim() === '1' || tipo === 'vitalicia';
    const suspensa = String(dados.licencaSuspensa || '').trim() === '1' || tipo === 'suspensa';

    if (!instalacaoId) throw new Error('Informe o ID da instalação.');
    if (!cliente) throw new Error('Informe o cliente ou empresa da licença.');
    if (!tipo) throw new Error('Informe o tipo de licença.');
    if (!vitalicia && !suspensa && !vencimento) throw new Error('Informe o vencimento da licença.');

    const payload = {
        v: 1,
        instalacaoId,
        cliente,
        telefone: String(dados.licencaTelefone || dados.telefone || '').trim(),
        tipo: vitalicia ? 'vitalicia' : suspensa ? 'assinatura' : tipo,
        ativacao,
        vencimento: vitalicia ? '' : vencimento,
        vitalicia: vitalicia ? '1' : '0',
        periodoTesteDias: String(dados.licencaPeriodoTesteDias || dados.periodoTesteDias || '0'),
        suspensa: suspensa ? '1' : '0',
        observacoes: String(dados.licencaObservacoes || dados.observacoes || '').trim(),
        emitidoEm: new Date().toISOString()
    };

    const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
    return `${LICENCA_CODIGO_PREFIXO}${payloadBase64}.${assinarPayloadLicenca(payloadBase64)}`;
}

function lerCodigoLicenca(codigo) {
    const texto = String(codigo || '').trim();
    const normalizado = texto.startsWith(LICENCA_CODIGO_PREFIXO)
        ? texto.slice(LICENCA_CODIGO_PREFIXO.length)
        : texto;
    const [payloadBase64, assinatura] = normalizado.split('.');

    if (!payloadBase64 || !assinatura) {
        throw new Error('Código de licença inválido.');
    }

    const assinaturaEsperada = assinarPayloadLicenca(payloadBase64);
    if (!compararSeguro(assinatura, assinaturaEsperada)) {
        throw new Error('Código de licença não confere com a assinatura do fornecedor.');
    }

    const payload = JSON.parse(base64UrlDecode(payloadBase64));
    if (Number(payload.v || 0) !== 1) {
        throw new Error('Versão do código de licença não suportada.');
    }
    return payload;
}

function compararSeguro(a, b) {
    const bufferA = Buffer.from(String(a || ''));
    const bufferB = Buffer.from(String(b || ''));
    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function instalacaoAdministrador() {
    const perfil = String(process.env.LICENSE_ROLE || '').trim().toLowerCase();
    const cliente = String(process.env.LICENSE_CUSTOMER_NAME || '').trim().toLowerCase();
    const appName = String(process.env.JULIAN_PLAY_APP_NAME || '').trim().toLowerCase();

    if (['admin', 'administrador', 'fornecedor'].includes(perfil)) return true;
    if (['cliente', 'customer'].includes(perfil)) return false;
    if (appName === 'julian-play-cliente' || appName.endsWith('-cliente')) return false;

    return !cliente || cliente === 'julianplay' || cliente === 'julian play';
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
    config = await sincronizarLicencaRemota(config);
    return calcularEstadoLicenca(config);
}

function consultaRemotaRecente(config = {}) {
    const ultima = new Date(config.licencaUltimaConsultaRemota || 0).getTime();
    return Number.isFinite(ultima) && ultima > 0 && Date.now() - ultima < INTERVALO_CONSULTA_REMOTA_MS;
}

async function sincronizarLicencaRemota(config = {}) {
    const servidorUrl = String(config.licencaServidorUrl || '').trim().replace(/\/+$/, '');
    const instalacaoId = String(config.instalacaoId || '').trim();

    if (!servidorUrl || !instalacaoId || consultaRemotaRecente(config) || typeof fetch !== 'function') {
        return config;
    }

    const agora = new Date().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const resposta = await fetch(`${servidorUrl}/api/licencas/${encodeURIComponent(instalacaoId)}/status`, {
            signal: controller.signal,
            headers: { accept: 'application/json' }
        });

        if (!resposta.ok) {
            await salvarConfiguracao('licencaUltimaConsultaRemota', agora);
            return { ...config, licencaUltimaConsultaRemota: agora };
        }

        const dados = await resposta.json();
        if (!dados || !dados.encontrada) {
            await salvarConfiguracao('licencaUltimaConsultaRemota', agora);
            return { ...config, licencaUltimaConsultaRemota: agora };
        }

        const atualizacoes = {
            licencaCliente: dados.cliente || config.licencaCliente || '',
            licencaTelefone: dados.telefone || config.licencaTelefone || '',
            licencaTipo: dados.tipo || config.licencaTipo || 'assinatura',
            licencaAtivacao: dados.ativacao || config.licencaAtivacao || '',
            licencaVencimento: dados.vencimento || '',
            licencaVitalicia: dados.vitalicia ? '1' : '0',
            licencaSuspensa: dados.suspensa ? '1' : '0',
            licencaBloqueioAtivo: '1',
            licencaObservacoes: dados.observacoes || config.licencaObservacoes || '',
            licencaUltimaConsultaRemota: agora
        };

        for (const [chave, valor] of Object.entries(atualizacoes)) {
            if (String(config[chave] || '') !== String(valor || '')) {
                await salvarConfiguracao(chave, valor);
            }
        }

        return { ...config, ...atualizacoes };
    } catch {
        await salvarConfiguracao('licencaUltimaConsultaRemota', agora);
        return { ...config, licencaUltimaConsultaRemota: agora };
    } finally {
        clearTimeout(timeout);
    }
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

async function aplicarCodigoLicenca(codigo) {
    const payload = lerCodigoLicenca(codigo);
    const config = await garantirIdentificadorInstalacao(await obterConfiguracoes());
    const instalacaoAtual = String(config.instalacaoId || '').trim();
    const instalacaoCodigo = String(payload.instalacaoId || '').trim();

    if (!instalacaoCodigo || instalacaoCodigo !== instalacaoAtual) {
        throw new Error('Este código pertence a outra instalação. Confira o ID informado ao fornecedor.');
    }

    await salvarConfiguracao('licencaCliente', payload.cliente || '');
    await salvarConfiguracao('licencaTelefone', payload.telefone || '');
    await salvarConfiguracao('licencaAtivacao', payload.ativacao || dataHojeSaoPaulo());
    await salvarConfiguracao('licencaVencimento', payload.vencimento || '');
    await salvarConfiguracao('licencaVitalicia', payload.vitalicia === '1' ? '1' : '0');
    await salvarConfiguracao('licencaTipo', payload.tipo || 'assinatura');
    await salvarConfiguracao('licencaPeriodoTesteDias', payload.periodoTesteDias || '0');
    await salvarConfiguracao('licencaBloqueioAtivo', '1');
    await salvarConfiguracao('licencaSuspensa', payload.suspensa === '1' ? '1' : '0');
    await salvarConfiguracao('licencaObservacoes', payload.observacoes || '');
    await salvarConfiguracao('licencaCodigoAtivacao', codigo);
    await salvarConfiguracao('licencaServidorUrl', payload.servidorUrl || '');
    await salvarConfiguracao('licencaUltimaConsultaRemota', '');

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

const WHATSAPP_REATIVACAO_PADRAO = '11925716232';

function escaparHtml(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function obterTelefoneReativacao() {
    const configurado = process.env.WHATSAPP_REATIVACAO || WHATSAPP_REATIVACAO_PADRAO;
    return String(configurado || '').replace(/\D/g, '') || WHATSAPP_REATIVACAO_PADRAO;
}

function formatarTelefoneReativacao(numero) {
    const digitos = String(numero || '').replace(/\D/g, '');
    if (digitos.length === 11) return `${digitos.slice(0, 2)} ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
    if (digitos.length === 13 && digitos.startsWith('55')) {
        return `${digitos.slice(2, 4)} ${digitos.slice(4, 9)}-${digitos.slice(9)}`;
    }
    return digitos;
}

function linkTelefoneReativacao(numero) {
    const digitos = String(numero || '').replace(/\D/g, '');
    return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

function responderPainelBloqueado(req, res, licenca) {
    const telefone = obterTelefoneReativacao();
    const telefoneTela = formatarTelefoneReativacao(telefone);
    const mensagem = `Para ativar o painel, envie mensagem para WhatsApp ${telefoneTela} solicitando a reativação do painel.`;
    const aceitaHtml = String(req.headers.accept || '').includes('text/html');

    if (!aceitaHtml && req.method !== 'GET') {
        return res.status(403).json({ erro: 'Licença expirada', mensagem, licenca });
    }

    const textoWhatsapp = encodeURIComponent('Solicito a reativação do painel.');
    const vencimento = licenca && licenca.vencimento ? licenca.vencimento : 'vencida';

    return res.status(403).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel bloqueado</title>
  <style>
    body{margin:0;font-family:Inter,Arial,sans-serif;background:#f4f6f8;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{width:min(560px,calc(100% - 32px));background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;box-shadow:0 18px 45px rgba(15,23,42,.10)}
    h1{margin:0 0 12px;font-size:30px}
    p{font-size:18px;line-height:1.5;color:#475569}
    .tag{display:inline-block;margin:6px 0 18px;padding:8px 12px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-weight:700}
    a{display:inline-flex;margin-top:12px;padding:14px 18px;border-radius:10px;background:#16a34a;color:#fff;text-decoration:none;font-weight:800}
    small{display:block;margin-top:18px;color:#64748b}
  </style>
</head>
<body>
  <main class="card">
    <span class="tag">Painel bloqueado</span>
    <h1>Licença expirada</h1>
    <p>${escaparHtml(mensagem)}</p>
    <a href="https://wa.me/${linkTelefoneReativacao(telefone)}?text=${textoWhatsapp}" target="_blank" rel="noopener">Solicitar reativação</a>
    <small>Vencimento da licença: ${escaparHtml(vencimento)}</small>
  </main>
</body>
</html>`);
}

async function protegerLicenca(req, res, next) {
    try {
        if (String(req.path || '').startsWith('/licenca')) return next();
        const licenca = await obterEstadoLicenca();
        if (licenca.permitida) return next();

        return responderPainelBloqueado(req, res, licenca);
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    calcularEstadoLicenca,
    obterEstadoLicenca,
    atualizarLicencaComercial,
    aplicarCodigoLicenca,
    gerarCodigoLicenca,
    instalacaoAdministrador,
    licencaPermiteUso,
    protegerLicenca
};
