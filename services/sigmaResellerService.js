const crypto = require('crypto');
const BASE = 'https://auratvpainel.com/api/reseller-api/v1';
const agendas = new Map();
function validarBase(valor) {
    if (String(valor || '').replace(/\/$/, '') !== BASE) throw new Error('Para Aura/Sigma, use https://auratvpainel.com/api/reseller-api/v1.');
    return BASE;
}
class ErroSigma extends Error {
    constructor(mensagem, status = 502) { super(mensagem); this.status = status; }
}
function criarClienteSigma(painel, transporte = fetch) {
    const base = validarBase(painel.apiUrl);
    const token = String(painel.apiToken || '').trim();
    if (!token || /[\r\n]/.test(token)) throw new ErroSigma('Configure o token Aura/Sigma no cadastro do painel.', 400);
    const chave = crypto.createHash('sha256').update(token).digest('hex');
    if (!agendas.has(chave)) {
        if (agendas.size >= 256) throw new ErroSigma('Limite de conexões locais atingido. Tente mais tarde.', 429);
        agendas.set(chave, { fila: Promise.resolve(), proxima: 0 });
    }
    const agenda = agendas.get(chave);
    async function executar(caminho) {
        if (agenda.proxima - Date.now() > 1000) throw new ErroSigma('Aguarde a liberação da cota de consultas do Aura antes de tentar novamente.',429);
        if (Date.now() < agenda.proxima) await new Promise(ok => setTimeout(ok, agenda.proxima - Date.now()));
        agenda.proxima = Date.now() + 600; // Margem abaixo de 120/min; outras aplicações compartilham a cota.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(3, Math.min(60, Number(painel.timeoutSegundos) || 15)) * 1000);
        try {
            const r = await transporte(base + caminho, { method: 'GET', redirect: 'manual', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: controller.signal });
            if (r.status === 429) {
                const segundos = Number(r.headers.get('retry-after'));
                agenda.proxima = Date.now() + Math.max(1000, Math.min(3600000, Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : 60000));
            }
            if (!r.ok) {
                await r.body?.cancel();
                const mensagens = { 401:'Token Aura/Sigma inválido ou expirado.', 402:'API sem assinatura ativa ou operação indisponível por saldo. Confira o Aura.', 403:'Acesso recusado: confira permissões do token, da revenda e restrição de IP.', 404:'Assinatura não encontrada no Aura para esta revenda.', 409:'Usuário ambíguo no Aura. É necessário identificar a assinatura pelo ID.', 429:'Limite de consultas do Aura atingido. Aguarde antes de consultar novamente.' };
                throw new ErroSigma(mensagens[r.status] || `Aura/Sigma indisponível (HTTP ${r.status}).`, r.status);
            }
            if (!(r.headers.get('content-type') || '').toLowerCase().includes('application/json')) { await r.body?.cancel(); throw new ErroSigma('Aura/Sigma retornou uma resposta fora do contrato JSON.'); }
            const reader = r.body?.getReader();
            if (!reader) throw new ErroSigma('Resposta vazia do Aura/Sigma.');
            const partes = []; let tamanho = 0;
            try { while (true) { const { done, value } = await reader.read(); if (done) break; tamanho += value.length; if (tamanho > 512 * 1024) { await reader.cancel(); throw new ErroSigma('Resposta do Aura/Sigma excedeu o limite de consulta.'); } partes.push(Buffer.from(value)); } }
            finally { reader.releaseLock(); }
            let json; try { json = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch (_) { throw new ErroSigma('Resposta JSON inválida do Aura/Sigma.'); }
            if (!json || typeof json !== 'object' || !Object.hasOwn(json, 'data') || json.data === null) throw new ErroSigma('Resposta do Aura/Sigma sem os dados esperados.');
            return json;
        } catch (e) { if (e instanceof ErroSigma) throw e; throw new ErroSigma('Não foi possível consultar o Aura/Sigma. Confira a conexão e tente novamente.'); }
        finally { clearTimeout(timer); }
    }
    function get(caminho) {
        const resultado = agenda.fila.then(() => executar(caminho));
        agenda.fila = resultado.catch(() => {});
        return resultado;
    }
    return {
        perfil: async () => { const { data } = await get('/me'); if (!data.id || !Number.isFinite(data.creditsBalance)) throw new ErroSigma('Perfil Aura/Sigma incompleto.'); return { id:data.id, creditos:data.creditsBalance }; },
        catalogo: async (tipo, pagina = 1) => {
            if (!['servers','packages'].includes(tipo) || !Number.isSafeInteger(Number(pagina)) || Number(pagina) < 1 || Number(pagina) > 10000) throw new ErroSigma('Consulta de catálogo inválida.',400);
            const json = await get(`/${tipo}?page=${Number(pagina)}&per_page=25`);
            if (!Array.isArray(json.data) || !json.meta || !Number.isInteger(json.meta.last_page)) throw new ErroSigma('Paginação Aura/Sigma inválida.');
            const campos = tipo === 'servers' ? ['id','name','type','status','timezone','max_connections'] : ['id','server_id','name','status','is_trial','credits','duration','duration_in','connections'];
            return { itens:json.data.map(item=>Object.fromEntries(campos.map(campo=>[campo,item[campo] ?? null]))), pagina:Number(pagina), ultima:json.meta.last_page };
        },
        assinatura: async usuario => {
            const nome = String(usuario || '').trim();
            if (!nome || nome.length > 200 || /[\x00-\x1f]/.test(nome)) throw new ErroSigma('Informe o usuário exato da assinatura no Aura.',400);
            const { data } = await get('/customers/by-username/' + encodeURIComponent(nome));
            if (!data.id || data.username !== nome) throw new ErroSigma('Aura/Sigma retornou uma assinatura diferente da consultada.');
            return Object.fromEntries(['id','username','status','expires_at','expires_at_tz','server_id','package_id','server','package','connections','is_trial','is_multi_server'].map(campo=>[campo,data[campo] ?? null]));
        }
    };
}
function resultadoConsultaHtml(resultado, escapar) {
    const nomes={id:'Identificador',creditos:'Saldo em créditos',username:'Usuário',status:'Situação',expires_at:'Vencimento informado pelo Aura',expires_at_tz:'Fuso do vencimento',server_id:'ID do servidor',package_id:'ID do pacote',server:'Servidor',package:'Pacote',connections:'Conexões',is_trial:'É teste',is_multi_server:'Múltiplos servidores',name:'Nome',type:'Tipo',timezone:'Fuso horário',max_connections:'Máximo de conexões',credits:'Custo em créditos',duration:'Duração',duration_in:'Unidade da duração'};
    const ficha=item=>`<dl>${Object.entries(item).map(([chave,valor])=>`<div style="margin-bottom:10px;"><dt><strong>${escapar(nomes[chave] || chave)}</strong></dt><dd style="margin:2px 0;overflow-wrap:anywhere;">${escapar(valor===null?'Não informado':String(valor))}</dd></div>`).join('')}</dl>`;
    return resultado.itens ? `<p>Página ${escapar(resultado.pagina)} de ${escapar(resultado.ultima)}. Use o formulário para consultar outras páginas.</p>${resultado.itens.length?resultado.itens.map(item=>`<section style="border-top:1px solid var(--line);padding:12px 0;">${ficha(item)}</section>`).join(''):'<p>Nenhum item nesta página.</p>'}` : ficha(resultado);
}
module.exports = { BASE, validarBase, criarClienteSigma, ErroSigma, resultadoConsultaHtml };
