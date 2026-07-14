const {
    gerarCodigoAssinado,
    lerCodigoAssinado
} = require('./licencaAssinatura');

function gerarCodigoLicencaAssinado(payload = {}) {
    return gerarCodigoAssinado(payload);
}

function lerCodigoLicencaAssinado(codigo) {
    return lerCodigoAssinado(codigo);
}

module.exports = {
    gerarCodigoLicencaAssinado,
    lerCodigoLicencaAssinado
};
