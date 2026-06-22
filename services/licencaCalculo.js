function dataHojeSaoPaulo() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).reduce((mapa, item) => {
        mapa[item.type] = item.value;
        return mapa;
    }, {});
    return `${partes.year}-${partes.month}-${partes.day}`;
}

function adicionarDias(dataIso, dias) {
    const data = new Date(`${dataIso}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() + Number(dias || 0));
    return data.toISOString().slice(0, 10);
}

function calcularEstadoLicenca(config = {}) {
    const bloqueioAtivo = String(config.licencaBloqueioAtivo || '0') === '1';
    const suspensa = String(config.licencaSuspensa || '0') === '1';
    const vitalicia = String(config.licencaVitalicia || '0') === '1' || config.licencaTipo === 'vitalicia';
    const vencimento = String(config.licencaVencimento || '').slice(0, 10);
    const hoje = dataHojeSaoPaulo();
    const tipo = config.licencaTipo || (vitalicia ? 'vitalicia' : vencimento ? 'assinatura' : 'nao_configurada');
    let diasRestantes = null;
    let status = 'nao_configurada';
    let rotulo = 'Não configurada';
    let permitida = !bloqueioAtivo;

    if (suspensa) {
        status = 'suspensa';
        rotulo = 'Suspensa';
        permitida = false;
    } else if (vitalicia && String(config.licencaCliente || '').trim()) {
        status = 'ativa';
        rotulo = 'Vitalícia';
        permitida = true;
    } else if (vencimento) {
        const hojeData = new Date(`${hoje}T00:00:00Z`);
        const vencimentoData = new Date(`${vencimento}T00:00:00Z`);
        diasRestantes = Math.ceil((vencimentoData - hojeData) / 86400000);

        if (diasRestantes < 0) {
            status = 'vencida';
            rotulo = tipo === 'avaliacao' ? 'Avaliação encerrada' : 'Vencida';
            permitida = !bloqueioAtivo;
        } else if (diasRestantes <= 7) {
            status = 'vencendo';
            rotulo = tipo === 'avaliacao' ? 'Avaliação terminando' : 'Vencendo';
            permitida = true;
        } else {
            status = 'ativa';
            rotulo = tipo === 'avaliacao' ? 'Em avaliação' : 'Ativa';
            permitida = true;
        }
    }

    return {
        cliente: config.licencaCliente || '', telefone: config.licencaTelefone || '',
        ativacao: config.licencaAtivacao || '', vencimento, vitalicia, tipo,
        periodoTesteDias: Number(config.licencaPeriodoTesteDias || 0),
        observacoes: config.licencaObservacoes || '', instalacaoId: config.instalacaoId || '',
        bloqueioAtivo, suspensa, diasRestantes, status, rotulo, permitida
    };
}

module.exports = { dataHojeSaoPaulo, adicionarDias, calcularEstadoLicenca };
