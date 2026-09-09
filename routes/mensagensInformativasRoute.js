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
        const conteudo = `<style>.informativo-form{max-width:900px;display:grid;gap:18px}.informativo-form select{min-height:42px}.informativo-form input[type=file]{padding:10px}.informativo-preview{display:flex;flex-wrap:wrap;gap:12px}.informativo-preview img{width:150px;height:100px;object-fit:cover;border-radius:8px;border:1px solid #dbe5f0}.informativo-form .button{width:max-content;min-width:180px}</style><section class="page-title"><h1>Mensagens informativas</h1><div class="subtitle">Envie orientações com imagens diretamente aos clientes, fora das campanhas.</div></section><section class="panel"><form method="post" enctype="multipart/form-data" class="fields informativo-form"><label>Orientação (opcional)<textarea name="texto" rows="4" placeholder="Digite a orientação que acompanhará a imagem..."></textarea></label><label>Cliente<select name="clientes" required><option value="">Selecione um cliente...</option>${clientes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></label><label>Imagem informativa<input id="informativo-imagens" type="file" name="imagens" multiple accept="image/*"></label><div id="informativo-preview" class="informativo-preview" aria-live="polite"></div><button class="button primary" type="submit">Enviar informativo</button></form></section><script>(()=>{const input=document.getElementById('informativo-imagens'),preview=document.getElementById('informativo-preview');input?.addEventListener('change',()=>{preview.innerHTML='';[...input.files].forEach(file=>{if(!file.type.startsWith('image/'))return;const url=URL.createObjectURL(file);const img=document.createElement('img');img.src=url;img.alt=file.name;img.onload=()=>URL.revokeObjectURL(url);preview.appendChild(img);});});})();</script>`;
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

