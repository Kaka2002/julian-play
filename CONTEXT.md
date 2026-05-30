# JULIAN PLAY TV - CONTEXTO DO PROJETO

## Informações Gerais

Projeto de automação de atendimento via WhatsApp para a JULIAN PLAY TV.

Objetivo principal:

- Atendimento automático
- Teste grátis
- Consulta de planos
- Renovação de assinaturas
- Envio de PIX
- Recebimento de comprovantes
- Cadastro de clientes
- Controle de vencimentos
- Integração futura com painel IPTV

---

# Ambiente

## Hospedagem

Render

Tipo:

Web Service

Plano:

Free

## Sistema Operacional

Linux

## Memória

512 MB

## Runtime

Node.js 20

---

# Repositório

GitHub:

https://github.com/Kaka2002/julian-play

Branch principal:

main

---

# Estrutura Atual

julian-play/

├── bot.js

├── config/
│   └── whatsapp.js

├── routes/
│   └── qrRoute.js

├── package.json

├── Dockerfile

└── .wwebjs_auth/

---

# Tecnologias

## Backend

- Node.js
- Express

## WhatsApp

- whatsapp-web.js

## Chromium

- @sparticuz/chromium

## QR Code

- qrcode

---

# Problemas Resolvidos

## Chrome não encontrado

Erro:

Browser was not found

Solução:

Uso de:

const chromium = require('@sparticuz/chromium');

e

const executablePath = await chromium.executablePath();

---

## Puppeteer incompatível com Render

Resolvido utilizando:

@sparticuz/chromium

---

## Erro client is not defined

Resolvido declarando:

let client;

em escopo global.

---

## Erro Unexpected end of input

Resolvido corrigindo fechamentos:

});
}

na função iniciarWhatsApp().

---

## Erro Cannot find module './routes/qrRoute'

Resolvido criando:

routes/qrRoute.js

e exportando corretamente o Router.

---

# Status Atual

## QR Code

Funcionando

Evento:

client.on('qr')

Log:

📱 QR Code gerado

---

## Autenticação

Funcionando

Evento:

client.on('authenticated')

Log:

✅ Autenticado

---

## Conexão

Funcionando

Evento:

client.on('ready')

Log:

✅ WhatsApp conectado

---

## Envio de Mensagens

Funcionando

Teste realizado:

await client.sendMessage()

Log:

✅ Mensagem de teste enviada

---

## Recebimento de Mensagens

Funcionando

Evento:

client.on('message')

Log:

📩 MENSAGEM RECEBIDA

---

# Menu Atual

Ao enviar:

oi
olá
ola
menu

Bot responde:

📺 JULIAN PLAY TV

1 - Solicitar Planos

2 - Teste Grátis

3 - Renovar Assinatura

4 - Ativar Aplicativos

0 - Encerrar Atendimento

---

# Fluxo Atual

## Opção 1

Planos

Implementação parcial.

Necessário:

- Exibir preços reais
- Gerar PIX
- Receber comprovante

---

## Opção 2

Teste Grátis

Implementação parcial.

Necessário:

- Solicitar nome
- Solicitar aparelho
- Liberar teste automaticamente

---

## Opção 3

Renovação

Implementação parcial.

Necessário:

- Localizar cliente
- Consultar vencimento
- Gerar PIX

---

## Opção 4

Ativação

Implementação parcial.

Necessário:

- Identificar dispositivo
- Enviar tutorial correto

---

# Próxima Implementação

## Controle de Conversa

Criar objeto:

const clientes = {};

Exemplo:

clientes[message.from] = {
    etapa: "aguardando_nome"
};

Objetivo:

Controlar fluxo de atendimento.

---

# Banco de Dados

Atualmente:

Memória RAM

Problema:

Dados são perdidos após reinício.

---

# Próxima Migração

SQLite

Arquivo:

database.sqlite

Tabela:

clientes

Campos:

id
nome
telefone
usuario
senha
plano
vencimento
status

---

# Módulos Planejados

## services/clientes.js

Funções:

- cadastrarCliente()
- atualizarCliente()
- buscarCliente()

---

## services/testeGratis.js

Funções:

- gerarTeste()
- liberarTeste()

---

## services/pix.js

Funções:

- gerarPIX()
- gerarQRCode()
- confirmarPagamento()

---

## services/renovacao.js

Funções:

- consultarVencimento()
- renovarPlano()

---

# Integração IPTV (Futuro)

Objetivo:

Após pagamento confirmado:

- Criar usuário automaticamente
- Definir senha
- Definir vencimento
- Enviar dados ao cliente

Sem intervenção manual.

---

# Logs Importantes

Conexão OK:

✅ WhatsApp conectado

Mensagem recebida:

📩 MENSAGEM RECEBIDA

Menu acionado:

📋 MENU ACIONADO

Mensagem enviada:

✅ Menu enviado

---

# Próxima Prioridade

1. Fluxo completo do Teste Grátis
2. SQLite
3. Cadastro permanente de clientes
4. PIX automático
5. Recebimento de comprovantes
6. Controle de vencimentos
7. Integração IPTV

---

# Estado Atual do Projeto

STATUS: OPERACIONAL

Funciona:

- Deploy Render
- Docker
- Chromium
- QR Code
- Conexão WhatsApp
- Recebimento de mensagens
- Menu inicial

Próxima meta:

Implementar cadastro persistente e fluxo completo de atendimento.