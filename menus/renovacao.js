function menuRenovacao(planos = []) {
    const linhasPlanos = planos.length
        ? planos.map((plano, index) => `*${index + 1}* - ${plano.nome}: R$ ${plano.valor}`).join('\n')
        : 'Nenhum plano disponível no momento.';

    return `🔄 *RENOVAÇÃO DE ASSINATURA*
--------------------
Escolha o plano para renovar:

${linhasPlanos}
*0* - ↩️ Voltar`;
}

module.exports = menuRenovacao;
