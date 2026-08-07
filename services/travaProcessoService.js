const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TOLERANCIA_INICIO_MS = 15000;

function pausarSincronamente(milisegundos) {
    const tempo = Math.max(0, Number(milisegundos) || 0);
    if (!tempo) return;

    // A trava e adquirida antes de o servidor HTTP iniciar. Uma pausa curta e
    // bloqueante aqui evita duas instancias no intervalo de troca do PM2.
    const sinal = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(sinal, 0, 0, tempo);
}

function lerRegistroTrava(conteudo) {
    const texto = String(conteudo || '').trim();
    if (!texto) return null;

    try {
        const registro = JSON.parse(texto);
        if (typeof registro !== 'object' || registro === null) {
            const pidLegado = Number(registro);
            if (!Number.isInteger(pidLegado) || pidLegado <= 0) return null;
            return { versao: 1, pid: pidLegado, instancia: '', iniciadoEm: '', execucaoId: '', legado: true };
        }

        const pid = Number(registro?.pid);
        if (!Number.isInteger(pid) || pid <= 0) return null;
        return {
            versao: Number(registro.versao || 1),
            pid,
            instancia: String(registro.instancia || ''),
            iniciadoEm: String(registro.iniciadoEm || ''),
            execucaoId: String(registro.execucaoId || ''),
            legado: false
        };
    } catch {
        const pid = Number(texto);
        if (!Number.isInteger(pid) || pid <= 0) return null;
        return { versao: 1, pid, instancia: '', iniciadoEm: '', execucaoId: '', legado: true };
    }
}

function processoExiste(pid, matarProcesso = process.kill) {
    if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;

    try {
        matarProcesso(Number(pid), 0);
        return true;
    } catch (err) {
        return err?.code === 'EPERM';
    }
}

function consultarProcessoWindows(pid, executar = execFileSync) {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const comando = [
        '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
        `$processo = Get-Process -Id ${Number(pid)} -ErrorAction Stop`,
        '[PSCustomObject]@{ nome = $processo.ProcessName; iniciadoEm = $processo.StartTime.ToUniversalTime().ToString("o") } | ConvertTo-Json -Compress'
    ].join('; ');

    try {
        const saida = executar(
            powershell,
            ['-NoProfile', '-NonInteractive', '-Command', comando],
            {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 5000,
                stdio: ['ignore', 'pipe', 'ignore']
            }
        );
        const dados = JSON.parse(String(saida || '').trim());
        return {
            nome: String(dados?.nome || ''),
            iniciadoEm: String(dados?.iniciadoEm || '')
        };
    } catch {
        return null;
    }
}

function registroPertenceAProcessoAtivo(registro, opcoes = {}) {
    if (!registro?.pid) return false;

    const pidAtual = Number(opcoes.pidAtual || process.pid);
    if (registro.pid === pidAtual) return false;

    const processoExisteFn = opcoes.processoExisteFn || processoExiste;
    if (!processoExisteFn(registro.pid)) return false;

    const plataforma = opcoes.plataforma || process.platform;
    if (plataforma !== 'win32') return true;

    const consultarProcessoFn = opcoes.consultarProcessoFn || consultarProcessoWindows;
    const processo = consultarProcessoFn(registro.pid);

    // Se o Windows impedir a consulta, preserva a protecao contra duplicidade.
    if (!processo) return true;
    if (!/^node(?:\.exe)?$/i.test(processo.nome)) return false;

    const inicioTrava = Date.parse(registro.iniciadoEm);
    const inicioProcesso = Date.parse(processo.iniciadoEm);
    if (Number.isFinite(inicioTrava) && Number.isFinite(inicioProcesso)) {
        return Math.abs(inicioTrava - inicioProcesso) <= TOLERANCIA_INICIO_MS;
    }

    // Arquivos antigos continham somente o PID; para Node, mantem o bloqueio seguro.
    return true;
}

function criarGerenciadorTravaProcesso(opcoes = {}) {
    const caminho = path.resolve(String(opcoes.caminho || ''));
    const pidAtual = Number(opcoes.pidAtual || process.pid);
    const inicioAtualMs = Number(opcoes.inicioAtualMs || (Date.now() - (process.uptime() * 1000)));
    const registroAtual = {
        versao: 2,
        pid: pidAtual,
        instancia: String(opcoes.instancia || ''),
        iniciadoEm: new Date(inicioAtualMs).toISOString(),
        execucaoId: String(opcoes.execucaoId || crypto.randomUUID())
    };

    function tentarAdquirir() {
        fs.mkdirSync(path.dirname(caminho), { recursive: true });
        let registroAnterior = null;

        if (fs.existsSync(caminho)) {
            registroAnterior = lerRegistroTrava(fs.readFileSync(caminho, 'utf8'));
            if (registroPertenceAProcessoAtivo(registroAnterior, {
                pidAtual,
                plataforma: opcoes.plataforma,
                processoExisteFn: opcoes.processoExisteFn,
                consultarProcessoFn: opcoes.consultarProcessoFn
            })) {
                return { adquirida: false, registroAnterior, substituiuObsoleta: false };
            }
        }

        fs.writeFileSync(caminho, `${JSON.stringify(registroAtual, null, 2)}\n`, 'utf8');
        return {
            adquirida: true,
            registroAnterior,
            substituiuObsoleta: Boolean(registroAnterior)
        };
    }

    function adquirir(opcoesAquisicao = {}) {
        const tempoEsperaMs = Math.max(0, Number(opcoesAquisicao.tempoEsperaMs) || 0);
        const intervaloEsperaMs = Math.max(1, Number(opcoesAquisicao.intervaloEsperaMs) || 250);
        const agoraFn = opcoes.agoraFn || Date.now;
        const pausarFn = opcoes.pausarFn || pausarSincronamente;
        const inicioEsperaMs = Number(agoraFn());
        const limiteEsperaMs = inicioEsperaMs + tempoEsperaMs;
        let resultado = tentarAdquirir();

        while (!resultado.adquirida && tempoEsperaMs > 0 && Number(agoraFn()) < limiteEsperaMs) {
            const restanteMs = Math.max(1, limiteEsperaMs - Number(agoraFn()));
            pausarFn(Math.min(intervaloEsperaMs, restanteMs));
            resultado = tentarAdquirir();
        }

        return {
            ...resultado,
            aguardouMs: Math.max(0, Number(agoraFn()) - inicioEsperaMs)
        };
    }

    function liberar() {
        if (!fs.existsSync(caminho)) return false;
        const registro = lerRegistroTrava(fs.readFileSync(caminho, 'utf8'));
        const pertenceAExecucaoAtual = registro?.execucaoId
            ? registro.execucaoId === registroAtual.execucaoId
            : registro?.pid === pidAtual;

        if (!pertenceAExecucaoAtual) return false;
        fs.unlinkSync(caminho);
        return true;
    }

    return { adquirir, liberar, registroAtual };
}

module.exports = {
    TOLERANCIA_INICIO_MS,
    consultarProcessoWindows,
    criarGerenciadorTravaProcesso,
    lerRegistroTrava,
    pausarSincronamente,
    processoExiste,
    registroPertenceAProcessoAtivo
};
