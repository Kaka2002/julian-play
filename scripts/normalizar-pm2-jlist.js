'use strict';

const fs = require('fs');

function falhar(mensagem) {
    process.stderr.write(`${mensagem}\n`);
    process.exit(1);
}

const arquivo = process.argv[2];
if (!arquivo) falhar('Informe o arquivo temporario com a saida do PM2.');

let conteudo;
try {
    conteudo = fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, '');
} catch (erro) {
    falhar(`Nao foi possivel ler a saida do PM2: ${erro.message}`);
}

const inicioJson = conteudo.indexOf('[');
if (inicioJson < 0) falhar('O PM2 nao retornou uma lista JSON.');

let processos;
try {
    processos = JSON.parse(conteudo.slice(inicioJson));
} catch (erro) {
    falhar(`O PM2 retornou JSON invalido: ${erro.message}`);
}

if (!Array.isArray(processos)) falhar('O PM2 nao retornou um array de processos.');

const normalizados = processos.map((processo) => {
    const ambiente = processo && typeof processo.pm2_env === 'object' && processo.pm2_env
        ? processo.pm2_env
        : {};
    const ambienteInterno = ambiente && typeof ambiente.env === 'object' && ambiente.env
        ? ambiente.env
        : {};
    const porta = ambiente.PORT ?? ambienteInterno.PORT ?? null;

    return {
        name: typeof processo?.name === 'string' ? processo.name : '',
        pm2_env: {
            status: typeof ambiente.status === 'string' ? ambiente.status : '',
            PORT: typeof porta === 'string' || typeof porta === 'number' ? porta : null
        }
    };
});

process.stdout.write(JSON.stringify(normalizados));
