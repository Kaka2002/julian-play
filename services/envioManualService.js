function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function telaEnvioManual(cliente, mensagem) {
    const telefone = String(cliente.telefone || '').replace(/\D/g, '');
    const link = /^\d{10,15}$/.test(telefone)
        ? `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}` : '';
    return `<section class="panel" style="padding:24px">
        <h1>Envio manual pelo seu WhatsApp</h1>
        <p>Confira a mensagem de ${escapar(cliente.nome)}. Abra o WhatsApp e toque em Enviar. O sistema não confirma a entrega deste envio.</p>
        <label for="mensagem-manual">Mensagem pronta</label>
        <textarea id="mensagem-manual" readonly rows="14" style="width:100%">${escapar(mensagem)}</textarea>
        <div class="actions" style="margin-top:16px;flex-wrap:wrap">
            <button class="button" type="button" id="copiar-mensagem-manual">Copiar mensagem</button>
            ${link ? `<a class="button green" target="_blank" rel="noopener noreferrer" href="${escapar(link)}">Abrir WhatsApp com mensagem</a>` : '<p>Cadastre o telefone com código do país e DDD para abrir a conversa.</p>'}
            <a class="button secondary" href="/clientes/${escapar(cliente.id)}/editar">Voltar ao cliente</a>
        </div>
        <p id="resultado-copia" role="status"></p>
        <script>
        document.getElementById('copiar-mensagem-manual').addEventListener('click', async function () {
            const campo = document.getElementById('mensagem-manual');
            const aviso = document.getElementById('resultado-copia');
            try {
                if (!navigator.clipboard) throw new Error('clipboard');
                await navigator.clipboard.writeText(campo.value);
                aviso.textContent = 'Mensagem copiada.';
            } catch (_) {
                campo.focus(); campo.select();
                aviso.textContent = 'Texto selecionado. Use Ctrl+C ou a opção Copiar do aparelho.';
            }
        });
        </script>
    </section>`;
}

module.exports = { telaEnvioManual };
