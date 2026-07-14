# Passo A Passo Para O Cliente

Este guia mostra a ordem correta para instalar, ativar a licenca e conectar o WhatsApp do robo.

O cliente nao precisa instalar VS Code. Para ler estes arquivos, pode usar o Bloco de Notas, o navegador ou qualquer editor de texto.

## 1. Instalar Programas Necessarios

Instale o Google Chrome:
https://www.google.com/chrome/

Instale o Node.js LTS:
https://nodejs.org/

Depois de instalar, reinicie o computador.

## 2. Conferir Os Arquivos Recebidos

Na pasta recebida, confira se existem estes arquivos:

- `LEIA-PRIMEIRO.md`
- `PASSO-A-PASSO-CLIENTE.md`
- `1-VERIFICAR-COMPUTADOR.bat`
- `2-INSTALAR-PAINEL.bat`
- `3-ABRIR-PAINEL.bat`
- `4-ATUALIZAR-PAINEL.bat`
- `VERIFICAR-COMPUTADOR.ps1`
- `INSTALAR-PAINEL.ps1`
- `ABRIR-PAINEL.ps1`
- `ATUALIZAR-PAINEL.ps1`
- `julian-play-app.zip`

Nao abra nem extraia o `julian-play-app.zip`. Ele sera usado automaticamente pelo instalador.

## 3. Conferir O Computador

Na pasta recebida, dê dois cliques em:

`1-VERIFICAR-COMPUTADOR.bat`

Se preferir executar pelo PowerShell, use:

```powershell
.\VERIFICAR-COMPUTADOR.ps1
```

Se aparecer alguma pendencia, instale o programa indicado e execute a verificacao novamente.

## 4. Instalar O Painel

Na pasta recebida, dê dois cliques em:

`2-INSTALAR-PAINEL.bat`

Se preferir executar pelo PowerShell, use:

```powershell
.\INSTALAR-PAINEL.ps1
```

O instalador vai preparar o painel, instalar dependencias, configurar o servico e abrir o endereco local.

## 5. Abrir O Painel

Abra no navegador:

http://localhost:10000

Se preferir, execute:

`3-ABRIR-PAINEL.bat`

Se preferir executar pelo PowerShell, use:

```powershell
.\ABRIR-PAINEL.ps1
```

Importante: no PowerShell, sempre use `.\` antes do arquivo. Exemplo: `.\VERIFICAR-COMPUTADOR.ps1`.

## 6. Ativar A Licenca

Abra:

http://localhost:10000/licenca

Na tela de licenca:

1. Confira o nome do cliente ou empresa.
2. No campo **Telefone do responsavel**, informe o numero do WhatsApp que sera usado pelo robo.
3. Copie o **ID da instalacao**.
4. Envie o ID da instalacao e o numero do WhatsApp do robo ao fornecedor.
5. Aguarde o fornecedor enviar o codigo de ativacao.
6. Cole o codigo de ativacao na tela de licenca.
7. Clique em **Aplicar codigo de ativacao** ou **Salvar e ativar licenca**, conforme aparecer na tela.

Importante: somente o fornecedor deve gerar o codigo de ativacao da licenca.

## 7. Conectar O WhatsApp Do Robo

Depois que a licenca estiver ativa, abra o menu **WhatsApp** no painel.

No celular que sera usado pelo robo:

1. Abra o WhatsApp.
2. Toque em **Aparelhos conectados**.
3. Toque em **Conectar aparelho**.
4. Leia o QR Code exibido no painel.

Use o mesmo numero informado na tela de licenca.

## 8. Testar O Robo

Depois que aparecer **WhatsApp conectado**, envie uma mensagem de outro numero para testar o atendimento.

Se o robo responder corretamente, a instalacao esta pronta.

## 9. Cuidados Para Nao Perder A Conexao

- Nao desconecte o aparelho pelo celular.
- Nao apague a pasta `C:\JulianPlay`.
- Nao use outro WhatsApp Web no mesmo computador para o mesmo numero.
- Nao troque o numero do WhatsApp sem avisar o fornecedor.
- Mantenha o computador ligado e com internet para o robo funcionar.
- Se reiniciar o computador, aguarde alguns minutos para o painel voltar.

## 10. Se Der Problema

Envie ao fornecedor:

- print da tela
- mensagem de erro
- se o WhatsApp aparece conectado
- se o computador foi reiniciado
- qual numero de WhatsApp esta sendo usado no robo

Nao apague pastas do sistema antes de falar com o fornecedor.

## 11. Atualizar O Painel Quando Receber Uma Nova Versao

Quando o fornecedor enviar uma melhoria do sistema:

1. Salve o novo pacote recebido na mesma pasta destes arquivos.
2. Confira se o arquivo `julian-play-app.zip` foi substituido pelo pacote novo.
3. Dê dois cliques em `4-ATUALIZAR-PAINEL.bat`.
4. Aguarde a atualizacao terminar.
5. Abra o painel em:

http://localhost:10000

A atualizacao preserva:

- clientes cadastrados
- historico financeiro
- licenca
- configuracoes locais
- conexao do WhatsApp

Se preferir executar pelo PowerShell, use:

```powershell
.\ATUALIZAR-PAINEL.ps1
```
