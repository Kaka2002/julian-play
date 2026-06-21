# julian-play
Desenvolvimento Julian Play

## Painel de clientes

Com o servidor rodando, acesse:

- `/clientes` para listar, buscar, cadastrar, editar e excluir clientes.
- `/planos` para cadastrar tipos de plano, como Mensal com 30 dias.
- `/modelos` para cadastrar e editar os modelos de mensagens enviadas pelo WhatsApp.
- `/apps` para cadastrar e editar aplicativos disponiveis.
- `/dispositivos` para cadastrar e editar dispositivos.
- `/paineis` para cadastrar e editar paineis.
- `/clientes/novo` para cadastrar um novo cliente.
- `/qr` para conectar o WhatsApp pelo QR Code.

O painel possui tela de login. Em uma instalacao nova, acesse o sistema e conclua a tela de configuracao inicial para criar o primeiro usuario administrador. O codigo de instalacao aparece no log do processo. Nao existe mais senha padrao para novas instalacoes.

Para producao, configure as variaveis:

- `PANEL_USER`: usuario do painel.
- `PANEL_PASSWORD`: senha do painel.
- `PANEL_SESSION_HOURS`: duracao da sessao em horas. Padrao: `8`.
- `PANEL_COOKIE_SECURE`: use `1` quando estiver acessando por HTTPS.
- `PANEL_LOGIN_MAX_ATTEMPTS`: tentativas invalidas antes do bloqueio. Padrao: `5`.
- `PANEL_LOGIN_LOCK_MINUTES`: duracao do bloqueio do login. Padrao: `15`.
- `PANEL_SETUP_TOKEN`: codigo fixo opcional exigido somente na primeira configuracao.
- `TRUST_PROXY`: use `1` somente quando o painel estiver atras de proxy reverso confiavel com HTTPS.

Senhas antigas armazenadas em SHA-256 continuam funcionando e sao migradas automaticamente para `scrypt` depois de um login bem-sucedido.

## Instalacao comercial no Windows

Abra o PowerShell na pasta do projeto. Para instalar dependencias, configurar uma unica instancia no PM2 e preparar o inicio automatico:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

Opcoes uteis:

```powershell
# Usar outra porta
.\install-windows.ps1 -Porta 10001

# Liberar a porta no Firewall (execute como Administrador)
.\install-windows.ps1 -AbrirFirewall

# Guardar banco e backups em outra pasta
.\install-windows.ps1 -PastaDados "C:\JulianPlayDados"
```

O instalador preserva o banco `clientes.db`, a sessao `.wwebjs_auth` e os backups. Quando executado como Administrador, cria uma tarefa do Windows para restaurar o PM2 depois de reiniciar o servidor. Sem permissao administrativa, cria uma inicializacao no proximo login do usuario.

As escolhas de porta, nome do processo e pasta de dados ficam em `.julian-play-install.json`. Esse arquivo e local, nao e enviado ao GitHub e e reutilizado automaticamente nas atualizacoes.

Para atualizar uma instalacao existente com backup antes do `git pull`:

```powershell
powershell -ExecutionPolicy Bypass -File .\update-windows.ps1
```

O atualizador recusa a operacao quando existem alteracoes locais ainda nao salvas no Git. O arquivo `deploy.ps1`, usado pelo GitHub Actions, chama o mesmo atualizador seguro.

Como o servidor utiliza o Google Chrome ja instalado, os scripts definem `PUPPETEER_SKIP_DOWNLOAD=true` durante o `npm ci`. Assim, uma atualizacao nao tenta baixar uma segunda copia do navegador.

O painel usa o mesmo banco SQLite do bot e normaliza telefones para o formato brasileiro com DDI `55`.

No cadastro de cliente, o tipo de plano preenche automaticamente os dias de contrato e ajuda a calcular a data/hora de vencimento a partir da data/hora de inicio. Tambem e possivel selecionar varios apps, dispositivos e paineis para o mesmo cliente.
Quando o status do cliente for `Teste`, o campo de horas de teste fica disponivel com opcoes de 30 minutos a 24 horas.

Na lista `/clientes/todos`, o painel mostra inicio, vencimento, app, dispositivos, validade, status e a data de aniversario do cliente no formato dia/mes.
O status e atualizado automaticamente conforme o vencimento, e o envio automatico usa os modelos cadastrados em `/modelos`.
Tambem existe um modelo padrao de aniversario com bonus de 1 mes de acesso, enviado uma vez por ano no dia do aniversario do cliente.

## Avisos de renovacao pelo WhatsApp

O sistema verifica clientes com status `ativo` ou `teste` e vencimento proximo. Quando o WhatsApp esta conectado, ele envia uma mensagem de renovacao e registra o vencimento avisado para evitar repeticao no mesmo periodo.

Variaveis opcionais:

- `RENOVACAO_DIAS_AVISO`: quantos dias antes do vencimento avisar. Padrao: `3`.
- `RENOVACAO_INTERVALO_MINUTOS`: intervalo entre verificacoes automaticas. Padrao: `60`.

## Monitoramento comercial

Na tela `/manutencao` e possivel configurar:

- backup automatico diario e horario de execucao;
- retencao dos backups automaticos em dias;
- tempo maximo de WhatsApp desconectado antes do alerta;
- webhook HTTPS opcional para receber alertas externos;
- historico persistente de backups, desconexoes e recuperacoes.

Backups manuais nao sao removidos pela retencao automatica. O monitor roda a cada minuto e tambem registra os eventos no banco local.

Na licenca da instalacao, use uma data de vencimento para contratos comerciais ou marque `Licenca vitalicia` para a instalacao principal sem vencimento.

Variavel opcional:

- `MONITOR_INTERVALO_MS`: intervalo do monitor em milissegundos. Padrao: `60000`.

## Modelos de mensagem e logo

Na tela `/modelos`, use as variaveis abaixo nos textos:

- `{{nome}}`
- `{{plano}}`
- `{{vencimento}}`
- `{{dias}}`
- `{{valor}}`

Tambem e possivel trocar o nome exibido no topo e informar um caminho/URL de logo. Para usar a logo que ja existe no projeto, informe:

`/assets/Logo%201_7.png`
