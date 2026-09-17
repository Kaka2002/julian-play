/**
 * Aplica uma correção de compatibilidade para a resolução de conversas do
 * whatsapp-web.js. O WhatsApp Web pode fazer o helper FindOrCreateChat falhar
 * com identificadores atuais, embora a conversa já esteja disponível em
 * Store.Chat. O envio padrão da biblioteca passa por esse helper e, por isso,
 * qualquer tipo de mensagem acaba falhando antes de ser enviado.
 */
const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

async function instalarCompatibilidadeGetChat(client, opcoes = {}) {
    if (typeof client?.pupPage?.evaluate !== 'function') {
        return { ok: false, motivo: 'pupPage indisponivel' };
    }

    const intervaloMs = Math.max(50, Number(opcoes.intervaloMs || 1000));
    const tempoMaximoMs = Math.max(intervaloMs, Number(opcoes.tempoMaximoMs || 30000));
    const inicio = Date.now();
    let ultimoResultado = { ok: false, motivo: 'Store do WhatsApp ainda indisponivel' };

    // A página do WhatsApp pode estar autenticada e responder CONNECTED antes
    // de terminar de expor WWebJS/Store. Aguarde por uma janela limitada para
    // não marcar a compatibilidade como aplicada cedo demais nem bloquear o
    // encerramento da sessão indefinidamente.
    while (Date.now() - inicio <= tempoMaximoMs) {
        try {
            ultimoResultado = await client.pupPage.evaluate(() => {
        // Se a injeção oficial não terminou, a própria página ainda pode
        // fornecer os módulos necessários pelo require exposto pelo WhatsApp.
        // Reconstitua somente Chat e WidFactory, sem substituir a Store inteira.
        if ((!window.Store?.Chat || !window.Store?.WidFactory || !window.Store?.AppState || !window.Store?.FindOrCreateChat) && typeof window.require === 'function') {
            try {
                const colecoes = window.require('WAWebCollections');
                const fabricaWid = window.require('WAWebWidFactory');
                const socketModelo = window.require('WAWebSocketModel');
                const criadorChat = window.require('WAWebFindChatAction');
                window.Store = window.Store || {};
                if (!window.Store.Chat && colecoes?.Chat) window.Store.Chat = colecoes.Chat;
                if (!window.Store.WidFactory && fabricaWid) window.Store.WidFactory = fabricaWid;
                if (!window.Store.AppState && socketModelo?.Socket) window.Store.AppState = socketModelo.Socket;
                if (!window.Store.FindOrCreateChat && criadorChat) window.Store.FindOrCreateChat = criadorChat;
            } catch (_) {
                // O bundle pode ainda estar carregando; a próxima tentativa
                // repete a descoberta dentro da mesma janela.
            }
        }

        const ausentes = [];
        if (!window.Store?.Chat) ausentes.push('Store.Chat');
        if (!window.Store?.WidFactory) ausentes.push('Store.WidFactory');
        if (ausentes.length) {
            return { ok: false, motivo: 'Store do WhatsApp ainda indisponivel', ausentes };
        }

        // A versão atual do WhatsApp Web pode deixar o módulo oficial fora da
        // Store exposta. O whatsapp-web.js chama este helper em getNumberId e
        // FindOrCreateChat; sem ele a sessão fica CONNECTED, mas nenhum
        // destinatário é resolvido. Tente os nomes usados pelas cargas nova e
        // legada antes de instalar um fallback local para chats já carregados.
        if (typeof window.Store.QueryExist !== 'function' && typeof window.require === 'function') {
            try {
                const modulo = window.require('WAWebQueryExistsJob') || {};
                const queryExist = modulo.queryWidExists || modulo.queryExists ||
                    modulo.default?.queryWidExists || modulo.default?.queryExists;
                if (typeof queryExist === 'function') window.Store.QueryExist = queryExist;
            } catch (_) {
                try {
                    const moduloLegado = window.require('queryExists') || {};
                    const queryExistLegado = moduloLegado.queryExists || moduloLegado.queryWidExists;
                    if (typeof queryExistLegado === 'function') window.Store.QueryExist = queryExistLegado;
                } catch (_) {
                    // O módulo pode não estar disponível nesta carga; use o
                    // fallback abaixo para conversas presentes na Store.
                }
            }
        }

        if (typeof window.Store.QueryExist !== 'function') {
            window.Store.QueryExist = async wid => {
                const serializado = wid?._serialized || String(wid || '');
                let chat = null;
                try { chat = window.Store.Chat.get(wid) || null; } catch (_) { chat = null; }
                if (!chat && typeof window.Store.Chat.find === 'function') {
                    try { chat = await window.Store.Chat.find(wid); } catch (_) { chat = null; }
                }
                if (!chat && typeof window.Store.Chat.getModelsArray === 'function') {
                    try {
                        chat = window.Store.Chat.getModelsArray().find(item => item?.id?._serialized === serializado) || null;
                    } catch (_) { chat = null; }
                }
                return chat ? { wid: chat.id || wid, biz: false } : null;
            };
        }

        // Em algumas cargas a Store fica pronta antes do namespace WWebJS.
        // Criar o objeto aqui permite instalar somente o helper necessário
        // para o envio, sem substituir os demais utilitários da biblioteca.
        window.WWebJS = window.WWebJS || {};
        if (window.WWebJS.__julianGetChatCompatVersion === 2 && typeof window.Store.QueryExist === 'function') {
            return { ok: true, reutilizada: true, queryExist: true };
        }

        const getChatModel = window.WWebJS.getChatModel;
        const isChannel = chatId => /@\w*newsletter\b/.test(String(chatId || ''));

        window.WWebJS.getChat = async (chatId, { getAsModel = true } = {}) => {
            if (!chatId) return null;

            let chatWid;
            try {
                chatWid = window.Store.WidFactory.createWid(chatId);
            } catch (_) {
                return null;
            }

            let chat = null;
            try {
                chat = window.Store.Chat.get(chatWid) || null;
            } catch (_) {
                chat = null;
            }

            // Store.Chat.find usa a API atual da coleção e não passa pelo
            // FindOrCreateChat, que é o ponto que está lançando o erro.
            if (!chat && typeof window.Store.Chat.find === 'function') {
                try {
                    chat = await window.Store.Chat.find(chatWid);
                } catch (_) {
                    chat = null;
                }
            }

            // Algumas versões carregam a conversa na coleção, mas deixam o
            // índice de `find` inconsistente. A busca linear ainda encontra o
            // modelo pelo identificador serializado sem chamar o helper que
            // está quebrado.
            if (!chat && typeof window.Store.Chat.getModelsArray === 'function') {
                try {
                    const serializado = chatWid?._serialized || String(chatId);
                    chat = window.Store.Chat.getModelsArray().find(item =>
                        item?.id?._serialized === serializado
                    ) || null;
                } catch (_) {
                    chat = null;
                }
            }

            // Depois de QueryExist ser restaurado, o criador oficial volta a
            // ser o caminho correto para uma conversa que ainda não está na
            // coleção local. Ele carrega/cria o chat real e permite que
            // client.getChatById e chat.sendMessage retornem uma mensagem com
            // ID confirmado.
            if (!chat && typeof window.Store.FindOrCreateChat?.findOrCreateLatestChat === 'function') {
                try {
                    chat = (await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid))?.chat || null;
                } catch (_) {
                    chat = null;
                }
            }

            if (!chat || !getAsModel) return chat;

            if (typeof getChatModel !== 'function') return chat;

            try {
                return await getChatModel(chat, { isChannel: isChannel(chatId) });
            } catch (_) {
                return chat;
            }
        };

        window.WWebJS.__julianGetChatCompatVersion = 2;
        return { ok: true, reutilizada: false, queryExist: typeof window.Store.QueryExist === 'function' };
            });

            if (ultimoResultado?.ok || ultimoResultado?.motivo !== 'Store do WhatsApp ainda indisponivel') {
                return ultimoResultado;
            }
        } catch (err) {
            // Navegações do WhatsApp podem destruir o contexto de execução por
            // alguns instantes. Tente novamente dentro da mesma janela.
            ultimoResultado = { ok: false, motivo: err.message };
        }

        if (Date.now() - inicio >= tempoMaximoMs) break;
        await esperar(intervaloMs);
    }

    return ultimoResultado;
}

module.exports = { instalarCompatibilidadeGetChat };
