# Uso Interno - Preparar Entrega Ao Cliente

Esta pasta é para você, não para o cliente.

## 1. Gerar O Pacote Oficial Do App

Execute no PowerShell dentro desta pasta:

```powershell
powershell -ExecutionPolicy Bypass -File .\CRIAR-PACOTE-APP.ps1
```

Isso cria:

```text
..\ENVIAR_AO_CLIENTE\julian-play-app.zip
```

## 2. Conferir A Pasta De Envio

Envie ao cliente somente:

```text
entrega-cliente-local\ENVIAR_AO_CLIENTE
```

Essa pasta deve conter:

- `julian-play-app.zip`
- `INSTALAR-PAINEL.ps1`
- `VERIFICAR-COMPUTADOR.ps1`
- `ABRIR-PAINEL.ps1`
- `LEIA-PRIMEIRO.md`
- `PASSO-A-PASSO-CLIENTE.md`
- `CHECKLIST-SUPORTE.md`

## 3. Depois Que O Cliente Instalar

Peça para ele abrir:

```text
http://localhost:10000/licenca
```

Ele deve copiar o ID da instalação e enviar para você.

## 4. Gerar Licença No Painel Mestre

No Painel Mestre:

1. Vá em **Licença para instalação local**.
2. Cole o ID da instalação.
3. Informe nome do cliente.
4. Escolha mensal, semestral, anual, avaliação ou vitalícia.
5. Gere o código.
6. Envie o código ao cliente.

O cliente cola o código em:

```text
http://localhost:10000/licenca
```

## Observação Importante

O pacote `julian-play-app.zip` é o pacote oficial de instalação. Não envie repositório Git, `.git`, banco de dados, sessão WhatsApp, backups ou arquivos internos do seu servidor.
