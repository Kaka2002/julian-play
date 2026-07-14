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
- `VERIFICAR-COMPUTADOR.ps1`
- `INSTALAR-PAINEL.ps1`
- `ABRIR-PAINEL.ps1`
- `julian-play-app.zip`

O arquivo `julian-play-app.zip` nao deve ser executado manualmente. O instalador usa esse arquivo automaticamente.

Se o arquivo `julian-play-app.zip` nao estiver nesta pasta, solicite o pacote oficial ao fornecedor.

## Instalacao Rapida

1. Clique com o botao direito em `VERIFICAR-COMPUTADOR.ps1`.
2. Escolha **Executar com PowerShell**.
3. Se estiver tudo certo, clique com o botao direito em `INSTALAR-PAINEL.ps1`.
4. Escolha **Executar com PowerShell**.
5. Ao terminar, abra:
   http://localhost:10000

## Licenca E Numero Do WhatsApp Do Robo

Depois da instalacao, abra:

http://localhost:10000/licenca

Na tela de licenca:

1. Confira o nome do cliente ou empresa.
2. Preencha o **Telefone do responsavel** com o numero do WhatsApp que sera usado pelo robo.
3. Copie o **ID da instalacao**.
4. Envie o ID da instalacao e o numero do WhatsApp do robo ao fornecedor.
5. Aguarde o fornecedor enviar o codigo de ativacao.
6. Cole o codigo na tela de licenca e clique em **Aplicar codigo de ativacao** ou **Salvar e ativar licenca**, conforme aparecer na tela.

Sem o codigo enviado pelo fornecedor, a licenca nao deve ser alterada.

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
- Se o computador reiniciar, aguarde alguns minutos para o painel voltar.
- Se trocar o numero do WhatsApp do robo, avise o fornecedor antes de conectar outro numero.
- Se aparecer erro, envie print da tela ao fornecedor.
