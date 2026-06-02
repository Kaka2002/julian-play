const { enviarMensagem } = require('./mensagemService');
const {
    listarClientesParaAviso,
    registrarAvisoRenovacao,
    normalizarTelefone
} = require('./clientes');

const UM_DIA_MS = 24 * 60 * 60 * 1000;
let agendador = null;
let executando = false;

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function adicionarDiasISO(dias) {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return data.toISOString().slice(0, 10);
}

function formatarData(dataISO) {
    if (!dataISO) return 'em breve';

    const [ano, mes, dia] = dataISO.split('-');
    if (!ano || !mes || !dia) return dataISO;

    return `${dia}/${mes}/${ano}`;
}

function calcularDiasRestantes(vencimento) {
    const hoje = new Date(`${hojeISO()}T00:00:00`);
    const dataVencimento = new Date(`${vencimento}T00:00:00`);

    return Math.ceil((dataVencimento - hoje) / UM_DIA_MS);
}

function montarMensagemRenovacao(cliente) {
    const dias = calcularDiasRestantes(cliente.vencimento);
    const vencimento = formatarData(cliente.vencimento);
    const saudacao = cliente.nome ? `Ola, ${cliente.nome}!` : 'Ola!';

    if (dias < 0) {
        return `${saudacao}\n\nSua assinatura JULIAN PLAY venceu em ${vencimento}.\n\nPara renovar e evitar ficar sem acesso, responda esta mensagem que ja te ajudamos.`;
    }

    if (dias === 0) {
        return `${saudacao}\n\nSua assinatura JULIAN PLAY vence hoje (${vencimento}).\n\nPara renovar, responda esta mensagem que ja te atendemos.`;
    }

    return `${saudacao}\n\nSua assinatura JULIAN PLAY vence em ${dias} dia(s), no dia ${vencimento}.\n\nSe quiser renovar agora, responda esta mensagem que ja te atendemos.`;
}

function montarDestinoWhatsApp(telefone) {
    return `${normalizarTelefone(telefone)}@c.us`;
}

async function verificarRenovacoes({ getClient, getStatusWhatsApp, diasAviso } = {}) {
    if (executando) {
        return { enviados: 0, ignorados: 0, erro: 'Verificacao ja esta em andamento.' };
    }

    executando = true;

    try {
        const status = getStatusWhatsApp ? getStatusWhatsApp() : {};
        const client = getClient ? getClient() : null;

        if (!client || !status.conectado) {
            return { enviados: 0, ignorados: 0, erro: 'WhatsApp nao esta conectado.' };
        }

        const limite = adicionarDiasISO(Number.isFinite(diasAviso) ? diasAviso : 3);
        const clientes = await listarClientesParaAviso(limite);
        let enviados = 0;
        let ignorados = 0;

        for (const cliente of clientes) {
            const destino = montarDestinoWhatsApp(cliente.telefone);
            const mensagem = montarMensagemRenovacao(cliente);
            const enviado = await enviarMensagem(client, destino, mensagem);

            if (enviado) {
                enviados += 1;
                await registrarAvisoRenovacao(cliente.id, cliente.vencimento);
            } else {
                ignorados += 1;
            }
        }

        return { enviados, ignorados, erro: null };
    } finally {
        executando = false;
    }
}

function iniciarAgendadorRenovacao(options) {
    if (agendador) return;

    const intervaloMinutos = Number(process.env.RENOVACAO_INTERVALO_MINUTOS || 60);
    const intervaloMs = Math.max(intervaloMinutos, 5) * 60 * 1000;
    const diasAviso = Number(process.env.RENOVACAO_DIAS_AVISO || 3);

    const rodar = () => {
        verificarRenovacoes({ ...options, diasAviso })
            .then((resultado) => {
                if (resultado.erro) {
                    console.log('Renovacao automatica:', resultado.erro);
                    return;
                }

                console.log(`Renovacao automatica: ${resultado.enviados} aviso(s) enviado(s), ${resultado.ignorados} ignorado(s).`);
            })
            .catch((err) => {
                console.log('Erro na renovacao automatica:', err.message);
            });
    };

    agendador = setInterval(rodar, intervaloMs);
    setTimeout(rodar, 30000);
}

module.exports = {
    iniciarAgendadorRenovacao,
    verificarRenovacoes,
    montarMensagemRenovacao
};
