const FUSO_SAO_PAULO = 'America/Sao_Paulo';

function partesSaoPaulo(data = new Date()) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: FUSO_SAO_PAULO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(data).reduce((mapa, parte) => {
        mapa[parte.type] = parte.value;
        return mapa;
    }, {});

    return {
        ano: partes.year,
        mes: partes.month,
        dia: partes.day,
        hora: partes.hour === '24' ? '00' : partes.hour,
        minuto: partes.minute,
        segundo: partes.second
    };
}

function agoraSaoPauloInput() {
    const partes = partesSaoPaulo();
    return `${partes.ano}-${partes.mes}-${partes.dia}T${partes.hora}:${partes.minuto}`;
}

function timestampSqliteUtc(texto) {
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(texto);
}

function temFusoExplicito(texto) {
    return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto);
}

function partesDataHora(valor, horaDataPura = '00:00') {
    const texto = String(valor || '').trim();
    if (!texto) return null;

    const dataPura = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dataPura) {
        const [, ano, mes, dia] = dataPura;
        const [hora = '00', minuto = '00'] = String(horaDataPura || '00:00').split(':');
        return { ano, mes, dia, hora: hora.padStart(2, '0'), minuto: minuto.padStart(2, '0'), segundo: '00' };
    }

    if (timestampSqliteUtc(texto)) {
        const data = new Date(`${texto.replace(' ', 'T')}Z`);
        if (Number.isNaN(data.getTime())) return null;
        return partesSaoPaulo(data);
    }

    if (temFusoExplicito(texto)) {
        const data = new Date(texto);
        if (Number.isNaN(data.getTime())) return null;
        return partesSaoPaulo(data);
    }

    const local = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (local) {
        const [, ano, mes, dia, hora, minuto, segundo = '00'] = local;
        return { ano, mes, dia, hora, minuto, segundo };
    }

    const data = new Date(texto);
    if (Number.isNaN(data.getTime())) return null;
    return partesSaoPaulo(data);
}

function formatarDataHoraBrasil(valor, opcoes = {}) {
    const partes = partesDataHora(valor, opcoes.horaDataPura || '00:00');
    if (!partes) return String(valor || '');

    const ano = opcoes.anoCompleto ? partes.ano : partes.ano.slice(-2);
    const separador = opcoes.separador || ' ';
    return `${partes.dia}/${partes.mes}/${ano}${separador}${partes.hora}:${partes.minuto}`;
}

module.exports = {
    FUSO_SAO_PAULO,
    agoraSaoPauloInput,
    partesDataHora,
    formatarDataHoraBrasil
};
