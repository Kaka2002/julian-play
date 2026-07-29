function analisarListaPm2(saida) {
    const texto = String(saida || '').replace(/\u001b\[[0-9;]*m/g, '');
    const fim = texto.lastIndexOf(']');
    if (fim < 0) {
        throw new Error('O PM2 não retornou uma lista de processos válida.');
    }

    let processos = null;
    let inicio = texto.indexOf('[');
    while (inicio >= 0 && inicio < fim) {
        try {
            processos = JSON.parse(texto.slice(inicio, fim + 1));
            break;
        } catch (_) {
            inicio = texto.indexOf('[', inicio + 1);
        }
    }
    if (!Array.isArray(processos)) {
        throw new Error('A resposta do PM2 não contém uma lista de processos.');
    }

    return new Map(processos.map(processo => [
        String(processo?.name || ''),
        String(processo?.pm2_env?.status || '').toLowerCase()
    ]).filter(([nome]) => nome));
}

function separarInstalacoesPorEstadoPm2(instalacoes, estadosPm2) {
    const online = [];
    const ignoradas = [];

    for (const instalacao of instalacoes || []) {
        const nome = String(instalacao?.processoPm2 || '');
        const estado = estadosPm2.get(nome) || 'ausente';
        if (estado === 'online') online.push(instalacao);
        else ignoradas.push({ instalacao, estado });
    }

    return { online, ignoradas };
}

module.exports = {
    analisarListaPm2,
    separarInstalacoesPorEstadoPm2
};
