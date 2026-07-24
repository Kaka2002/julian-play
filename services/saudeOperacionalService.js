const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..'));

function numero(valor, padrao, minimo = 0) {
    const resultado = Number(valor);
    return Number.isFinite(resultado) ? Math.max(minimo, resultado) : padrao;
}

function medirRecursosOperacionais() {
    let discoLivreGb = null;
    let discoTotalGb = null;

    try {
        const disco = fs.statfsSync(DATA_DIR);
        discoLivreGb = Math.round((Number(disco.bavail) * Number(disco.bsize) / 1024 ** 3) * 100) / 100;
        discoTotalGb = Math.round((Number(disco.blocks) * Number(disco.bsize) / 1024 ** 3) * 100) / 100;
    } catch (_) {
        // A ausencia da metrica nao deve interromper o robo.
    }

    return {
        discoLivreGb,
        discoTotalGb,
        memoriaLivreMb: Math.round(os.freemem() / 1024 / 1024),
        memoriaTotalMb: Math.round(os.totalmem() / 1024 / 1024),
        medidoEm: new Date().toISOString()
    };
}

function avaliarSaudeOperacional(config = {}, recursos = medirRecursosOperacionais()) {
    const limites = {
        discoAtencaoGb: numero(config.alertaDiscoAtencaoGb, 8, 1),
        discoCriticoGb: numero(config.alertaDiscoCriticoGb, 5, 1),
        memoriaAtencaoMb: numero(config.alertaMemoriaAtencaoMb, 1024, 128),
        memoriaCriticaMb: numero(config.alertaMemoriaCriticaMb, 512, 128)
    };
    const alertas = [];

    if (recursos.discoLivreGb !== null) {
        if (recursos.discoLivreGb < limites.discoCriticoGb) {
            alertas.push({ codigo: 'disco_critico', nivel: 'critico', mensagem: `Disco em nivel critico: ${recursos.discoLivreGb} GB livres.` });
        } else if (recursos.discoLivreGb < limites.discoAtencaoGb) {
            alertas.push({ codigo: 'disco_atencao', nivel: 'atencao', mensagem: `Pouco espaco em disco: ${recursos.discoLivreGb} GB livres.` });
        }
    }

    if (recursos.memoriaLivreMb < limites.memoriaCriticaMb) {
        alertas.push({ codigo: 'memoria_critica', nivel: 'critico', mensagem: `Memoria em nivel critico: ${recursos.memoriaLivreMb} MB livres.` });
    } else if (recursos.memoriaLivreMb < limites.memoriaAtencaoMb) {
        alertas.push({ codigo: 'memoria_atencao', nivel: 'atencao', mensagem: `Pouca memoria disponivel: ${recursos.memoriaLivreMb} MB livres.` });
    }

    const nivel = alertas.some(item => item.nivel === 'critico')
        ? 'critico'
        : alertas.length ? 'atencao' : 'normal';

    return { nivel, alertas, recursos, limites };
}

module.exports = {
    medirRecursosOperacionais,
    avaliarSaudeOperacional
};
