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
        const conteudo = `<style>.informativo-form{max-width:1100px;display:grid;gap:20px}.informativo-form textarea{min-height:130px;font-size:15px}.informativo-form input[type=file]{padding:11px}.informativo-clientes{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center}.informativo-clientes select{min-height:180px}.informativo-clientes label{display:grid;gap:8px}.informativo-clientes .transferir{display:grid;gap:8px}.informativo-clientes .transferir button{min-width:46px}.informativo-preview{display:flex;flex-wrap:wrap;gap:12px}.informativo-preview img{width:170px;height:115px;object-fit:cover;border-radius:8px;border:1px solid #dbe5f0}.informativo-form .button{width:max-content;min-width:180px}@media(max-width:800px){.informativo-clientes{grid-template-columns:1fr}.informativo-clientes .transferir{grid-template-columns:1fr 1fr}}</style><section class="page-title"><h1>Mensagens informativas</h1><div class="subtitle">Envie orientações com imagens diretamente aos clientes, fora das campanhas.</div></section><section class="panel"><form method="post" enctype="multipart/form-data" class="fields informativo-form"><label>Orientação (opcional)<textarea name="texto" placeholder="Digite a orientação que acompanhará a imagem..."></textarea></label><div class="informativo-clientes"><label>Clientes disponíveis<select id="clientes-disponiveis" multiple>${clientes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></label><div class="transferir"><button type="button" class="button" id="cliente-adicionar">→</button><button type="button" class="button" id="cliente-remover">←</button></div><label>Clientes selecionados<select id="clientes-selecionados" name="clientes" multiple required></select></label></div><label>Imagens informativas<input id="informativo-imagens" type="file" name="imagens" multiple accept="image/*"></label><div id="informativo-preview" class="informativo-preview" aria-live="polite"></div><button class="button primary" type="submit">Enviar informativo</button></form></section><script>(()=>{const d=document.getElementById('clientes-disponiveis'),s=document.getElementById('clientes-selecionados');const mover=(origem,destino)=>[...origem.selectedOptions].forEach(o=>{destino.appendChild(o);o.selected=false});document.getElementById('cliente-adicionar')?.addEventListener('click',()=>mover(d,s));document.getElementById('cliente-remover')?.addEventListener('click',()=>mover(s,d));s.form?.addEventListener('submit',()=>[...s.options].forEach(o=>o.selected=true));const input=document.getElementById('informativo-imagens'),preview=document.getElementById('informativo-preview');input?.addEventListener('change',()=>{preview.innerHTML='';[...input.files].forEach(file=>{if(!file.type.startsWith('image/'))return;const url=URL.createObjectURL(file);const img=document.createElement('img');img.src=url;img.alt=file.name;img.onload=()=>URL.revokeObjectURL(url);preview.appendChild(img);});});})();</script>`;
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

