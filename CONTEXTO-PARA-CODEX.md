# Contexto permanente do projeto Julian Play

Este arquivo fica no repositório para sobreviver à exclusão de
`C:\Users\carlo\.codex`. Uma nova sessão do Codex deve ler primeiro:

1. `AGENTS.md`;
2. este arquivo;
3. `git status` e os últimos commits antes de alterar qualquer coisa.

Não registrar aqui senhas, tokens, chaves PIX, cookies ou credenciais.

## Fonte de verdade operacional em 04/08/2026

O ambiente de produção atual e o procedimento de recuperação estão consolidados
em `docs/ESTADO-OPERACIONAL-ATUAL.md` e
`docs/RECUPERACAO-E-CONTINGENCIA.md`. Em caso de conflito, esses documentos
prevalecem sobre os marcos históricos abaixo. A produção está no computador
`Julianelli-CP`; o VPS antigo permanece parado e não deve receber deploy.

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

- a situação detalhada das recomendações técnicas fica em
  `AUDITORIA-MELHORIAS.md`;
- sessões administrativas agora persistem no banco somente com hash do token,
  podem ser consultadas em `/sessoes` e revogadas em conjunto;
- novas senhas administrativas exigem no mínimo 12 caracteres;
- campanhas respeitam limite semanal por cliente, horário configurável e dias
  úteis, além dos controles de consentimento, limite diário e retomada;
- pagamentos PayPal manuais possuem área protegida em `/pagamentos-manuais`,
  upload de comprovante para o `DATA_DIR`, conferência com identificador único,
  responsável, vencimentos anterior/novo e estorno auditado; o estorno não
  reduz automaticamente o acesso do cliente;
- backups automáticos aplicam retenção diária, semanal e mensal localmente e
  na pasta externa; uma vez por mês o sistema restaura uma cópia em diretório
  temporário, abre o SQLite, valida seu conteúdo e registra o último backup
  comprovadamente recuperável;
- migrações novas ficam em `database/migrations`, são aplicadas em transação,
  geram backup verificado `pre-migracao-*.db`, checksum, duração e relatório em
  `<DATA_DIR>/migrations/ultimo-relatorio.json`; falhas executam rollback e
  impedem o banco de ser declarado pronto;

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
- versão 1.1.5 adiciona governança de campanhas: registro auditável de
  reclamação, bloqueio imediato de marketing, pausa automática por taxa de
  erros configurável e rota dedicada `routes/campanhasRoute.js`;
- eventos persistidos recebem `correlationId`, o `/health` informa versão
  instalada/esperada e o pacote local passa por teste automatizado de
  instalação limpa sem bancos, sessões ou backups;
- migrações formais `004` e `005` cobrem reclamações de campanhas e
  formalização das colunas históricas de privacidade.
- a migração formal `006` registra campanhas, itens e eventos históricos sem
  sobrescrever dados; o Painel Mestre agora compara automaticamente a versão
  de cada instalação com sua própria versão e mostra o resultado na saúde;
- `routes/campanhasRoute.js` passou a registrar também a página principal de
  campanhas, ampliando a separação gradual do arquivo histórico de clientes.

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

## Testes de navegacao e menu principal em 28/07/2026

- A Central Hoje foi removida porque repetia informacoes do Painel e adicionava
  complexidade sem ganho operacional suficiente.
- O menu usa uma largura maior em telas desktop e oculta a barra visual de
  rolagem. A navegacao continua responsiva em telas menores.
- Testes Playwright executam login e validam o Painel e a largura do menu em
  Chrome, banco e porta temporarios. `DISABLE_WHATSAPP=1` impede WhatsApp,
  renovacoes e monitoramento somente no processo de teste; a execucao normal
  permanece inalterada.
- Execute `npm run test:e2e` para a validacao real de navegacao e
  `npm run test:all` para testes internos e de navegador.
- O `deploy.ps1` preserva em `backups\deploy-recovery` um
  `package-lock.json` legado e nao rastreado antes do primeiro pull que passa
  a versionar esse arquivo. Isso evita bloqueio do Git sem apagar o artefato.

## Otimizacao segura de memoria em 29/07/2026

- A acao de memoria do Painel Mestre consulta `pm2 jlist` antes de reiniciar
  qualquer instalacao.
- Somente processos cujo estado real no PM2 seja `online` podem ser
  reiniciados. Processos `stopped`, `stopping`, `errored` ou ausentes sao
  ignorados e aparecem na mensagem final.
