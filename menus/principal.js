const { getSaudacao } = require('../utils/helpers');

function menuPrincipal(nome) {

    const saudacao = getSaudacao();

    return `${saudacao} ${nome}! 🍿

*MENU PRINCIPAL*

[1] Solicitar Planos e Preços
[2] Solicitar Teste Grátis
[3] Renovar Assinatura
[4] Ativar Apps
[0] Encerrar Atendimento

Digite a opção desejada.`;
}

module.exports = menuPrincipal;