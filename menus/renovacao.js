function menuRenovacao(planos = []) {
    const linhasPlanos = planos.length
        ? planos.map((plano, index) => {
            const valor = plano.valorConfigurado === false ? 'Valor a consultar' : `R$ ${plano.valor}`;
            return `*${index + 1}* - ${plano.nome}: ${valor}`;
        }).join('\n')
        : 'Nenhum plano disponível no momento.';

    return `🔄 *RENOVAÇÃO DE ASSINATURA*
--------------------
Escolha o plano para renovar:

${linhasPlanos}
*0* - ↩️ Voltar`;
}

module.exports = menuRenovacao;