- Se a consulta ao PM2 falhar ou devolver uma resposta invalida, nenhum robo
  e reiniciado. Essa regra impede que uma instalacao mantida parada, como
  `julian-amplaytv`, seja reativada pela manutencao de memoria.

## Encerramento planejado do servidor em 01/08/2026

- O destino confirmado e este computador Windows.
- `C:\JulianPlay\dados` e a instalacao local independente
  `julian-play-cliente` devem permanecer intocados na porta `10000`.
- O administrador do servidor sera migrado para
  `D:\JulianPlayDados\admin`, processo `julian-play-admin`, porta `10001`.
- O Painel Mestre sera atualizado em `D:\JulianPlayDados\master`, processo
  `julian-master`, porta `9000`.
- Instalacoes comerciais futuras ficam em `D:\JulianPlayDados\clientes` e os
  pacotes, temporarios e backups da migracao em `D:\MigracaoJulianPlay`.
- AMPLAYTV deve permanecer parada.
- Os scripts controlados ficam em `scripts\migracao-servidor-local`: o
  exportador para os processos, copia bancos e sessao e gera manifesto e
  SHA-256; o importador valida hashes e `PRAGMA quick_check`, cria backup do
  estado local e exige confirmacao explicita de que o servidor foi parado.
- A versao 1.2.1 ampliou o pacote de encerramento para preservar tambem
  `assets`, backups, relatorios de migracao, o estado de avisos fora de horario
  e o banco legado anterior a manutencao quando ele existir. Cache antigo do
  Chrome/WhatsApp Web e copias antigas do script de deploy nao fazem parte do
  estado necessario para restauracao.
- A versao 1.2.2 normaliza a data somente das copias temporarias antes de
  compactar a exportacao. Isso contorna arquivos legados com timestamp fora do
  intervalo aceito pelo ZIP sem alterar os dados originais ou seus hashes.
- A versao 1.2.3 substituiu `Compress-Archive` pelo `tar.exe` nativo na
  exportacao final. A compactacao passa a ser feita em fluxo para evitar falta
  de memoria no servidor de 4 GB; falhas continuam religando automaticamente
  os processos que estavam online antes da tentativa.
- A versao 1.2.4 permite ao importador reconstruir nomes Unicode que tenham
  sido alterados pelo ZIP do `tar.exe`, usando tamanho e SHA-256 do manifesto.
  Depois da verificacao, entradas que nao pertencem ao manifesto sao removidas
  da area temporaria antes da copia para o `DATA_DIR`.
- A versao 1.2.5 trata `stop` e `delete` de processos PM2 ainda inexistentes
  como operacoes opcionais durante a primeira importacao. Isso evita que a
  mensagem esperada `Process not found` interrompa o fluxo no PowerShell 5.1.
- A versao 1.2.6 aceita um arquivo `AmbienteSeguro` separado para migrar
  credenciais persistidas somente no PM2, incluindo chaves de licenca, cofre,
  MFA e login do Painel Mestre. O arquivo nunca deve ser versionado, exibido
  no terminal ou mantido depois da homologacao e do backup definitivo.
- O exportador seguro fica em
  `scripts\migracao-servidor-local\3-EXPORTAR-AMBIENTE-SEGURO-NO-SERVIDOR.ps1`.
  Ele le o `dump.pm2`, copia somente variaveis permitidas, valida o token do
  administrador e o usuario/hash do Painel Mestre e mostra apenas caminho,
  tamanho e SHA-256 do arquivo criado.
- A versao 1.2.7 usa o parser JSON do Node.js nesse exportador porque o
  Windows PowerShell 5.1 rejeita o `dump.pm2` real quando ele contem chaves
  legitimas que diferem somente entre maiusculas e minusculas, como
  `username` e `USERNAME`.
- A versao 1.2.8 move a adaptacao do cadastro do administrador no banco mestre
  para `adaptar-cadastro-local.js`. Isso evita que o Windows PowerShell remova
  aspas do SQL passado anteriormente por `node -e`; a consulta agora usa
  parametros e possui teste executavel com SQLite temporario.
- A versao 1.2.9 torna o checksum das migracoes independente dos finais de
  linha do sistema operacional. Os seis checksums trazidos do servidor foram
  comprovados como a variante CRLF exata do mesmo codigo LF local; por isso o
  runner aceita somente essa equivalencia legada, cria backup, normaliza os
  registros em transacao e continua bloqueando qualquer divergencia real.
