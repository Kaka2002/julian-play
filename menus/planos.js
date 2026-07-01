function menuPlanos(planos = [], nomeEmpresa = 'Nossa empresa') {
    const linhasPlanos = planos.length
        ? planos.map((plano, index) => {
            const valor = plano.valorConfigurado === false ? 'Valor a consultar' : `R$ ${plano.valor}`;
            return `*${index + 1}* - ${plano.nome}\n${valor}`;
        }).join('\n\n')
        : 'Nenhum plano disponível no momento.';

    return `*PLANOS ${String(nomeEmpresa || '').toUpperCase()}*
--------------------
Escolha o plano ideal para você:

${linhasPlanos}

*0* - Voltar

Para ativar o plano, tenha em mãos:

*Nome completo*
*WhatsApp*
*Data de nascimento*
*Dispositivo que vai usar*

Digite apenas o número do plano desejado.`;
}

module.exports = menuPlanos;
