const db = require('../database/sqlite');
const { mesDiaAniversario } = require('../utils/aniversario');
const { normalizarTelefone } = require('./clientes');
const { obterConfiguracoes } = require('./configuracoesPainel');
const { enfileirarEnvio } = require('./filaMensagensService');
const { simularRespostaHumanizada } = require('./conversaService');
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');

const all = (sql, p = []) => db.ready.then(() => new Promise((ok, no) => db.all(sql, p, (e, r) => e ? no(e) : ok(r))));
const run = (sql, p = []) => db.ready.then(() => new Promise((ok, no) => db.run(sql, p, function(e) { e ? no(e) : ok(this.changes); })));
let executando = false;

function relogio(data = new Date()) {
    const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(data).map(p => [p.type, p.value]));
    return { dia: `${partes.year}-${partes.month}-${partes.day}`, mesDia: `${partes.month}-${partes.day}`, hora: Number(partes.hour) };
}

function montarParabens(nome, empresa) {
    return `🎉🎂🎈 *FELIZ ANIVERSÁRIO!* 🎈🎂🎉
━━━━━━━━━━━━━━━━━━━━

Olá, *${nome}*! 🥳

Hoje o dia é seu! A equipe *${empresa}* deseja muita saúde, felicidade e momentos especiais ao lado de quem você ama. 💙

Que este novo ciclo venha cheio de conquistas, boas surpresas e muitos motivos para sorrir! ✨

Obrigado por fazer parte da nossa história. Aproveite cada momento do seu dia! 🎁🍿

Um abraço da equipe *${empresa}*! 💙

━━━━━━━━━━━━━━━━━━━━
🎊🎁 *HOJE A FESTA É SUA! PARABÉNS!* 🎁🎊`;
}

async function verificarAniversarios({ getClient, getStatusWhatsApp, agora = () => new Date(),
    enfileirar = enfileirarEnvio, humanizar = simularRespostaHumanizada } = {}) {
    if (executando) return { enviados: 0 };
    executando = true;
    let enviados = 0;
    try {
        const hoje = relogio(agora());
        const client = getClient?.();
        if (hoje.hora < 10 || !client || !getStatusWhatsApp?.().conectado) return { enviados };
        const config = await obterConfiguracoes();
        const empresa = String(config.nomeEmpresaRobo || 'nossa empresa').trim();
        const marca = `[Parabéns automático ${hoje.dia.slice(0, 4)}]`;
        const clientes = await all(`SELECT id, nome, telefone, nascimento FROM clientes
            WHERE COALESCE(anonimizadoEm, '') = '' AND COALESCE(whatsappOptOutEm, '') = ''
            AND COALESCE(nascimento, '') <> '' AND NOT EXISTS
            (SELECT 1 FROM cliente_notas n WHERE n.clienteId = clientes.id AND substr(n.texto, 1, length(?)) = ?)`, [marca, marca]);
        for (const cliente of clientes) {
            if (mesDiaAniversario(cliente.nascimento) !== hoje.mesDia) continue;
            const telefone = normalizarTelefone(cliente.telefone);
            if (!/^\d{10,15}$/.test(telefone)) continue;
            try {
                await enfileirar(async () => {
                    const podeEnviar = () => relogio(agora()).dia === hoje.dia && getClient?.() === client && getStatusWhatsApp?.().conectado;
                    if (!podeEnviar()) return;
                    const id = await client.getNumberId(telefone);
                    const destino = id?._serialized;
                    // O LID foi resolvido a partir do telefone cadastrado; nunca é convertido em telefone.
                    if (!destino || !/@(?:c\.us|lid)$/.test(destino)) return;
                    await humanizar({ client, from: destino }, destino);
                    if (!podeEnviar()) return;
                    const atual = await all(`SELECT id FROM clientes WHERE id = ? AND COALESCE(anonimizadoEm, '') = ''
                        AND COALESCE(whatsappOptOutEm, '') = '' AND nascimento = ? AND telefone = ?`, [cliente.id, cliente.nascimento, cliente.telefone]);
                    if (!atual.length) return;
                    const reservado = await run(`INSERT INTO cliente_notas (clienteId, texto) SELECT ?, ? WHERE NOT EXISTS
                        (SELECT 1 FROM cliente_notas WHERE clienteId = ? AND substr(texto, 1, length(?)) = ?)`,
                    [cliente.id, `${marca} Envio reservado; se interrompido, revisar antes de reenviar.`, cliente.id, marca, marca]);
                    if (!reservado) return;
                    let resultado = 'Envio incerto; conferir WhatsApp antes de qualquer reenvio.';
                    try {
                        const mensagem = montarParabens(cliente.nome, empresa);
                        registrarEnvioDoRobo(destino, mensagem);
                        const enviada = await client.sendMessage(destino, mensagem);
                        if (enviada?.id) {
                            registrarMensagemDoRobo(enviada);
                            resultado = 'Parabéns enviados. Bônus permanece independente e sujeito à aprovação.';
                        }
                        enviados += 1;
                    } finally {
                        await run('UPDATE cliente_notas SET texto = ? WHERE clienteId = ? AND substr(texto, 1, length(?)) = ?',
                            [`${marca} ${resultado}`, cliente.id, marca, marca]);
                    }
                }, 'Parabéns de aniversário', { proativo: true });
            } catch (_) {
                console.error('[aniversario] Envio não concluído; consultar histórico do cliente.');
            }
        }
        return { enviados };
    } finally { executando = false; }
}

module.exports = { verificarAniversarios, montarParabens, relogio };