- Depois do reinicio em 01/08/2026, `julian-play-admin` permaneceu online, a
  rota local `http://127.0.0.1:10001/login` respondeu HTTP 200 e o WhatsApp do
  administrador foi confirmado como conectado. O dominio exibido pelo Painel
  Mestre e o cadastro publico da instalacao; a saude e o estado do WhatsApp
  sao consultados localmente em `127.0.0.1` pela porta cadastrada. Nao
  desconectar o aparelho vinculado pelo celular durante o corte do tunel.
- A versao 1.2.10 conclui o fluxo controlado para copiar a AMPLAYTV para
  `D:\JulianPlayDados\clientes\amplaytv` sem iniciar o robo. O exportador 4
  exige processo e porta parados; o importador 5 valida SHA-256, manifesto e
  bancos, cria rollback, atualiza o Painel Mestre para status `parado`, grava
  a configuracao PM2 e deixa o processo fora da lista ativa. A transferencia
  real ainda deve ser executada com a cliente usando a instalacao local.
- O exportador de ambiente seguro da versao 1.2.10 inclui opcionalmente a
  secao `amplaytv`. Para essa etapa e obrigatorio gerar um novo JSON no
  servidor; o arquivo anterior nao contem os segredos da instalacao. O botao
  `Iniciar robo` do Painel Mestre passa a carregar o `ecosystem.config.cjs`
  quando o processo ainda nao existir no PM2, mas somente apos acao explicita.
- A versao 1.2.11 aceita a instalacao legada sem `JULIAN_SECRET_KEY`
  explicita quando o `LICENSE_ADMIN_TOKEN` original esta presente. Esse e o
  fallback deliberado de `cofreSegredosService`; preservar o mesmo token
  mantem legiveis os valores ja cifrados sem criar ou trocar a chave durante
  a migracao.
- A versao 1.2.12 preserva pontos iniciais de diretorios raiz no pacote da
  AMPLAYTV. A primeira importacao validou todos os hashes, mas materializou
  `.wwebjs_auth` e `.wwebjs_auth-backup-*` sem o ponto por causa de
  `TrimStart`; como o robo permaneceu parado, as duas pastas puderam ser
  renomeadas localmente antes de qualquer uso da sessao.
- A AMPLAYTV foi importada com sucesso em 01/08/2026 para
  `D:\JulianPlayDados\clientes\amplaytv`. Os bancos da instalacao e do Painel
  Mestre retornaram `PRAGMA quick_check = ok`; o cadastro ficou com processo
  `julian-amplaytv`, porta 11004, caminho local e status `parado`.
- O backup anterior dessa etapa esta em
  `D:\MigracaoJulianPlay\AntesImportacao-AMPLAYTV-20260801-160650`. Depois da
  correcao dos nomes, `.wwebjs_auth` possui aproximadamente 997 MB, a pasta
  sem ponto nao existe e a porta 11004 permanece sem listener. O `dump.pm2`
  salvo contem somente `julian-play-cliente`, `julian-play-admin` e
  `julian-master`; portanto AMPLAYTV nao sera ressuscitada no boot.
- A importacao definitiva no computador `Julianelli-CP` foi concluida em
  01/08/2026 e homologada com a versao 1.2.12. `julian-play-admin`,
  `julian-master` e a instalacao independente `julian-play-cliente` ficaram
  online; a porta 11004 permaneceu fechada e AMPLAYTV nao foi iniciada.
- Depois da importacao, `PRAGMA quick_check` retornou `ok` nos bancos em
  `D:\JulianPlayDados\admin` e `D:\JulianPlayDados\master`. O cadastro mestre
  passou a apontar para processo `julian-play-admin`, porta 10001 e pasta
  `D:\JulianPlayDados\admin`. As portas 9000, 10000 e 10001 responderam com
  redirecionamento HTTP 302 para seus respectivos logins.
- A migracao dos dados e o corte publico foram concluidos em 01/08/2026. O
  servico Windows `Cloudflared` do computador `Julianelli-CP` ficou em
  execucao automatica, conectado ao tunel `julian-play-casa`, ID
  `6c9f4316-0d11-47c6-8987-4f2a92d1a054`.
