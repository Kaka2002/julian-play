const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/sqlite');
const {
    listarCobrancasManuais,
    registrarComprovanteManual,
    confirmarPagamentoManual,
    estornarPagamentoManual
} = require('../services/pagamentoManualService');

const router = express.Router();
const PASTA_COMPROVANTES = path.join(db.dataDir, 'comprovantes-pagamentos');
const TIPOS = {
    'image/jpeg': { extensao: '.jpg', assinaturas: ['ffd8ff'] },
    'image/png': { extensao: '.png', assinaturas: ['89504e470d0a1a0a'] },
    'application/pdf': { extensao: '.pdf', assinaturas: ['25504446'] }
};

function escapar(valor) {
    return String(valor ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function tipoArquivoValido(buffer, contentType) {
    const regra = TIPOS[contentType];
    if (!regra || !Buffer.isBuffer(buffer) || !buffer.length) return null;
    const inicio = buffer.subarray(0, 16).toString('hex').toLowerCase();
    return regra.assinaturas.some(item => inicio.startsWith(item)) ? regra : null;
}

function statusTexto(status) {
    return {
        aguardando_comprovante: 'Cobrança enviada',
        aguardando_conferencia: 'Aguardando conferência',
        processando_manual: 'Processando',
        erro_renovacao: 'Erro na renovação',
        aprovado: 'Confirmado',
        estornado: 'Estornado'
    }[status] || status;
}

router.get('/', async (req, res, next) => {
    try {
        const status = String(req.query.status || 'todos');
        const cobrancas = await listarCobrancasManuais({ status });
        res.set('Cache-Control', 'no-store');
        return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamentos manuais</title><style>
body{font-family:Arial,sans-serif;background:#f4f6fa;color:#101828;margin:0;padding:24px}.wrap{max-width:1400px;margin:auto}.head,.card{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:20px;margin-bottom:16px}.head{display:flex;justify-content:space-between;gap:16px;align-items:center}.grid{display:grid;gap:16px}.meta{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px}.label{font-size:12px;color:#667085}.value{font-weight:700;margin-top:4px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}input,select,button,a{font:inherit;border-radius:8px;padding:10px 12px}input,select{border:1px solid #d0d5dd}button,a{border:0;text-decoration:none;font-weight:700;cursor:pointer}.primary{background:#2563eb;color:#fff}.danger{background:#dc2626;color:#fff}.secondary{background:#eef2ff;color:#3448a5}.badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eef2ff;font-weight:700;font-size:12px}.warn{background:#fff7ed}.ok{background:#ecfdf3}.error{background:#fef2f2}.helper{color:#667085;font-size:13px}.upload{border:1px dashed #98a2b3;padding:12px;border-radius:8px}@media(max-width:800px){.meta{grid-template-columns:1fr 1fr}.head{align-items:flex-start;flex-direction:column}}</style></head><body><main class="wrap">
<section class="head"><div><h1>Pagamentos manuais</h1><p>Confira a transação dentro do PayPal antes de renovar. A imagem isolada não comprova recebimento.</p></div><div><a class="secondary" href="/financeiro">Voltar ao financeiro</a></div></section>
${req.query.mensagem ? `<section class="card"><strong>${escapar(req.query.mensagem)}</strong></section>` : ''}
<section class="head"><form method="get"><label>Status <select name="status" onchange="this.form.submit()">${['todos','aguardando_comprovante','aguardando_conferencia','aprovado','estornado','erro_renovacao'].map(item => `<option value="${item}" ${item === status ? 'selected' : ''}>${statusTexto(item)}</option>`).join('')}</select></label></form><strong>${cobrancas.length} cobrança(s)</strong></section>
<div class="grid">${cobrancas.map(c => `<article class="card ${c.status === 'aprovado' ? 'ok' : c.status === 'estornado' || c.status === 'erro_renovacao' ? 'error' : 'warn'}">
<span class="badge">${escapar(statusTexto(c.status))}</span><h2>${escapar(c.clienteNome)}</h2>
<div class="meta"><div><div class="label">Referência</div><div class="value">${escapar(c.referencia)}</div></div><div><div class="label">Plano</div><div class="value">${escapar(c.plano)} (${escapar(c.diasContrato)} dias)</div></div><div><div class="label">Valor</div><div class="value">${escapar(c.moeda || 'BRL')} ${escapar(c.valorTotal)}</div></div><div><div class="label">Criada</div><div class="value">${escapar(c.criadoEm)}</div></div></div>
${c.comprovanteArquivo ? `<p><a class="secondary" target="_blank" href="/pagamentos-manuais/${c.id}/comprovante">Abrir comprovante</a></p>` : `<div class="upload"><input id="arquivo-${c.id}" type="file" accept="image/jpeg,image/png,application/pdf"><button class="secondary" type="button" onclick="enviarArquivo(${c.id})">Anexar comprovante</button> <span id="upload-${c.id}" class="helper"></span></div>`}
${['aguardando_comprovante','aguardando_conferencia','erro_renovacao'].includes(c.status) ? `<form class="actions" method="post" action="/pagamentos-manuais/${c.id}/confirmar" onsubmit="return confirm('Você conferiu valor, moeda e identificador diretamente no PayPal?')"><input name="identificadorManual" required maxlength="120" placeholder="ID da transação PayPal"><button class="primary" type="submit">Confirmar e renovar</button></form>` : ''}
${c.status === 'aprovado' ? `<div class="meta"><div><div class="label">Conferido por</div><div class="value">${escapar(c.conferidoPor)}</div></div><div><div class="label">Transação</div><div class="value">${escapar(c.identificadorManual)}</div></div><div><div class="label">Vencimento anterior</div><div class="value">${escapar(c.vencimentoAnterior)}</div></div><div><div class="label">Novo vencimento</div><div class="value">${escapar(c.vencimentoNovo)}</div></div></div><form class="actions" method="post" action="/pagamentos-manuais/${c.id}/estornar" onsubmit="return confirm('Registrar estorno? O acesso não será reduzido automaticamente.')"><input name="motivo" required minlength="5" maxlength="300" placeholder="Motivo do estorno"><button class="danger" type="submit">Registrar estorno</button></form>` : ''}
${c.status === 'estornado' ? `<p><strong>Estornado por ${escapar(c.estornadoPor)}:</strong> ${escapar(c.motivoEstorno)}</p>` : ''}${c.erro ? `<p class="error">${escapar(c.erro)}</p>` : ''}</article>`).join('') || '<section class="card">Nenhuma cobrança manual encontrada.</section>'}</div>
</main><script>
async function enviarArquivo(id){const input=document.getElementById('arquivo-'+id);const aviso=document.getElementById('upload-'+id);if(!input.files[0]){aviso.textContent='Selecione um arquivo.';return}aviso.textContent='Enviando...';const csrf=document.querySelector('input[name="_csrf"]')?.value||'';const r=await fetch('/pagamentos-manuais/'+id+'/comprovante',{method:'POST',headers:{'content-type':input.files[0].type,'x-csrf-token':csrf},body:input.files[0]});if(!r.ok){aviso.textContent=await r.text();return}location.reload()}
</script></body></html>`);
    } catch (err) {
        next(err);
    }
});

router.post('/:id/comprovante', express.raw({ type: ['image/jpeg', 'image/png', 'application/pdf'], limit: '5mb' }), async (req, res, next) => {
    try {
        const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
        const regra = tipoArquivoValido(req.body, contentType);
        if (!regra) return res.status(415).send('Envie JPG, PNG ou PDF válido.');
        fs.mkdirSync(PASTA_COMPROVANTES, { recursive: true });
        const nome = `${Number(req.params.id)}-${crypto.randomBytes(12).toString('hex')}${regra.extensao}`;
        const arquivo = path.join(PASTA_COMPROVANTES, nome);
        await fs.promises.writeFile(arquivo, req.body, { flag: 'wx' });
        try {
            await registrarComprovanteManual(req.params.id, nome);
        } catch (err) {
            await fs.promises.unlink(arquivo).catch(() => {});
            throw err;
        }
        return res.status(204).end();
    } catch (err) {
        next(err);
    }
});

router.get('/:id/comprovante', async (req, res, next) => {
    try {
        const cobrancas = await listarCobrancasManuais({ status: 'todos' });
        const cobranca = cobrancas.find(item => Number(item.id) === Number(req.params.id));
        if (!cobranca?.comprovanteArquivo) return res.status(404).send('Comprovante não encontrado.');
        const arquivo = path.resolve(PASTA_COMPROVANTES, path.basename(cobranca.comprovanteArquivo));
        if (!arquivo.startsWith(path.resolve(PASTA_COMPROVANTES) + path.sep)) return res.status(400).send('Arquivo inválido.');
        return res.sendFile(arquivo);
    } catch (err) {
        next(err);
    }
});

router.post('/:id/confirmar', async (req, res) => {
    try {
        const resultado = await confirmarPagamentoManual(req.params.id, {
            identificadorManual: req.body.identificadorManual,
            conferidoPor: req.usuarioPainel
        });
        const mensagem = resultado.duplicado ? 'Pagamento já estava confirmado.' : 'Pagamento confirmado e cliente renovado.';
        return res.redirect(`/pagamentos-manuais?mensagem=${encodeURIComponent(mensagem)}`);
    } catch (err) {
        return res.redirect(`/pagamentos-manuais?mensagem=${encodeURIComponent(err.message)}`);
    }
});

router.post('/:id/estornar', async (req, res) => {
    try {
        await estornarPagamentoManual(req.params.id, {
            motivo: req.body.motivo,
            estornadoPor: req.usuarioPainel
        });
        return res.redirect('/pagamentos-manuais?status=estornado');
    } catch (err) {
        return res.redirect(`/pagamentos-manuais?mensagem=${encodeURIComponent(err.message)}`);
    }
});

module.exports = router;
