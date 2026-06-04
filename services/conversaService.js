const fs = require('fs');
const path = require('path');
const menuPrincipal = require('../menus/principal');
const menuPlanos = require('../menus/planos');
const menuDispositivos = require('../menus/dispositivos');
const menuRenovacao = require('../menus/renovacao');
const { isMensagemConfirmacao, isPalavraChave, isPedidoTeste } = require('../utils/helpers');
const { enviarImagemComLegenda } = require('./assetService');
const { agendarEncerramentoTeste } = require('./encerramentoTesteService');
const { buscarPlano, enviarQRCodePIX } = require('./pixService');
const {
    buscarClientePorNomeOuTelefone,
    buscarClientePorUsuarioIPTV,
    cadastrarClienteTesteParcial,
    cadastrarTesteLiberadoPorAtendente
} = require('./clientes');
const { registrarMensagemDoRobo, registrarEnvioDoRobo } = require('./mensagensPropriasService');

const conversas = new Map();
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));
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
        ['oi', 'ola', 'olÃ¡', 'menu', 'inicio', 'iniciar', 'bom dia', 'boa tarde', 'boa noite'].includes(texto) ||
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

    const enviouComImagem = await enviarImagemComLegenda(message, imagem, resposta);

    if (enviouComImagem) return;

    const destino = obterDestinoMensagem(message);
    console.log('Enviando resposta para:', destino);
    registrarEnvioDoRobo(destino, resposta);

    try {
        const chat = await comTimeout(message.getChat(), 5000, 'Busca do chat para resposta');
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
    const destino = obterDestinoMensagem(message);
    apagarConversa(destino);

    const texto = `âœ… *ATENDIMENTO ENCERRADO*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Obrigado por falar com a *JULIAN PLAY*.

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
    return message?.fromMe && message?.to ? message.to : message.from;
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
    if (!valor) return 'nÃ£o informado';

    try {
        const lista = JSON.parse(valor);
        if (Array.isArray(lista) && lista.length) return lista[0];
    } catch (err) {
        return String(valor).split(',').map(item => item.trim()).filter(Boolean)[0] || 'nÃ£o informado';
    }

    return 'nÃ£o informado';
}

function tutorialDispositivo(opcao) {
    const tutoriais = {
        '1': `ðŸ“º *SMART TV*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
1 - Abra a loja de aplicativos da sua TV
2 - Procure por *IPTV Smarters Pro*
3 - Instale o aplicativo
4 - Abra o app e envie uma foto da tela inicial

Com a foto, enviamos os dados corretos para ativaÃ§Ã£o.`,
        '2': `ðŸ“¦ *TV BOX*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
1 - Abra a Play Store
2 - Procure por *IPTV Smarters Pro*
3 - Instale e abra o aplicativo
4 - Envie uma foto da tela inicial

Assim conseguimos orientar a configuraÃ§Ã£o sem erro.`,
        '3': `ðŸ“± *ANDROID*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
1 - Abra a Play Store
2 - Instale *IPTV Smarters Pro*
3 - Aceite as permissÃµes solicitadas
4 - Envie uma foto da tela inicial do app`,
        '4': `ðŸŽ *IPHONE*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
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
    return `ðŸ“º *MARCA DA SMART TV*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
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

Se nÃ£o for nenhuma acima, digite o nome da marca da sua TV.`;
}

function mensagemTesteLiberado(cliente) {
    return `ðŸŽ *TESTE GRÃTIS LIBERADO*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Seu acesso de teste foi preparado com sucesso.

ðŸ‘¤ *Nome:* ${cliente.nome}
ðŸ“² *Dispositivo:* ${cliente.aparelho}
ðŸ” *UsuÃ¡rio:* ${cliente.usuario}
ðŸ”‘ *Senha:* ${cliente.senha}
ðŸ“… *VÃ¡lido atÃ©:* ${formatarData(cliente.vencimento)}

Abra o aplicativo no dispositivo informado e use os dados acima.

Se aparecer alguma dÃºvida na tela, envie uma foto aqui.`;
}