- Os registros DNS `painel.julianplay.com.br`, `gestao.julianplay.com.br` e
  `amplaytv.julianplay.com.br` passaram a apontar para `julian-play-casa` com
  proxy ativo. `painel` e `gestao` retornaram HTTP 200 pelas rotas publicas;
  AMPLAYTV permanece preparada em `http://localhost:11004`, mas indisponivel
  enquanto o processo estiver parado e a porta 11004 fechada.
- O reinicio completo do Windows foi homologado em 01/08/2026. A tarefa
  `Julian Play - Iniciar PM2` executou com resultado 0 e restaurou somente
  `julian-master`, `julian-play-admin` e `julian-play-cliente`; os listeners
  voltaram nas portas 9000, 10000 e 10001, sem listener em 11004. O servico
  `Cloudflared` voltou como `Running/Automatic` e os enderecos publicos de
  `painel` e `gestao` retornaram HTTP 200 depois do boot.
- Manter o VPS parado e disponivel para rollback ate validar acesso por outra
  rede, confirmar visualmente o WhatsApp e concluir o backup externo seguro.
- O pacote final copiado para o computador local em 01/08/2026 e
  `D:\MigracaoJulianPlay\Recebidos\JulianPlay-Servidor-20260801-130527.zip`,
  com SHA-256
  `F659E6BE5E5CB8F612274EF4F9540F537807E1D61FB6E0A43F7D6477D56BA813`.
  Os processos `julian-play`, `julian-master` e `julian-amplaytv` permanecem
  parados no servidor. Administrador, Painel Mestre e os dados da AMPLAYTV ja
  foram importados e validados localmente; falta somente concluir o corte
  publico do Cloudflare. Nao religar nem atualizar o servidor.
- A verificacao final do PM2 em 01/08/2026 confirmou `julian-master`,
  `julian-play-admin` e `julian-play-cliente` online e salvos no
  `C:\Users\carlo\.pm2\dump.pm2`. Os listeners locais ficaram em 9000, 10000
  e 10001; `julian-amplaytv` permaneceu fora do PM2 e sem listener em 11004.
- O tunel residencial `julian-play-casa` assumiu os enderecos publicos
  `painel.julianplay.com.br`, `gestao.julianplay.com.br` e
  `amplaytv.julianplay.com.br`; nao voltar os registros ao tunel do servidor
  sem executar o procedimento formal de retorno e sincronizar os dados.
- O backup manual `clientes-20260801-173039.db` foi copiado para
  `C:\BackupsJulianPlay`, no disco fisico `C:` separado do disco `D:` que
  armazena os dados. As copias retornaram o mesmo SHA-256
  `4C7E47A5B962492FE93E1D2846783EDB9A728AF64CF3E52BC03BCD88FC90C8D9`.
  O exercicio real de restauracao foi aprovado com 25 tabelas e 11 clientes.
  Essa segunda copia local protege contra falha do disco `D:`, mas ainda deve
  ser sincronizada para armazenamento fora do computador.
- A versao 1.2.13 faz o botao `Gerar backup agora` copiar o novo backup e seu
  manifesto automaticamente para a pasta externa configurada. Se a segunda
  copia falhar, o backup local verificado permanece preservado e a interface
  informa separadamente a falha externa. O comportamento possui testes para
  sucesso e falha do destino externo.
- O workflow `.github/workflows/deploy-vps.yml` deixou de executar em pushes
  para `main`. O deploy do VPS antigo ficou restrito a acionamento manual com
  a confirmacao literal `DEPLOY_VPS_LEGADO`, evitando que um push volte a
  iniciar o servidor que sera encerrado.
- A versao 1.2.14 altera o aniversario de clientes para somente dia e mes no
  formato `DD/MM`. O banco guarda `MM-DD`, a migracao formal `007` remove o
  ano de datas ISO existentes depois de criar o backup pre-migracao, e os
  avisos anuais e a importacao/exportacao CSV aceitam o formato novo sem
  perder compatibilidade com registros legados.
- O workflow legado de deploy do VPS foi removido depois do encerramento do
  servidor. O GitHub Actions agora executa somente validacao em Windows nos
  pushes e pull requests da `main`: testes internos, navegacao no Chromium e
  verificacao do pacote local limpo. O workflow nao possui SSH, nao usa os
  secrets antigos do VPS e nao implanta codigo no computador residencial.
