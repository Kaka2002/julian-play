const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizarTexto(texto) {
    return (texto || '')
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getSaudacao() {
    const hora = new Date().getHours() - 3;

    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
}

function isPalavraChave(texto) {
    const textoNormalizado = normalizarTexto(texto);

    return /\b(oi|ola|dia|tarde|noite|gratis|teste)\b/.test(textoNormalizado);
}

function isPedidoTeste(texto) {
    const textoNormalizado = normalizarTexto(texto);

    return /\b(gratis|teste)\b/.test(textoNormalizado);
}

function isMensagemConfirmacao(texto) {
    const textoNormalizado = normalizarTexto(texto);

    return /^(ok|okay|blz|beleza|certo|certinho|sim|ta|tá|obrigado|obrigada|vlw|valeu|show|legal|perfeito)$/i.test(textoNormalizado);
}

module.exports = {
    delay,
    getSaudacao,
    isMensagemConfirmacao,
    isPalavraChave,
    isPedidoTeste,
    normalizarTexto
};
