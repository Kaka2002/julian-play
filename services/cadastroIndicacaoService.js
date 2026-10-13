const db = require('../database/sqlite');
const clientes = require('./clientes');
const indicacoes = require('./indicacoesService');
const { listarHistoricoBonus, ORIGENS } = require('./bonusService');

const get = (sql, p = []) => db.ready.then(() => new Promise((ok, erro) => db.get(sql, p, (e, r) => e ? erro(e) : ok(r))));
const run = (sql, p = []) => db.ready.then(() => new Promise((ok, erro) => db.run(sql, p, function(e) { e ? erro(e) : ok(this.changes); })));

async function prepararIndicacaoCadastro(dados) {
    if (!dados.indicadorClienteId) return null;
    if (!/^[1-9]\d*$/.test(String(dados.indicadorClienteId))) throw new Error('Selecione um indicador cadastrado.');
    const indicadorId = Number(dados.indicadorClienteId);
    if (indicadorId === Number(dados.id)) throw new Error('O cliente não pode indicar a si mesmo.');
    const indicador = await clientes.buscarClientePorId(indicadorId);
    if (!indicador || indicador.anonimizadoEm) throw new Error('Indicador não encontrado.');
    const existente = dados.id ? await get("SELECT * FROM programa_indicacoes WHERE indicadoClienteId = ? AND status <> 'cancelada'", [dados.id]) : null;
    if (existente && Number(existente.indicadorClienteId) !== indicadorId) throw new Error('Este cliente já possui outro indicador no histórico. Revise em Campanhas.');
    const telefone = clientes.normalizarTelefone(dados.telefone);
    if (telefone && telefone === clientes.normalizarTelefone(indicador.telefone)) throw new Error('Indicador e indicado não podem usar o mesmo telefone.');
    const mac = valor => String(valor || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (mac(dados.enderecoMac) && mac(dados.enderecoMac) === mac(indicador.enderecoMac)) throw new Error('Indicador e indicado não podem usar o mesmo MAC.');
    const campanhaChave = String(dados.campanhaIndicacaoChave || '');
    if (campanhaChave && !['campanha_amizade_presente', 'campanha_indique_ganhe_tres_meses'].includes(campanhaChave)) throw new Error('Campanha de indicação inválida.');
    if (!existente && !campanhaChave && !await indicacoes.obterCampanhaAtiva()) throw new Error('Selecione a campanha de origem ou ative uma campanha em Modelos.');
    return { indicadorId, nome: indicador.nome, existente, campanhaChave };
}

async function concluirIndicacaoCadastro(preparo, cliente) {
    if (!preparo) return;
    if (!preparo.existente) {
        const atual = await get("SELECT * FROM programa_indicacoes WHERE indicadoClienteId = ? AND status <> 'cancelada'", [cliente.id]);
        if (atual && Number(atual.indicadorClienteId) !== preparo.indicadorId) throw new Error('A indicação foi vinculada a outro cliente; revise em Campanhas.');
        if (!atual) await indicacoes.registrarIndicacao({ indicadorClienteId: preparo.indicadorId, indicadoClienteId: cliente.id, campanhaChave: preparo.campanhaChave });
    }
    await indicacoes.processarCreditosIndicacoes();
}

async function avisarBonusProgramado(cliente, transporte) {
    if (cliente.statusAvisoBonus !== 'programado' || Number(cliente.bonusMeses) <= 0) return { agendado: false };
    if (!transporte.conectado) return { agendado: false, mensagem: 'Cliente salvo. Aviso de bônus não enviado: WhatsApp desconectado. Salve novamente quando reconectar.' };
    const historico = await listarHistoricoBonus(cliente.id);
    const origens = [...new Set(historico.creditos.filter(c => Number(c.saldo) > 0).map(c => ORIGENS[c.campanhaChave] || 'Origem não identificada'))];
    const periodo = cliente.dataVencimento || cliente.vencimento;
    if (!periodo) return { agendado: false, mensagem: 'Cliente salvo. Informe o vencimento antes de programar o aviso de bônus.' };
    const marca = `[Aviso de bônus programado ${periodo}]`;
    const reservado = await run(`INSERT INTO cliente_notas(clienteId, texto) SELECT ?, ? WHERE NOT EXISTS
        (SELECT 1 FROM cliente_notas WHERE clienteId = ? AND substr(texto, 1, length(?)) = ?)`, [cliente.id, `${marca} Em preparação; não reenviar automaticamente em caso de envio incerto.`, cliente.id, marca, marca]);
    if (!reservado) return { agendado: false };
    const mensagem = `Olá, ${String(cliente.nome || '').split(' ')[0]}!\n\nVocê conquistou ${cliente.bonusMeses} mês(es) de bônus. Origem: ${origens.join('; ') || 'saldo de bônus com origem ainda não identificada'}.\n\nNa sua próxima renovação, o período de bônus será aplicado sem cobrança. Obrigado pelas indicações!`;
    const conclusao = Promise.resolve().then(() => transporte.enviar(cliente, mensagem)).then(
        resultado => run('UPDATE cliente_notas SET texto = ? WHERE clienteId = ? AND substr(texto, 1, length(?)) = ?', [`${marca} ${resultado?.mensagemId ? 'Envio confirmado pelo WhatsApp.' : 'Envio realizado sem ID de confirmação; conferir antes de reenviar.'}`, cliente.id, marca, marca]),
        () => run('UPDATE cliente_notas SET texto = ? WHERE clienteId = ? AND substr(texto, 1, length(?)) = ?', [`${marca} Falha ou envio incerto. Conferir WhatsApp e fila antes de qualquer reenvio.`, cliente.id, marca, marca])
    );
    conclusao.catch(() => console.error('[bonus] Falha ao registrar resultado do aviso de bônus.'));
    return { agendado: true, conclusao, mensagem: 'Cliente salvo. Aviso de bônus em preparação; acompanhe o resultado no histórico.' };
}

module.exports = { prepararIndicacaoCadastro, concluirIndicacaoCadastro, avisarBonusProgramado };
