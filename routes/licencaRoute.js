const express = require('express');
const { obterConfiguracoes } = require('../services/configuracoesPainel');
const {
    obterEstadoLicenca,
    atualizarLicencaComercial,
    aplicarCodigoLicenca,
    instalacaoAdministrador
} = require('../services/licencaService');
const { formatarDataHoraBrasil } = require('../utils/dataHora');
const { obterFingerprintMaquina } = require('../services/maquinaInstalacao');

const router = express.Router();

function escapar(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function tipoSelecionado(licenca) {
    if (licenca.tipo === 'vitalicia') return 'vitalicia';
    if (licenca.tipo === 'avaliacao') return Number(licenca.periodoTesteDias) === 30 ? 'avaliacao_30' : 'avaliacao_15';
    if (['mensal', 'semestral', 'anual', 'assinatura'].includes(licenca.tipo)) return licenca.tipo;
    return 'assinatura';
}

function formatarDataBrasileira(dataIso) {
    return String(dataIso || '').slice(0, 10).split('-').reverse().join('/');
}

function textoControleRemoto(config = {}) {
    if (!config.licencaServidorUrl) return 'Não configurado';
    if (!config.licencaUltimaConsultaRemota) return 'Ativo';
    return `Ativo - última consulta ${formatarDataHoraBrasil(config.licencaUltimaConsultaRemota, { anoCompleto: true })}`;
}

function painelGerenciamento({ licenca, tipoAtual }) {
    return `<section class="panel">
        <h2>Gerenciar licença</h2>
        <div class="sub">Esta alteração exige o código exclusivo do fornecedor.</div>
        <form class="fields" method="post" action="/licenca">
            <label>Tipo de licença
                <select name="licencaTipo" id="licencaTipo">
                    <option value="avaliacao_15" ${tipoAtual === 'avaliacao_15' ? 'selected' : ''}>Avaliação por 15 dias</option>
                    <option value="avaliacao_30" ${tipoAtual === 'avaliacao_30' ? 'selected' : ''}>Avaliação por 30 dias</option>
                    <option value="mensal" ${tipoAtual === 'mensal' ? 'selected' : ''}>Licença mensal</option>
                    <option value="semestral" ${tipoAtual === 'semestral' ? 'selected' : ''}>Licença semestral</option>
                    <option value="anual" ${tipoAtual === 'anual' ? 'selected' : ''}>Licença anual</option>
                    <option value="assinatura" ${tipoAtual === 'assinatura' ? 'selected' : ''}>Licença com vencimento</option>
                    <option value="vitalicia" ${tipoAtual === 'vitalicia' ? 'selected' : ''}>Licença vitalícia</option>
                </select>
            </label>
            <label>Cliente / Empresa<input name="licencaCliente" required value="${escapar(licenca.cliente)}"></label>
            <label>Telefone do responsável<input name="licencaTelefone" value="${escapar(licenca.telefone)}"></label>
            <label>Data de ativação<input type="date" name="licencaAtivacao" value="${escapar(licenca.ativacao)}"></label>
            <label>Data de vencimento<input type="date" name="licencaVencimento" value="${escapar(licenca.vencimento)}"></label>
            <label>Código do fornecedor<input type="password" name="codigoFornecedor" required autocomplete="off"></label>
            <label class="full">Observações<textarea name="licencaObservacoes">${escapar(licenca.observacoes)}</textarea></label>
            <div class="full"><button type="submit">Salvar e ativar licença</button></div>
        </form>
    </section>`;
}

function painelSomenteLeitura() {
    return `<section class="panel">
        <h2>Licença gerenciada pelo fornecedor</h2>
        <div class="sub">Esta instalação pode consultar a licença, mas alterações de avaliação, pagamento ou licença vitalícia são feitas somente pelo Painel Mestre ou por um código enviado pelo fornecedor.</div>
        <form class="fields" method="post" action="/licenca/codigo">
            <label class="full">Código de ativação<textarea name="codigoLicenca" required placeholder="Cole aqui o código enviado pelo fornecedor"></textarea></label>
            <div class="full"><button type="submit">Aplicar código de ativação</button></div>
        </form>
    </section>`;
}

function pagina({ licenca, config, mensagem = '', erro = '' }) {
    const nomeSistema = config.nomeSistema || 'Controle de Cliente IPTV e P2P';
    const tipoAtual = tipoSelecionado(licenca);
    const podeGerenciarLicenca = instalacaoAdministrador();
    const classe = licenca.permitida ? (licenca.status === 'vencendo' ? 'warn' : 'ok') : 'error';
    const detalhe = licenca.vitalicia
        ? 'Sem data de vencimento'
        : licenca.vencimento
            ? `Válida até ${formatarDataBrasileira(licenca.vencimento)}`
            : 'Aguardando configuração';

    const machineFingerprint = licenca.machineFingerprint || obterFingerprintMaquina();

    return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Licença - ${escapar(nomeSistema)}</title>
    <style>
        *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#081225;font-family:Inter,Arial,sans-serif}main{width:min(920px,calc(100% - 32px));margin:40px auto}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:22px}.top a{color:#4368e8;font-weight:700;text-decoration:none}.panel{background:#fff;border:1px solid #e4e7ec;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.06);padding:26px;margin-bottom:20px}h1,h2{margin:0 0 8px}.sub{color:#6c7383;margin-bottom:22px}.status{padding:18px;border-radius:8px;margin-bottom:18px;font-weight:700}.status.ok{background:#dff8ee;color:#047446}.status.warn{background:#fff2dc;color:#a76100}.status.error{background:#ffe5e7;color:#c52e35}.info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:18px}.info div{padding:14px;background:#f7f8fa;border-radius:8px}.info small{display:block;color:#6c7383;margin-bottom:5px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}label{display:grid;gap:7px;font-weight:700}input,select,textarea{width:100%;border:1px solid #dfe3ea;border-radius:8px;padding:12px;font:inherit}textarea{min-height:90px;resize:vertical}.full{grid-column:1/-1}button{border:0;border-radius:8px;background:#4368e8;color:#fff;padding:13px 18px;font:inherit;font-weight:800;cursor:pointer}.notice{padding:13px;border-radius:8px;margin-bottom:18px}.notice.ok{background:#dff8ee;color:#047446}.notice.error{background:#ffe5e7;color:#c52e35}@media(max-width:680px){.fields,.info{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
    </style>
</head>
<body>
<main>
    <div class="top"><div><h1>Licença da instalação</h1><div class="sub">Controle de avaliação e ativação comercial</div></div>${licenca.permitida ? '<a href="/clientes">Voltar ao painel</a>' : '<a href="/logout">Sair</a>'}</div>
    ${mensagem ? `<div class="notice ok">${escapar(mensagem)}</div>` : ''}
    ${erro ? `<div class="notice error">${escapar(erro)}</div>` : ''}
    <section class="panel">
        <div class="status ${classe}">${escapar(licenca.rotulo)}. ${escapar(detalhe)}</div>
        <div class="info">
            <div><small>Cliente / Empresa</small>${escapar(licenca.cliente || '-')}</div>
            <div><small>Identificação da instalação</small>${escapar(licenca.instalacaoId || '-')}</div>
            <div><small>Controle remoto</small>${escapar(textoControleRemoto(config))}</div>
            <div><small>Chave da máquina</small>${escapar(machineFingerprint)}</div>
        </div>
        ${!licenca.permitida ? '<p>O período de avaliação terminou. Entre em contato com o fornecedor para renovar ou ativar esta instalação.</p>' : ''}
    </section>
    ${podeGerenciarLicenca ? painelGerenciamento({ licenca, tipoAtual }) : painelSomenteLeitura()}
</main>
</body>
</html>`;
}

router.get('/', async (req, res, next) => {
    try {
        const [licenca, config] = await Promise.all([obterEstadoLicenca(), obterConfiguracoes()]);
        res.send(pagina({ licenca, config, mensagem: req.query.mensagem, erro: req.query.erro }));
    } catch (err) {
        next(err);
    }
});

router.post('/', async (req, res) => {
    try {
        if (!instalacaoAdministrador()) {
            return res.redirect(`/licenca?erro=${encodeURIComponent('Esta opção é restrita ao fornecedor.')}`);
        }
        await atualizarLicencaComercial(req.body);
        res.redirect(`/licenca?mensagem=${encodeURIComponent('Licença atualizada com sucesso.')}`);
    } catch (err) {
        res.redirect(`/licenca?erro=${encodeURIComponent(err.message)}`);
    }
});

router.post('/codigo', async (req, res) => {
    try {
        await aplicarCodigoLicenca(req.body.codigoLicenca);
        res.redirect(`/licenca?mensagem=${encodeURIComponent('Licença ativada com sucesso pelo código do fornecedor.')}`);
    } catch (err) {
        res.redirect(`/licenca?erro=${encodeURIComponent(err.message)}`);
    }
});

module.exports = router;
