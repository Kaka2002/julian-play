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
| `amplaytv.julianplay.com.br` | `http://127.0.0.1:11004` |

As rotas sao publicadas pelo tunel com proxy habilitado. `painel` e `gestao`
foram verificados retornando redirecionamento `302` para a tela de login. A
rota `amplaytv` esta preparada, mas somente respondera normalmente quando o
processo `julian-amplaytv` for iniciado depois de parar e sincronizar a
instalacao local da cliente.

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
- opção adicional de pagamento PayPal nas renovações, cobrando em `BRL` o
  mesmo valor do plano, com link no WhatsApp, retorno HTTPS, webhook e
  renovação idempotente;
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
# Marco operacional de 26/07/2026 — migração, Cloudflare e servidor

Este registro deve ser lido antes de qualquer nova alteração, especialmente
depois da exclusão ou recriação da pasta local do Codex.

## Estado atual em produção

- O ambiente ativo está novamente no servidor Windows, com código em
  `C:\bots\julian-play`.
- `julian-play` está online no PM2, usando a porta `10000`.
- `julian-master` está online no PM2, usando a porta `9000`.
- `julian-amplaytv` permanece parado no servidor porque essa cliente está
  usando sua instalação local. Não iniciar simultaneamente a sessão do
  WhatsApp da cliente no servidor e na máquina local.
- Caddy deixou de ser utilizado: o processo foi removido do PM2 e o estado foi
  salvo com `pm2.cmd save --force`.
- `pm2-logrotate` permanece online.

## Cloudflare

- O domínio `julianplay.com.br` usa os nameservers da Cloudflare.
- Existe um túnel da máquina de casa, chamado `julian-play-casa`, mantido para
  contingência.
- Existe um túnel do servidor, chamado `julian-play-servidor`, atualmente
  saudável e ativo.
- No túnel do servidor:
  - `painel.julianplay.com.br` aponta para `http://127.0.0.1:10000`;
  - `gestao.julianplay.com.br` aponta para `http://127.0.0.1:9000`.
- Os registros DNS `painel` e `gestao` são CNAME com proxy ativo e apontam para
  o túnel `julian-play-servidor`.
- Os dois endereços HTTPS foram validados e respondem com redirecionamento para
  suas respectivas telas de login.
- Para alternar entre servidor e casa, primeiro parar e salvar os processos do
  ambiente ativo; depois alterar somente os CNAMEs `painel` e `gestao` para o
  túnel desejado e iniciar os processos no novo ambiente. Nunca deixar duas
  cópias da mesma sessão de WhatsApp ativas.

## Migração e cópias

- Os bancos do painel administrador e do Painel Mestre foram transferidos,
  conferidos com SHA-256 e validados com `PRAGMA quick_check`.
- Os dados e a sessão do administrador foram devolvidos ao servidor e o
  WhatsApp voltou a conectar.
- A instalação AMPLAYTV não recebeu alterações depois da exportação e, por
  isso, não foi sobrescrita no servidor. O processo correspondente permanece
  parado.
- Há cópias de migração mantidas no disco `D:` da máquina local.
- No servidor, manter temporariamente a pasta de segurança mais recente
  `C:\MigracaoJulianPlay\AntesRetorno-*` até confirmar alguns dias de operação.
  Os ZIPs já importados em `C:\MigracaoJulianPlay\RetornoLocal` podem ser
  removidos após conferência.

## Recursos do servidor no encerramento desta etapa

- Disco C: aproximadamente `5,21 GB` livres de `29,9 GB`.
- RAM livre: aproximadamente `545 MB` de `4 GB`.
- A pouca RAM não é causada principalmente pelos processos Node do projeto.
  Antes de encerrar qualquer processo, identificar o consumo do Windows,
  antivírus e Chrome. Nunca finalizar todos os processos Chrome, pois o
  WhatsApp ativo utiliza Chrome em modo headless.
- Para este servidor, `8 GB` de RAM é o mínimo recomendado e `16 GB` é a
  configuração preferível.
# Estado operacional consolidado em 26/07/2026

Este registro deve ser lido antes de qualquer nova alteracao. Nao contem
senhas, tokens, cookies ou chaves.

## Operacao ativa no servidor Windows

- Codigo: `C:\bots\julian-play`.
- Dados do Painel Mestre: `C:\JulianPlayMaster`.
- Instalacoes isoladas: `C:\JulianPlayClientes`.
- `julian-play`: ativo no PM2, porta `10000`.
- `julian-master`: ativo no PM2, porta `9000`.
- `julian-amplaytv`: parado intencionalmente no servidor porque a cliente esta
  usando a instalacao local.
- `caddy`: removido do PM2 e nao deve mais ser usado.
- `pm2-logrotate`: ativo.
- O estado atual foi salvo com `pm2.cmd save --force`.

