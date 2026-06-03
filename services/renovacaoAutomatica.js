const { enviarMensagem } = require('./mensagemService');
const {
    listarClientesParaAvisosProgramados,
    listarClientesAniversarioHoje,
    registrarAvisoRenovacaoProgramado,
    registrarAvisoAniversario,
    normalizarTelefone
} = require('./clientes');
const {
    montarMensagemAvisoProgramado,
    montarMensagemAniversario
} = require('./modelosMensagem');

const UM_DIA_MS = 24 * 60 * 60 * 1000;
let agendador = null;
let executando = false;
let ultimoEnvioAutomatico = '';

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

async function montarMensagemRenovacao(cliente) {
    const dias = calcularDiasRestantes(cliente.vencimento);
    return montarMensagemAvisoProgramado(cliente, dias);
}

function montarDestinoWhatsApp(telefone) {
    return `${normalizarTelefone(telefone)}@c.us`;
}

async function verificarRenovacoes({ getClient, getStatusWhatsApp, diasAviso } = {}) {
    if (executando) {
        return { enviados: 0, ignorados: 0, erro: 'Verificação já está em andamento.' };
    }

    executando = true;

    try {
        const status = getStatusWhatsApp ? getStatusWhatsApp() : {};
        const client = getClient ? getClient() : null;

        if (!client || !status.conectado) {
            return { enviados: 0, ignorados: 0, erro: 'WhatsApp não está conectado.' };
        }

        const clientes = await listarClientesParaAvisosProgramados();
        const aniversariantes = await listarClientesAniversarioHoje(new Date().getFullYear());
        let enviados = 0;
        let ignorados = 0;
        let aniversarios = 0;

        for (const cliente of clientes) {
            const destino = montarDestinoWhatsApp(cliente.telefone);
            const diasAntes = Number(cliente.diasAntes);
            const mensagem = await montarMensagemAvisoProgramado(cliente, diasAntes);
            const enviado = await enviarMensagem(client, destino, mensagem);

            if (enviado) {
                enviados += 1;
                await registrarAvisoRenovacaoProgramado(cliente.id, cliente.vencimento, diasAntes);
            } else {
                ignorados += 1;
            }
        }

        for (const cliente of aniversariantes) {
            const destino = montarDestinoWhatsApp(cliente.telefone);
            const mensagem = await montarMensagemAniversario(cliente);
            const enviado = await enviarMensagem(client, destino, mensagem);

            if (enviado) {
                aniversarios += 1;
                await registrarAvisoAniversario(cliente.id, new Date().getFullYear());
            } else {
                ignorados += 1;
            }
        }

        return { enviados, aniversarios, ignorados, erro: null };
    } finally {
        executando = false;
    }
}

function obterAgoraSaoPaulo() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date());

    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));

    return {
        data: `${mapa.year}-${mapa.month}-${mapa.day}`,
        hora: Number(mapa.hour),
        minuto: Number(mapa.minute)
    };
}

function iniciarAgendadorRenovacao(options) {
    if (agendador) return;

    const horaEnvio = Number(process.env.RENOVACAO_HORA_ENVIO || 9);
    const minutoEnvio = Number(process.env.RENOVACAO_MINUTO_ENVIO || 0);

    const rodar = (dataExecucao = '') => {
        verificarRenovacoes(options)
            .then((resultado) => {
                if (resultado.erro) {
                    console.log('Renovação automática:', resultado.erro);
                    return;
                }

                if (dataExecucao) {
                    ultimoEnvioAutomatico = dataExecucao;
                }

                console.log(`Renovação automática: ${resultado.enviados} aviso(s) de renovação, ${resultado.aniversarios || 0} aniversário(s), ${resultado.ignorados} ignorado(s).`);
            })
            .catch((err) => {
                console.log('Erro na renovação automática:', err.message);
            });
    };

    const verificarHorario = () => {
        const agora = obterAgoraSaoPaulo();
        const jaPassouHorario = agora.hora > horaEnvio || (agora.hora === horaEnvio && agora.minuto >= minutoEnvio);

        if (!jaPassouHorario) return;
        if (ultimoEnvioAutomatico === agora.data) return;

        rodar(agora.data);
    };

    console.log(`Renovação automática agendada para ${String(horaEnvio).padStart(2, '0')}:${String(minutoEnvio).padStart(2, '0')} todos os dias.`);
    agendador = setInterval(verificarHorario, 30000);
    verificarHorario();
}

module.exports = {
    iniciarAgendadorRenovacao,
    verificarRenovacoes,
    montarMensagemRenovacao
};
