# Instalacao do Painel no Computador do Cliente

Este pacote instala o painel no computador Windows do cliente.

O cliente nao precisa instalar VS Code, nao precisa copiar codigo e nao deve abrir arquivos internos do sistema. Basta seguir este arquivo e executar os scripts indicados.

## Antes De Comecar

1. Use um computador com Windows 10 ou Windows 11.
2. Tenha internet ativa.
3. Instale o Google Chrome.
4. Instale o Node.js LTS.
5. Tenha em maos o celular com o WhatsApp que sera usado pelo robo.
6. Deixe todos os arquivos recebidos juntos na mesma pasta.

## Links Oficiais Para Baixar

Google Chrome:
https://www.google.com/chrome/

Node.js LTS:
https://nodejs.org/

## Arquivos Que Devem Estar Nesta Pasta

Antes de instalar, esta pasta precisa conter:

- `LEIA-PRIMEIRO.md`
- `PASSO-A-PASSO-CLIENTE.md`
- `CONFIGURAR-MERCADO-PAGO.md`
- `1-VERIFICAR-COMPUTADOR.bat`
- `2-INSTALAR-PAINEL.bat`
- `3-ABRIR-PAINEL.bat`
- `4-ATUALIZAR-PAINEL.bat`
- `VERIFICAR-COMPUTADOR.ps1`
- `INSTALAR-PAINEL.ps1`
- `ABRIR-PAINEL.ps1`
- `ATUALIZAR-PAINEL.ps1`
- `julian-play-app.zip`

O arquivo `julian-play-app.zip` nao deve ser executado manualmente. O instalador usa esse arquivo automaticamente.

Se o arquivo `julian-play-app.zip` nao estiver nesta pasta, solicite o pacote oficial ao fornecedor.

## Instalacao Rapida

1. DÃª dois cliques em `1-VERIFICAR-COMPUTADOR.bat`.
2. Se estiver tudo certo, dÃª dois cliques em `2-INSTALAR-PAINEL.bat`.
3. Se quiser abrir o painel depois, dÃª dois cliques em `3-ABRIR-PAINEL.bat`.
4. Ao terminar, abra:
   http://julianplay.local:10000

## Se For Executar Pelo PowerShell

Se abrir o PowerShell manualmente, entre na pasta recebida e use sempre `.\` antes do nome do arquivo:

```powershell
.\VERIFICAR-COMPUTADOR.ps1
.\INSTALAR-PAINEL.ps1
.\ABRIR-PAINEL.ps1
```

Se digitar apenas `VERIFICAR-COMPUTADOR.ps1`, o PowerShell pode mostrar erro dizendo que o comando nao foi encontrado.

## Abrir O Painel

Depois da instalacao:

1. DÃª dois cliques em `3-ABRIR-PAINEL.bat`; ou
2. Abra no navegador:
   http://julianplay.local:10000

Se o endereco acima nao abrir, use o endereco alternativo:

http://localhost:10000

## Atualizar O Painel

Quando o fornecedor enviar uma versao nova:

1. Coloque o novo `julian-play-app.zip` na mesma pasta destes arquivos.
2. DÃª dois cliques em `4-ATUALIZAR-PAINEL.bat`.
3. Aguarde terminar.
4. O painel sera aberto novamente no navegador.

A atualizacao preserva clientes, financeiro, licenca e conexao do WhatsApp.

Se for executar pelo PowerShell:

```powershell
.\ATUALIZAR-PAINEL.ps1
```

## Licenca E Numero Do WhatsApp Do Robo

Depois da instalacao, abra:

http://julianplay.local:10000/licenca

Na tela de licenca:

1. Confira o nome do cliente ou empresa.
2. Preencha o **Telefone do responsavel** com o numero do WhatsApp que sera usado pelo robo.
3. Copie o **ID da instalacao**.
4. Copie tambem a **Chave da maquina**.
5. Envie o ID da instalacao, a Chave da maquina e o numero do WhatsApp do robo ao fornecedor.
6. Aguarde o fornecedor enviar o codigo de ativacao.
7. Cole o codigo na tela de licenca e clique em **Aplicar codigo de ativacao** ou **Salvar e ativar licenca**, conforme aparecer na tela.

Sem o codigo enviado pelo fornecedor, a licenca nao deve ser alterada.

## Licenca Em Apenas Um Computador

A licenca local fica vinculada ao computador onde foi ativada. Se copiar a pasta ou tentar usar o mesmo codigo em outro computador, o sistema vai bloquear a ativacao.

Para usar em outro computador, solicite ao fornecedor uma nova liberacao.

## Instalacao Em Outro Disco

O painel pode ser instalado no disco C: ou D:. O Google Chrome e o Node.js podem continuar instalados no C:, mesmo que o painel fique no D:.

Nao mova a pasta manualmente depois de instalar. Se precisar mudar de disco ou pasta, fale com o fornecedor.

## Conectar WhatsApp

Depois que a licenca estiver ativa:

1. Abra o menu **WhatsApp** no painel.
2. Se aparecer QR Code, abra o WhatsApp no celular do robo.
3. Toque em **Aparelhos conectados**.
4. Toque em **Conectar aparelho**.
5. Leia o QR Code da tela.

Use somente o numero de WhatsApp informado na licenca.

## Orientacoes Importantes

- Nao desconecte o aparelho pelo celular depois de conectar.
- Nao use o mesmo numero em outro WhatsApp Web no mesmo computador.
- Nao apague a pasta `C:\JulianPlay`.
- Nao renomeie nem mova a pasta instalada sem falar com o fornecedor.
- Nao instale a mesma licenca em outro computador sem autorizacao do fornecedor.
- Se o computador reiniciar, aguarde alguns minutos para o painel voltar.
- Se trocar o numero do WhatsApp do robo, avise o fornecedor antes de conectar outro numero.
- Se aparecer erro, envie print da tela ao fornecedor.

