# julian-play
Desenvolvimento Julian Play

## Painel de clientes

Com o servidor rodando, acesse:

- `/clientes` para listar, buscar, cadastrar, editar e excluir clientes.
- `/clientes/novo` para cadastrar um novo cliente.
- `/qr` para conectar o WhatsApp pelo QR Code.

O painel usa o mesmo banco SQLite do bot e normaliza telefones para o formato brasileiro com DDI `55`.

## Avisos de renovacao pelo WhatsApp

O sistema verifica clientes com status `ativo` ou `teste` e vencimento proximo. Quando o WhatsApp esta conectado, ele envia uma mensagem de renovacao e registra o vencimento avisado para evitar repeticao no mesmo periodo.

Variaveis opcionais:

- `RENOVACAO_DIAS_AVISO`: quantos dias antes do vencimento avisar. Padrao: `3`.
- `RENOVACAO_INTERVALO_MINUTOS`: intervalo entre verificacoes automaticas. Padrao: `60`.
