const { obterConfiguracoes, salvarConfiguracao } = require('./configuracoesPainel');

const CODIGO_BLOQUEIO = 'WHATSAPP_PROTECAO_ATIVA';

async function obterProtecaoWhatsapp() {
    const config = await obterConfiguracoes();

    return {
        ativa: String(config.whatsappProtecaoAtiva || '0') === '1',
        motivo: String(config.whatsappProtecaoMotivo || '').trim(),
        ativadaEm: String(config.whatsappProtecaoAtivadaEm || ''),
        bloquearNovoQrAutomatico: String(config.whatsappBloquearNovoQrAutomatico ?? '1') === '1'
    };
}

async function salvarProtecaoWhatsapp(dados = {}) {
    const ativa = Boolean(dados.whatsappProtecaoAtiva);
    const motivo = String(dados.whatsappProtecaoMotivo || '').trim().slice(0, 240);
    const bloquearNovoQrAutomatico = dados.whatsappBloquearNovoQrAutomatico !== false;
    const atual = await obterProtecaoWhatsapp();
    const ativadaEm = ativa
        ? (atual.ativa && atual.ativadaEm ? atual.ativadaEm : new Date().toISOString())
        : '';

    await salvarConfiguracao('whatsappProtecaoAtiva', ativa ? '1' : '0');
    await salvarConfiguracao('whatsappProtecaoMotivo', motivo);
    await salvarConfiguracao('whatsappProtecaoAtivadaEm', ativadaEm);
    await salvarConfiguracao('whatsappBloquearNovoQrAutomatico', bloquearNovoQrAutomatico ? '1' : '0');

    return obterProtecaoWhatsapp();
}

async function exigirEnvioProativoPermitido(tipo = 'envio proativo') {
    const protecao = await obterProtecaoWhatsapp();
    if (!protecao.ativa) return protecao;

    const err = new Error(
        `Modo de protecao do WhatsApp ativo: ${tipo} bloqueado.` +
        (protecao.motivo ? ` Motivo: ${protecao.motivo}` : '')
    );
    err.code = CODIGO_BLOQUEIO;
    err.protecaoWhatsapp = true;
    throw err;
}

module.exports = {
    CODIGO_BLOQUEIO,
    obterProtecaoWhatsapp,
    salvarProtecaoWhatsapp,
    exigirEnvioProativoPermitido
};
