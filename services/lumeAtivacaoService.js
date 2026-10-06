const fs = require('fs');
const path = require('path');
const ORIGIN = 'https://ativacao.julianplay.com.br';
const REF = /^[a-f0-9]{48}$/;

function validarConfig(config) {
    return config?.enabled === true && config.site === ORIGIN &&
        /^[a-f0-9]{64}$/.test(config.token || '') && config.sender === '5511925716232';
}
function validarAviso(job) {
    if (!job || !REF.test(job.reference || '') || !REF.test(job.receipt || '') ||
        !/^55[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(job.phone || '') ||
        !/^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$/.test(job.mac || '') ||
        !['annual', 'lifetime', 'trial'].includes(job.plan) ||
        (job.plan === 'trial' && job.test !== true) ||
        (job.test === true && job.plan !== 'trial') ||
        (job.plan !== 'lifetime' && (!Number.isSafeInteger(job.expires) || job.expires <= 0)) ||
        (job.plan === 'lifetime' && job.expires !== null)) throw new Error('Aviso invalido.');
}
function mensagem(job) {
    validarAviso(job);
    const validade = job.expires === null ? 'Sem vencimento' : new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'
    }).format(new Date(job.expires * 1000));
    if (job.test === true) return `TESTE de notificacao do Lume Player.\n\nAparelho (MAC): ${job.mac}\nSeu periodo gratuito continua ate ${validade}.\nNenhum pagamento foi realizado e sua licenca nao foi alterada.\n\nEste envio verifica a integracao automatica pelo WhatsApp.\nSuporte: https://wa.me/5511925716232`;
    return `Pagamento confirmado! Seu Lume Player esta ativo.\n\nPlano: ${job.plan === 'annual' ? 'Anual' : 'Vitalicio'}\nAparelho (MAC): ${job.mac}\nValidade: ${validade}\nPedido: ${job.reference}\n\nAbra o aplicativo e selecione Consultar ativacao. A licenca nao inclui canais ou listas de provedor.\nSuporte: https://wa.me/5511925716232`;
}
function criarConsumidor({ dataDir, config, getClient, getStatusWhatsApp, enfileirarEnvio, fetchFn = fetch, administrador = () => false, registrarEnvioDoRobo = () => {}, registrarMensagemDoRobo = () => {} }) {
    let ocupado = false;
    async function api(action, body) {
        const response = await fetchFn(`${ORIGIN}/notifications/whatsapp/${action}`, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('Integracao indisponivel.');
        const raw = await response.text();
        if (raw.length > 16384) throw new Error('Resposta invalida.');
        return JSON.parse(raw);
    }
    async function executar() {
        if (ocupado || !administrador() || !validarConfig(config) || !getStatusWhatsApp().conectado) return;
        const client = getClient();
        if (String(client?.info?.wid?.user || '').split(':')[0] !== config.sender) return;
        ocupado = true;
        try {
            const { job } = await api('claim', {});
            if (!job) return;
            validarAviso(job);
            const dir = path.join(dataDir, '.lume-whatsapp-envios');
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            const file = path.join(dir, `${job.reference}.json`);
            let result;
            if (fs.existsSync(file)) {
                const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
                result = saved.result === 'sent' ? 'sent' : 'uncertain';
            } else {
                const destino = await client.getNumberId(job.phone);
                if (!destino) result = 'not_registered';
                else {
                    const to = destino._serialized;
                    // Only accept the identifier returned by the phone lookup. A LID is
                    // an opaque WhatsApp identifier, never a telephone to normalize.
                    if (!/^(?:55[0-9]{10,11}@c\.us|[0-9]{5,20}@lid)$/.test(to || '')) throw new Error('Destino invalido.');
                    // Exclusive creation protects even two overlapping processes. No recipient in this journal.
                    try { fs.writeFileSync(file, JSON.stringify({ result: 'reserved' }), { flag: 'wx', mode: 0o600 }); }
                    catch (error) { if (error.code === 'EEXIST') return; throw error; }
                    let iniciou = false;
                    try {
                        const enviada = await enfileirarEnvio(async () => {
                            if (!getStatusWhatsApp().conectado || getClient() !== client || String(client.info?.wid?.user || '').split(':')[0] !== config.sender) throw new Error('Conexao indisponivel.');
                            try { await (await client.getChatById(to)).sendStateTyping(); } catch (_) { /* Cosmetic only. */ }
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            const texto = mensagem(job);
                            registrarEnvioDoRobo(to, texto);
                            iniciou = true;
                            const enviada = await client.sendMessage(to, texto);
                            registrarMensagemDoRobo(enviada);
                            return enviada;
                        }, 'Confirmacao de ativacao Lume Player', { proativo: true });
                        result = enviada?.id?._serialized ? 'sent' : 'uncertain';
                        fs.writeFileSync(file, JSON.stringify({ result }), { mode: 0o600 });
                    } catch (_) {
                        if (!iniciou) { fs.unlinkSync(file); result = 'deferred'; }
                        else { result = 'uncertain'; fs.writeFileSync(file, JSON.stringify({ result }), { mode: 0o600 }); }
                    }
                }
            }
            await api('ack', { reference: job.reference, receipt: job.receipt, result });
        } finally { ocupado = false; }
    }
    return { executar };
}
function iniciarAvisosLume({ dataDir, getClient, getStatusWhatsApp }) {
    const file = path.join(dataDir, '.lume-whatsapp.json');
    if (!fs.existsSync(file)) return;
    let config;
    try { config = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch (_) { console.log('[lume] Configuracao indisponivel.'); return; }
    const { instalacaoAdministrador } = require('./licencaService');
    if (!instalacaoAdministrador() || !validarConfig(config)) return;
    const { enfileirarEnvio } = require('./filaMensagensService');
    const { registrarEnvioDoRobo, registrarMensagemDoRobo } = require('./mensagensPropriasService');
    const consumer = criarConsumidor({ dataDir, config, getClient, getStatusWhatsApp, enfileirarEnvio, administrador: instalacaoAdministrador, registrarEnvioDoRobo, registrarMensagemDoRobo });
    const tick = () => consumer.executar().catch(() => console.log('[lume] Aviso pendente; confira conexao e integracao.'));
    const initial = setTimeout(tick, 20000); initial.unref?.();
    const timer = setInterval(tick, 60000); timer.unref?.();
    console.log('[lume] Consulta de avisos de ativacao habilitada.');
    return timer;
}
module.exports = { criarConsumidor, iniciarAvisosLume, validarConfig, validarAviso, mensagem };
