const fs = require('fs');
const path = require('path');
const menuPrincipal = require('../menus/principal');
const menuPlanos = require('../menus/planos');
const menuDispositivos = require('../menus/dispositivos');
const menuRenovacao = require('../menus/renovacao');
const { isMensagemConfirmacao, isPalavraChave, isPedidoTeste } = require('../utils/helpers');
const { enviarImagem } = require('./assetService');
const { agendarEncerramentoTeste } = require('./encerramentoTesteService');
const { buscarPlano, enviarQRCodePIX, listarPlanosComerciais } = require('./pixService');
const { obterConfiguracoes } = require('./configuracoesPainel');
const {
    buscarClientePorNomeOuTelefone,
    buscarClientePorUsuarioIPTV,
    cadastrarClienteTesteParcial,
    cadastrarTesteLiberadoPorAtendente
} = require('./clientes');
const {
    registrarMensagemDoRobo,
    registrarEnvioDoRobo,
    foiTextoEnviadoPeloRobo
} = require('./mensagensPropriasService');

const conversas = new Map();
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ?'/var/data' : path.join(__dirname, '..'));
const ARQUIVO_CONVERSAS = path.join(DATA_DIR, 'database', 'conversas.json');
const TEMPO_RESPOSTA_MS = Number(process.env.TEMPO_RESPOSTA_MS || 3500);
const DIGITACAO_ATIVA = process.env.DIGITACAO_ATIVA !== 'false';
const ENVIO_TIMEOUT_MS = Number(process.env.ENVIO_TIMEOUT_MS || 90000);
const ATENDIMENTO_HUMANO_TIMEOUT_MS = Number(process.env.ATENDIMENTO_HUMANO_TIMEOUT_MS || 30 * 60 * 1000);
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

async function obterPerfilRobo() {
    const config = await obterConfiguracoes().catch(() => ({}));
    const usarImagensPadrao = !String(process.env.LICENSE_CUSTOMER_NAME || '').trim();
    const nomeEmpresa = (
        config.nomeEmpresaRobo ||
        config.licencaCliente ||
        process.env.LICENSE_CUSTOMER_NAME ||
        config.nomeSistema ||
        'JULIAN PLAY'
    ).trim();

    return {
        nomeEmpresa,
        imagens: {
            menu: config.imagemRoboMenu || (usarImagensPadrao ?imagensRespostas.menu : ''),
            planos: config.imagemRoboPlanos || (usarImagensPadrao ?imagensRespostas.planos : ''),
            teste: config.imagemRoboTeste || (usarImagensPadrao ?imagensRespostas.teste : ''),
            testeLiberado: config.imagemRoboTesteLiberado || (usarImagensPadrao ?imagensRespostas.testeLiberado : ''),
            renovacao: config.imagemRoboRenovacao || (usarImagensPadrao ?imagensRespostas.renovacao : ''),
            ativacao: config.imagemRoboAtivacao || (usarImagensPadrao ?imagensRespostas.ativacao : ''),
            erro: config.imagemRoboErro || (usarImagensPadrao ?imagensRespostas.erro : ''),
            encerramento: config.imagemRoboEncerramento || (usarImagensPadrao ?imagensRespostas.encerramento : '')
        },
        planos: await listarPlanosComerciais()
    };
}

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

function pausarParaAtendente(telefone, nome = '', origem = 'bot') {
    definirConversa(telefone, {
        etapa: 'atendimento_humano',
        nome,
        origem,
        iniciadoEm: new Date().toISOString()
    });
}

function prepararRenovacaoTesteGratis(telefone, cliente = {}) {
    definirConversa(telefone, {
        etapa: 'renovacao_plano',
        usuarioPainel: cliente.usuario || cliente.usuarioApp || cliente.nome || 'Teste grátis',
        painel: primeiraOpcaoJson(cliente.paineisSelecionados),
        clienteId: cliente.id || null,
        origem: 'teste_gratis_vencendo'
    });
}

carregarConversas();

function atendimentoHumanoExpirou(conversa = {}) {
    if (conversa.etapa !== 'atendimento_humano') return false;
    if (!conversa.iniciadoEm) return true;

    const inicio = new Date(conversa.iniciadoEm).getTime();
    if (!inicio) return true;

    return Date.now() - inicio > ATENDIMENTO_HUMANO_TIMEOUT_MS;
}

function textoCurto(texto) {
    return String(texto || '').length <= 80 && String(texto || '').split(/\s+/).length <= 8;
}

