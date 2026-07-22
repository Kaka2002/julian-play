# Configurar PIX Automatico Com Mercado Pago

Este guia ensina a conectar sua propria conta Mercado Pago ao painel. Depois da configuracao, o painel pode gerar um QR Code PIX exclusivo para cada cobranca, confirmar o pagamento, registrar no Financeiro, renovar o cliente e enviar a confirmacao pelo WhatsApp.

## Antes De Comecar

Voce precisa ter:

- uma conta Mercado Pago ativa;
- uma chave PIX cadastrada nessa conta;
- acesso ao menu **Suas integracoes** do Mercado Pago;
- acesso ao menu **Manutencao** do painel.

O PIX automatico tambem funciona em instalacoes abertas somente por `localhost` ou `julianplay.local`. Nesse caso, o painel consulta as cobrancas pendentes no Mercado Pago a cada minuto, sem precisar receber conexoes da internet.

## 1. Criar A Integracao No Mercado Pago

1. Entre em https://www.mercadopago.com.br/developers/pt.
2. Clique em **Suas integracoes**.
3. Clique em **Criar aplicacao**.
4. Informe um nome que identifique seu painel, por exemplo `Painel Minha Empresa`.
5. Quando for solicitado o produto, escolha uma opcao relacionada a pagamento online ou **Checkout Transparente**.
6. Finalize a criacao da aplicacao.

Cada empresa deve criar e usar sua propria aplicacao e suas proprias credenciais.

## 2. Obter O Access Token

1. Abra a aplicacao criada.
2. Entre em **Producao > Credenciais de producao**.
3. Ative as credenciais, se ainda estiverem desativadas.
4. Localize o **Access Token**.
5. Copie o Access Token somente quando for preencher o painel.

Seguranca:

- nunca envie o Access Token pelo WhatsApp;
- nunca coloque o Access Token em prints;
- nunca envie essa credencial para outro cliente;
- cada instalacao deve guardar apenas a credencial do proprio recebedor.

## 3. Configurar O Webhook No Mercado Pago (Servidor Publico)

Se o painel abre somente por `localhost` ou `julianplay.local`, pule para a etapa 4. A URL do webhook pode ficar vazia.

1. Dentro da aplicacao, abra **Webhooks** ou **Notificacoes > Webhooks**.
2. Abra a aba **Modo de producao**.
3. No campo de URL, informe o endereco publico do seu painel seguido de `/webhooks/mercado-pago`.

Exemplo:

```text
https://cliente.seudominio.com/webhooks/mercado-pago
```

4. Em eventos, marque somente **Pagamentos (legacy)**.
5. Deixe desmarcados **Order (Mercado Pago)**, **Planos e assinaturas** e os demais eventos.
6. Clique em **Salvar configuracoes**.
7. Copie a **Assinatura secreta** mostrada pelo Mercado Pago.

O nome `legacy` aparece no Mercado Pago, mas esse e o evento usado pela integracao atual de pagamentos PIX do painel.

## 4. Configurar O Painel

1. Entre no seu painel.
2. Abra **Manutencao**.
3. Na secao **PIX de recebimento**, preencha tambem os dados do seu PIX manual. Eles ficam disponiveis como alternativa caso o provedor automatico seja desativado.
4. Clique em **Salvar PIX**.
5. Na secao **Confirmacao automatica do PIX**, escolha **Mercado Pago**.
6. Cole o **Access Token**.
7. Cole a **Assinatura secreta do webhook**.
8. Se a instalacao possuir dominio HTTPS publico, informe exatamente a mesma URL cadastrada no Mercado Pago. Em instalacao local, deixe a URL vazia.
9. Informe um e-mail operacional valido para o pagador. Se possivel, use um e-mail diferente do login da conta Mercado Pago recebedora.
10. Clique em **Salvar provedor PIX**.

Quando os campos mostrarem `Configurado - deixe vazio para manter`, a credencial ja esta salva. Nao e necessario digitá-la novamente ao alterar outro campo.

## 5. Configurar Os Alertas No Discord (Opcional)

Para receber os eventos do PIX no Discord:

1. Ainda em **Manutencao**, localize **Monitoramento comercial**.
2. Cole a URL do webhook do Discord em **Webhook HTTPS para alertas**.
3. Clique em **Salvar monitoramento**.
4. Clique em **Enviar alerta de teste**.

O mesmo canal recebera:

- PIX gerado;
- pagamento aprovado e cliente renovado;
- divergencia de valor;
- erro ao gerar cobranca;
- falha na renovacao depois de um pagamento aprovado.

## 6. Fazer Um Teste Seguro

1. Crie um plano de teste com valor baixo, por exemplo R$ 1,00, e 1 dia de duracao.
2. Cadastre um cliente de teste com um segundo numero de WhatsApp.
3. Abra o cadastro desse cliente.
4. Use a opcao **Enviar PIX do plano**.
5. Confira se o WhatsApp recebeu um QR Code com a mensagem de confirmacao automatica.
6. Pague usando outra conta bancaria, diferente da conta Mercado Pago recebedora.
7. Aguarde a confirmacao.

Confira se:

- o pagamento apareceu no Financeiro;
- o cliente ficou ativo;
- o vencimento foi renovado;
- o historico do cliente recebeu o registro;
- o WhatsApp recebeu a confirmacao;
- o Discord recebeu os eventos, se estiver configurado.

## 7. Como O Sistema Funciona

```text
Enviar PIX do plano
        |
        v
Mercado Pago gera QR Code exclusivo
        |
        v
Cliente paga
        |
        v
Mercado Pago chama o webhook
        |
        v
Painel consulta o pagamento na API
        |
        v
Confere cliente, referencia, status e valor
        |
        v
Registra pagamento e renova uma unica vez
        |
        v
Envia confirmacao pelo WhatsApp
```

Notificacoes repetidas do Mercado Pago nao criam renovacoes duplicadas.

## 8. Problemas Comuns

### O QR Code nao foi gerado

- confira se Mercado Pago esta selecionado;
- confira o Access Token;
- confirme que a conta Mercado Pago possui uma chave PIX;
- confira se o plano tem valor e dias de contrato;
- tente salvar novamente o provedor.

### O cliente pagou, mas nao renovou

- confira se a URL termina em `/webhooks/mercado-pago`;
- confira se a URL usa HTTPS e abre pela internet;
- confirme que **Pagamentos (legacy)** esta marcado;
- confira se o Access Token e de producao;
- veja os eventos no Mercado Pago e no Monitoramento comercial;
- envie os prints e o ID do pagamento ao suporte, sem enviar o Access Token.

### A instalacao e local

O Mercado Pago automatico funciona em `http://localhost:10000` ou `http://julianplay.local:10000` pela verificacao periodica. Mantenha o computador ligado, o painel em execucao e a internet conectada. A confirmacao pode levar cerca de um minuto depois do pagamento.

## Links Oficiais

- Mercado Pago Developers: https://www.mercadopago.com.br/developers/pt
- Credenciais: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials
- Webhooks: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
