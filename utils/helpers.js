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

    const palavras = [
        'oi',
        'ola',
        'dia',
        'tarde',
        'noite',
        'gratis',
        'teste'
    ];

    return palavras.some(palavra => textoNormalizado.includes(palavra));
}

function isPedidoTeste(texto) {
    const textoNormalizado = normalizarTexto(texto);

    return textoNormalizado.includes('gratis') || textoNormalizado.includes('teste');
}

module.exports = {
    delay,
    getSaudacao,
    isPalavraChave,
    isPedidoTeste,
    normalizarTexto
};
