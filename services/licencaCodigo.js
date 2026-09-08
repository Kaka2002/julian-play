const {
    gerarCodigoAssinado,
    gerarCodigoEd25519Obrigatorio,
    lerCodigoAssinado
} = require('./licencaAssinatura');

function gerarCodigoLicencaAssinado(payload = {}) {
    return gerarCodigoAssinado(payload);
}

function gerarCodigoLicencaEd25519Obrigatorio(payload = {}) {
    return gerarCodigoEd25519Obrigatorio(payload);
}

function lerCodigoLicencaAssinado(codigo) {
    return lerCodigoAssinado(codigo);
}

module.exports = {
    gerarCodigoLicencaAssinado,
    gerarCodigoLicencaEd25519Obrigatorio,
    lerCodigoLicencaAssinado
};
