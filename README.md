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

O painel possui tela de login. Por padrao, quando nenhuma variavel for configurada, o acesso inicial e:

- Usuario: `admin`
- Senha: `admin123`

Para producao, configure as variaveis:

- `PANEL_USER`: usuario do painel.
- `PANEL_PASSWORD`: senha do painel.
- `PANEL_SESSION_HOURS`: duracao da sessao em horas. Padrao: `8`.
- `PANEL_COOKIE_SECURE`: use `1` quando estiver acessando por HTTPS.

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

## Modelos de mensagem e logo

Na tela `/modelos`, use as variaveis abaixo nos textos:

- `{{nome}}`
- `{{plano}}`
- `{{vencimento}}`
- `{{dias}}`
- `{{valor}}`

Tambem e possivel trocar o nome exibido no topo e informar um caminho/URL de logo. Para usar a logo que ja existe no projeto, informe:

`/assets/Logo%201_7.png`