function mensagemTransferenciaTesteSmartTV(nome, aparelho) {
    return `*ATENDIMENTO TRANSFERIDO*
--------------------
Recebemos as informaÃ§Ãµes para liberar seu teste grÃ¡tis.

Seu atendimento serÃ¡ transferido para um atendente.
Aguarde alguns minutos, por favor.

*Dados informados:*
*Nome:* ${nome}
*Dispositivo:* ${aparelho}

O atendente vai preparar seu teste e enviar os dados de acesso assim que estiver pronto.

Aguarde o atendente informar os procedimentos corretos para configurar seu teste grÃ¡tis no aplicativo.

Se aparecer alguma dÃºvida na tela, envie uma foto aqui.`;
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

    const telefone = await obterTelefoneClienteMensagem(message);

    if (!telefone) {
        console.log('Teste grÃ¡tis liberado nÃ£o cadastrado: telefone do cliente nÃ£o identificado.');
        return false;
    }

    const dados = {
        telefone,
        nome: extrairCampoTeste(texto, ['Nome']),
        aparelho: extrairCampoTeste(texto, ['Aparelho', 'Dispositivo']),
        aplicativo: extrairCampoTeste(texto, ['Aplicativo']),
        painel: extrairCampoTeste(texto, ['Painel']),
        usuario: extrairCampoTeste(texto, ['UsuÃ¡rio', 'Usuario']),
        senha: extrairCampoTeste(texto, ['Senha']),
        dataInicio: extrairCampoTeste(texto, ['Data/InÃ­cio', 'Data Inicio', 'InÃ­cio', 'Inicio']),
        validade: extrairCampoTeste(texto, ['VÃ¡lido atÃ©', 'Valido ate', 'Validade'])
    };

    const cliente = await cadastrarTesteLiberadoPorAtendente(dados);

    if (!cliente) {
        console.log('Teste grÃ¡tis liberado nÃ£o cadastrado: dados incompletos.');
        return false;
    }

    console.log('Teste grÃ¡tis cadastrado pelo atendimento:', cliente.nome, cliente.telefone);
    agendarEncerramentoTeste(message.client, telefone);
    return true;
}

function mensagemEscolhaAparelhoTeste(nome) {
    return `ðŸŽ *TESTE GRÃTIS*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Perfeito, *${primeiroNome(nome)}*!

Agora escolha o dispositivo que vocÃª vai usar:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador

Digite apenas o nÃºmero do dispositivo.`;
}

function mensagemBoasVindas(nome) {
    const saudacao = menuPrincipal.getSaudacao ? menuPrincipal.getSaudacao() : 'OlÃ¡';

    return `*BEM-VINDO Ã€ JULIAN PLAY*
--------------------
${saudacao}, *${primeiroNome(nome)}*!

Sou o assistente virtual da *JULIAN PLAY* e vou iniciar seu atendimento.

VocÃª jÃ¡ Ã© cliente ou deseja realizar um teste grÃ¡tis?

*1* - JÃ¡ sou cliente
*2* - Quero teste grÃ¡tis
*3* - Ainda nÃ£o sou cliente

Digite *sair* para encerrar o atendimento.`;
}

function mensagemClienteOpcoes(nome) {
    return `*CLIENTE JULIAN PLAY*
--------------------
Perfeito, *${primeiroNome(nome)}*!

Como posso te ajudar?

*1* - Renovar assinatura
*2* - Falar com um atendente
*3* - Quero teste grÃ¡tis
*0* - Abrir menu principal

Digite *sair* para encerrar o atendimento.`;
}

