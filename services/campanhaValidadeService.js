const db=require('../database/sqlite');
const REGRAS={campanha_amizade_presente:{titulo:'Amizade que vale presente — 1 mês',meses:1,indicados:1,pagamentos:1},campanha_indique_ganhe_tres_meses:{titulo:'Indique e ganhe 3 meses — 3 meses',meses:3,indicados:2,pagamentos:2}};
async function conexao(){await db.ready;const sqlite=require('sqlite3');const c=await new Promise((ok,no)=>{const b=new sqlite.Database(db.dbPath,e=>e?no(e):ok(b));});c.configure('busyTimeout',5000);return {run:(s,p=[])=>new Promise((ok,no)=>c.run(s,p,function(e){e?no(e):ok({id:this.lastID,changes:this.changes});})),all:(s,p=[])=>new Promise((ok,no)=>c.all(s,p,(e,r)=>e?no(e):ok(r))),close:()=>new Promise(ok=>c.close(ok))};}
async function encerrar(c,agora=new Date().toISOString()){
    await c.run(`UPDATE indicacao_campanhas SET status='encerrada',encerradaEm=? WHERE status='ativa' AND validadeEm IS NOT NULL AND validadeEm<=?`,[agora,agora]);
    await c.run(`UPDATE modelos_mensagem SET ativo=0 WHERE plano='campanha' AND campanhaEdicaoId IN (SELECT id FROM indicacao_campanhas WHERE status='encerrada')`);
    await c.run(`UPDATE programa_indicacoes SET status='expirada',atualizadoEm=CURRENT_TIMESTAMP WHERE status IN ('ativa','aguardando_assinatura') AND campanhaEdicaoId IN (SELECT id FROM indicacao_campanhas WHERE status='encerrada')`);
}
async function campanhaAtiva(){await db.ready;const all=(s,p=[])=>new Promise((ok,no)=>db.all(s,p,(e,r)=>e?no(e):ok(r)));const vencidas=await all("SELECT 1 FROM indicacao_campanhas WHERE status='ativa' AND validadeEm<=? LIMIT 1",[new Date().toISOString()]);if(vencidas.length){const c=await conexao();try{await c.run('BEGIN IMMEDIATE');await encerrar(c);await c.run('COMMIT');}catch(e){await c.run('ROLLBACK').catch(()=>{});throw e;}finally{await c.close();}}const rows=await all(`SELECT e.*,e.modeloChave AS chave FROM indicacao_campanhas e JOIN modelos_mensagem m ON m.campanhaEdicaoId=e.id WHERE m.plano='campanha' AND m.ativo=1 AND e.status='ativa' AND e.validadeEm>?`,[new Date().toISOString()]);return rows.length===1?rows[0]:null;}
function dataValidade(valor){const s=String(valor||'').trim();if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))throw new Error('Informe a validade da campanha (horário de Brasília).');const d=new Date(s+':00-03:00');if(!Number.isFinite(d.getTime())||d.getTime()<=Date.now()||entradaValidade(d.toISOString())!==s)throw new Error('A validade da campanha deve estar no futuro.');return d.toISOString();}
async function salvarCampanhaModelo(dados){
    const c=await conexao();try{await c.run('BEGIN IMMEDIATE');await encerrar(c);
        const [modelo]=await c.all('SELECT * FROM modelos_mensagem WHERE id=?',[dados.id]);
        if(!modelo||!REGRAS[modelo.chave])throw new Error('Edite um dos modelos de indicação disponíveis para configurar a campanha.');
        const ativo=String(dados.ativo)!=='0';const regra=REGRAS[modelo.chave];let edicao=modelo.campanhaEdicaoId;
        if(ativo){const validade=dataValidade(dados.campanhaValidadeEm);const [atual]=await c.all('SELECT * FROM indicacao_campanhas WHERE id=?',[edicao]);
            await c.run(`UPDATE indicacao_campanhas SET status='encerrada',encerradaEm=? WHERE status IN ('ativa','legada') AND id<>?`,[new Date().toISOString(),edicao||0]);
            if(!atual||!(atual.status==='ativa'||atual.status==='legada'&&Number(modelo.ativo)===1)){
                const r=await c.run(`INSERT INTO indicacao_campanhas(modeloChave,titulo,meses,indicados,pagamentos,validadeEm) VALUES(?,?,?,?,?,?)`,[modelo.chave,regra.titulo,regra.meses,regra.indicados,regra.pagamentos,validade]);edicao=r.id;
            }else await c.run("UPDATE indicacao_campanhas SET validadeEm=?,status='ativa' WHERE id=?",[validade,edicao]);
            await c.run("UPDATE modelos_mensagem SET ativo=0 WHERE plano='campanha' AND id<>?",[modelo.id]);
        }else if(edicao)await c.run("UPDATE indicacao_campanhas SET status='encerrada',encerradaEm=? WHERE id=? AND status IN ('ativa','legada')",[new Date().toISOString(),edicao]);
        await encerrar(c);
        await c.run('UPDATE modelos_mensagem SET titulo=?,texto=?,cor=?,ativo=?,campanhaEdicaoId=?,atualizadoEm=CURRENT_TIMESTAMP WHERE id=?',[dados.titulo,dados.texto,dados.cor||'blue',ativo?1:0,edicao,modelo.id]);
        await c.run('COMMIT');return {...modelo,...dados,campanhaEdicaoId:edicao};
    }catch(e){await c.run('ROLLBACK').catch(()=>{});throw e;}finally{await c.close();}
}
async function exigirCampanhaAtiva(edicaoId){const e=await campanhaAtiva();if(!e||edicaoId&&Number(edicaoId)!==Number(e.id))throw new Error('Nenhuma campanha de indicação vigente. Defina a validade e ative uma campanha em Modelos.');return e;}
function entradaValidade(iso){if(!iso||!Number.isFinite(new Date(iso).getTime()))return '';const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
function telefoneCampanha(valor){const n=String(valor||'').replace(/\D/g,'');return n.length===10||n.length===11?'55'+n:n;}
async function enviarUnico(edicaoId,telefone,envio){
    const destino=telefoneCampanha(telefone);if(!/^\d{10,15}$/.test(destino))throw new Error('Telefone inválido para campanha.');
    const c=await conexao();try{await c.run('BEGIN IMMEDIATE');await encerrar(c);
        const [e]=await c.all("SELECT e.id FROM indicacao_campanhas e JOIN modelos_mensagem m ON m.campanhaEdicaoId=e.id WHERE e.id=? AND e.status='ativa' AND m.ativo=1 AND e.validadeEm>?",[edicaoId,new Date().toISOString()]);
        if(!e)throw new Error('Campanha encerrada ou substituída. Nenhuma mensagem enviada.');
        const r=await c.run("INSERT OR IGNORE INTO campanha_destinatarios(campanhaEdicaoId,telefone,estado) VALUES(?,?,'reservado')",[edicaoId,destino]);
        if(!r.changes)throw new Error('Este celular já recebeu ou tem um envio reservado nesta edição da campanha.');
        await c.run('COMMIT');
    }catch(e){await c.run('ROLLBACK').catch(()=>{});throw e;}finally{await c.close();}
    try{const resultado=await envio();await new Promise((ok,no)=>db.run("UPDATE campanha_destinatarios SET estado='enviado' WHERE campanhaEdicaoId=? AND telefone=?",[edicaoId,destino],e=>e?no(e):ok()));return resultado;}
    catch(e){await new Promise(ok=>db.run("UPDATE campanha_destinatarios SET estado='incerto' WHERE campanhaEdicaoId=? AND telefone=?",[edicaoId,destino],()=>ok()));throw e;}
}
async function jaRecebeu(edicaoId,telefone){await db.ready;return new Promise((ok,no)=>db.get('SELECT 1 FROM campanha_destinatarios WHERE campanhaEdicaoId=? AND telefone=?',[edicaoId,telefoneCampanha(telefone)],(e,r)=>e?no(e):ok(Boolean(r))));}
module.exports={jaRecebeu,REGRAS,campanhaAtiva,salvarCampanhaModelo,exigirCampanhaAtiva,dataValidade,encerrar,entradaValidade,telefoneCampanha,enviarUnico};
