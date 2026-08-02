const path = require('path');
const crypto = require('crypto');

const LIMITE_UPLOAD_BYTES = 12 * 1024 * 1024;

function boundaryDoContentType(contentType = '') {
    const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    return String(match?.[1] || match?.[2] || '').trim();
}

function valorParametro(cabecalho, nome) {
    const expressoes = [
        new RegExp(`${nome}="([^"]*)"`, 'i'),
        new RegExp(`${nome}=([^;\\r\\n]+)`, 'i')
    ];

    for (const expressao of expressoes) {
        const match = String(cabecalho || '').match(expressao);
        if (match) return String(match[1] || '').trim();
    }

    return '';
}

function nomeArquivoSeguro(nome = '') {
    return path.basename(String(nome).replace(/\\/g, '/').replace(/\0/g, '')).trim();
}

function extrairArquivoMultipart(buffer, boundary, campo = '') {
    if (!Buffer.isBuffer(buffer) || !buffer.length || !boundary) {
        throw new Error('Formulario de upload invalido.');
    }

    const marcador = Buffer.from(`--${boundary}`);
    const separadorCabecalho = Buffer.from('\r\n\r\n');
    const final = Buffer.from('--');
    const quebra = Buffer.from('\r\n');
    const campos = {};
    let arquivo = null;
    let inicioParte = buffer.indexOf(marcador);

    while (inicioParte >= 0) {
        inicioParte += marcador.length;
        if (buffer.subarray(inicioParte, inicioParte + 2).equals(final)) break;
        if (buffer.subarray(inicioParte, inicioParte + 2).equals(quebra)) inicioParte += 2;

        const proximaParte = buffer.indexOf(marcador, inicioParte);
        if (proximaParte < 0) break;

        const fimCabecalho = buffer.indexOf(separadorCabecalho, inicioParte);
        if (fimCabecalho < 0 || fimCabecalho >= proximaParte) {
            inicioParte = proximaParte;
            continue;
        }

        const cabecalho = buffer.subarray(inicioParte, fimCabecalho).toString('utf8');
        const filename = nomeArquivoSeguro(valorParametro(cabecalho, 'filename'));
        const nomeCampo = valorParametro(cabecalho, 'name');

        const inicioConteudo = fimCabecalho + separadorCabecalho.length;
        let fimConteudo = proximaParte;
        if (buffer.subarray(fimConteudo - 2, fimConteudo).equals(quebra)) fimConteudo -= 2;
        const conteudo = buffer.subarray(inicioConteudo, fimConteudo);

        if (!arquivo && filename && (!campo || nomeCampo === campo)) {
            arquivo = {
                filename,
                campo: nomeCampo,
                buffer: conteudo
            };
        } else if (!filename && nomeCampo) {
            campos[nomeCampo] = conteudo.toString('utf8');
        }

        inicioParte = proximaParte;
    }

    if (!arquivo) throw new Error('Selecione um arquivo para enviar.');
    return { ...arquivo, campos };
}

function tokenCsrfDoCookie(req) {
    return String(req.headers?.cookie || '')
        .split(';')
        .map(item => item.trim())
        .find(item => item.startsWith('julian_csrf='))
        ?.slice('julian_csrf='.length) || '';
}

function validarCsrfMultipart(req, upload) {
    const esperado = Buffer.from(decodeURIComponent(tokenCsrfDoCookie(req)));
    const recebido = Buffer.from(String(upload.campos?._csrf || ''));
    if (!esperado.length || esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) {
        throw new Error('Requisicao expirada ou invalida. Atualize a pagina e tente novamente.');
    }
}

function lerUploadMultipart(req, opcoes = {}) {
    const limiteBytes = Number(opcoes.limiteBytes || LIMITE_UPLOAD_BYTES);
    const boundary = boundaryDoContentType(req.headers?.['content-type']);

    if (!boundary) return Promise.reject(new Error('Formulario de upload invalido.'));

    return new Promise((resolve, reject) => {
        const partes = [];
        let tamanho = 0;
        let excedeuLimite = false;

        req.on('data', (parte) => {
            tamanho += parte.length;
            if (tamanho > limiteBytes) {
                excedeuLimite = true;
                return;
            }
            partes.push(parte);
        });
        req.on('error', reject);
        req.on('end', () => {
            if (excedeuLimite) {
                reject(new Error(`Arquivo maior que ${Math.round(limiteBytes / 1024 / 1024)} MB.`));
                return;
            }

            try {
                const upload = extrairArquivoMultipart(Buffer.concat(partes), boundary, opcoes.campo || '');
                if (opcoes.validarCsrf !== false) validarCsrfMultipart(req, upload);
                resolve(upload);
            } catch (err) {
                reject(err);
            }
        });
    });
}

function validarImagemUpload(filename, buffer) {
    const extensao = path.extname(String(filename || '')).toLowerCase();
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
        throw new Error('O arquivo de imagem esta vazio ou invalido.');
    }

    const assinaturas = {
        '.png': () => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        '.jpg': () => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
        '.jpeg': () => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
        '.gif': () => ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
        '.webp': () => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
        '.svg': () => {
            const texto = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
            return /^<svg\b/i.test(texto) && !/<script\b|\son\w+\s*=|javascript:/i.test(texto);
        }
    };

    if (!assinaturas[extensao] || !assinaturas[extensao]()) {
        throw new Error('O conteudo do arquivo nao corresponde a uma imagem valida.');
    }

    return true;
}

module.exports = {
    LIMITE_UPLOAD_BYTES,
    boundaryDoContentType,
    extrairArquivoMultipart,
    lerUploadMultipart,
    validarCsrfMultipart,
    validarImagemUpload
};
