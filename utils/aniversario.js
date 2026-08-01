const MENSAGEM_INVALIDA = 'Data de aniversário inválida. Informe somente dia e mês no formato DD/MM.';

function mesDiaAniversario(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';

    let dia = '';
    let mes = '';
    let partes = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);

    if (partes) {
        [, dia, mes] = partes;
    } else {
        partes = texto.match(/^\d{4}-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
        if (partes) {
            [, mes, dia] = partes;
        } else {
            partes = texto.match(/^(?:--)?(\d{1,2})-(\d{1,2})$/);
            if (partes) [, mes, dia] = partes;
        }
    }

    if (!dia || !mes) return '';

    const numeroDia = Number(dia);
    const numeroMes = Number(mes);
    const diasPorMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    if (!Number.isInteger(numeroMes) || numeroMes < 1 || numeroMes > 12) return '';
    if (!Number.isInteger(numeroDia) || numeroDia < 1 || numeroDia > diasPorMes[numeroMes - 1]) return '';

    return `${String(numeroMes).padStart(2, '0')}-${String(numeroDia).padStart(2, '0')}`;
}

function normalizarAniversario(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';

    const mesDia = mesDiaAniversario(texto);
    if (!mesDia) throw new Error(MENSAGEM_INVALIDA);
    return mesDia;
}

function formatarAniversario(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';

    const mesDia = mesDiaAniversario(texto);
    if (!mesDia) return texto;
    const [mes, dia] = mesDia.split('-');
    return `${dia}/${mes}`;
}

module.exports = {
    MENSAGEM_INVALIDA,
    mesDiaAniversario,
    normalizarAniversario,
    formatarAniversario
};
