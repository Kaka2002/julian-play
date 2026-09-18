// Compatibilidade temporaria com whatsapp-web.js 1.34.7 (issue upstream 201922).
// Remove apenas o ID privado da midia do objeto final; preserva o MsgKey real.
function corrigirMidiaNoNavegador() {
    const api = window.WWebJS;
    if (!api || typeof api.sendMessage !== 'function') throw new Error('WhatsApp ainda nao preparou o envio de midia.');
    if (api.sendMessage.julianMediaIdCorrigido) return;
    const fonte = api.sendMessage.toString();
    const alvo = /\.\.\.extraOptions,\s*};/g;
    if ((fonte.match(alvo) || []).length !== 1 || !fonte.includes('...mediaOptions,')) {
        throw new Error('Versao de envio WhatsApp nao reconhecida para compatibilidade de midia.');
    }
    const corrigida = fonte.replace(alvo, '$&\n        delete message.__x_id;');
    const enviar = (0, eval)('(' + corrigida + ')');
    enviar.julianMediaIdCorrigido = true;
    api.sendMessage = enviar;
}

function instalarCompatibilidadeMidia(client) {
    const enviarOriginal = client.sendMessage;
    client.sendMessage = async function (destino, conteudo, opcoes) {
        const midia = conteudo && typeof conteudo === 'object' && typeof conteudo.mimetype === 'string';
        if (midia || opcoes?.media) {
            // Reconfere a cada envio: WhatsApp pode reinjetar WWebJS ao reconectar.
            // A adaptacao ocorre antes do envio; nao repete uma mensagem enviada.
            await this.pupPage.evaluate(corrigirMidiaNoNavegador);
        }
        return enviarOriginal.call(this, destino, conteudo, opcoes);
    };
}

module.exports = { instalarCompatibilidadeMidia, corrigirMidiaNoNavegador };
