# Contexto permanente do projeto Julian Play

Este arquivo fica no repositório para sobreviver à exclusão de
`C:\Users\carlo\.codex`. Uma nova sessão do Codex deve ler primeiro:

1. `AGENTS.md`;
2. este arquivo;
3. `git status` e os últimos commits antes de alterar qualquer coisa.

Não registrar aqui senhas, tokens, chaves PIX, cookies ou credenciais.

## Objetivo do sistema

O Julian Play é um sistema de administração de clientes, automação de
WhatsApp, cobranças PIX e instalações comerciais isoladas. O mesmo código
suporta:

- Painel Mestre;
- painel administrador de clientes;
- clientes comerciais provisionados no servidor;
- instalação local no computador do cliente.

As regras técnicas e de entrega obrigatórias estão em `AGENTS.md`.

## Estrutura principal

### Repositório de desenvolvimento

- Caminho: `D:\julian-play`
- Branch de produção: `main`
- Repositório remoto: `origin`
- Entrega local: `entrega-cliente-local\ENVIAR_AO_CLIENTE`
- Gerador do aplicativo local:
  `entrega-cliente-local\USO_INTERNO_NAO_ENVIAR\CRIAR-PACOTE-APP.ps1`

### Servidor Windows

- Código: `C:\bots\julian-play`
- Dados do administrador: `C:\bots\julian-play`
- Banco do administrador: `C:\bots\julian-play\clientes.db`
- Dados do Painel Mestre: `C:\JulianPlayMaster`
- Banco mestre: `C:\JulianPlayMaster\master.db`
- Instalações comerciais: `C:\JulianPlayClientes\<cliente>`
- Dados AMPLAYTV: `C:\JulianPlayClientes\amplaytv`

Cada instalação deve manter banco, configuração, backup, sessão do WhatsApp,
porta e processo PM2 próprios.

## Estado operacional confirmado em 26/07/2026

### Processos do servidor

| Processo | Porta | Estado desejado |
|---|---:|---|
| `julian-play` | 10000 | online |
| `julian-master` | 9000 | online |
| `julian-amplaytv` | 11004 | parado enquanto a cliente usa a instalação local |
| `caddy` | — | parado; não é mais usado |
| `pm2-logrotate` | — | online |

O WhatsApp do processo `julian-play` foi confirmado como conectado depois da
restauração. O AMPLAYTV no servidor permaneceu parado para evitar duas sessões
do mesmo WhatsApp.

### Cloudflare de produção

- Nameservers:
  - `brady.ns.cloudflare.com`
  - `chloe.ns.cloudflare.com`
- Serviço Windows: `Cloudflared`, inicialização `Automatic`
- Executável:
  `C:\Program Files (x86)\cloudflared\cloudflared.exe`
- Versão conferida: `2026.7.3`
- Túnel ativo: `julian-play-servidor`
- ID do túnel: `a2254c5a-b366-41d0-968b-bbb0dd915616`
- Destino DNS do túnel:
  `a2254c5a-b366-41d0-968b-bbb0dd915616.cfargotunnel.com`

Rotas de produção:

| Endereço | Serviço |
|---|---|
| `painel.julianplay.com.br` | `http://127.0.0.1:10000` |
| `gestao.julianplay.com.br` | `http://127.0.0.1:9000` |

Os dois registros DNS são CNAME, com proxy habilitado. Os dois endereços HTTPS
foram verificados retornando redirecionamento `302` para a tela de login.

O Caddy foi substituído nessas rotas pelo Cloudflare Tunnel e deve permanecer
parado.

### Túnel residencial de contingência

- Nome: `julian-play-casa`
- Deve ser mantido para contingência.
- As rotas podem ficar cadastradas no túnel, mas os DNS públicos
  `painel` e `gestao` devem apontar para apenas um túnel por vez.
- Nunca iniciar no servidor e em casa a mesma sessão do WhatsApp ao mesmo
  tempo.

### Computador local

- Código/repositório: `D:\julian-play`
- Instalação local independente já existente:
  - processo `julian-play-cliente`
  - porta 10000
  - dados `C:\JulianPlay\dados`
- Cópias migradas para contingência:
  - `julian-play-admin`, porta 10001: parada;
  - `julian-master`, porta 9000: parada;
  - `julian-amplaytv`, porta 11004: parada.

Não parar `julian-play-cliente` ao alternar a infraestrutura migrada: essa é
uma instalação local independente.

Foi criado o ponto de restauração do Windows:

- sequência 118;
- descrição `Antes da migracao Julian Play`;
- data 25/07/2026 14:49:16.

## Histórico resumido da migração

1. As instalações do servidor foram exportadas para o computador local.
2. Os arquivos foram validados por SHA-256.
3. Os bancos SQLite foram validados com `PRAGMA quick_check`.
4. Administrador e Painel Mestre chegaram a operar localmente pelas portas
   10001 e 9000.
5. Foi criado o túnel `julian-play-casa` e os acessos HTTPS foram testados.
6. Os dados atualizados do administrador e do Painel Mestre foram devolvidos
   ao servidor.
7. AMPLAYTV não foi sobrescrito no servidor porque não havia mudado e a cliente
   continuou usando a instalação local.
8. Foi criado o túnel `julian-play-servidor`, os DNS foram direcionados para
   ele e o Caddy foi parado.

Hashes registrados durante o retorno:

