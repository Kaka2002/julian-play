function getSaudacao() {
    const hora = new Date().getHours();

    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
}

function menuPrincipal(nome = '') {
    const tratamento = nome ? ` ${nome}` : '';

    return `${getSaudacao()}${tratamento}!

📺 *JULIAN PLAY TV*

1 - Solicitar Planos
2 - Teste Gratis
3 - Renovar Assinatura
4 - Ativar Aplicativos
0 - Encerrar Atendimento

Digite a opcao desejada.`;
}

module.exports = menuPrincipal;
