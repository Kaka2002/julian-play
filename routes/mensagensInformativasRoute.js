const express = require('express');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { lerUploadMultipart, validarImagemUpload } = require('../services/uploadMultipartService');

function criarMensagensInformativasRoute({ getClient, listarClientes, normalizarTelefone, dataDir, layout } = {}) {
    const router = express.Router();
    const pasta = path.join(dataDir || path.join(__dirname, '..'), 'mensagens-informativas');
    fs.mkdirSync(pasta, { recursive: true });
    router.get('/', async (req, res) => {
        const clientes = await listarClientes({ status: 'ativo' });
        const imagens = fs.readdirSync(pasta).filter(nome => /\.(png|jpe?g|webp|gif)$/i.test(nome));
        const csrf = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('julian_csrf='))?.slice(12) || '';
        const conteudo = `<section class="page-title"><h1>Mensagens informativas</h1><div class="subtitle">Envie orientações com imagens diretamente aos clientes, fora das campanhas.</div></section><section class="panel"><form method="post" enctype="multipart/form-data" class="fields"><input type="hidden" name="_csrf" value="${csrf}"><label>Orientação (opcional)<textarea name="texto" rows="4"></textarea></label>
        <label>Clientes (Ctrl+clique para vários)<select name="clientes" multiple required>${clientes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></label><label>Imagens informativas<input type="file" name="imagens" multiple accept="image/*"></label><button class="button primary" type="submit">Enviar informativo</button></form><p class="muted">Imagens salvas: ${imagens.join(', ') || 'nenhuma'}</p></section>`;
        res.send(layout ? layout({ titulo: 'Mensagens informativas', conteudo, ativo: 'mensagens-informativas' }) : conteudo);
    });
    router.post('/', async (req, res) => {
        try {
            const upload = await lerUploadMultipart(req, { campo: 'imagens', multiplos: true });
            const arquivos = upload.arquivos?.length ? upload.arquivos : [upload];
            const imagens = arquivos.filter(item => item?.buffer).map(item => { validarImagemUpload(item.filename, item.buffer); const nome = `${Date.now()}-${path.basename(item.filename)}`; const arquivo = path.join(pasta, nome); fs.writeFileSync(arquivo, item.buffer); return arquivo; });
            const texto = String(upload?.campos?.texto || '').trim();
            const ids = (Array.isArray(upload?.campos?.clientes) ? upload.campos.clientes : [upload?.campos?.clientes]).flatMap(valor => String(valor || '').split(',')).map(Number).filter(Boolean);
            const clientes = await listarClientes({ status: 'ativo' });
            const client = getClient();
            if (!client) throw new Error('WhatsApp não está conectado.');
            for (const cliente of clientes.filter(c => ids.includes(Number(c.id)) && !c.whatsappOptOutEm && normalizarTelefone(c.telefone))) {
                const destino = `${normalizarTelefone(cliente.telefone)}@c.us`;
                if (texto) await client.sendMessage(destino, texto);
                for (const arquivo of imagens) await client.sendMessage(destino, MessageMedia.fromFilePath(arquivo));
            }
            res.redirect('/mensagens-informativas');
        } catch (err) { res.status(400).send(err.message); }
    });
    return router;
}
module.exports = criarMensagensInformativasRoute;
