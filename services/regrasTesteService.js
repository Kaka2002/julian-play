const DURACOES = new Set(['30 minutos', '01 hora', '02 horas', '03 horas', '04 horas', '06 horas', '12 horas', '15 horas', '24 horas']);
function emTeste(plano) { return /teste/i.test(String(plano || '')); }
function horarioSaoPaulo(agora) {
 const partes = new Intl.DateTimeFormat('sv-SE', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(agora);
 const p = Object.fromEntries(partes.map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
}
function prepararPeriodoTeste(cliente, existente = null, agora = new Date()) {
 if (emTeste(cliente.plano) && cliente.status === 'ativo' && (!existente?.dataInicio || !existente?.horasTeste)) cliente.status = 'pendente';
 if (cliente.status === 'pendente' && emTeste(cliente.plano)) {
  cliente.dataInicio = ''; cliente.dataVencimento = ''; cliente.vencimento = ''; cliente.horasTeste = ''; return;
 }
 if (cliente.status !== 'teste') return;
 if (!DURACOES.has(cliente.horasTeste)) throw new Error('Selecione as horas de teste antes de iniciar.');
 const iniciando = !existente || existente.status !== 'teste' || !existente.horasTeste || !existente.dataInicio;
 const inicio = iniciando ? horarioSaoPaulo(agora) : cliente.dataInicio;
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio)) throw new Error('Informe uma data de início válida para o teste.');
 const base = new Date(inicio+':00Z');
 if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0,16)!==inicio) throw new Error('Data de início inválida.');
 const numero = Number(cliente.horasTeste.match(/\d+/)[0]);
 const minutos = cliente.horasTeste.includes('minuto') ? numero : numero*60;
 cliente.dataInicio=inicio;
 cliente.dataVencimento=new Date(base.getTime()+minutos*60000).toISOString().slice(0,16);
 cliente.vencimento=cliente.dataVencimento.slice(0,10);
}
module.exports={prepararPeriodoTeste};