| Artefato | SHA-256 |
|---|---|
| administrador | `677B55CBEBD607F803D7154E52BD6BAD4D78D4EF856B3066FEA637A4E679078E` |
| Painel Mestre | `039B6B7C3325E9E98BCA049DABC317100A1C45BE1191A2FE1A38C45D45775B0C` |
| AMPLAYTV local | `C9BA2C7A20ECC071D8B2F65562FB4B465D0C7D00AF01150CCC8341F9810FC4B6` |

O servidor manteve cópias de segurança em
`C:\MigracaoJulianPlay\AntesRetorno-20260726-112939`. Não apagar sem confirmar
que existe cópia íntegra fora do servidor.

## Alternância servidor/casa

### Colocar o servidor em produção

1. Parar no computador local somente `julian-play-admin`, `julian-master` e
   `julian-amplaytv`.
2. Confirmar no servidor `julian-play` e `julian-master` online.
3. Iniciar clientes comerciais do servidor apenas quando não estiverem
   funcionando localmente.
4. Confirmar o serviço `Cloudflared` do servidor em execução.
5. Direcionar os CNAMEs `painel` e `gestao` para o túnel
   `julian-play-servidor`.
6. Testar os dois endereços HTTPS.

### Colocar a casa em produção

1. Fazer backup e migrar para casa os dados mais recentes.
2. Parar no servidor os processos equivalentes antes de iniciar os locais.
3. Parar o `Cloudflared` do servidor ou deixar seu túnel sem os DNS públicos.
4. Iniciar os processos locais migrados.
5. Confirmar o `Cloudflared` residencial.
6. Direcionar os CNAMEs `painel` e `gestao` para o túnel
   `julian-play-casa`.
7. Testar HTTPS, login, banco e WhatsApp.

Não é possível manter dois CNAMEs de mesmo nome ativos apontando ao mesmo tempo
para os dois túneis. A troca de ambiente é feita alterando o destino do CNAME.

## Comandos de diagnóstico

No servidor:

```powershell
pm2.cmd status
Get-Service Cloudflared | Select-Object Name,Status,StartType
Get-NetTCPConnection -State Listen -LocalPort 9000,10000,11004 -ErrorAction SilentlyContinue
Invoke-WebRequest "https://painel.julianplay.com.br" -UseBasicParsing -MaximumRedirection 0
Invoke-WebRequest "https://gestao.julianplay.com.br" -UseBasicParsing -MaximumRedirection 0
Get-PSDrive C
```

Logs:

```powershell
pm2.cmd logs julian-play --lines 100 --nostream
pm2.cmd logs julian-master --lines 100 --nostream
pm2.cmd logs julian-amplaytv --lines 100 --nostream
```

Validação de banco:

```powershell
cd C:\bots\julian-play
node.exe -e "const sqlite3=require('sqlite3').verbose();const db=new sqlite3.Database('C:/bots/julian-play/clientes.db');db.get('PRAGMA quick_check',[],(e,r)=>{console.log(e||r);db.close();if(e||Object.values(r)[0]!=='ok')process.exitCode=1})"
node.exe -e "const sqlite3=require('sqlite3').verbose();const db=new sqlite3.Database('C:/JulianPlayMaster/master.db');db.get('PRAGMA quick_check',[],(e,r)=>{console.log(e||r);db.close();if(e||Object.values(r)[0]!=='ok')process.exitCode=1})"
```

## Melhorias acumuladas no projeto

Esta lista resume alterações trabalhadas no projeto. Antes de modificar uma
delas, confirmar o estado real no código e nos testes:

- novas instalações com nome da empresa, imagens e PIX vazios;
- separação entre servidor e instalação local;
- controles de WhatsApp centralizados no Painel Mestre;
- confirmação automática do PIX pelo Mercado Pago, com webhook no servidor e
  consulta periódica na instalação local;
- aviso de PIX confirmado no painel e no WhatsApp de controle;
- envio do PIX correspondente ao plano após aviso de vencimento, com instrução
  para digitar `planos`;
- melhoria visual da tela de envio manual de modelos;
- modo de proteção do WhatsApp;
- Central de Saúde no Painel Mestre;
- testes automáticos executáveis por `npm.cmd test`;
- reforço de autenticação, sessão, auditoria e proteção de segredos;
- backups verificáveis com integridade e hash;
- instalador/atualizador local e botões locais de reiniciar/parar o robô;
- política para não versionar ZIPs gerados e manter hash dos artefatos.

## Cuidados importantes

- Nunca copiar a sessão de WhatsApp enquanto o processo correspondente estiver
  em execução.
- Nunca rodar a mesma sessão do WhatsApp em duas máquinas.
- Não apagar bancos, `.wwebjs_auth`, configurações ou backups atuais em
  limpezas de disco.
- O servidor tinha aproximadamente 4,7 a 4,9 GB livres e 4 GB de RAM. Limpar
  somente temporários, logs rotacionados e ZIPs antigos já copiados.
- Não usar `npm audit fix --force` sem revisão.
- Não incluir tokens de túnel ou outras credenciais em commits.
- Tokens que apareceram em telas ou conversas devem ser rotacionados.

## Como iniciar uma nova sessão do Codex

Enviar:

> Leia `D:\julian-play\AGENTS.md` e
> `D:\julian-play\CONTEXTO-PARA-CODEX.md` por completo. Depois confira
> `git status`, o código e o estado atual antes de continuar.

Ao concluir uma mudança importante de infraestrutura, arquitetura, entrega ou
operação, atualizar este arquivo sem registrar segredos.
