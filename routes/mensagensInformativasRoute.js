const express = require('express');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { lerUploadMultipart, validarImagemUpload } = require('../services/uploadMultipartService');

function criarMensagensInformativasRoute({ getClient, listarClientes, normalizarTelefone, dataDir, layout } = {}) {
    const router = express.Router();
    const pasta = path.join(dataDir || path.join(__dirname, '..'), 'mensagens-informativas');
    const historicoArquivo = path.join(pasta, 'historico.json');
    fs.mkdirSync(pasta, { recursive: true });
    const lerHistorico = () => { try { const limite = Date.now() - 2 * 24 * 60 * 60 * 1000; return JSON.parse(fs.readFileSync(historicoArquivo, 'utf8')).filter(item => !item.timestamp || Date.parse(item.timestamp) >= limite); } catch (_) { return []; } };
    const escapar = valor => String(valor || '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
    router.get('/', async (req, res) => {
        const clientes = await listarClientes({ status: 'ativo' });
        const historico = lerHistorico();
        const resumo = historico.length ? `<section class="panel informativo-historico"><style>.informativo-historico article{padding:12px 0;border-top:1px solid #e5eaf2;display:grid;gap:4px}.informativo-historico h2{margin-top:0}.informativo-historico small{color:#667085}</style><h2>Últimos envios</h2>${historico.slice(0, 10).map(item => `<article><strong>${escapar(item.data)}</strong><div>Destinatários: ${escapar(item.clientes.join(', ') || 'Nenhum')}</div><div>${escapar(item.texto || 'Sem texto')}</div><small>${item.imagens.length} imagem(ns): ${escapar(item.imagens.join(', '))}</small></article>`).join('')}</section>` : '';
        const aviso = req.query.status === "sem-imagem" ? "<div style=\"padding:12px;margin-bottom:16px;background:#fff8e6;color:#8a5a00;border-radius:8px;font-weight:600\">Escolha pelo menos uma imagem para enviar.</div>" : req.query.status === "sucesso" ? "<div style=\"padding:12px;margin-bottom:16px;background:#e8f8ef;color:#16733d;border-radius:8px;font-weight:600\">Informativo enviado com êxito.</div>" : req.query.status === "erro" ? "<div style=\"padding:12px;margin-bottom:16px;background:#fff0f0;color:#a32929;border-radius:8px;font-weight:600\">Não foi possível enviar o informativo.</div>" : "";
        const conteudo = `${req.query.status === "sem-imagem" ? "<div style=\"padding:12px;margin-bottom:16px;background:#fff8e6;color:#8a5a00;border-radius:8px;font-weight:600\">Escolha pelo menos uma imagem para enviar.</div>" : req.query.status === "sucesso" ? "<div style=\"padding:12px;margin-bottom:16px;background:#e8f8ef;color:#16733d;border-radius:8px;font-weight:600\">Informativo enviado com êxito.</div>" : req.query.status === "erro" ? "<div style=\"padding:12px;margin-bottom:16px;background:#fff0f0;color:#a32929;border-radius:8px;font-weight:600\">Não foi possível enviar o informativo.</div>" : ""}<style>.informativo-form{max-width:1600px;display:block!important}.informativo-form textarea{min-height:130px;font-size:15px}.informativo-form input[type=file]{padding:11px;width:100%;box-sizing:border-box}.informativo-clientes{display:grid;grid-template-columns:minmax(300px,1.15fr) 56px minmax(300px,1.15fr) minmax(300px,1fr);gap:18px;align-items:start}.informativo-clientes select{min-height:220px;width:100%;font-size:15px;padding:8px;white-space:nowrap}.informativo-clientes label{display:grid;gap:8px;min-width:0}.informativo-clientes .transferir{display:grid;gap:10px;align-self:center;padding-top:28px}.informativo-clientes .transferir button{width:42px;min-width:42px;height:38px;padding:0;font-size:18px}.informativo-preview{display:flex;flex-wrap:wrap;gap:12px}.informativo-preview img{width:170px;height:115px;object-fit:cover;border-radius:8px;border:1px solid #dbe5f0}.informativo-submit{display:block!important;width:180px!important;min-width:0;height:46px;margin-top:22px}.informativo-preview{margin-top:16px}@media(max-width:800px){.informativo-form{grid-template-columns:1fr}.informativo-clientes{display:grid;grid-template-columns:1fr}.informativo-clientes>label:first-child,.informativo-clientes .transferir,.informativo-clientes>label:last-child,.informativo-upload{grid-column:auto}.informativo-clientes .transferir{grid-template-columns:1fr 1fr}}</style><section class="page-title"><h1>Mensagens informativas</h1><div class="subtitle">Envie orientações com imagens diretamente aos clientes, fora das campanhas.</div></section><section class="panel">${aviso}<form method="post" enctype="multipart/form-data" class="fields informativo-form"><label>Orientação (opcional)<textarea name="texto" placeholder="Digite a orientação que acompanhará a imagem..."></textarea></label><div class="informativo-clientes"><label>Clientes disponíveis<select id="clientes-disponiveis" multiple>${clientes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></label><div class="transferir"><button type="button" class="button" id="cliente-adicionar">→</button><button type="button" class="button" id="cliente-remover">←</button></div><label>Clientes selecionados<select id="clientes-selecionados" name="clientes" multiple></select></label><label class="informativo-upload">Imagens informativas<input id="informativo-imagens" type="file" name="imagens" multiple accept="image/*"></label></div><div id="informativo-preview" class="informativo-preview" aria-live="polite"></div><button class="button primary informativo-submit" type="submit">Enviar informativo</button></form></section><script>(()=>{const d=document.getElementById('clientes-disponiveis'),s=document.getElementById('clientes-selecionados');const mover=(origem,destino)=>{[...origem.selectedOptions].forEach(o=>{destino.appendChild(o);o.selected=destino===s});s.setCustomValidity('');};s.addEventListener('change',()=>s.setCustomValidity(''));document.getElementById('cliente-adicionar')?.addEventListener('click',()=>mover(d,s));document.getElementById('cliente-remover')?.addEventListener('click',()=>mover(s,d));s.form?.addEventListener('submit',(e)=>{if(!s.options.length){e.preventDefault();s.setCustomValidity('Selecione um cliente para enviar o informativo.');s.reportValidity();return;}s.setCustomValidity('');[...s.options].forEach(o=>o.selected=true);});const input=document.getElementById('informativo-imagens'),preview=document.getElementById('informativo-preview');input?.addEventListener('change',()=>{preview.innerHTML='';[...input.files].forEach(file=>{if(!file.type.startsWith('image/'))return;const url=URL.createObjectURL(file);const img=document.createElement('img');img.src=url;img.alt=file.name;img.onload=()=>URL.revokeObjectURL(url);preview.appendChild(img);});});})();</script>`;
        res.send(layout ? layout({ titulo: 'Mensagens informativas', conteudo: conteudo + resumo, ativo: 'mensagens-informativas' }) : conteudo + resumo);
    });
    router.post('/', async (req, res) => {
        try {
            const upload = await lerUploadMultipart(req, { campo: 'imagens', multiplos: true });
            const arquivos = upload.arquivos?.length ? upload.arquivos : [upload];
            const imagens = arquivos.filter(item => item?.buffer).map(item => { validarImagemUpload(item.filename, item.buffer); const nome = `${Date.now()}-${path.basename(item.filename)}`; const arquivo = path.join(pasta, nome); fs.writeFileSync(arquivo, item.buffer); return arquivo; });
            const texto = String(upload?.campos?.texto || '').trim();
            if (!imagens.length) return res.redirect('/mensagens-informativas?status=sem-imagem');
            const ids = (Array.isArray(upload?.campos?.clientes) ? upload.campos.clientes : [upload?.campos?.clientes]).flatMap(valor => String(valor || '').split(',')).map(Number).filter(Boolean);
            const clientes = await listarClientes({ status: 'ativo' });
            const client = getClient();
            if (!client) throw new Error('WhatsApp não está conectado.');
            const enviados = [];
            for (const cliente of clientes.filter(c => ids.includes(Number(c.id)) && !c.whatsappOptOutEm && normalizarTelefone(c.telefone))) {
                const destino = `${normalizarTelefone(cliente.telefone)}@c.us`;
                if (texto) await client.sendMessage(destino, texto);
                for (const arquivo of imagens) await client.sendMessage(destino, MessageMedia.fromFilePath(arquivo));
                enviados.push(cliente.nome);
            }
            const historico = lerHistorico();
            historico.unshift({ timestamp: new Date().toISOString(), data: new Date().toLocaleString('pt-BR'), texto, clientes: enviados, imagens: imagens.map(arquivo => path.basename(arquivo)) });
            fs.writeFileSync(historicoArquivo, JSON.stringify(historico.slice(0, 50), null, 2));
            res.redirect('/mensagens-informativas?status=sucesso');
        } catch (err) { res.redirect('/mensagens-informativas?status=erro'); }
    });
    return router;
}
module.exports = criarMensagensInformativasRoute;
