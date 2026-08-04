const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const settingsPath = path.join(projectDir, '.julian-master-install.json');
let settings = {};
try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''));
} catch (_) {
    settings = {};
}

module.exports = {
    apps: [{
        name: 'julian-master',
        cwd: projectDir,
        script: path.join(projectDir, 'master', 'app.js'),
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        wait_ready: true,
        shutdown_with_message: true,
        listen_timeout: 30000,
        min_uptime: '10s',
        max_restarts: 5,
        restart_delay: 10000,
        max_memory_restart: '300M',
        env: {
            NODE_ENV: 'production',
            MASTER_HOST: '127.0.0.1',
            MASTER_PORT: String(settings.port || 9000),
            MASTER_USER: settings.user || '',
            MASTER_PASSWORD_HASH: settings.passwordHash || '',
            MASTER_TOTP_SECRET: process.env.MASTER_TOTP_SECRET || settings.totpSecret || '',
            MASTER_SESSION_SECRET: process.env.MASTER_SESSION_SECRET || settings.sessionSecret || settings.licenseAdminToken || '',
            MASTER_DATA_DIR: settings.dataDir || 'C:\\JulianPlayMaster',
            MASTER_CLIENTS_DIR: settings.clientsDir || 'C:\\JulianPlayClientes',
            MASTER_ARCHIVE_DIR: settings.archiveDir || 'C:\\JulianPlayClientes\\_arquivados',
            MASTER_CADDY_DIR: settings.caddyDir || 'C:\\JulianPlayMaster\\caddy',
            MASTER_BASE_DOMAIN: settings.baseDomain || 'julianplay.com.br',
            MASTER_FIRST_PORT: String(settings.firstPort || 11001),
            LICENSE_SIGNING_SECRET: process.env.LICENSE_SIGNING_SECRET || settings.licenseSigningSecret || settings.licenseAdminToken || '',
            LICENSE_ADMIN_TOKEN: process.env.LICENSE_ADMIN_TOKEN || settings.licenseAdminToken || settings.licenseSigningSecret || '',
            LICENSE_PRIVATE_KEY: process.env.LICENSE_PRIVATE_KEY || settings.licenseSigningPrivateKey || '',
            LICENSE_PUBLIC_KEY: process.env.LICENSE_PUBLIC_KEY || settings.licensePublicKey || '',
            JULIAN_PLAY_SOURCE_DIR: projectDir,
            CADDY_EXE: settings.caddyExe || 'C:\\caddy\\caddy.exe',
            CADDY_CONFIG: settings.caddyConfig || 'C:\\caddy\\Caddyfile'
        }
    }]
};
