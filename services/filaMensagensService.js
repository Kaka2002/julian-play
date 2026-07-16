const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

let fila = Promise.resolve();
let ultimoEnvioEm = 0;
let pendentes = 0;
let ultimoErro = '';

function numeroInteiro(valor, padrao, minimo, maximo) {
    const numero = Number.parseInt(valor, 10);
    const normalizado = Number.isFinite(numero) ?numero : padrao;

    return Math.max(minimo, Math.min(maximo, normalizado));
}

async function obterPerfilFila(opcoes = {}) {
    if (opcoes.ignorarFila) {
        return { ativa: false, minimoMs: 0, maximoMs: 0 };
    }

    try {
        const { obterConfiguracoes } = require('./configuracoesPainel');
        const config = await obterConfiguracoes();
        const ativa = String(config.roboFilaMensagensAtiva ?? '1') === '1';
        const minimo = numeroInteiro(opcoes.intervaloMinimoSegundos ?? config.roboFilaIntervaloMinimoSegundos, 2, 0, 600);
        const maximo = numeroInteiro(opcoes.intervaloMaximoSegundos ?? config.roboFilaIntervaloMaximoSegundos, 5, minimo, 900);

        return {
            ativa,
            minimoMs: minimo * 1000,
            maximoMs: Math.max(minimo, maximo) * 1000
        };
    } catch (err) {
        return { ativa: true, minimoMs: 2000, maximoMs: 5000 };
    }
}

function tempoAleatorio(minimoMs, maximoMs) {
    if (!minimoMs || maximoMs <= 0) return 0;
    if (maximoMs <= minimoMs) return minimoMs;

    return Math.round(minimoMs + Math.random() * (maximoMs - minimoMs));
}

async function executarComControle(tarefa, descricao, opcoes) {
    const perfil = await obterPerfilFila(opcoes);

    if (perfil.ativa) {
        const agora = Date.now();
        const intervalo = tempoAleatorio(perfil.minimoMs, perfil.maximoMs);
        const faltaIntervalo = Math.max(0, (ultimoEnvioEm + intervalo) - agora);

        if (faltaIntervalo > 0) {
            console.log(`[fila-whatsapp] Aguardando ${Math.ceil(faltaIntervalo / 1000)}s para ${descricao}.`);
            await esperar(faltaIntervalo);
        }
    }

    const resultado = await tarefa();
    ultimoEnvioEm = Date.now();
    ultimoErro = '';
    return resultado;
}

function enfileirarEnvio(tarefa, descricao = 'Envio WhatsApp', opcoes = {}) {
    pendentes += 1;

    const execucao = fila
        .catch(() => null)
        .then(() => executarComControle(tarefa, descricao, opcoes))
        .catch((err) => {
            ultimoErro = err?.message || String(err);
            throw err;
        })
        .finally(() => {
            pendentes = Math.max(0, pendentes - 1);
        });

    fila = execucao.catch(() => null);
    return execucao;
}

function obterStatusFilaMensagens() {
    return {
        pendentes,
        ultimoEnvioEm: ultimoEnvioEm ?new Date(ultimoEnvioEm).toISOString() : '',
        ultimoErro
    };
}

module.exports = {
    enfileirarEnvio,
    obterStatusFilaMensagens
};