- A versao 1.2.15 torna `start-pm2.ps1` tolerante a um `dump.pm2` incompleto.
  Depois de `pm2 resurrect`, o script le `.julian-play-install.json` e garante
  o processo principal configurado; quando o perfil local e
  `julian-play-admin`, tambem garante `julian-master` a partir de
  `.julian-master-install.json`. Se precisou reconstruir a lista, salva o PM2
  novamente. A AMPLAYTV nao e iniciada por esse mecanismo e permanece parada.
- A versao 1.2.16 limita a copia externa a cinco conjuntos de backup por
  padrao, removendo banco e manifesto antigos juntos sem reduzir a retencao
  longa mantida no disco de dados. Quando `C:\BackupsJulianPlay` estiver
  sincronizada pelo Google Drive para computador, as exclusoes locais tambem
  mantem somente os cinco conjuntos mais recentes na nuvem. O limite pode ser
  alterado em Manutencao. A validacao do GitHub usa o Chromium instalado no
  runner quando o Google Chrome nao estiver disponivel e separa testes
  internos dos testes de navegacao para diagnostico claro.
- A versao 1.2.17 corrige a compatibilidade da validacao no GitHub Actions: o
  exportador do ambiente seguro calcula SHA-256 diretamente pela API .NET,
  sem depender de `Get-FileHash`. Processos isolados continuam limitados a 30
  segundos localmente e recebem 90 segundos quando `CI` esta definido, para
  tolerar runners mais lentos sem desativar a deteccao de travamentos.
- A versao 1.2.18 corrige a ordem da validacao do pacote no GitHub Actions. Em
  um checkout limpo, o workflow agora executa `CRIAR-PACOTE-APP.ps1` antes de
  `test:pacote-limpo`, pois os ZIPs gerados permanecem corretamente fora do
  Git e nao existem ate que o pacote seja construido no proprio runner.
- A versao 1.2.19 impede que a instalacao ou atualizacao de um cliente local
  sobrescreva a tarefa PM2 valida de outra instalacao no mesmo computador. A
  tarefa existente e preservada quando aponta para outro `start-pm2.ps1` que
  ainda existe. O problema foi identificado depois que a tarefa administrativa
  de `D:\julian-play` foi substituida pela copia de `C:\JulianPlay\app`, fazendo
  somente a porta 10000 subir no reinicio e causando 502 nas portas 10001 e 9000.
- A versao 1.2.20 completa o isolamento da atualizacao local: o atualizador nao
  executa mais `pm2 kill` nem salva uma lista parcial antes da reinstalacao, e o
  instalador em modo local pausa somente o processo que esta sendo atualizado.
  Assim, atualizar `C:\JulianPlay\app` nao derruba nem remove `julian-play-admin`
  e `julian-master` mantidos pelo ambiente administrativo em `D:\julian-play`.
- A versao 1.2.21 corrige uploads multipart com o campo CSRF: o leitor agora
  localiza a parte que realmente contem o arquivo, valida o token do formulario,
  limita o upload e confere a assinatura do conteudo antes de gravar imagens.
  O defeito anterior salvava o token CSRF de 64 caracteres como
  `logo-painel.png`; a logo valida da instalacao administradora foi restaurada
  em `D:\JulianPlayDados\admin\assets\logo-painel.png` sem alterar o banco.
- A pagina Campanhas passou a separar campanhas disponiveis do historico. A
  campanha `Amizade que vale presente` agora pode ser testada para um cliente ou
  iniciada diretamente nessa pagina, com a quantidade de clientes elegiveis e
  os mesmos controles de consentimento, horario, repeticao e lotes ja usados
  pelo servico existente.
- A versao 1.2.22 impede criar uma execucao de campanha fora da janela definida
  em Manutencao. A pagina desabilita o disparo geral e explica a regra atual;
  assim, dias nao permitidos deixam de aparecer incorretamente como falha de
  WhatsApp. Alertas de uma campanha que ultrapasse o horario orientam aguardar
  a janela configurada, em vez de afirmar incorretamente que o WhatsApp ficou
  instavel. O envio individual de teste permanece disponivel.
- O workflow de validacao usa `actions/checkout@v6` e `actions/setup-node@v6`,
  cujos runtimes internos sao compativeis com Node.js 24. Os testes da aplicacao
  continuam executados com Node.js 20 para reproduzir o ambiente local atual.
  O cancelamento de uma execucao antiga quando entra um push mais novo em
  `main` e intencional; a execucao mais recente deve ser usada como resultado.
