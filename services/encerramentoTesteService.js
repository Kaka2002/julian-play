const TEMPO_ENCERRAMENTO_TESTE_MS = Number(process.env.TESTE_ENCERRAMENTO_MS || 10 * 60 * 1000);
const encerramentos = new Map();
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');
const { enfileirarEnvio } = require('./filaMensagensService');

function mensagemEncerramentoTeste() {
    return `✅ *ATENDIMENTO ENCERRADO*
--------------------
Obrigado por falar com a *JULIAN PLAY*.

Caso queira retornar ao atendimento, digite *menu*.`;
}

function agendarEncerramentoTeste(client, destino) {
    if (!client || !destino) return;

    const anterior = encerramentos.get(destino);
    if (anterior) clearTimeout(anterior);

    const timer = setTimeout(async () => {
        encerramentos.delete(destino);

        try {
            const mensagem = mensagemEncerramentoTeste();
            registrarEnvioDoRobo(destino, mensagem);
            const enviada = await enfileirarEnvio(
                () => client.sendMessage(destino, mensagem),
                'Envio de encerramento automatico de teste'
            );
            registrarMensagemDoRobo(enviada);
            console.log(`[teste] Atendimento encerrado automaticamente para ${destino}. id=${enviada?.id?._serialized || 'sem-id'}`);
        } catch (err) {
            console.log(`[teste] Falha ao encerrar atendimento automaticamente para ${destino}: ${err.message}`);
        }
    }, TEMPO_ENCERRAMENTO_TESTE_MS);

    encerramentos.set(destino, timer);
    console.log(`[teste] Encerramento automatico agendado para ${destino} em ${Math.round(TEMPO_ENCERRAMENTO_TESTE_MS / 60000)} minuto(s).`);
}

module.exports = {
    agendarEncerramentoTeste
};
