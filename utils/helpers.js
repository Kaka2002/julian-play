const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function getSaudacao() {

    const hora = new Date().getHours() - 3;

    if (hora >= 5 && hora < 12) return 'Bom dia';

    if (hora >= 12 && hora < 18) return 'Boa tarde';

    return 'Boa noite';
}

function isPalavraChave(texto) {

    if (!texto) return false;

    const palavras = [
        'oi',
        'olá',
        'ola',
        'menu',
        'teste',
        'bom dia',
        'boa tarde',
        'boa noite'
    ];

    return palavras.some(p =>
        texto.toLowerCase().includes(p)
    );
}

module.exports = {
    delay,
    getSaudacao,
    isPalavraChave
};