const fs = require('fs');
const path = require('path');
const menuPrincipal = require('../menus/principal');
const menuPlanos = require('../menus/planos');
const menuDispositivos = require('../menus/dispositivos');
const menuRenovacao = require('../menus/renovacao');
const { isPalavraChave, isPedidoTeste } = require('../utils/helpers');
const { enviarImagemComLegenda } = require('./assetService');
const { buscarPlano, enviarQRCodePIX } = require('./pixService');
const {
    buscarClientePorNomeOuTelefone,
    buscarClientePorUsuarioIPTV,
    cadastrarClienteTesteParcial,
    cadastrarTesteLiberadoPorAtendente
} = require('./clientes');

const conversas = new Map();
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));
const ARQUIVO_CONVERSAS = path.join(DATA_DIR, 'database', 'conversas.json');
const TEMPO_RESPOSTA_MS = Number(process.env.TEMPO_RESPOSTA_MS || 3500);
const DIGITACAO_ATIVA = process.env.DIGITACAO_ATIVA !== 'false';
const ENVIO_TIMEOUT_MS = Number(process.env.ENVIO_TIMEOUT_MS || 90000);
const imagensRespostas = {
    menu: 'Logo 1_7.png',
    planos: 'Plano.png',
    teste: null,
    testeLiberado: null,
    renovacao: null,
    ativacao: null,
    erro: null,
    encerramento: null
};
const RODAPE_ATENDIMENTO = 'Digite *sair* para encerrar o atendimento.';

function carregarConversas() {
    try {
        if (!fs.existsSync(ARQUIVO_CONVERSAS)) return;

        const dados = JSON.parse(fs.readFileSync(ARQUIVO_CONVERSAS, 'utf8'));

        for (const [telefone, conversa] of Object.entries(dados)) {
            if (conversa?.etapa) conversas.set(telefone, conversa);
        }
    } catch (err) {
        console.log('Nao foi possivel carregar conversas salvas:', err.message);
    }
}

function salvarConversas() {
    try {
        fs.mkdirSync(path.dirname(ARQUIVO_CONVERSAS), { recursive: true });
        fs.writeFileSync(
            ARQUIVO_CONVERSAS,
            JSON.stringify(Object.fromEntries(conversas), null, 2)
        );
    } catch (err) {
        console.log('Nao foi possivel salvar conversas:', err.message);
    }
}

function definirConversa(telefone, conversa) {
    conversas.set(telefone, conversa);
    salvarConversas();
}

function apagarConversa(telefone) {
    conversas.delete(telefone);
    salvarConversas();
}

function pausarParaAtendente(telefone, nome = '') {
    definirConversa(telefone, {
        etapa: 'atendimento_humano',
        nome,
        iniciadoEm: new Date().toISOString()
    });
}

carregarConversas();

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function comTimeout(promessa, ms, descricao) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => {
            setTimeout(() => {
                const err = new Error(`${descricao} excedeu ${ms}ms`);
                err.isTimeout = true;
                reject(err);
            }, ms);
        })
    ]);
}

async function simularDigitacao(message, tempo = TEMPO_RESPOSTA_MS) {
    if (!DIGITACAO_ATIVA || tempo <= 0) return;

    try {
        const chat = await comTimeout(message.getChat(), 5000, 'Busca do chat');
        await comTimeout(chat.sendStateTyping(), 5000, 'Estado digitando');
        await esperar(tempo);
        await comTimeout(chat.clearState(), 5000, 'Limpeza do estado digitando');
    } catch (err) {
        console.log('Nao foi possivel simular digitacao:', err.message);
    }
}

async function responderComDigitacao(message, texto, imagem = null) {
    await simularDigitacao(message);
    const resposta = adicionarOpcaoSair(texto);

    const enviouComImagem = await enviarImagemComLegenda(message, imagem, resposta);

    if (enviouComImagem) return;

    const destino = obterDestinoMensagem(message);
    console.log('Enviando resposta para:', destino);

    try {
        const enviada = await comTimeout(
            message.client.sendMessage(destino, resposta),
            ENVIO_TIMEOUT_MS,
            'Envio de mensagem'
        );

        console.log('Resposta enviada:', enviada?.id?._serialized || 'sem id');
    } catch (err) {
        if (err.isTimeout) {
            console.log('Envio demorou demais. O WhatsApp pode concluir em segundo plano:', err.message);
            return;
        }

        throw err;
    }
}

