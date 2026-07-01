const path = require('path');
const fs = require('fs');

const appDir = __dirname;
const settingsPath = path.join(appDir, '.julian-play-install.json');
let settings = {};

try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''));
} catch (_) {
    settings = {};
}

const appName = process.env.JULIAN_PLAY_APP_NAME || settings.appName || 'julian-play';
const dataDir = process.env.JULIAN_PLAY_DATA_DIR || process.env.DATA_DIR || settings.dataDir || appDir;

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
            restart_delay: 10000,
            kill_timeout: 30000,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                JULIAN_PLAY_APP_NAME: appName,
                PORT: String(process.env.JULIAN_PLAY_PORT || process.env.PORT || settings.port || 10000),
                DATA_DIR: dataDir,
                LICENSE_ADMIN_TOKEN: process.env.LICENSE_ADMIN_TOKEN || settings.licenseAdminToken || '',
                LICENSE_DEFAULT_TRIAL_DAYS: String(process.env.LICENSE_DEFAULT_TRIAL_DAYS || settings.trialDays || 0)
            }
        }
    ]
};
