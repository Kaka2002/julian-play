const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');

function limpar(valor) {
    return String(valor || '').trim().toUpperCase();
}

function lerMachineGuidWindows() {
    if (process.platform !== 'win32') return '';

    try {
        const saida = execFileSync('reg', [
            'query',
            'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
            '/v',
            'MachineGuid'
        ], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 2500
        });
        const linha = String(saida || '').split(/\r?\n/).find(item => /MachineGuid/i.test(item));
        const partes = String(linha || '').trim().split(/\s+/);
        return limpar(partes[partes.length - 1]);
    } catch {
        return '';
    }
}

function obterBaseFingerprintMaquina() {
    const valores = [
        `platform=${process.platform}`,
        `arch=${process.arch}`,
        `machineGuid=${lerMachineGuidWindows()}`,
        `hostname=${os.hostname()}`,
        `computer=${process.env.COMPUTERNAME || ''}`,
        `processor=${process.env.PROCESSOR_IDENTIFIER || ''}`,
        `userDomain=${process.env.USERDOMAIN || ''}`
    ].map(limpar).filter(Boolean);

    return valores.join('|') || limpar(os.hostname());
}

function obterFingerprintMaquina() {
    return crypto
        .createHash('sha256')
        .update(obterBaseFingerprintMaquina())
        .digest('hex')
        .toUpperCase()
        .slice(0, 32);
}

function normalizarFingerprintMaquina(valor) {
    return limpar(valor).replace(/[^A-Z0-9]/g, '');
}

module.exports = {
    obterFingerprintMaquina,
    normalizarFingerprintMaquina
};
