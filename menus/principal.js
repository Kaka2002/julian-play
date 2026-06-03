function getHoraSaoPaulo() {
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false
    }).formatToParts(new Date());

    const hora = partes.find(parte => parte.type === 'hour')?.value || '0';
    return Number(hora);
}

function getSaudacao() {
    const hora = getHoraSaoPaulo();

    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
}

function menuPrincipal(nome = '') {
    const tratamento = nome ? `, ${nome}` : '';

    return `${getSaudacao()}${tratamento}! Seja bem-vindo(a).

📺 *JULIAN PLAY*
━━━━━━━━━━━━━━━━━━━━
Sua melhor experiencia em TV online.

Escolha uma opcao:

*1* - 💎 Planos e valores
*2* - 🎁 Teste gratis
*3* - 🔄 Renovar assinatura
*4* - 📲 Ativar aplicativos
*0* - ↩️ Voltar ao menu

Digite apenas o numero da opcao desejada.`;
}

module.exports = menuPrincipal;
module.exports.getSaudacao = getSaudacao;