function mensagemTransferirAtendente(nome) {
    return `*ATENDIMENTO COM ATENDENTE*
--------------------
Tudo certo, *${primeiroNome(nome)}*!

Seu atendimento serÃ¡ transferido para um atendente.
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
    let conversa = conversas.get(telefone);

    if (texto === '0' || texto === 'voltar') {
        apagarConversa(telefone);
        await enviarMenuPrincipal(message);
        return;
    }

    if (texto === 'sair' || texto === 'encerrar') {
        apagarConversa(telefone);
        await responderComDigitacao(message, `âœ… *ATENDIMENTO ENCERRADO*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Obrigado por falar com a *JULIAN PLAY*.

Caso queira retornar ao atendimento, digite *menu*.`, imagensRespostas.encerramento);
        return;
    }

    if (texto === 'menu') {
        apagarConversa(telefone);
        await enviarMenuPrincipal(message, imagensRespostas.menu);
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
            console.log('Mensagem ignorada: atendimento humano em andamento para:', telefone);
            return;
        }
    }

    if (conversa?.etapa === 'boas_vindas_opcao') {
        if (texto === '1') {
            definirConversa(telefone, {
                etapa: 'cliente_opcoes',
                nome: conversa.nome
            });

            await responderComDigitacao(message, mensagemClienteOpcoes(conversa.nome), imagensRespostas.menu);
            return;
        }

        if (texto === '2' || (textoCurto(textoOriginal) && isPedidoTeste(texto))) {
            await iniciarTesteGratis(message, telefone);
            return;
        }

        if (texto === '3') {
            apagarConversa(telefone);
            await enviarMenuPrincipal(message, imagensRespostas.menu);
            return;
        }

        await responderComDigitacao(message, `âš ï¸ *OPÃ‡ÃƒO INVÃLIDA*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Escolha uma das opÃ§Ãµes:

*1* - JÃ¡ sou cliente
*2* - Quero teste grÃ¡tis
*3* - Ainda nÃ£o sou cliente`, imagensRespostas.erro);
        return;
    }

    if (conversa?.etapa === 'cliente_opcoes') {
        if (texto === '1') {
            definirConversa(telefone, { etapa: 'renovacao_nome' });

            await responderComDigitacao(message, `ðŸ”„ *RENOVAÃ‡ÃƒO*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Vamos iniciar sua renovaÃ§Ã£o.

Envie o *usuÃ¡rio do painel* para o atendente localizar o cadastro.`, imagensRespostas.renovacao);
            return;
        }

        if (texto === '2') {
            pausarParaAtendente(telefone, conversa.nome);
            await responderComDigitacao(message, mensagemTransferirAtendente(conversa.nome), imagensRespostas.ativacao);
            return;
        }

        if (texto === '3' || (textoCurto(textoOriginal) && isPedidoTeste(texto))) {
            await iniciarTesteGratis(message, telefone);
            return;
        }

        if (texto === '0' || texto === 'voltar') {
            apagarConversa(telefone);
            await enviarMenuPrincipal(message, imagensRespostas.menu);
            return;
        }

        await responderComDigitacao(message, `âš ï¸ *OPÃ‡ÃƒO INVÃLIDA*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Escolha uma das opÃ§Ãµes:

*1* - Renovar assinatura
*2* - Falar com um atendente
*3* - Quero teste grÃ¡tis
*0* - Abrir menu principal`, imagensRespostas.erro);
        return;
    }

    if (conversa?.etapa === 'planos_escolha') {
        const plano = buscarPlano(texto);

        if (!plano) {
            await responderComDigitacao(message, `âš ï¸ *OPÃ‡ÃƒO INVÃLIDA*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Escolha um dos planos abaixo:

*1* - Mensal
*2* - Trimestral
*3* - Semestral
*4* - Anual
*0* - Voltar`, imagensRespostas.planos);
            return;
        }

        apagarConversa(telefone);
        await responderComDigitacao(message, `*DADOS NECESSÃRIOS PARA ATIVAÃ‡ÃƒO*
--------------------
Para liberar seu plano apÃ³s o pagamento, envie aqui:

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

        await responderComDigitacao(message, `âœ… Perfeito, *${primeiroNome(textoOriginal)}*!
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Agora escolha o dispositivo que vocÃª vai usar:

*1* - Smart TV
*2* - TV Box
*3* - Celular Android
*4* - iPhone
*5* - Computador

Digite apenas o nÃºmero do dispositivo.`, imagensRespostas.teste);
        return;
    }

    if (conversa?.etapa === 'teste_aparelho') {
        const aparelho = aparelhoTeste(texto);

        if (!aparelho) {
            await responderComDigitacao(message, `âš ï¸ *OPÃ‡ÃƒO INVÃLIDA*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
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

        const telefoneCliente = await obterTelefoneClienteMensagem(message);

        if (!telefoneCliente) {
            console.log('Teste grÃ¡tis parcial nÃ£o cadastrado: telefone do cliente nÃ£o identificado.');
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
            imagensRespostas.testeLiberado
        );
        return;
    }

    if (conversa?.etapa === 'teste_marca_smarttv') {
        const marca = marcaSmartTV(texto) || textoOriginal.trim();
        const aparelho = marca;
        const telefoneCliente = await obterTelefoneClienteMensagem(message);

        if (!telefoneCliente) {
            console.log('Teste grÃ¡tis parcial nÃ£o cadastrado: telefone do cliente nÃ£o identificado.');
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

        await responderComDigitacao(message, `âœ… *DADOS RECEBIDOS*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
*UsuÃ¡rio:* ${usuarioPainel}
*Painel:* ${painel}

${menuRenovacao()}

Digite apenas o nÃºmero do plano que deseja renovar.`, imagensRespostas.renovacao);
        return;
    }

    if (conversa?.etapa === 'renovacao_plano') {
        const plano = buscarPlano(texto);

        if (!plano) {
            await responderComDigitacao(message, `âš ï¸ *OPÃ‡ÃƒO INVÃLIDA*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
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
            await responderComDigitacao(message, `ðŸ”Ž *CADASTRO NÃƒO LOCALIZADO*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
NÃ£o encontrei esse cadastro automaticamente.

Para conferirmos manualmente, envie:

ðŸ‘¤ Nome completo
ðŸ“± NÃºmero cadastrado`, imagensRespostas.erro);
            return;
        }

        await responderComDigitacao(message, `âœ… *CADASTRO LOCALIZADO*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ðŸ‘¤ *Nome:* ${cliente.nome}
ðŸ“¦ *Plano atual:* ${cliente.plano || 'a confirmar'}
ðŸ“… *Vencimento:* ${formatarData(cliente.vencimento)}

${menuRenovacao()}

ðŸ’³ *PIX:* 61319147704

Depois do pagamento, envie o comprovante aqui.`, imagensRespostas.renovacao);
        return;
    }

    if (conversa?.etapa === 'ativacao_dispositivo') {
        const tutorial = tutorialDispositivo(texto);

        if (!tutorial) {
            await responderComDigitacao(message, `âš ï¸ *OPÃ‡ÃƒO INVÃLIDA*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
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

    if (texto === '1' || (textoCurto(textoOriginal) && texto.includes('plano'))) {
        definirConversa(telefone, { etapa: 'planos_escolha' });
        await responderComDigitacao(message, menuPlanos(), imagensRespostas.planos);
        return;
    }

    if (texto === '2' || (textoCurto(textoOriginal) && isPedidoTeste(texto))) {
        await iniciarTesteGratis(message, telefone);
        return;
    }

    if (textoCurto(textoOriginal) && isPalavraChave(texto)) {
        await iniciarBoasVindas(message, telefone);
        return;
    }

    if (texto === '3' || (textoCurto(textoOriginal) && (texto.includes('renovar') || texto.includes('renovacao')))) {
        definirConversa(telefone, { etapa: 'renovacao_nome' });

        await responderComDigitacao(message, `ðŸ”„ *RENOVAÃ‡ÃƒO*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Vamos iniciar sua renovaÃ§Ã£o.

Envie o *usuÃ¡rio do painel* para o atendente localizar o cadastro.`, imagensRespostas.renovacao);
        return;
    }

    if (texto === '4' || (textoCurto(textoOriginal) && (texto.includes('ativar') || texto.includes('aplicativo')))) {
        definirConversa(telefone, { etapa: 'ativacao_dispositivo' });

        await responderComDigitacao(message, menuDispositivos(), imagensRespostas.ativacao);
        return;
    }
    console.log('Mensagem ignorada: sem palavra-chave para iniciar atendimento:', telefone);
}

module.exports = {
    pausarParaAtendente,
    responderMensagem,
    responderEncerramentoRapido,
    registrarTesteLiberadoPorMensagem,
    normalizar
};
