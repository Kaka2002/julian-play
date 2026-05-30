const menuPrincipal = require('../menus/principal');
const menuPlanos = require('../menus/planos');
const menuDispositivos = require('../menus/dispositivos');
const menuRenovacao = require('../menus/renovacao');
const { isPalavraChave } = require('../utils/helpers');
const {
    cadastrarOuAtualizarCliente,
    buscarClientePorNomeOuTelefone
} = require('./clientes');

const conversas = new Map();

function normalizar(texto) {
    return (texto || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function primeiroNome(nome) {
    return (nome || 'cliente').trim().split(/\s+/)[0];
}

function formatarData(dataIso) {
    if (!dataIso) return 'a confirmar';

    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function tutorialDispositivo(opcao) {
    const tutoriais = {
        '1': '*Smart TV*\n\nInstale o IPTV Smarters Pro ou aplicativo indicado na loja da TV. Depois envie uma foto da tela inicial do app.',
        '2': '*TV Box*\n\nAbra a Play Store, instale IPTV Smarters Pro e envie uma foto da tela inicial do aplicativo.',
        '3': '*Android*\n\nInstale IPTV Smarters Pro pela Play Store. Se o aparelho pedir permissao, aceite e envie uma foto da tela inicial.',
        '4': '*iPhone*\n\nInstale Smarters Player Lite pela App Store e envie uma foto da tela inicial do aplicativo.'
    };

    return tutoriais[opcao] || null;
}

function mensagemTesteLiberado(cliente) {
    return `✅ *TESTE GRATIS LIBERADO*

Nome: ${cliente.nome}
Aparelho: ${cliente.aparelho}
Usuario: ${cliente.usuario}
Senha: ${cliente.senha}
Vencimento: ${formatarData(cliente.vencimento)}

Assim que abrir o aplicativo, envie uma foto da tela se precisar de ajuda.`;
}

async function responderMensagem(message) {
    const telefone = message.from;
    const textoOriginal = message.body || '';
    const texto = normalizar(textoOriginal);
    const conversa = conversas.get(telefone);

    if (texto === '0' || texto === 'sair' || texto === 'encerrar') {
        conversas.delete(telefone);

        await message.reply(`Obrigado pelo contato.

Quando precisar novamente basta enviar *menu*.

JULIAN PLAY TV`);
        return;
    }

    if (texto === 'menu') {
        conversas.delete(telefone);
        await message.reply(menuPrincipal(''));
        return;
    }

    if (conversa?.etapa === 'teste_nome') {
        conversas.set(telefone, {
            etapa: 'teste_aparelho',
            nome: textoOriginal.trim()
        });

        await message.reply(`Perfeito, ${primeiroNome(textoOriginal)}.

Agora informe o aparelho que vai usar:
Smart TV, TV Box, Android, iPhone ou computador.`);
        return;
    }

    if (conversa?.etapa === 'teste_aparelho') {
        const cliente = await cadastrarOuAtualizarCliente({
            telefone,
            nome: conversa.nome,
            aparelho: textoOriginal.trim()
        });

        conversas.delete(telefone);
        await message.reply(mensagemTesteLiberado(cliente));
        return;
    }

    if (conversa?.etapa === 'renovacao_busca') {
        const cliente = await buscarClientePorNomeOuTelefone(textoOriginal.trim());
        conversas.delete(telefone);

        if (!cliente) {
            await message.reply(`Nao encontrei esse cadastro ainda.

Um atendente vai conferir manualmente. Se puder, envie o nome completo e o numero cadastrado.`);
            return;
        }

        await message.reply(`Cadastro localizado:

Nome: ${cliente.nome}
Plano atual: ${cliente.plano || 'a confirmar'}
Vencimento: ${formatarData(cliente.vencimento)}

${menuRenovacao()}

PIX: 61319147704

Depois do pagamento, envie o comprovante aqui.`);
        return;
    }

    if (conversa?.etapa === 'ativacao_dispositivo') {
        const tutorial = tutorialDispositivo(texto);

        if (!tutorial) {
            await message.reply(`Escolha uma opcao valida:

1 - Smart TV
2 - TV Box
3 - Android
4 - iPhone

0 - Voltar`);
            return;
        }

        conversas.delete(telefone);
        await message.reply(tutorial);
        return;
    }

    if (isPalavraChave(texto)) {
        await message.reply(menuPrincipal(''));
        return;
    }

    if (texto === '1' || texto.includes('plano')) {
        await message.reply(menuPlanos());
        return;
    }

    if (texto === '2' || texto.includes('teste')) {
        conversas.set(telefone, { etapa: 'teste_nome' });

        await message.reply(`🎁 *TESTE GRATIS*

Para liberar seu acesso, informe seu nome completo.`);
        return;
    }

    if (texto === '3' || texto.includes('renovar') || texto.includes('renovacao')) {
        conversas.set(telefone, { etapa: 'renovacao_busca' });

        await message.reply(`🔄 *RENOVACAO*

Envie o nome do assinante ou numero cadastrado para localizar sua assinatura.`);
        return;
    }

    if (texto === '4' || texto.includes('ativar') || texto.includes('aplicativo')) {
        conversas.set(telefone, { etapa: 'ativacao_dispositivo' });

        await message.reply(menuDispositivos());
        return;
    }

    await message.reply(`Nao entendi sua mensagem.

Digite *menu* para ver as opcoes de atendimento.`);
}

module.exports = {
    responderMensagem
};
