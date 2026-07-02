const { enviarMensagem } = require('./mensagemService');
const {
    listarClientesParaAvisosProgramados,
    listarClientesParaAvisoUmaHora,
    listarClientesVencidosPorDiasParaAviso,
    listarTestesGratisParaAvisoPorHorario,
    listarTestesGratisExpiradosParaAviso,
    listarClientesAniversarioHoje,
    registrarAvisoRenovacaoProgramado,
    registrarAvisoAniversario,
    normalizarTelefone
} = require('./clientes');
const {
    montarMensagemAvisoProgramado,
    montarMensagemAniversario
} = require('./modelosMensagem');
const menuRenovacao = require('../menus/renovacao');
const { prepararRenovacaoTesteGratis } = require('./conversaService');
const { buscarPlanoPorNome, enviarQRCodePIXParaDestino, listarPlanosComerciais } = require('./pixService');
const { licencaPermiteUso } = require('./licencaService');

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const TESTE_AVISO_MINUTOS = 30;
const TESTE_AVISO_PLANO = -30;
const TESTE_AVISO_EXPIRADO_FORA_HORARIO = -31;
const TESTE_AVISO_EXPIRADO_PLANOS = -32;
const AVISO_CLIENTE_UMA_HORA = -60;
const AVISOS_CLIENTES_VENCIDOS_DIAS = [
    { dias: 2, codigo: -102 },
    { dias: 5, codigo: -105 }
];
let agendador = null;
let executando = false;
let executandoUmaHora = false;
let executandoVencidosDias = false;
let executandoTestes = false;
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

function nomeCliente(cliente = {}) {
    return String(cliente.nome || 'cliente').trim() || 'cliente';
}

async function obterPlanosRenovacao() {
    try {
        return await listarPlanosComerciais();
    } catch (err) {
        console.log(`Renovação automática: não foi possível carregar os planos comerciais: ${err.message}`);
        return [];
    }
}

function montarMensagemTesteVencendo(cliente, planos = []) {
    return `⚠️ *TESTE GRÁTIS VENCENDO*
━━━━━━━━━━━━━━━━━━━━
Olá, *${nomeCliente(cliente)}*! Seu teste grátis vence em aproximadamente 30 minutos.

Para continuar usando sem interrupção, escolha um plano fixo:

${menuRenovacao(planos)}

Digite apenas o número do plano que deseja ativar, ou digite *sair* para encerrar o atendimento.`;
}

function montarMensagemTesteExpiradoComPlanos(cliente, planos = []) {
    return `⚠️ *TESTE GRÁTIS EXPIRADO*
━━━━━━━━━━━━━━━━━━━━
Olá, *${nomeCliente(cliente)}*! Seu teste grátis expirou.

Para reativar seu acesso, escolha um plano fixo:

${menuRenovacao(planos)}

Digite apenas o número do plano que deseja ativar, ou digite *sair* para encerrar o atendimento.`;
}

