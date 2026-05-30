const menuPrincipal = require('../menus/principal');
const menuPlanos = require('../menus/planos');
const menuDispositivos = require('../menus/dispositivos');
const menuRenovacao = require('../menus/renovacao');
const { isPalavraChave, isPedidoTeste } = require('../utils/helpers');
const { enviarImagemComLegenda } = require('./assetService');
const { buscarPlano, enviarQRCodePIX } = require('./pixService');
const {
    cadastrarOuAtualizarCliente,
    buscarClientePorNomeOuTelefone
} = require('./clientes');

const conversas = new Map();
const TEMPO_RESPOSTA_MS = Number(process.env.TEMPO_RESPOSTA_MS || 1000);
const DIGITACAO_ATIVA = process.env.DIGITACAO_ATIVA !== 'false';
const imagensRespostas = {
    menu: 'Logo 1_7.png',
    planos: null,
    teste: null,
    testeLiberado: null,
    renovacao: null,
    ativacao: null,
    erro: null,
    encerramento: null
};
const RODAPE_ATENDIMENTO = 'Digite *sair* para encerrar o atendimento.';

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function simularDigitacao(message, tempo = TEMPO_RESPOSTA_MS) {
    if (!DIGITACAO_ATIVA || tempo <= 0) return;

    try {
        const chat = await message.getChat();
        await chat.sendStateTyping();
        await esperar(tempo);
        await chat.clearState();
    } catch (err) {
        console.log('Nao foi possivel simular digitacao:', err.message);
        await esperar(tempo);
    }
}

async function responderComDigitacao(message, texto, imagem = null) {
    await simularDigitacao(message);
    const resposta = adicionarOpcaoSair(texto);

    const enviouComImagem = await enviarImagemComLegenda(message, imagem, resposta);

    if (enviouComImagem) return;

    const chat = await message.getChat();
    await chat.sendMessage(resposta);
}

function adicionarOpcaoSair(texto) {
    if (!texto) return RODAPE_ATENDIMENTO;
    if (texto.toLowerCase().includes('atendimento encerrado')) return texto;
    if (texto.toLowerCase().includes('sair')) return texto;

    return `${texto}

${RODAPE_ATENDIMENTO}`;
}

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
    return `*TESTE GRATIS LIBERADO*

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

    if (texto === '0' || texto === 'voltar') {
        conversas.delete(telefone);
        await responderComDigitacao(message, menuPrincipal(''), imagensRespostas.menu);
        return;
    }

    if (texto === 'sair' || texto === 'encerrar') {
        conversas.delete(telefone);
        await responderComDigitacao(message, `Atendimento encerrado.

Caso queira retornar ao atendimento, digite *menu*.`, imagensRespostas.encerramento);
        return;
    }

    if (texto === 'menu') {
        conversas.delete(telefone);
        await responderComDigitacao(message, menuPrincipal(''), imagensRespostas.menu);
        return;
    }

    if (conversa?.etapa === 'planos_escolha') {
        const plano = buscarPlano(texto);

        if (!plano) {
            await responderComDigitacao(message, `Escolha uma opcao valida:

1 - Mensal
2 - Trimestral
3 - Semestral
4 - Anual
0 - Voltar`, imagensRespostas.planos);
            return;
        }

        conversas.delete(telefone);
        await simularDigitacao(message, 1500);
        await enviarQRCodePIX(message, plano);
        return;
    }

    if (conversa?.etapa === 'teste_nome') {
        conversas.set(telefone, {
            etapa: 'teste_aparelho',
            nome: textoOriginal.trim()
        });

        await responderComDigitacao(message, `Perfeito, ${primeiroNome(textoOriginal)}.

Agora informe o aparelho que vai usar:
Smart TV, TV Box, Android, iPhone ou computador.`, imagensRespostas.teste);
        return;
    }

    if (conversa?.etapa === 'teste_aparelho') {
        const cliente = await cadastrarOuAtualizarCliente({
            telefone,
            nome: conversa.nome,
            aparelho: textoOriginal.trim()
        });

        conversas.delete(telefone);
        await responderComDigitacao(message, mensagemTesteLiberado(cliente), imagensRespostas.testeLiberado);
        return;
    }

    if (conversa?.etapa === 'renovacao_busca') {
        const cliente = await buscarClientePorNomeOuTelefone(textoOriginal.trim());
        conversas.delete(telefone);

        if (!cliente) {
            await responderComDigitacao(message, `Nao encontrei esse cadastro ainda.

Um atendente vai conferir manualmente. Se puder, envie o nome completo e o numero cadastrado.`, imagensRespostas.erro);
            return;
        }

        await responderComDigitacao(message, `Cadastro localizado:

Nome: ${cliente.nome}
Plano atual: ${cliente.plano || 'a confirmar'}
Vencimento: ${formatarData(cliente.vencimento)}

${menuRenovacao()}

PIX: 61319147704

Depois do pagamento, envie o comprovante aqui.`, imagensRespostas.renovacao);
        return;
    }

    if (conversa?.etapa === 'ativacao_dispositivo') {
        const tutorial = tutorialDispositivo(texto);

        if (!tutorial) {
            await responderComDigitacao(message, `Escolha uma opcao valida:

1 - Smart TV
2 - TV Box
3 - Android
4 - iPhone

0 - Voltar`, imagensRespostas.ativacao);
            return;
        }

        conversas.delete(telefone);
        await responderComDigitacao(message, tutorial, imagensRespostas.ativacao);
        return;
    }

    if (texto === '1' || texto.includes('plano')) {
        conversas.set(telefone, { etapa: 'planos_escolha' });
        await responderComDigitacao(message, menuPlanos(), imagensRespostas.planos);
        return;
    }

    if (texto === '2' || isPedidoTeste(texto)) {
        conversas.set(telefone, { etapa: 'teste_nome' });

        await responderComDigitacao(message, `*TESTE GRATIS*

Para liberar seu acesso, informe seu nome completo.`, imagensRespostas.teste);
        return;
    }

    if (isPalavraChave(texto)) {
        await responderComDigitacao(message, menuPrincipal(''), imagensRespostas.menu);
        return;
    }

    if (texto === '3' || texto.includes('renovar') || texto.includes('renovacao')) {
        conversas.set(telefone, { etapa: 'renovacao_busca' });

        await responderComDigitacao(message, `*RENOVACAO*

Envie o nome do assinante ou numero cadastrado para localizar sua assinatura.`, imagensRespostas.renovacao);
        return;
    }

    if (texto === '4' || texto.includes('ativar') || texto.includes('aplicativo')) {
        conversas.set(telefone, { etapa: 'ativacao_dispositivo' });

        await responderComDigitacao(message, menuDispositivos(), imagensRespostas.ativacao);
        return;
    }

    await responderComDigitacao(message, `Nao entendi sua mensagem.

Digite *menu* para ver as opcoes de atendimento.`, imagensRespostas.erro);
}

module.exports = {
    responderMensagem
};