async function responderEncerramentoRapido(message) {
    const destino = obterDestinoMensagem(message);
    apagarConversa(destino);

    const texto = `✅ *ATENDIMENTO ENCERRADO*
━━━━━━━━━━━━━━━━━━━━
Obrigado por falar com a *JULIAN PLAY*.

Caso queira retornar ao atendimento, digite *menu*.`;

    console.log('Enviando encerramento para:', destino);

    try {
        const enviada = await comTimeout(
            message.client.sendMessage(destino, texto),
            ENVIO_TIMEOUT_MS,
            'Envio de encerramento'
        );

        console.log('Atendimento encerrado:', enviada?.id?._serialized || 'sem id');
    } catch (err) {
        if (err.isTimeout) {
            console.log('Encerramento demorou demais. Atendimento ja foi encerrado internamente:', err.message);
            return;
        }

        throw err;
    }
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

function obterDestinoMensagem(message) {
    return message?.fromMe && message?.to ? message.to : message.from;
}

function obterTelefoneClienteMensagem(message) {
    const destino = obterDestinoMensagem(message);

    if (!destino || !String(destino).endsWith('@c.us')) return '';

    return destino;
}

function primeiroNome(nome) {
    return (nome || 'cliente').trim().split(/\s+/)[0];
}

async function obterNomeContato(message) {
    try {
        const contato = await comTimeout(message.getContact(), 5000, 'Busca do contato');
        const nome = contato.pushname || contato.name || contato.shortName || '';
        return nome.trim() || '';
    } catch (err) {
        console.log('Nao foi possivel obter nome do contato:', err.message);
        return '';
    }
}

async function enviarMenuPrincipal(message, imagem = null) {
    const nome = primeiroNome(await obterNomeContato(message));
    await responderComDigitacao(message, menuPrincipal(nome), imagem);
}

function formatarData(dataIso) {
    if (!dataIso) return 'a confirmar';

    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function primeiraOpcaoJson(valor) {
    if (!valor) return 'não informado';

    try {
        const lista = JSON.parse(valor);
        if (Array.isArray(lista) && lista.length) return lista[0];
    } catch (err) {
        return String(valor).split(',').map(item => item.trim()).filter(Boolean)[0] || 'não informado';
    }

    return 'não informado';
}

function tutorialDispositivo(opcao) {
    const tutoriais = {
        '1': `📺 *SMART TV*
━━━━━━━━━━━━━━━━━━━━
1 - Abra a loja de aplicativos da sua TV
2 - Procure por *IPTV Smarters Pro*
3 - Instale o aplicativo
4 - Abra o app e envie uma foto da tela inicial

Com a foto, enviamos os dados corretos para ativação.`,
        '2': `📦 *TV BOX*
━━━━━━━━━━━━━━━━━━━━
1 - Abra a Play Store
2 - Procure por *IPTV Smarters Pro*
3 - Instale e abra o aplicativo
4 - Envie uma foto da tela inicial

Assim conseguimos orientar a configuração sem erro.`,
        '3': `📱 *ANDROID*
━━━━━━━━━━━━━━━━━━━━
1 - Abra a Play Store
2 - Instale *IPTV Smarters Pro*
3 - Aceite as permissões solicitadas
4 - Envie uma foto da tela inicial do app`,
        '4': `🍎 *IPHONE*
━━━━━━━━━━━━━━━━━━━━
1 - Abra a App Store
2 - Instale *Smarters Player Lite*
3 - Abra o aplicativo
4 - Envie uma foto da tela inicial para continuarmos`
    };

    return tutoriais[opcao] || null;
}

function aparelhoTeste(opcao) {
    const aparelhos = {
        '1': 'Smart TV',
        '2': 'TV Box',
        '3': 'Celular Android',
        '4': 'iPhone',
        '5': 'Computador'
    };

    return aparelhos[opcao] || null;
}

function marcaSmartTV(opcao) {
    const marcas = {
        '1': 'TV LG',
        '2': 'TV Samsung',
        '3': 'TV TCL',
        '4': 'TV Roku',
        '5': 'Toshiba/Philco',
        '6': 'TV Philips',
        '7': 'Semp',
        '8': 'Hisense',
        '9': 'Panasonic',
        '10': 'Sony',
        '11': 'Telefunken',
        '12': 'Thomson'
    };

    return marcas[opcao] || null;
}

function menuMarcasSmartTV() {
    return `📺 *MARCA DA SMART TV*
━━━━━━━━━━━━━━━━━━━━
Escolha a marca da sua TV:

*1* - TV LG
*2* - TV Samsung
*3* - TV TCL
*4* - TV Roku
*5* - Toshiba e/ou Philco
*6* - TV Philips
*7* - Semp
*8* - Hisense
*9* - Panasonic
*10* - Sony
*11* - Telefunken
*12* - Thomson

Se não for nenhuma acima, digite o nome da marca da sua TV.`;
}

function mensagemTesteLiberado(cliente) {
    return `🎁 *TESTE GRÁTIS LIBERADO*
━━━━━━━━━━━━━━━━━━━━
Seu acesso de teste foi preparado com sucesso.

👤 *Nome:* ${cliente.nome}
📲 *Dispositivo:* ${cliente.aparelho}
🔐 *Usuário:* ${cliente.usuario}
🔑 *Senha:* ${cliente.senha}
📅 *Válido até:* ${formatarData(cliente.vencimento)}

Abra o aplicativo no dispositivo informado e use os dados acima.

Se aparecer alguma dúvida na tela, envie uma foto aqui.`;
}

function mensagemTransferenciaTesteSmartTV(nome, aparelho) {
    return `*ATENDIMENTO TRANSFERIDO*
--------------------
Recebemos as informações para liberar seu teste grátis.

Seu atendimento será transferido para um atendente.
Aguarde alguns minutos, por favor.

*Dados informados:*
*Nome:* ${nome}
*Dispositivo:* ${aparelho}

O atendente vai preparar seu teste e enviar os dados de acesso assim que estiver pronto.

Aguarde o atendente informar os procedimentos corretos para ativar seu teste grátis.

Se aparecer alguma dúvida na tela, envie uma foto aqui.`;
}

function extrairCampoTeste(texto, nomes) {
    const linhas = String(texto || '').split(/\r?\n/);
    const nomesNormalizados = nomes.map(nome => normalizar(nome));

    for (const linha of linhas) {
        const limpa = linha.replace(/\*/g, '').trim();
        const indice = limpa.indexOf(':');

        if (indice === -1) continue;

        const rotulo = normalizar(limpa.slice(0, indice));
        if (!nomesNormalizados.includes(rotulo)) continue;

        const valor = limpa.slice(indice + 1).trim();
        if (!valor || /^[_\s/:-]+$/.test(valor)) return '';
        return valor;
    }

    return '';
}

async function registrarTesteLiberadoPorMensagem(message) {
    const texto = message?.body || '';
    const textoNormalizado = normalizar(texto);

    if (!textoNormalizado.includes('teste gratis liberado')) return false;

    const telefone = message?.to || '';
    const dados = {
        telefone,
        nome: extrairCampoTeste(texto, ['Nome']),
        aparelho: extrairCampoTeste(texto, ['Aparelho', 'Dispositivo']),
        aplicativo: extrairCampoTeste(texto, ['Aplicativo']),
        painel: extrairCampoTeste(texto, ['Painel']),
        usuario: extrairCampoTeste(texto, ['Usuário', 'Usuario']),
        senha: extrairCampoTeste(texto, ['Senha']),
        dataInicio: extrairCampoTeste(texto, ['Data/Início', 'Data Inicio', 'Início', 'Inicio']),
        validade: extrairCampoTeste(texto, ['Válido até', 'Valido ate', 'Validade'])
    };

    const cliente = await cadastrarTesteLiberadoPorAtendente(dados);

    if (!cliente) {
        console.log('Teste grátis liberado não cadastrado: dados incompletos.');
        return false;
    }

    console.log('Teste grátis cadastrado pelo atendimento:', cliente.nome, cliente.telefone);
    return true;
}

function mensagemEscolhaAparelhoTeste(nome) {
    return `🎁 *TESTE GRÁTIS*
━━━━━━━━━━━━━━━━━━━━
Perfeito, *${primeiroNome(nome)}*!

Agora escolha o dispositivo que você vai usar:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador

Digite apenas o número do dispositivo.`;
}

function mensagemBoasVindas(nome) {
    const saudacao = menuPrincipal.getSaudacao ? menuPrincipal.getSaudacao() : 'Olá';

    return `*BEM-VINDO À JULIAN PLAY*
--------------------
${saudacao}, *${primeiroNome(nome)}*!

Sou o assistente virtual da *JULIAN PLAY* e vou iniciar seu atendimento.

Você já é cliente ou deseja realizar um teste grátis?

*1* - Já sou cliente
*2* - Quero teste grátis
*3* - Ainda não sou cliente

Digite *sair* para encerrar o atendimento.`;
}

function mensagemClienteOpcoes(nome) {
    return `*CLIENTE JULIAN PLAY*
--------------------
Perfeito, *${primeiroNome(nome)}*!

Como posso te ajudar?

*1* - Renovar assinatura
*2* - Falar com um atendente
*0* - Abrir menu principal

Digite *sair* para encerrar o atendimento.`;
}

function mensagemTransferirAtendente(nome) {
    return `*ATENDIMENTO COM ATENDENTE*
--------------------
Tudo certo, *${primeiroNome(nome)}*!

Seu atendimento será transferido para um atendente.
Aguarde alguns minutos, por favor.`;
}

async function iniciarTesteGratis(message, telefone) {
    const nomeContato = await obterNomeContato(message);
    const nome = nomeContato || 'Cliente';

    definirConversa(telefone, {
        etapa: 'teste_aparelho',
        nome
    });

    await responderComDigitacao(message, mensagemEscolhaAparelhoTeste(nome), imagensRespostas.teste);
}

async function iniciarBoasVindas(message, telefone) {
    const nomeContato = await obterNomeContato(message);
    const nome = nomeContato || 'Cliente';

    definirConversa(telefone, {
        etapa: 'boas_vindas_opcao',
        nome
    });

    await responderComDigitacao(message, mensagemBoasVindas(nome), imagensRespostas.menu);
}

async function responderMensagem(message) {
    const telefone = obterDestinoMensagem(message);
    const textoOriginal = message.body || '';
    const texto = normalizar(textoOriginal);
    const conversa = conversas.get(telefone);

    if (texto === '0' || texto === 'voltar') {
        apagarConversa(telefone);
        await enviarMenuPrincipal(message);
        return;
    }

    if (texto === 'sair' || texto === 'encerrar') {
        apagarConversa(telefone);
        await responderComDigitacao(message, `✅ *ATENDIMENTO ENCERRADO*
━━━━━━━━━━━━━━━━━━━━
Obrigado por falar com a *JULIAN PLAY*.

Caso queira retornar ao atendimento, digite *menu*.`, imagensRespostas.encerramento);
        return;
    }

    if (texto === 'menu') {
        apagarConversa(telefone);
        await enviarMenuPrincipal(message, imagensRespostas.menu);
        return;
    }

    if (conversa?.etapa === 'atendimento_humano') {
        console.log('Mensagem ignorada: atendimento humano em andamento para:', telefone);
        return;
    }

    if (conversa?.etapa === 'boas_vindas_opcao') {
        if (texto === '1' || texto.includes('cliente')) {
            definirConversa(telefone, {
                etapa: 'cliente_opcoes',
                nome: conversa.nome
            });

            await responderComDigitacao(message, mensagemClienteOpcoes(conversa.nome), imagensRespostas.menu);
            return;
        }

        if (texto === '2' || texto.includes('teste') || texto.includes('gratis')) {
            await iniciarTesteGratis(message, telefone);
            return;
        }

        if (texto === '3' || texto.includes('nao')) {
            apagarConversa(telefone);
            await enviarMenuPrincipal(message, imagensRespostas.menu);
            return;
        }

        await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
━━━━━━━━━━━━━━━━━━━━
Escolha uma das opções:

*1* - Já sou cliente
*2* - Quero teste grátis
*3* - Ainda não sou cliente`, imagensRespostas.erro);
        return;
    }

    if (conversa?.etapa === 'cliente_opcoes') {
        if (texto === '1' || texto.includes('renovar') || texto.includes('renovacao')) {
            definirConversa(telefone, { etapa: 'renovacao_nome' });

            await responderComDigitacao(message, `🔄 *RENOVAÇÃO*
━━━━━━━━━━━━━━━━━━━━
Vamos iniciar sua renovação.

Envie o *usuário do painel* para o atendente localizar o cadastro.`, imagensRespostas.renovacao);
            return;
        }

        if (texto === '2' || texto.includes('atendente')) {
            pausarParaAtendente(telefone, conversa.nome);
            await responderComDigitacao(message, mensagemTransferirAtendente(conversa.nome), imagensRespostas.ativacao);
            return;
        }

        if (texto === '0' || texto === 'voltar') {
            apagarConversa(telefone);
            await enviarMenuPrincipal(message, imagensRespostas.menu);
            return;
        }

        await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
━━━━━━━━━━━━━━━━━━━━
Escolha uma das opções:

*1* - Renovar assinatura
*2* - Falar com um atendente
*0* - Abrir menu principal`, imagensRespostas.erro);
        return;
    }

    if (conversa?.etapa === 'planos_escolha') {
        const plano = buscarPlano(texto);

        if (!plano) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
━━━━━━━━━━━━━━━━━━━━
Escolha um dos planos abaixo:

*1* - Mensal
*2* - Trimestral
*3* - Semestral
*4* - Anual
*0* - Voltar`, imagensRespostas.planos);
            return;
        }

        apagarConversa(telefone);
        await responderComDigitacao(message, `*DADOS NECESSÁRIOS PARA ATIVAÇÃO*
--------------------
Para liberar seu plano após o pagamento, envie aqui:

*Nome completo*
*WhatsApp*
*Data de nascimento*
*Dispositivo que vai usar*

Agora vou te enviar o PIX do plano escolhido.`, imagensRespostas.planos);
        await simularDigitacao(message, 1500);
        await enviarQRCodePIX(message, plano);
        return;
    }

    if (conversa?.etapa === 'teste_nome') {
        definirConversa(telefone, {
            etapa: 'teste_aparelho',
            usuarioPainel: textoOriginal.trim()
        });

        await responderComDigitacao(message, `✅ Perfeito, *${primeiroNome(textoOriginal)}*!
━━━━━━━━━━━━━━━━━━━━
Agora escolha o dispositivo que você vai usar:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador

Digite apenas o número do dispositivo.`, imagensRespostas.teste);
        return;
    }

    if (conversa?.etapa === 'teste_aparelho') {
        const aparelho = aparelhoTeste(texto);

        if (!aparelho) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
━━━━━━━━━━━━━━━━━━━━
Escolha um dispositivo da lista:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador`, imagensRespostas.teste);
            return;
        }

        if (aparelho === 'Smart TV') {
            definirConversa(telefone, {
                etapa: 'teste_marca_smarttv',
                nome: conversa.nome
            });

            await responderComDigitacao(message, menuMarcasSmartTV(), imagensRespostas.teste);
            return;
        }

        const telefoneCliente = obterTelefoneClienteMensagem(message);

        if (!telefoneCliente) {
            console.log('Teste grátis parcial não cadastrado: telefone do cliente não identificado.');
            return;
        }

        await cadastrarClienteTesteParcial({
            telefone: telefoneCliente,
            nome: conversa.nome,
            aparelho
        });

        pausarParaAtendente(telefoneCliente, conversa.nome);
        await responderComDigitacao(
            message,
            mensagemTransferenciaTesteSmartTV(conversa.nome, aparelho),
            imagensRespostas.testeLiberado
        );
        return;
    }

    if (conversa?.etapa === 'teste_marca_smarttv') {
        const marca = marcaSmartTV(texto) || textoOriginal.trim();
        const aparelho = `Smart TV - ${marca}`;
        const telefoneCliente = obterTelefoneClienteMensagem(message);

        if (!telefoneCliente) {
            console.log('Teste grátis parcial não cadastrado: telefone do cliente não identificado.');
            return;
        }

        await cadastrarClienteTesteParcial({
            telefone: telefoneCliente,
            nome: conversa.nome,
            aparelho
        });

        pausarParaAtendente(telefoneCliente, conversa.nome);
        await responderComDigitacao(
            message,
            mensagemTransferenciaTesteSmartTV(conversa.nome, aparelho),
            imagensRespostas.testeLiberado
        );
        return;
    }

    if (conversa?.etapa === 'renovacao_nome' || conversa?.etapa === 'renovacao_busca') {
        const usuarioPainel = textoOriginal.trim();
        const cliente = await buscarClientePorUsuarioIPTV(usuarioPainel);
        const painel = primeiraOpcaoJson(cliente?.paineisSelecionados);

        definirConversa(telefone, {
            etapa: 'renovacao_plano',
            usuarioPainel,
            painel,
            clienteId: cliente?.id || null
        });

        await responderComDigitacao(message, `✅ *DADOS RECEBIDOS*
━━━━━━━━━━━━━━━━━━━━
*Usuário:* ${usuarioPainel}
*Painel:* ${painel}

${menuRenovacao()}

Digite apenas o número do plano que deseja renovar.`, imagensRespostas.renovacao);
        return;
    }

    if (conversa?.etapa === 'renovacao_plano') {
        const plano = buscarPlano(texto);

        if (!plano) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
━━━━━━━━━━━━━━━━━━━━
Escolha um dos planos para renovar:

${menuRenovacao()}`, imagensRespostas.renovacao);
            return;
        }

        apagarConversa(telefone);
        await simularDigitacao(message, 1500);
        await enviarQRCodePIX(message, plano, {
            tipo: 'renovacao',
            nomeCliente: conversa.usuarioPainel
        });
        return;
    }

    if (conversa?.etapa === 'renovacao_busca_antiga') {
        const cliente = await buscarClientePorNomeOuTelefone(textoOriginal.trim());
        apagarConversa(telefone);

        if (!cliente) {
            await responderComDigitacao(message, `🔎 *CADASTRO NÃO LOCALIZADO*
━━━━━━━━━━━━━━━━━━━━
Não encontrei esse cadastro automaticamente.

Para conferirmos manualmente, envie:

👤 Nome completo
📱 Número cadastrado`, imagensRespostas.erro);
            return;
        }

        await responderComDigitacao(message, `✅ *CADASTRO LOCALIZADO*
━━━━━━━━━━━━━━━━━━━━
👤 *Nome:* ${cliente.nome}
📦 *Plano atual:* ${cliente.plano || 'a confirmar'}
📅 *Vencimento:* ${formatarData(cliente.vencimento)}

${menuRenovacao()}

💳 *PIX:* 61319147704

Depois do pagamento, envie o comprovante aqui.`, imagensRespostas.renovacao);
        return;
    }

    if (conversa?.etapa === 'ativacao_dispositivo') {
        const tutorial = tutorialDispositivo(texto);

        if (!tutorial) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
━━━━━━━━━━━━━━━━━━━━
Escolha um dispositivo da lista:

*1* - Smart TV
*2* - TV Box
*3* - Android
*4* - iPhone

*0* - Voltar`, imagensRespostas.ativacao);
            return;
        }

        apagarConversa(telefone);
        await responderComDigitacao(message, tutorial, imagensRespostas.ativacao);
        return;
    }

    if (texto === '1' || texto.includes('plano')) {
        definirConversa(telefone, { etapa: 'planos_escolha' });
        await responderComDigitacao(message, menuPlanos(), imagensRespostas.planos);
        return;
    }

    if (texto === '2' || isPedidoTeste(texto)) {
        await iniciarTesteGratis(message, telefone);
        return;
    }

    if (isPalavraChave(texto)) {
        await iniciarBoasVindas(message, telefone);
        return;
    }

    if (texto === '3' || texto.includes('renovar') || texto.includes('renovacao')) {
        definirConversa(telefone, { etapa: 'renovacao_nome' });

        await responderComDigitacao(message, `🔄 *RENOVAÇÃO*
━━━━━━━━━━━━━━━━━━━━
Vamos iniciar sua renovação.

Envie o *usuário do painel* para o atendente localizar o cadastro.`, imagensRespostas.renovacao);
        return;
    }

    if (texto === '4' || texto.includes('ativar') || texto.includes('aplicativo')) {
        definirConversa(telefone, { etapa: 'ativacao_dispositivo' });

        await responderComDigitacao(message, menuDispositivos(), imagensRespostas.ativacao);
        return;
    }

    await responderComDigitacao(message, `⚠️ *NÃO ENTENDI SUA MENSAGEM*
━━━━━━━━━━━━━━━━━━━━
Digite uma das opções do menu principal:

*1* - Planos
*2* - Teste grátis
*3* - Renovação
*4* - Ativação`, imagensRespostas.erro);
}

module.exports = {
    responderMensagem,
    responderEncerramentoRapido,
    registrarTesteLiberadoPorMensagem,
    normalizar
};
