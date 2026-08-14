const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function texto(valor) {
    return String(valor || '').trim();
}

function caminhoChaveCofre(dataDir) {
    return path.join(dataDir, '.julian-play-cofre.json');
}

function lerChaveCofre(dataDir) {
    try {
        const conteudo = JSON.parse(fs.readFileSync(caminhoChaveCofre(dataDir), 'utf8').replace(/^\uFEFF/, ''));
        return texto(conteudo.chaveCofre);
    } catch (_) {
        return '';
    }
}

function gravarChaveCofre(dataDir, chaveCofre) {
    const arquivo = caminhoChaveCofre(dataDir);
    const temporario = `${arquivo}.${process.pid}.tmp`;
    const conteudo = JSON.stringify({ formato: 'JPLAY-COFRE-1', chaveCofre }, null, 2);

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(temporario, conteudo, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporario, arquivo);
    return chaveCofre;
}

// A chave do cofre nao pode depender de um token que possa ser trocado numa
// renovacao de licenca. Ela fica somente no DATA_DIR, fora do Git e do pacote.
// Em instalacoes antigas, o token de licenca atual e usado uma unica vez para
// manter legiveis os valores que ja tenham sido cifrados por ele.
function obterChaveCofrePersistente({ dataDir, env = process.env, settings = {} } = {}) {
    if (!dataDir) throw new Error('dataDir e obrigatorio para obter a chave do cofre.');

    const chaveInformada = texto(env.JULIAN_SECRET_KEY);
    if (chaveInformada) return chaveInformada;

    const chavePersistida = lerChaveCofre(dataDir);
    if (chavePersistida) return chavePersistida;

    const chaveLegada = texto(env.LICENSE_ADMIN_TOKEN) || texto(settings.licenseAdminToken);
    const chaveNova = chaveLegada || crypto.randomBytes(32).toString('base64url');
    return gravarChaveCofre(dataDir, chaveNova);
}

function lerConfiguracaoInstalacao(appDir) {
    const arquivo = path.join(appDir, '.julian-play-install.json');

    try {
        return JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
    } catch (_) {
        return {};
    }
}

function resolverConfiguracaoInstalacao({ appDir, env = process.env, settings } = {}) {
    if (!appDir) throw new Error('appDir e obrigatorio para resolver a instalacao.');

    const configuracao = settings || lerConfiguracaoInstalacao(appDir);
    const dataDirRegistrado = texto(configuracao.dataDir);
    const dataDirHerdado = texto(env.JULIAN_PLAY_DATA_DIR || env.DATA_DIR);
    const dataDir = dataDirRegistrado || dataDirHerdado || appDir;
    const conflitoDataDir = Boolean(
        dataDirRegistrado &&
        dataDirHerdado &&
        path.resolve(dataDirRegistrado) !== path.resolve(dataDirHerdado)
    );

    return {
        settings: configuracao,
        appName: texto(configuracao.appName) || texto(env.JULIAN_PLAY_APP_NAME) || 'julian-play',
        dataDir,
        port: texto(configuracao.port) || texto(env.JULIAN_PLAY_PORT) || texto(env.PORT) || '10000',
        installMode: texto(configuracao.installMode) || texto(env.JULIAN_PLAY_INSTALL_MODE) || 'server',
        dataDirRegistrado,
        conflitoDataDir
    };
}

function aplicarDiretorioRegistrado({ appDir, env = process.env, settings } = {}) {
    const configuracao = resolverConfiguracaoInstalacao({ appDir, env, settings });

    if (configuracao.dataDirRegistrado) {
        env.DATA_DIR = configuracao.dataDir;
        env.JULIAN_PLAY_DATA_DIR = configuracao.dataDir;
    }

    return configuracao;
}

module.exports = {
    lerConfiguracaoInstalacao,
    resolverConfiguracaoInstalacao,
    aplicarDiretorioRegistrado,
    caminhoChaveCofre,
    obterChaveCofrePersistente
};
