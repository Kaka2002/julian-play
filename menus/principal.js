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

if (texto === '1') {

    await message.reply(
`📋 *PLANOS JULIAN PLAY TV*

💎 Mensal: R$ 35,00
💎 Trimestral: R$ 80,00
💎 Semestral: R$ 150,00
💎 Anual: R$ 275,00

Pix:
11925716232

Envie o comprovante após o pagamento.`
    );

    return;
}

if (texto === '2') {

    await message.reply(
`🎁 *TESTE GRÁTIS*

Informe:

👤 Nome
📱 Marca do aparelho

para liberar seu acesso de teste.`
    );

    return;
}

if (texto === '3') {

    await message.reply(
`🔄 *RENOVAÇÃO*

Envie o número da sua linha ou CPF cadastrado para localizar sua assinatura.`
    );

    return;
}

if (texto === '4') {

    await message.reply(
`📲 *ATIVAÇÃO DE APLICATIVOS*

Escolha:

1 - Smart TV
2 - TV Box
3 - Celular Android
4 - iPhone

e enviaremos o passo a passo.`
    );

    return;
}