## Cloudflare

- O servico Windows `Cloudflared` esta `Running` e com inicio `Automatic`.
- Tunel ativo do servidor: `julian-play-servidor`.
- Rota `painel.julianplay.com.br` aponta para
  `http://127.0.0.1:10000`.
- Rota `gestao.julianplay.com.br` aponta para
  `http://127.0.0.1:9000`.
- Rota `amplaytv.julianplay.com.br` aponta para
  `http://127.0.0.1:11004`; enquanto a cliente usar a instalacao local, o
  processo correspondente deve permanecer parado no servidor.
- Os hostnames publicados usam o tunel do servidor. `painel` e `gestao`
  respondem publicamente redirecionando para suas telas de login.
- O tunel `julian-play-casa` pode ser mantido para contingencia, mas nao deve
  disputar os mesmos hostnames publicos enquanto o servidor estiver ativo.
- Para trocar entre servidor e casa, primeiro parar os robos no ambiente
  atual, preservar/sincronizar bancos e sessoes, mudar os CNAMEs/rotas para o
  tunel de destino e somente depois iniciar os processos no novo ambiente.
- Nunca manter a mesma sessao do WhatsApp ativa simultaneamente nos dois
  ambientes.

## Migracao e preservacao de dados

- A migracao servidor -> computador local -> servidor foi concluida.
- Os pacotes foram conferidos por SHA256 antes da restauracao.
- `clientes.db` e `master.db` passaram por `PRAGMA quick_check` com resultado
  `ok`.
- O banco e a sessao da instalacao administradora foram devolvidos ao
  servidor.
- O Painel Mestre foi devolvido ao servidor.
- A instalacao AMPLAYTV nao foi sobrescrita no retorno porque nao havia sido
  modificada no computador local; seu processo permanece parado no servidor.
- Existem copias de seguranca no disco `D:` do computador local. No servidor,
  apagar pacotes de migracao somente depois de confirmar que a copia
  correspondente existe no computador local e que seu hash foi validado.

## Recursos observados no servidor

- Ultima medicao: aproximadamente `5,21 GB` livres no disco `C:`.
- Ultima medicao: aproximadamente `545 MB` de RAM livre em `4 GB`.
- O servidor esta funcional, mas 4 GB de RAM e pouco para crescimento.
- Manter pelo menos 8 GB livres em disco; abaixo de 5 GB e estado critico.
- Para expansao, usar no minimo 8 GB de RAM, preferencialmente 16 GB.
- Limpezas nunca devem remover `clientes.db`, `master.db`, bancos de
  instalacoes, `.wwebjs_auth` ativa, configuracoes ou backups atuais.

## Estado esperado para validacao rapida

```powershell
Get-Service Cloudflared | Select-Object Name,Status,StartType
pm2.cmd status
Invoke-WebRequest "https://painel.julianplay.com.br" -UseBasicParsing -MaximumRedirection 0
Invoke-WebRequest "https://gestao.julianplay.com.br" -UseBasicParsing -MaximumRedirection 0
```

Resultados esperados: `Cloudflared` em execucao automatica; `julian-play` e
`julian-master` online; `julian-amplaytv` parado enquanto a copia local estiver
em uso; os dois enderecos HTTPS respondendo com redirecionamento para login.

## Limpeza de disco realizada em 26/07/2026

- O espaco livre no disco `C:` do servidor aumentou de `5,21 GB` para
  `7,58 GB`.
- Foram removidos caches do Google Updater e do Edge Update, arquivos
  temporarios, a pasta desativada `C:\caddy` e componentes antigos por meio de
  `DISM.exe /Online /Cleanup-Image /StartComponentCleanup`.
- A pasta temporaria de retorno
  `C:\MigracaoJulianPlay\AntesRetorno-20260726-112939` foi removida.
- `C:\$WinREAgent` foi removida depois de confirmar que o Windows nao indicava
  reinicializacao pendente.
- Bancos, sessoes do WhatsApp, configuracoes e backups ativos nao foram
  alterados.

## PayPal, saude e deploy em 27/07/2026

- Pagamentos PayPal aprovados passam a ser encaminhados tambem ao webhook de
  alertas configurado, alem da renovacao e confirmacao pelo WhatsApp.
- Pagamentos PIX e PayPal aprovados enviam um comprovante resumido ao WhatsApp
  de controle cadastrado. Na ausencia dele, usam o numero de alertas.
- O PayPal possui modo manual para conta pessoal: envia um link configurado e
  solicita o comprovante, sem webhook nem renovacao automatica. A liberacao e
  feita manualmente no cadastro do cliente depois da conferencia.
- Quando a conta pessoal nao possui link reutilizavel, o modo manual aceita o
  e-mail de acesso ao PayPal e orienta o cliente a enviar o pagamento para ele.
