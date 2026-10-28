function secaoComprovantesPagamento(cliente,pagamento){
    if(!cliente.id||!pagamento.id)return '';
    const base=`/clientes/${Number(cliente.id)}/pagamentos/${Number(pagamento.id)}/comprovantes`;
    return `<section class="panel" id="comprovantes" data-base="${base}" style="margin-top:20px;scroll-margin-top:20px;">
    <h2>Comprovantes deste pagamento</h2>
    <p>Anexe o comprovante recebido no seu celular ou por outro meio. JPG, PNG ou PDF, até 5 MB por arquivo e cinco arquivos por pagamento.</p>
    <p class="helper">Anexar ou remover um comprovante não altera o pagamento, não renova a assinatura e não envia WhatsApp. Os anexos são salvos separadamente do formulário acima.</p>
    <ul id="comprovantes-lista" style="padding-left:22px;"></ul>
    <label for="comprovante-arquivo">Comprovante (opcional)</label>
    <input id="comprovante-arquivo" type="file" accept="image/jpeg,image/png,application/pdf" style="display:block;max-width:100%;margin:10px 0;">
    <button id="comprovante-anexar" class="button secondary" type="button" disabled>Anexar comprovante</button>
    <p id="comprovantes-aviso" role="status" aria-live="polite">Carregando comprovantes...</p>
    <script>(()=>{
        const secao=document.getElementById('comprovantes'),base=secao.dataset.base;
        const lista=document.getElementById('comprovantes-lista'),aviso=document.getElementById('comprovantes-aviso');
        const input=document.getElementById('comprovante-arquivo'),botao=document.getElementById('comprovante-anexar');
        let itens=[],ocupado=false;
        const csrf=()=>document.querySelector('input[name="_csrf"]')?.value||'';
        async function resposta(r){if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.erro||'Não foi possível concluir. Recarregue a página e tente novamente.');}return r.status===204?null:r.json();}
        function desenhar(){
            lista.replaceChildren();
            if(!itens.length){const li=document.createElement('li');li.textContent='Nenhum comprovante anexado.';lista.append(li);}
            itens.forEach((item,i)=>{
                const li=document.createElement('li');li.style.marginBottom='12px';
                const link=document.createElement('a');link.href=base+'/'+item.id;link.target='_blank';link.rel='noopener noreferrer';
                link.textContent='Ver comprovante '+(i+1);link.className='button secondary';li.append(link);
                const info=document.createElement('span');const data=new Date(item.criadoEm.replace(' ','T')+'Z');
                info.textContent=' '+({'image/jpeg':'JPG','image/png':'PNG','application/pdf':'PDF'}[item.tipo]||'Arquivo')+' · '+Math.ceil(item.tamanho/1024)+' KB · '+data.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' ';
                li.append(info);
                const remover=document.createElement('button');remover.type='button';remover.className='button secondary';remover.textContent='Remover comprovante '+(i+1);remover.disabled=ocupado;
                remover.addEventListener('click',async()=>{
                    if(ocupado||!confirm('Remover somente este comprovante? O pagamento e o vencimento serão preservados.'))return;
                    ocupado=true;desenhar();aviso.textContent='Removendo comprovante...';
                    try{await resposta(await fetch(base+'/'+item.id+'/remover',{method:'POST',headers:{'x-csrf-token':csrf()}}));itens=itens.filter(x=>x.id!==item.id);aviso.textContent='Comprovante removido. Pagamento preservado.';}catch(e){aviso.textContent=e.message;}
                    finally{ocupado=false;desenhar();}
                });li.append(remover);lista.append(li);
            });botao.disabled=ocupado||itens.length>=5;
        }
        botao.addEventListener('click',async()=>{
            const arquivo=input.files[0];if(!arquivo){aviso.textContent='Selecione um arquivo.';return;}
            if(!['image/jpeg','image/png','application/pdf'].includes(arquivo.type)||arquivo.size>5*1024*1024||!arquivo.size){aviso.textContent='Selecione JPG, PNG ou PDF de até 5 MB.';return;}
            if(ocupado)return;ocupado=true;desenhar();aviso.textContent='Anexando comprovante...';
            try{const item=await resposta(await fetch(base,{method:'POST',headers:{'content-type':arquivo.type,'x-csrf-token':csrf()},body:arquivo}));if(!itens.some(x=>x.id===item.id))itens.push(item);input.value='';aviso.textContent='Comprovante anexado. Pagamento e vencimento preservados.';}catch(e){aviso.textContent=e.message;}
            finally{ocupado=false;desenhar();}
        });
        fetch(base,{cache:'no-store'}).then(resposta).then(dados=>{itens=dados;desenhar();aviso.textContent='';}).catch(e=>{aviso.textContent=e.message;});
    })();</script></section>`;
}
module.exports={secaoComprovantesPagamento};
