function getSaudacao() {
    const hora = new Date().getHours();

    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
}

function menuPrincipal(nome) {
    return `${getSaudacao()} ${nome}!

📺 *JULIAN PLAY TV*

[1] Solicitar Planos

[2] Teste Grátis

[3] Renovar Assinatura

[4] Ativar Aplicativos

[0] Encerrar Atendimento

Digite a opção desejada`;
}

module.exports = menuPrincipal;