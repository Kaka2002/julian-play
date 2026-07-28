const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = path.join(os.tmpdir(), 'julian-play-e2e');
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

Object.assign(process.env, {
    PORT: '11999',
    DATA_DIR: dataDir,
    DB_PATH: path.join(dataDir, 'clientes-e2e.db'),
    PANEL_USER: 'e2e-admin',
    PANEL_PASSWORD: 'Senha-E2E-Segura-2026',
    LICENSE_ROLE: 'admin',
    JULIAN_PLAY_APP_NAME: 'julian-play-e2e',
    LICENSE_ADMIN_TOKEN: 'token-e2e-isolado-nao-usar-em-producao',
    DISABLE_WHATSAPP: '1',
    NODE_ENV: 'test'
});

async function executar() {
    const db = require('../../database/sqlite');
    await db.ready;
    await new Promise((resolve, reject) => db.run(
        `INSERT INTO clientes
            (nome, telefone, plano, vencimento, dataVencimento, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['Cliente E2E Vencido', '5511999990000', 'Mensal', '2026-07-20 23:59', '2026-07-20 23:59', 'ativo'],
        err => err ? reject(err) : resolve()
    ));
    require('../../bot');
}

executar().catch((err) => {
    console.error(err);
    process.exit(1);
});
