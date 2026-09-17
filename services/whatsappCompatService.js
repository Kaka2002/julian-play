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
        if (!window.WWebJS || !window.Store?.Chat || !window.Store?.WidFactory) {
            return { ok: false, motivo: 'Store do WhatsApp ainda indisponivel' };
        }

        if (window.WWebJS.__julianGetChatCompatVersion === 1) {
            return { ok: true, reutilizada: true };
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

            // Mantém compatibilidade com versões antigas em que Chat.find não
            // existe. Não usa esse caminho quando a API nova existe, pois ele
            // é justamente a origem do erro observado no WhatsApp atual.
            if (!chat && typeof window.Store.Chat.find !== 'function' && typeof window.Store.FindOrCreateChat?.findOrCreateLatestChat === 'function') {
                try {
                    chat = (await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid))?.chat || null;
                } catch (_) {
                    chat = null;
                }
            }

            if (!chat || !getAsModel) return chat;

            try {
                return await getChatModel(chat, { isChannel: isChannel(chatId) });
            } catch (_) {
                return chat;
            }
        };

        window.WWebJS.__julianGetChatCompatVersion = 1;
        return { ok: true, reutilizada: false };
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
