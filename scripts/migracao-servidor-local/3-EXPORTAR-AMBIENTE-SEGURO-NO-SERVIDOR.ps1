param(
    [Parameter(Mandatory=$true)][string]$Destino,
    [string]$DumpPm2 = "$env:USERPROFILE\.pm2\dump.pm2"
)

$ErrorActionPreference = 'Stop'

function Exigir([bool]$condicao, [string]$mensagem) {
    if (-not $condicao) { throw $mensagem }
}

function Obter-Sha256Arquivo([string]$caminho) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($caminho)

    try {
        $bytes = $sha256.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '')
    }
    finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

Exigir (Test-Path -LiteralPath $DumpPm2 -PathType Leaf) 'dump.pm2 nao encontrado.'
Exigir ($null -ne (Get-Command node.exe -ErrorAction SilentlyContinue)) 'Node.js nao encontrado.'
$destinoCompleto = [IO.Path]::GetFullPath($Destino)
$pastaDestino = Split-Path -Parent $destinoCompleto
Exigir ([bool]$pastaDestino) 'Destino invalido.'
New-Item -ItemType Directory -Path $pastaDestino -Force | Out-Null

$codigoNode = @'
const fs = require('fs');
const path = require('path');

const dump = JSON.parse(fs.readFileSync(process.env.JULIAN_PM2_DUMP, 'utf8'));
const processos = Array.isArray(dump) ? dump : [dump];
const nomeProcesso = processo => processo?.name || processo?.pm2_env?.name || '';
const admin = processos.find(processo => nomeProcesso(processo) === 'julian-play');
const master = processos.find(processo => nomeProcesso(processo) === 'julian-master');
const amplaytv = processos.find(processo => nomeProcesso(processo) === 'julian-amplaytv');
if (!admin) throw new Error('Processo julian-play nao encontrado no dump.pm2.');
if (!master) throw new Error('Processo julian-master nao encontrado no dump.pm2.');

function obter(processo, nome) {
    const candidatos = [
        processo?.[nome],
        processo?.env?.[nome],
        processo?.pm2_env?.[nome],
        processo?.pm2_env?.env?.[nome]
    ];
    const valor = candidatos.find(item => item !== undefined && item !== null && String(item) !== '');
    return valor === undefined ? undefined : String(valor);
}

function selecionar(processo, nomes) {
    const resultado = {};
    for (const nome of nomes) {
        const valor = obter(processo, nome);
        if (valor !== undefined) resultado[nome] = valor;
    }
    return resultado;
}

const comuns = [
    'LICENSE_ADMIN_TOKEN','LICENSE_PRIVATE_KEY','LICENSE_PUBLIC_KEY','LICENSE_ROLE',
    'LICENSE_CUSTOMER_NAME','LICENSE_DEFAULT_MODE','LICENSE_DEFAULT_TRIAL_DAYS',
    'LICENSE_SIGNING_SECRET','JULIAN_SECRET_KEY','JULIAN_SECRET_KEY_PREVIOUS',
    'SECURITY_SIGNING_SECRET','TRUST_PROXY'
];
const painel = [
    'PANEL_USER','PANEL_PASSWORD','PANEL_PASSWORD_HASH','PANEL_TOTP_SECRET',
    'PANEL_SETUP_TOKEN','PANEL_SESSION_HOURS','PANEL_COOKIE_SECURE',
    'PANEL_LOGIN_MAX_ATTEMPTS','PANEL_LOGIN_LOCK_MINUTES'
];
const mestre = [
    'MASTER_USER','MASTER_PASSWORD_HASH','MASTER_TOTP_SECRET','MASTER_SESSION_SECRET',
    'MASTER_LOGIN_MAX_ATTEMPTS','MASTER_LOGIN_LOCK_MINUTES','MASTER_PUBLIC_URL',
    'MASTER_BASE_DOMAIN','MASTER_FIRST_PORT'
];
const ambienteAdmin = selecionar(admin, [...comuns, ...painel]);
const ambienteMaster = selecionar(master, [...comuns, ...mestre]);
const ambienteAmplaytv = amplaytv ? selecionar(amplaytv, [
    ...comuns,
    ...painel,
    'RENOVACAO_HORA_ENVIO','RENOVACAO_MINUTO_ENVIO'
]) : null;
if (!ambienteAdmin.LICENSE_ADMIN_TOKEN) throw new Error('LICENSE_ADMIN_TOKEN nao foi encontrado para julian-play.');
if (!ambienteMaster.MASTER_USER) throw new Error('MASTER_USER nao foi encontrado para julian-master.');
if (!ambienteMaster.MASTER_PASSWORD_HASH) throw new Error('MASTER_PASSWORD_HASH nao foi encontrado para julian-master.');
if (ambienteAmplaytv && !ambienteAmplaytv.LICENSE_ADMIN_TOKEN) throw new Error('LICENSE_ADMIN_TOKEN nao foi encontrado para julian-amplaytv.');
if (ambienteAmplaytv && !ambienteAmplaytv.PANEL_USER) throw new Error('PANEL_USER nao foi encontrado para julian-amplaytv.');
if (ambienteAmplaytv && !ambienteAmplaytv.PANEL_PASSWORD_HASH && !ambienteAmplaytv.PANEL_PASSWORD) {
    throw new Error('Senha do painel nao foi encontrada para julian-amplaytv.');
}

const arquivo = {
    formato: 'julian-play-ambiente-seguro-v1',
    criadoEm: new Date().toISOString(),
    origem: process.env.COMPUTERNAME || '',
    admin: ambienteAdmin,
    master: ambienteMaster,
    ...(ambienteAmplaytv ? { amplaytv: ambienteAmplaytv } : {})
};
fs.mkdirSync(path.dirname(process.env.JULIAN_AMBIENTE_DESTINO), { recursive: true });
fs.writeFileSync(process.env.JULIAN_AMBIENTE_DESTINO, JSON.stringify(arquivo, null, 2), 'utf8');
'@

$env:JULIAN_PM2_DUMP = [IO.Path]::GetFullPath($DumpPm2)
$env:JULIAN_AMBIENTE_DESTINO = $destinoCompleto
try {
    & node.exe -e $codigoNode
    if ($LASTEXITCODE -ne 0) { throw "Node.js nao conseguiu exportar o ambiente seguro (codigo $LASTEXITCODE)." }
} finally {
    Remove-Item Env:JULIAN_PM2_DUMP,Env:JULIAN_AMBIENTE_DESTINO -ErrorAction SilentlyContinue
}

$item = Get-Item -LiteralPath $destinoCompleto
$hash = Obter-Sha256Arquivo $destinoCompleto
Write-Host 'Ambiente seguro exportado sem exibir os valores.' -ForegroundColor Green
Write-Host "Arquivo: $($item.FullName)" -ForegroundColor Green
Write-Host "Tamanho: $($item.Length) bytes" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor Green
Write-Warning 'Nao abra, nao envie pelo chat e nao versione este arquivo. Apague-o depois da homologacao e do backup definitivo.'