- Alertas repetidos de saude foram limitados a uma repeticao a cada 6 horas.
  Escalada para nivel critico continua imediata e a mensagem de normalizacao
  exige 30 minutos continuos de estabilidade.
- O `deploy.ps1` mantem `julian-amplaytv` parado e salva esse estado no PM2.
- Depois de uma atualizacao bem-sucedida, o deploy recria automaticamente o
  pacote oficial de instalacao local.

## Seguranca, privacidade e continuidade em 28/07/2026

- O monitoramento pode copiar cada backup automatico verificado para outro
  disco ou compartilhamento de rede. A pasta e configurada em Manutencao;
  uma pasta no mesmo disco nao deve ser tratada como copia externa.
- O login aceita segundo fator TOTP quando `PANEL_TOTP_SECRET` estiver definido
  no ambiente persistente do processo PM2. A chave nao deve ser gravada no
  Git, banco ou neste documento.
- Clientes novos nao entram em campanhas sem consentimento explicito no
  cadastro. As palavras `parar`, `cancelar mensagens` e `nao quero receber`
  retiram automaticamente o consentimento e registram nota no cliente.
- Campanhas possuem limite configuravel de destinatarios, com padrao de 100,
  alem dos lotes e intervalos ja existentes.
- Pedidos PayPal no modo manual agora criam uma cobranca auditavel com status
  `aguardando_comprovante`; continuam exigindo conferencia humana e nao
  renovam automaticamente.
- A criptografia integral das credenciais IPTV e de aplicativos permanece uma
  migracao separada: ela so deve ser ativada depois de definir como a chave
  externa sera guardada e recuperada junto aos backups. Nao usar uma chave
  descartavel dentro da mesma pasta dos dados.

## Cofre de integracoes e migracoes em 28/07/2026

- Tokens e segredos reversiveis de Mercado Pago, PayPal e webhooks passam a
  usar AES-256-GCM no banco quando a instalacao possui `JULIAN_SECRET_KEY` ou
  `LICENSE_ADMIN_TOKEN`. Valores antigos em texto sao migrados ao primeiro
  carregamento, sem alterar o valor usado pela aplicacao.
- A chave deve permanecer no ambiente/ecossistema da mesma instalacao e ser
  preservada separadamente do banco. Perder ou trocar essa chave impede abrir
  os segredos. Durante rotacao controlada, chaves anteriores podem ser
  informadas temporariamente em `JULIAN_SECRET_KEY_PREVIOUS`.
- Credenciais IPTV e de aplicativos ainda nao foram cifradas, pois sao usadas
  em muitos fluxos e exigem uma migracao transacional com plano de recuperacao
  especifico.
- O banco agora registra migracoes novas em `schema_migrations`; a migracao de
  privacidade dos clientes recebeu a versao
  `2026-07-28-privacidade-clientes`.
- O registro de cobrancas manuais foi extraido para um servico dedicado, como
  primeiro passo para reduzir o tamanho e o acoplamento das rotas.

## Kit de recuperacao e credenciais de paineis em 28/07/2026

- A exportacao `.jplaybackup` usa o formato `JPLAYBK2` e inclui, dentro do
  conteudo autenticado e criptografado por senha, o banco e o material de
  recuperacao da chave da instalacao. A senha do kit nao e armazenada.
- O extrator offline fica em `scripts/extrair-kit-recuperacao.js`; ele exige a
  senha em `JPLAY_RECOVERY_PASSWORD` e uma pasta de destino vazia. O arquivo
  `recuperacao-segredos.json` extraido deve ser protegido e apagado depois da
  restauracao.
- Usuario e token das APIs de paineis IPTV/P2P passam pelo mesmo cofre
  AES-256-GCM antes de serem gravados e sao abertos somente no fluxo que chama
  a API.
- Credenciais IPTV/app de clientes permanecem em texto neste pacote. Antes de
  cifra-las, todas as consultas diretas em clientes, campanhas, mensagens e
  renovacoes precisam passar por um repositorio central; fazer apenas metade
  dessa mudanca quebraria mensagens e renovacoes.

## Cofre de credenciais dos clientes em 28/07/2026

- Os campos `clientes.senha`, `clientes.senhaApp` e `clientes.acessosApp`
  passam a usar AES-256-GCM quando a instalacao possui chave.
- A migracao `2026-07-28-credenciais-clientes` ocorre apenas na primeira
  operacao de clientes, dentro de transacao, e pode ser repetida sem cifrar
  novamente valores ja protegidos.
- Usuarios permanecem pesquisaveis; senhas sao abertas somente no repositorio
  central antes de chegar a telas, mensagens, campanhas e renovacoes.
- Campanhas retomadas e renovacao automatica de paineis foram adaptadas para
  ler o bloco de acessos pelo cofre.