- Retomada rapida em 02/08/2026: o ambiente principal foi migrado do VPS para
  `Julianelli-CP`, com codigo em `D:\julian-play`, dados persistentes em
  `D:\JulianPlayDados`, processos `julian-master` e `julian-play-admin` e o
  tunel `julian-play-casa`. A versao atual e 1.2.22. A regra de campanhas fora
  da janela configurada e a correcao de upload da logo ja estao no codigo.
  GitHub CLI foi instalado, mas a autenticacao local precisa ser renovada antes
  de novo uso. A atualizacao do workflow para Actions v6 foi enviada no commit
  `5ad8996`; a execucao #9 de `Validacao do Julian Play` concluiu com sucesso,
  assim como a execucao mais recente #10 do commit `854d37e`. O pacote externo
  foi recriado em
  `D:\julian-play\entrega-cliente-local\ENVIAR_AO_CLIENTE.zip`.
- Nao cancelar o VPS antes de validar HTTPS por outra rede, login, bancos,
  WhatsApp, reinicio do Windows e restauracao de backup.
- A versao 1.2.23 adiciona dois controles independentes em Manutencao para o
  robo responder mensagens recebidas e enviar mensagens iniciadas pelo painel
  ou por rotinas automaticas. Os controles iniciam ligados em instalacoes novas
  e nao sobrescrevem configuracoes existentes; com ambos desligados, o
  WhatsApp permanece conectado, mas o robo nao responde nem realiza envios
  proativos. A gravacao das opcoes antigas de resposta humanizada e fila tambem
  passou a respeitar corretamente o valor Desligado.
- O registro de reclamacao na pagina de campanhas nao exige mais descobrir e
  digitar o ID numerico do cliente. O formulario lista por nome e telefone
  somente quem teve envio confirmado naquela campanha; o backend resolve e
  valida o cliente pelo item da campanha antes de bloquear o marketing.
- Os clientes de cada execucao de campanha aparecem em paginas de 10 linhas.
  Campanhas repetidas no mesmo dia sao diferenciadas na lista e no cabecalho
  por numero da execucao, data e horario; cada link abre somente os clientes
  associados ao respectivo ID de campanha.
- A versao 1.2.24 reforca o bloqueio de preenchimento automatico nos campos
  sensiveis da Manutencao. Senhas de confirmacao, senha do kit e pasta de copia
  externa sempre abrem vazias; o WhatsApp de controle tambem permanece vazio
  quando ainda nao foi configurado, sem receber por engano o usuario salvo no
  navegador. O usuario de acesso exibido continua sendo o valor real gravado.
  O preenchimento automatico permanece permitido somente na pagina de login;
  nas demais paginas, todo campo de senha e protegido e aberto vazio, inclusive
  quando o navegador tenta preencher somente depois que o campo recebe foco.
  No Painel Mestre, usuario e senha de uma nova instalacao tambem iniciam
  vazios e precisam ser informados explicitamente; instalacoes existentes nao
  sao alteradas.
- Publicacao operacional de 04/08/2026: a correcao foi enviada no commit
  `0b7ebbf`. Durante o reinicio, uma tentativa de `npm ci` deixou `node_modules`
  incompleto e o Painel Mestre entrou em reinicio continuo por falta do modulo
  `express`, causando 502 temporario. As dependencias foram restauradas com
  `npm install --omit=dev`; as portas 9000 e 10001 e os enderecos publicos
  `gestao.julianplay.com.br` e `painel.julianplay.com.br` voltaram a responder
  HTTP 200 e servem o codigo novo. Bancos e sessoes do WhatsApp nao foram
  alterados.
- A versao 1.3.0 consolida as prioridades operacionais. O deploy prepara e
  testa a release em diretorio temporario, fecha os bancos, cria copias
  verificadas do administrador, Painel Mestre e clientes, troca dependencias
  de forma atomica, exige `/ready` na versao esperada e faz rollback automatico
  do codigo e de `node_modules` em caso de falha. O PM2 aguarda sinal de
  prontidao e encerra HTTP, WhatsApp e SQLite de forma graciosa; somente os
  processos antes online retornam, e AMPLAYTV permanece parada.
- O monitoramento publico de `painel` e `gestao` roda fora do computador pelo
  GitHub Actions a cada 15 minutos. `/live` e `/ready` sao minimos; `/health`
  detalhado fica restrito a chamadas locais para nao publicar numeros e
  contatos do WhatsApp.
