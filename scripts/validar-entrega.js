const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isUtf8 } = require('buffer');
const { spawnSync } = require('child_process');

const VALIDADE_MS = 48 * 60 * 60 * 1000;
const sha = valor => crypto.createHash('sha256').update(valor).digest('hex');
const ambiente = () => ({ node: process.version, plataforma: process.platform, arquitetura: process.arch });
function caminhoSeguro(raiz, relativo) {
    if (!relativo || relativo.includes('\\') || relativo.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Caminho de fonte invalido.');
    const destino = path.resolve(raiz, relativo);
    if (!destino.startsWith(path.resolve(raiz) + path.sep)) throw new Error('Fonte fora do projeto.');
    return destino;
}
function arquivosGit(raiz, incluirDocumentos = false) {
    const resultado = spawnSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8', windowsHide: true });
    if (resultado.status !== 0) throw new Error('Nao foi possivel identificar as fontes versionadas.');
    return [...new Set(resultado.stdout.split('\0').filter(Boolean))].filter(p => incluirDocumentos || !/\.md$/i.test(p)).sort();
}
function arquivosCandidatos(raiz, relativo = '') {
    const itens = [];
    for (const entrada of fs.readdirSync(path.join(raiz, relativo), { withFileTypes: true })) {
        if (!relativo && ['node_modules', '.git', '.codex'].includes(entrada.name)) continue;
        const nome = relativo ? relativo + '/' + entrada.name : entrada.name;
        if (entrada.isSymbolicLink()) throw new Error('Link de fonte nao suportado.');
        if (entrada.isDirectory()) itens.push(...arquivosCandidatos(raiz, nome));
        else if (entrada.isFile() && !/\.md$/i.test(nome)) itens.push(nome);
    }
    return itens.sort();
}
function identidade(raiz, arquivos) {
    return sha(JSON.stringify(arquivos.map(nome => {
        const arquivo = caminhoSeguro(raiz, nome);
        if (fs.lstatSync(arquivo).isSymbolicLink()) throw new Error('Link de fonte nao suportado.');
        const bytes = fs.readFileSync(arquivo);
        // Git archive usa LF; o checkout Windows pode usar CRLF.
        const canonico = !bytes.includes(0) && isUtf8(bytes) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
        return [nome, sha(canonico)];
    })));
}
function pastaCache(raiz) { return path.join(raiz, '.codex', 'validacoes'); }
function protegerWindows(bytes, abrir = false) {
    if (process.platform !== 'win32') throw new Error('Comprovante local requer protecao do Windows.');
    const metodo = abrir ? 'Unprotect' : 'Protect';
    const comando = '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.Security; $dados=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $resultado=[Security.Cryptography.ProtectedData]::' + metodo + '($dados,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($resultado))';
    const resultado = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], {
        input: bytes.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 8*1024*1024
    });
    if (resultado.error || resultado.status !== 0) throw new Error('Nao foi possivel autenticar o comprovante pelo Windows.');
    return Buffer.from(resultado.stdout.trim(), 'base64');
}
function verificar(candidato, origem, opcoes = {}) {
    try {
        const registro = JSON.parse(fs.readFileSync(path.join(pastaCache(origem), 'aprovacao.json'), 'utf8'));
        if (registro.esquema !== 1 || typeof registro.protegido !== 'string') return false;
        const dados = JSON.parse(protegerWindows(Buffer.from(registro.protegido,'base64'), true).toString('utf8'));
        const agora = opcoes.agora ?? Date.now();
        if (dados.esquema !== 1 || dados.completo !== true || dados.comandos?.join('|') !== 'ci|test|run test:e2e') return false;
        if (!Number.isFinite(dados.aprovadoEm) || agora < dados.aprovadoEm || agora - dados.aprovadoEm > VALIDADE_MS) return false;
        if (JSON.stringify(dados.ambiente) !== JSON.stringify(opcoes.ambiente || ambiente())) return false;
        const arquivos = arquivosCandidatos(candidato);
        return JSON.stringify(arquivos) === JSON.stringify(dados.arquivos) && identidade(candidato, arquivos) === dados.identidade;
    } catch (_) { return false; }
}
function executarNpm(raiz, argumentos) {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!fs.existsSync(npmCli)) throw new Error('npm-cli.js nao encontrado junto ao Node. Configure a instalacao oficial do Node.');
    const resultado = spawnSync(process.execPath, [npmCli, ...argumentos], { cwd: raiz, stdio: 'inherit', windowsHide: true, env: { ...process.env, DISABLE_WHATSAPP: '1', PUPPETEER_SKIP_DOWNLOAD: 'true', PUPPETEER_SKIP_CHROME_DOWNLOAD: 'true' } });
    if (resultado.error || resultado.status !== 0) throw new Error('Falha em npm ' + argumentos.join(' ') + ' (codigo ' + resultado.status + ').');
}
function validarEntrega(raiz, opcoes = {}) {
    const cache = pastaCache(raiz);
    fs.mkdirSync(cache, { recursive: true });
    const comprovante = path.join(cache, 'aprovacao.json');
    // Uma nova tentativa nunca deixa uma aprovacao antiga utilizavel apos falha.
    fs.rmSync(comprovante, { force: true });
    const arquivos = arquivosGit(raiz);
    if (!arquivos.includes('scripts/validar-entrega.js') || !arquivos.includes('package-lock.json')) throw new Error('Inclua o validador e o lockfile no Git antes de validar.');
    const antes = identidade(raiz, arquivos);
    const executar = opcoes.executar || executarNpm;
    const staging = fs.mkdtempSync(path.join(cache, 'staging-'));
    try {
        for (const nome of arquivosGit(raiz, true)) {
            const fonte = caminhoSeguro(raiz, nome);
            if (fs.lstatSync(fonte).isSymbolicLink()) throw new Error('Link de fonte nao suportado.');
            const destino = caminhoSeguro(staging, nome);
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            fs.copyFileSync(fonte, destino);
        }
        executar(staging, ['ci']);
        executar(staging, ['test']);
        executar(staging, ['run', 'test:e2e']);
        if (antes !== identidade(staging, arquivos)) throw new Error('As fontes da validacao foram alteradas pelos testes.');
    } finally {
        const destinoLimpeza = path.resolve(staging);
        if (!destinoLimpeza.startsWith(path.resolve(cache) + path.sep) || !path.basename(destinoLimpeza).startsWith('staging-')) throw new Error('Pasta de validacao fora da area isolada.');
        fs.rmSync(destinoLimpeza, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
    const atuais = arquivosGit(raiz);
    if (JSON.stringify(arquivos) !== JSON.stringify(atuais) || antes !== identidade(raiz, atuais)) throw new Error('As fontes mudaram durante os testes; nenhuma aprovacao foi emitida.');
    const dados = { esquema: 1, completo: true, comandos: ['ci', 'test', 'run test:e2e'], aprovadoEm: Date.now(), ambiente: ambiente(), arquivos, identidade: antes };
    const registro = { esquema: 1, protegido: protegerWindows(Buffer.from(JSON.stringify(dados))).toString('base64') };
    fs.writeFileSync(comprovante + '.tmp', JSON.stringify(registro));
    fs.renameSync(comprovante + '.tmp', comprovante);
    console.log('Validacao completa aprovada. Comprovante local valido por 48 horas para estas mesmas fontes e versao do Node.');
    return dados;
}
if (require.main === module) {
    try {
        if (process.argv[2] === '--verificar') {
            const aprovado = verificar(path.resolve(process.argv[3]), path.resolve(process.argv[4]));
            console.log(aprovado ? 'Validacao completa local confirmada para o codigo candidato; testes ja aprovados serao reaproveitados.' : 'Sem aprovacao local compativel; o deploy executara os testes normalmente.');
            process.exitCode = aprovado ? 0 : 1;
        } else if (process.argv.length === 2) validarEntrega(path.resolve(__dirname, '..'));
        else throw new Error('Uso: node scripts/validar-entrega.js [--verificar candidato origem]');
    } catch (erro) { console.error('Validacao da entrega recusada: ' + erro.message); process.exitCode = 1; }
}
module.exports = { verificar, validarEntrega, identidade, arquivosGit };