function deveReiniciarAtendimentoHumano(texto, textoOriginal, conversa = {}) {
    if (!textoCurto(textoOriginal)) return false;
    if (conversa.origem === 'manual') {
        return ['menu', 'inicio', 'iniciar'].includes(texto);
    }

    return (
        ['1', '2', '3', '4'].includes(texto) ||
        ['oi', 'ola', 'olá', 'menu', 'inicio', 'iniciar', 'bom dia', 'boa tarde', 'boa noite'].includes(texto) ||
        isPedidoTeste(texto)
    );
}

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
    const destino = obterDestinoMensagem(message);
    console.log('Enviando resposta para:', destino);
    registrarEnvioDoRobo(destino, resposta);

    try {
        const chat = await comTimeout(message.getChat(), 5000, 'Busca do chat para resposta');
        if (imagem) {
            await enviarImagem(message, imagem);
        }

        const enviada = await comTimeout(
            chat.sendMessage(resposta),
            ENVIO_TIMEOUT_MS,
            'Envio de mensagem'
        );

        console.log('Resposta enviada:', enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
    } catch (err) {
        if (err.isTimeout) {
            console.log('Envio demorou demais. O WhatsApp pode concluir em segundo plano:', err.message);
            return;
        }

        console.log('Falha ao responder pelo chat. Tentando envio direto:', err.message);
        if (imagem) {
            await enviarImagem(message, imagem);
        }

        const enviada = await comTimeout(
            message.client.sendMessage(destino, resposta),
            ENVIO_TIMEOUT_MS,
            'Envio de mensagem reserva'
        );

        console.log('Resposta enviada por reserva:', enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
    }
}

async function responderEncerramentoRapido(message) {
    const perfil = await obterPerfilRobo();
    const destino = obterDestinoMensagem(message);
    apagarConversa(destino);

    const texto = `✅ *ATENDIMENTO ENCERRADO*
--------------------
Obrigado por falar com a *${perfil.nomeEmpresa}*.

Caso queira retornar ao atendimento, digite *menu*.`;

    console.log('Enviando encerramento para:', destino);
    registrarEnvioDoRobo(destino, texto);

    try {
        const chat = await comTimeout(message.getChat(), 5000, 'Busca do chat para encerramento');
        const enviada = await comTimeout(
            chat.sendMessage(texto),
            ENVIO_TIMEOUT_MS,
            'Envio de encerramento'
        );

        console.log('Atendimento encerrado:', enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
    } catch (err) {
        if (err.isTimeout) {
            console.log('Encerramento demorou demais. Atendimento ja foi encerrado internamente:', err.message);
            return;
        }

        console.log('Falha ao encerrar pelo chat. Tentando envio direto:', err.message);
        const enviada = await comTimeout(
            message.client.sendMessage(destino, texto),
            ENVIO_TIMEOUT_MS,
            'Envio de encerramento reserva'
        );

        console.log('Atendimento encerrado por reserva:', enviada?.id?._serialized || 'sem id');
        registrarMensagemDoRobo(enviada);
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
    return message?.fromMe && message?.to ?message.to : message.from;
}

async function obterTelefoneClienteMensagem(message) {
    const destino = obterDestinoMensagem(message);

    if (!destino) return '';
    if (String(destino).endsWith('@c.us')) return destino;
    if (!String(destino).endsWith('@lid')) return '';

    try {
        const telefoneReal = await comTimeout(
            message.client.pupPage.evaluate(async (id) => {
                const resultado = await window.WWebJS.enforceLidAndPnRetrieval(id);
                return resultado?.phone?._serialized || '';
            }, destino),
            7000,
            'Busca do telefone real do contato LID'
        );

        if (telefoneReal && String(telefoneReal).endsWith('@c.us')) {
            return telefoneReal;
        }
    } catch (err) {
        console.log('Nao foi possivel obter telefone real do contato LID:', err.message);
    }

    console.log('Telefone real do contato LID nao encontrado:', destino);
    return '';
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

async function enviarMenuPrincipal(message, imagem = null, perfil = null) {
    const perfilRobo = perfil || await obterPerfilRobo();
    const nome = primeiroNome(await obterNomeContato(message));
    await responderComDigitacao(message, menuPrincipal(nome, perfilRobo.nomeEmpresa), imagem || perfilRobo.imagens.menu);
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
--------------------
1 - Abra a loja de aplicativos da sua TV
2 - Procure por *IPTV Smarters Pro*
3 - Instale o aplicativo
4 - Abra o app e envie uma foto da tela inicial

Com a foto, enviamos os dados corretos para ativação.`,
        '2': `📦 *TV BOX*
--------------------
1 - Abra a Play Store
2 - Procure por *IPTV Smarters Pro*
3 - Instale e abra o aplicativo
4 - Envie uma foto da tela inicial

Assim conseguimos orientar a configuração sem erro.`,
        '3': `📱 *ANDROID*
--------------------
1 - Abra a Play Store
2 - Instale *IPTV Smarters Pro*
3 - Aceite as permissões solicitadas
4 - Envie uma foto da tela inicial do app`,
        '4': `🍎 *IPHONE*
--------------------
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
        '12': 'Thomson',
        '13': 'TV Smart Android'
    };

    return marcas[opcao] || null;
}

function menuMarcasSmartTV() {
    return `📺 *MARCA DA SMART TV*
--------------------
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
*13* - TV Smart Android

Se não for nenhuma acima, digite o nome da marca da sua TV.`;
}

function mensagemTesteLiberado(cliente) {
    return `🎁 *TESTE GRÁTIS LIBERADO*
--------------------
Seu acesso de teste foi preparado com sucesso.

👤 *Nome:* ${cliente.nome}
📲 *Dispositivo:* ${cliente.aparelho}
🔐 *Usuário:* ${cliente.usuario}
🔑 *Senha:* ${cliente.senha}
📅 *Válido até:* ${formatarData(cliente.vencimento)}

Abra o aplicativo no dispositivo informado e use os dados acima.

Para encerrar o atendimento, digite *sair*.`;
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

Aguarde o atendente informar os procedimentos corretos para configurar seu teste grátis no aplicativo.

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

    if (message?.fromMe && foiTextoEnviadoPeloRobo(texto)) {
        console.log('Teste gratis liberado ignorado: mensagem enviada pelo proprio robo.');
        return false;
    }

    const telefone = await obterTelefoneClienteMensagem(message);

    if (!telefone) {
        console.log('Teste grátis liberado não cadastrado: telefone do cliente não identificado.');
        return false;
    }

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
    agendarEncerramentoTeste(message.client, telefone);
    return true;
}

function mensagemEscolhaAparelhoTeste(nome) {
    return `🎁 *TESTE GRÁTIS*
--------------------
Perfeito, *${primeiroNome(nome)}*!

Agora escolha o dispositivo que você vai usar:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador

Digite apenas o número do dispositivo.`;
}

function mensagemBoasVindas(nome, nomeEmpresa = 'JULIAN PLAY') {
    const saudacao = menuPrincipal.getSaudacao ?menuPrincipal.getSaudacao() : 'Olá';

    return `*BEM-VINDO À ${String(nomeEmpresa).toUpperCase()}*
--------------------
${saudacao}, *${primeiroNome(nome)}*!

Sou o assistente virtual da *${nomeEmpresa}* e vou iniciar seu atendimento.

Você já é cliente ou deseja realizar um teste grátis?

*1* - Já sou cliente
*2* - Quero teste grátis
*3* - Ainda não sou cliente

Digite *sair* para encerrar o atendimento.`;
}

function mensagemClienteOpcoes(nome, nomeEmpresa = 'JULIAN PLAY') {
    return `*CLIENTE ${String(nomeEmpresa).toUpperCase()}*
--------------------
Perfeito, *${primeiroNome(nome)}*!

Como posso te ajudar?

*1* - Renovar assinatura
*2* - Falar com um atendente
*3* - Quero teste grátis
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

async function iniciarTesteGratis(message, telefone, perfil = null) {
    const imagens = perfil?.imagens || imagensRespostas;
    const nomeContato = await obterNomeContato(message);
    const nome = nomeContato || 'Cliente';

    definirConversa(telefone, {
        etapa: 'teste_aparelho',
        nome
    });

    await responderComDigitacao(message, mensagemEscolhaAparelhoTeste(nome), imagens.teste);
}

async function iniciarBoasVindas(message, telefone, perfil = null) {
    const perfilRobo = perfil || await obterPerfilRobo();
    const imagens = perfilRobo.imagens;
    const nomeContato = await obterNomeContato(message);
    const nome = nomeContato || 'Cliente';

    definirConversa(telefone, {
        etapa: 'boas_vindas_opcao',
        nome
    });

    await responderComDigitacao(message, mensagemBoasVindas(nome, perfilRobo.nomeEmpresa), imagens.menu);
}

async function responderMensagem(message) {
    const perfil = await obterPerfilRobo();
    const imagens = perfil.imagens;
    const planos = perfil.planos;
    let telefone = obterDestinoMensagem(message);
    const textoOriginal = message.body || '';
    const texto = normalizar(textoOriginal);
    let conversa = conversas.get(telefone);

    if (!conversa && String(telefone || '').endsWith('@lid')) {
        const telefoneReal = await obterTelefoneClienteMensagem(message);
        const conversaTelefoneReal = telefoneReal ?conversas.get(telefoneReal) : null;

        if (conversaTelefoneReal) {
            telefone = telefoneReal;
            conversa = conversaTelefoneReal;
        }
    }

    if (texto === '0' || texto === 'voltar') {
        apagarConversa(telefone);
        await enviarMenuPrincipal(message, imagens.menu, perfil);
        return;
    }

    if (texto === 'sair' || texto === 'encerrar') {
        apagarConversa(telefone);
        await responderComDigitacao(message, `✅ *ATENDIMENTO ENCERRADO*
--------------------
Obrigado por falar com a *${perfil.nomeEmpresa}*.

Caso queira retornar ao atendimento, digite *menu*.`, imagens.encerramento);
        return;
    }

    if (texto === 'menu') {
        apagarConversa(telefone);
        await enviarMenuPrincipal(message, imagens.menu, perfil);
        return;
    }

    if (isMensagemConfirmacao(texto)) {
        console.log('Mensagem de confirmacao ignorada:', telefone);
        return;
    }

    if (conversa?.etapa === 'atendimento_humano') {
        if (atendimentoHumanoExpirou(conversa) || deveReiniciarAtendimentoHumano(texto, textoOriginal, conversa)) {
            apagarConversa(telefone);
            conversa = null;
        } else {
            console.log(`Mensagem ignorada: atendimento humano em andamento para: ${telefone} origem=${conversa.origem || 'indefinida'}`);
            return;
        }
    }

    if (conversa?.etapa === 'boas_vindas_opcao') {
        if (texto === '1') {
            definirConversa(telefone, {
                etapa: 'cliente_opcoes',
                nome: conversa.nome
            });

            await responderComDigitacao(message, mensagemClienteOpcoes(conversa.nome, perfil.nomeEmpresa), imagens.menu);
            return;
        }

        if (texto === '2' || (textoCurto(textoOriginal) && isPedidoTeste(texto))) {
            await iniciarTesteGratis(message, telefone, perfil);
            return;
        }

        if (texto === '3') {
            apagarConversa(telefone);
            await enviarMenuPrincipal(message, imagens.menu, perfil);
            return;
        }

        await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
--------------------
Escolha uma das opções:

*1* - Já sou cliente
*2* - Quero teste grátis
*3* - Ainda não sou cliente`, imagens.erro);
        return;
    }

    if (conversa?.etapa === 'cliente_opcoes') {
        if (texto === '1') {
            definirConversa(telefone, { etapa: 'renovacao_nome' });

            await responderComDigitacao(message, `🔄 *RENOVAÇÃO*
--------------------
Vamos iniciar sua renovação.

Envie o *usuário do painel* para o atendente localizar o cadastro.`, imagens.renovacao);
            return;
        }

        if (texto === '2') {
            pausarParaAtendente(telefone, conversa.nome);
            await responderComDigitacao(message, mensagemTransferirAtendente(conversa.nome), imagens.ativacao);
            return;
        }

        if (texto === '3' || (textoCurto(textoOriginal) && isPedidoTeste(texto))) {
            await iniciarTesteGratis(message, telefone, perfil);
            return;
        }

        if (texto === '0' || texto === 'voltar') {
            apagarConversa(telefone);
            await enviarMenuPrincipal(message, imagens.menu, perfil);
            return;
        }

        await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
--------------------
Escolha uma das opções:

*1* - Renovar assinatura
*2* - Falar com um atendente
*3* - Quero teste grátis
*0* - Abrir menu principal`, imagens.erro);
        return;
    }

    if (conversa?.etapa === 'planos_escolha') {
        const plano = await buscarPlano(texto);

        if (!plano) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
--------------------
Escolha um dos planos abaixo:

${menuPlanos(planos, perfil.nomeEmpresa)}`, imagens.planos);
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

Agora vou te enviar o PIX do plano escolhido.`, imagens.planos);
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
--------------------
Agora escolha o dispositivo que você vai usar:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador

Digite apenas o número do dispositivo.`, imagens.teste);
        return;
    }

    if (conversa?.etapa === 'teste_aparelho') {
        const aparelho = aparelhoTeste(texto);

        if (!aparelho) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
--------------------
Escolha um dispositivo da lista:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador`, imagens.teste);
            return;
        }

        if (aparelho === 'Smart TV') {
            definirConversa(telefone, {
                etapa: 'teste_marca_smarttv',
                nome: conversa.nome
            });

            await responderComDigitacao(message, menuMarcasSmartTV(), imagens.teste);
            return;
        }

        const telefoneCliente = await obterTelefoneClienteMensagem(message);

        if (!telefoneCliente) {
            console.log('Teste grátis parcial não cadastrado: telefone do cliente não identificado.');
            return;
        }

        await cadastrarClienteTesteParcial({
            telefone: telefoneCliente,
            nome: conversa.nome,
            aparelho
        });

        pausarParaAtendente(telefone, conversa.nome);
        await responderComDigitacao(
            message,
            mensagemTransferenciaTesteSmartTV(conversa.nome, aparelho),
            imagens.testeLiberado
        );
        return;
    }

    if (conversa?.etapa === 'teste_marca_smarttv') {
        const marca = marcaSmartTV(texto) || textoOriginal.trim();
        const aparelho = marca;
        const telefoneCliente = await obterTelefoneClienteMensagem(message);

        if (!telefoneCliente) {
            console.log('Teste grátis parcial não cadastrado: telefone do cliente não identificado.');
            return;
        }

        await cadastrarClienteTesteParcial({
            telefone: telefoneCliente,
            nome: conversa.nome,
            aparelho
        });

        pausarParaAtendente(telefone, conversa.nome);
        await responderComDigitacao(
            message,
            mensagemTransferenciaTesteSmartTV(conversa.nome, aparelho),
            imagens.testeLiberado
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
--------------------
*Usuário:* ${usuarioPainel}
*Painel:* ${painel}

${menuRenovacao(planos)}

Digite apenas o número do plano que deseja renovar.`, imagens.renovacao);
        return;
    }

    if (conversa?.etapa === 'renovacao_plano') {
        const plano = await buscarPlano(texto);

        if (!plano) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
--------------------
Escolha um dos planos para renovar:

${menuRenovacao(planos)}`, imagens.renovacao);
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
--------------------
Não encontrei esse cadastro automaticamente.

Para conferirmos manualmente, envie:

👤 Nome completo
📱 Número cadastrado`, imagens.erro);
            return;
        }

        await responderComDigitacao(message, `✅ *CADASTRO LOCALIZADO*
--------------------
👤 *Nome:* ${cliente.nome}
📦 *Plano atual:* ${cliente.plano || 'a confirmar'}
📅 *Vencimento:* ${formatarData(cliente.vencimento)}

${menuRenovacao(planos)}

Depois do pagamento, envie o comprovante aqui.`, imagens.renovacao);
        return;
    }

    if (conversa?.etapa === 'ativacao_dispositivo') {
        const tutorial = tutorialDispositivo(texto);

        if (!tutorial) {
            await responderComDigitacao(message, `⚠️ *OPÇÃO INVÁLIDA*
--------------------
Escolha um dispositivo da lista:

*1* - Smart TV
*2* - TV Box
*3* - Android
*4* - iPhone

*0* - Voltar`, imagens.ativacao);
            return;
        }

        apagarConversa(telefone);
        await responderComDigitacao(message, tutorial, imagens.ativacao);
        return;
    }

    if (texto === '1' || (textoCurto(textoOriginal) && texto.includes('plano'))) {
        definirConversa(telefone, { etapa: 'planos_escolha' });
        await responderComDigitacao(message, menuPlanos(planos, perfil.nomeEmpresa), imagens.planos);
        return;
    }

    if (texto === '2' || (textoCurto(textoOriginal) && isPedidoTeste(texto))) {
        await iniciarTesteGratis(message, telefone, perfil);
        return;
    }

    if (textoCurto(textoOriginal) && isPalavraChave(texto)) {
        await iniciarBoasVindas(message, telefone, perfil);
        return;
    }

    if (texto === '3' || (textoCurto(textoOriginal) && (texto.includes('renovar') || texto.includes('renovacao')))) {
        definirConversa(telefone, { etapa: 'renovacao_nome' });

        await responderComDigitacao(message, `🔄 *RENOVAÇÃO*
--------------------
Vamos iniciar sua renovação.

Envie o *usuário do painel* para o atendente localizar o cadastro.`, imagens.renovacao);
        return;
    }

    if (texto === '4' || (textoCurto(textoOriginal) && (texto.includes('ativar') || texto.includes('aplicativo')))) {
        definirConversa(telefone, { etapa: 'ativacao_dispositivo' });

        await responderComDigitacao(message, menuDispositivos(), imagens.ativacao);
        return;
    }
    console.log('Mensagem ignorada: sem palavra-chave para iniciar atendimento:', telefone);
}

module.exports = {
    pausarParaAtendente,
    prepararRenovacaoTesteGratis,
    responderMensagem,
    responderEncerramentoRapido,
    registrarTesteLiberadoPorMensagem,
    normalizar
};