- A copia externa de backup agora e reaberta como SQLite, comparada por
  SHA-256 e usada preferencialmente no exercicio mensal de restauracao. A
  interface distingue outro disco de uma copia confirmada fora do computador.
- Mensagens proativas passam por uma fila persistente cifrada. Pendencias que
  ainda nao iniciaram sao retomadas; uma interrupcao durante o envio vira
  estado `incerto` para revisao manual, pois repetir automaticamente poderia
  duplicar uma mensagem que o WhatsApp recebeu antes da queda.
- A exclusao direta de clientes foi desativada. A area Privacidade exige senha
  atual, confirmacao do titular para exportar JSON e confirmacao literal para
  anonimizar. Dados pessoais e textos livres sao removidos em transacao;
  registros financeiros minimos e a trilha da solicitacao permanecem.
- O estado atual e os procedimentos de desastre foram consolidados em
  `docs/ESTADO-OPERACIONAL-ATUAL.md` e
  `docs/RECUPERACAO-E-CONTINGENCIA.md`.
- O runtime SQLite foi atualizado para `sqlite3` 6.0.1. A atualizacao foi
  validada em release isolada com 73 testes unitarios e 7 testes de navegador;
  `npm audit --omit=dev` passou sem vulnerabilidades conhecidas em 04/08/2026.
- A versao 1.3.1 corrige a leitura de `pm2 jlist` no Windows PowerShell 5.1.
  O ambiente real continha as chaves validas `username` e `USERNAME`, que o
  `ConvertFrom-Json` considerava duplicadas. Um normalizador Node agora devolve
  somente nome, status e porta, sem expor variaveis ou segredos do PM2. O deploy
  tambem sempre instala dependencias na release temporaria, salvo uso explicito
  de `-PularDependencias`, evitando confiar apenas na diferenca entre commits
  quando o commit foi criado diretamente na pasta de producao.
- Tentativa operacional de publicar 1.3.1 em 04/08/2026: a release isolada e
  seus testes passaram, os processos administrador e mestre foram fechados e
  os tres bancos foram copiados com verificacao. A troca de dependencias nao
  ocorreu porque a saida de `npm test` escapou pelo pipeline de
  `PrepararRelease` e transformou o caminho temporario em uma colecao com
  valores vazios. O rollback religou `julian-play-admin` e `julian-master`,
  ambos prontos em 1.3.1 nas portas 10001 e 9000; `julian-play-cliente`
  permaneceu independente na porta 10000. O `node_modules` ativo nao foi
  trocado e ainda usa `sqlite3` 5.1.7.
- A versao 1.3.2 impede saida de comandos no pipeline, extrai e valida
  explicitamente a unica pasta temporaria autorizada antes de parar producao e
  remove a parada redundante de processos configurados para permanecer
  parados. Assim, a ausencia esperada de `julian-amplaytv` nao marca mais o
  rollback como falho.
- Tentativa operacional de publicar 1.3.2 em 04/08/2026: a release isolada,
  os 73 testes, os backups verificados e a troca de codigo foram concluidos,
  mas a prontidao procurou somente `PORT`. O Painel Mestre guarda a porta em
  `MASTER_PORT`, por isso o atualizador esperou 120 segundos, iniciou rollback
  e esperou mais 120 segundos sem informar progresso. Administrador e Mestre
  terminaram online e prontos em 1.3.2 nas portas 10001 e 9000; a instalacao
  independente `julian-play-cliente` continuou intocada na porta 10000. O
  rollback restaurou o `node_modules` anterior, ainda com `sqlite3` 5.1.7.
- A versao 1.3.3 normaliza `MASTER_PORT` como a porta de saude do Painel
  Mestre, recusa parar a producao se algum processo online administrado nao
  tiver porta identificada e mostra o progresso da prontidao a cada 15
  segundos. As tabelas repetitivas do PM2 foram suprimidas durante parada,
  inicio e rollback, mantendo somente mensagens operacionais concisas.
- A versao 1.3.4 amplia o campo Endereco MAC dos acessos por aplicativo para
  aceitar todas as letras de A a Z e numeros de 0 a 9. Tela e servidor aplicam
  a mesma normalizacao, em maiusculas e pares separados por dois-pontos, para
  que letras posteriores a F nao desaparecam durante a digitacao ou ao salvar.