function montarMensagemTesteExpirado(cliente) {
    return `⚠️ *TESTE GRÁTIS EXPIRADO*
━━━━━━━━━━━━━━━━━━━━
Olá, *${nomeCliente(cliente)}*! Seu teste grátis expirou.

Para ativar um plano, digite *menu* e escolha uma das opções disponíveis.`;
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

function formatarDataHoraSaoPaulo(data = new Date()) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(data);

    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:${mapa.minute}:${mapa.second}`;
}

function estaNoHorarioDeTeste(agora = obterAgoraSaoPaulo()) {
    return agora.hora >= 8 && agora.hora < 23;
}

function estaNoHorarioAvisoVencido(agora = obterAgoraSaoPaulo()) {
    return agora.hora < 22;
}

async function verificarTestesGratisVencendo({ getClient, getStatusWhatsApp } = {}) {
    if (executandoTestes) {
        return { enviados: 0, ignorados: 0, erro: null };
    }

    executandoTestes = true;

    try {
        const status = getStatusWhatsApp ? getStatusWhatsApp() : {};
        const client = getClient ? getClient() : null;

        if (!client || !status.conectado) {
            return { enviados: 0, ignorados: 0, erro: 'WhatsApp não está conectado.' };
        }

        const agoraRelogio = obterAgoraSaoPaulo();
        const dentroHorario = estaNoHorarioDeTeste(agoraRelogio);
        const agoraIso = formatarDataHoraSaoPaulo();
        const planos = dentroHorario ? await obterPlanosRenovacao() : [];
        const clientes = [];

        if (dentroHorario) {
            const testesVencendo = await listarTestesGratisParaAvisoPorHorario(
                agoraIso,
                formatarDataHoraSaoPaulo(new Date(Date.now() + TESTE_AVISO_MINUTOS * 60 * 1000)),
                TESTE_AVISO_PLANO
            );
            const testesExpirados = await listarTestesGratisExpiradosParaAviso(
                agoraIso,
                TESTE_AVISO_EXPIRADO_PLANOS
            );

            clientes.push(
                ...testesVencendo.map(cliente => ({
                    cliente,
                    codigoAviso: TESTE_AVISO_PLANO,
                    tipo: 'vencendo'
                })),
                ...testesExpirados.map(cliente => ({
                    cliente,
                    codigoAviso: TESTE_AVISO_EXPIRADO_PLANOS,
                    tipo: 'expirado_planos'
                }))
            );
        } else {
            const testesExpirados = await listarTestesGratisExpiradosParaAviso(
                agoraIso,
                TESTE_AVISO_EXPIRADO_FORA_HORARIO
            );

            clientes.push(...testesExpirados.map(cliente => ({
                cliente,
                codigoAviso: TESTE_AVISO_EXPIRADO_FORA_HORARIO,
                tipo: 'expirado_fora_horario'
            })));
        }

        let enviados = 0;
        let ignorados = 0;

        for (const item of clientes) {
            const { cliente, codigoAviso, tipo } = item;
            const destino = montarDestinoWhatsApp(cliente.telefone);

            if (!normalizarTelefone(cliente.telefone)) {
                ignorados += 1;
                continue;
            }

            const mensagem = tipo === 'vencendo'
                ? montarMensagemTesteVencendo(cliente, planos)
                : tipo === 'expirado_planos'
                    ? montarMensagemTesteExpiradoComPlanos(cliente, planos)
                    : montarMensagemTesteExpirado(cliente);
            const enviado = await enviarMensagem(client, destino, mensagem);

            if (enviado) {
                enviados += 1;
                await registrarAvisoRenovacaoProgramado(cliente.id, cliente.vencimentoEfetivo, codigoAviso);

                if (dentroHorario) {
                    prepararRenovacaoTesteGratis(destino, cliente);
                }
            } else {
                ignorados += 1;
            }
        }

        return { enviados, ignorados, erro: null };
    } finally {
        executandoTestes = false;
    }
}

async function verificarClientesVencendoUmaHora({ getClient, getStatusWhatsApp } = {}) {
    if (executandoUmaHora) {
        return { enviados: 0, ignorados: 0, erro: null };
    }

    executandoUmaHora = true;

    try {
        const status = getStatusWhatsApp ? getStatusWhatsApp() : {};
        const client = getClient ? getClient() : null;

        if (!client || !status.conectado) {
            return { enviados: 0, ignorados: 0, erro: 'WhatsApp não está conectado.' };
        }

        const agoraIso = formatarDataHoraSaoPaulo();
        const limiteIso = formatarDataHoraSaoPaulo(new Date(Date.now() + 60 * 60 * 1000));
        const clientes = await listarClientesParaAvisoUmaHora(agoraIso, limiteIso, AVISO_CLIENTE_UMA_HORA);
        let enviados = 0;
        let ignorados = 0;

        for (const cliente of clientes) {
            const destino = montarDestinoWhatsApp(cliente.telefone);

            if (!normalizarTelefone(cliente.telefone)) {
                ignorados += 1;
                continue;
            }

            const mensagem = await montarMensagemAvisoProgramado(cliente, AVISO_CLIENTE_UMA_HORA);
            const enviado = await enviarMensagem(client, destino, mensagem);

            if (enviado) {
                enviados += 1;
                await registrarAvisoRenovacaoProgramado(cliente.id, cliente.vencimentoEfetivo, AVISO_CLIENTE_UMA_HORA);
            } else {
                ignorados += 1;
            }
        }

        return { enviados, ignorados, erro: null };
    } finally {
        executandoUmaHora = false;
    }
}

async function verificarClientesVencidosPorDias({ getClient, getStatusWhatsApp } = {}) {
    if (executandoVencidosDias) {
        return { enviados: 0, ignorados: 0, erro: null };
    }

    executandoVencidosDias = true;

    try {
        const agoraRelogio = obterAgoraSaoPaulo();
        if (!estaNoHorarioAvisoVencido(agoraRelogio)) {
            return { enviados: 0, ignorados: 0, erro: null };
        }

        const status = getStatusWhatsApp ? getStatusWhatsApp() : {};
        const client = getClient ? getClient() : null;

        if (!client || !status.conectado) {
            return { enviados: 0, ignorados: 0, erro: 'WhatsApp não está conectado.' };
        }

        const agoraIso = formatarDataHoraSaoPaulo();
        let enviados = 0;
        let ignorados = 0;

        for (const aviso of AVISOS_CLIENTES_VENCIDOS_DIAS) {
            const clientes = await listarClientesVencidosPorDiasParaAviso(agoraIso, aviso.dias, aviso.codigo);

            for (const cliente of clientes) {
                const destino = montarDestinoWhatsApp(cliente.telefone);

                if (!normalizarTelefone(cliente.telefone)) {
                    ignorados += 1;
                    continue;
                }

                const mensagem = await montarMensagemAvisoProgramado(cliente, aviso.codigo);
                const enviado = await enviarMensagem(client, destino, mensagem);

                if (enviado) {
                    enviados += 1;
                    const planoPix = buscarPlanoPorNome(cliente.plano);

                    if (planoPix) {
                        await enviarQRCodePIXParaDestino(client, destino, planoPix, {
                            tipo: 'renovacao',
                            nomeCliente: nomeCliente(cliente)
                        });
                    }

                    await registrarAvisoRenovacaoProgramado(cliente.id, cliente.vencimentoEfetivo, aviso.codigo);
                } else {
                    ignorados += 1;
                }
            }
        }

        return { enviados, ignorados, erro: null };
    } finally {
        executandoVencidosDias = false;
    }
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

    const verificarHorario = async () => {
        if (!(await licencaPermiteUso())) {
            return;
        }

        const agora = obterAgoraSaoPaulo();
        const jaPassouHorario = agora.hora > horaEnvio || (agora.hora === horaEnvio && agora.minuto >= minutoEnvio);

        verificarTestesGratisVencendo(options)
            .then((resultado) => {
                if (resultado.erro) return;
                if (resultado.enviados || resultado.ignorados) {
                    console.log(`Teste grátis: ${resultado.enviados} aviso(s), ${resultado.ignorados} ignorado(s).`);
                }
            })
            .catch((err) => {
                console.log('Erro no aviso de teste grátis:', err.message);
            });

        verificarClientesVencendoUmaHora(options)
            .then((resultado) => {
                if (resultado.erro) return;
                if (resultado.enviados || resultado.ignorados) {
                    console.log(`Vencimento em 1 hora: ${resultado.enviados} aviso(s), ${resultado.ignorados} ignorado(s).`);
                }
            })
            .catch((err) => {
                console.log('Erro no aviso de vencimento em 1 hora:', err.message);
            });

        verificarClientesVencidosPorDias(options)
            .then((resultado) => {
                if (resultado.erro) return;
                if (resultado.enviados || resultado.ignorados) {
                    console.log(`Vencidos 2/5 dias: ${resultado.enviados} aviso(s), ${resultado.ignorados} ignorado(s).`);
                }
            })
            .catch((err) => {
                console.log('Erro no aviso de vencidos 2/5 dias:', err.message);
            });

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
    verificarTestesGratisVencendo,
    verificarClientesVencendoUmaHora,
    verificarClientesVencidosPorDias,
    montarMensagemRenovacao
};
