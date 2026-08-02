const { obterConfiguracoes } = require('./configuracoesPainel');

const CODIGO_ENVIOS_DESATIVADOS = 'ROBO_ENVIOS_PAINEL_DESATIVADOS';

async function obterControleOperacaoRobo() {
    const config = await obterConfiguracoes();

    return {
        responderMensagens: String(config.roboResponderMensagensAtivo ?? '1') === '1',
        enviarMensagensPainel: String(config.roboEnviarMensagensPainelAtivo ?? '1') === '1'
    };
}

async function roboPodeResponderMensagens() {
    return (await obterControleOperacaoRobo()).responderMensagens;
}

async function exigirEnvioPainelPermitido(tipo = 'envio pelo painel') {
    const controle = await obterControleOperacaoRobo();
    if (controle.enviarMensagensPainel) return controle;

    const err = new Error(`Envios do robô pelo painel estão desligados: ${tipo} bloqueado.`);
    err.code = CODIGO_ENVIOS_DESATIVADOS;
    err.operacaoRoboDesativada = true;
    throw err;
}

module.exports = {
    CODIGO_ENVIOS_DESATIVADOS,
    obterControleOperacaoRobo,
    roboPodeResponderMensagens,
    exigirEnvioPainelPermitido
};
