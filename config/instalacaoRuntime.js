const fs = require('fs');
const path = require('path');

function texto(valor) {
    return String(valor || '').trim();
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
    aplicarDiretorioRegistrado
};
