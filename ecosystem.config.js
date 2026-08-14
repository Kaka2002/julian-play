const path = require('path');
const { resolverConfiguracaoInstalacao, obterChaveCofrePersistente } = require('./config/instalacaoRuntime');

const appDir = __dirname;
const instalacao = resolverConfiguracaoInstalacao({ appDir });
const settings = instalacao.settings;
const appName = instalacao.appName;
const dataDir = instalacao.dataDir;
const licenseAdminToken = process.env.LICENSE_ADMIN_TOKEN || settings.licenseAdminToken || '';
const julianSecretKey = obterChaveCofrePersistente({
    dataDir,
    settings,
    env: { ...process.env, LICENSE_ADMIN_TOKEN: licenseAdminToken }
});

module.exports = {
    apps: [
        {
            name: appName,
            cwd: appDir,
            script: path.join(appDir, 'bot.js'),
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            wait_ready: true,
            shutdown_with_message: true,
            listen_timeout: 60000,
            min_uptime: '20s',
            max_restarts: 5,
            restart_delay: 10000,
            kill_timeout: 30000,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                JULIAN_PLAY_APP_NAME: appName,
                PORT: String(instalacao.port),
                DATA_DIR: dataDir,
                JULIAN_PLAY_INSTALL_MODE: instalacao.installMode,
                LICENSE_ADMIN_TOKEN: licenseAdminToken,
                JULIAN_SECRET_KEY: julianSecretKey,
                JULIAN_SECRET_KEY_PREVIOUS: process.env.JULIAN_SECRET_KEY_PREVIOUS || '',
                LICENSE_PUBLIC_KEY: process.env.LICENSE_PUBLIC_KEY || settings.licensePublicKey || '',
                LICENSE_DEFAULT_TRIAL_DAYS: String(process.env.LICENSE_DEFAULT_TRIAL_DAYS || settings.trialDays || 0),
                RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY || settings.recaptchaSiteKey || '',
                RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY || settings.recaptchaSecretKey || '',
                RECAPTCHA_ALLOWED_HOSTNAMES: process.env.RECAPTCHA_ALLOWED_HOSTNAMES || settings.recaptchaAllowedHostnames || ''
            }
        }
    ]
};
