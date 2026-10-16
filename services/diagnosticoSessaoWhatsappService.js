const fs = require('fs');
const path = require('path');

function registrarCicloWhatsApp(evento, dados = {}) {
    const arquivo = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), 'whatsapp-ciclo-sessao.log');
    // Somente metadados técnicos. Não guardar URLs, QR, telefones ou credenciais.
    const item = { em: new Date().toISOString(), evento,
        ...(dados.estado ? { estado: /^[A-Z_]{1,40}$/.test(dados.estado) ? dados.estado : 'OUTRO' } : {}),
        ...(dados.motivo ? { motivo: /^[A-Z_]{1,40}$/.test(dados.motivo) ? dados.motivo : 'OUTRO' } : {}),
        ...(typeof dados.logout === 'boolean' ? { logout: dados.logout } : {}) };
    try {
        let historico = [];
        try { historico = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (_) {}
        if (!Array.isArray(historico)) historico = [];
        fs.mkdirSync(path.dirname(arquivo), { recursive: true });
        fs.writeFileSync(arquivo, JSON.stringify([...historico.slice(-59), item], null, 2));
    } catch (_) {
        console.warn('[whatsapp-ciclo] Não foi possível gravar diagnóstico local.');
    }
    console.log('[whatsapp-ciclo]', JSON.stringify(item));
}

module.exports = { registrarCicloWhatsApp };
