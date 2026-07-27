# Configurar recebimentos com PayPal

O PayPal e uma opcao adicional para clientes que desejam pagar fora do Brasil.
O Julian Play continua usando o valor cadastrado no plano e cria a cobranca em
reais (`BRL`). Nao existe conversao cambial dentro do sistema.

## Requisitos

- conta PayPal Business apta a receber pagamentos;
- aplicacao REST criada no PayPal Developer Dashboard;
- dominio HTTPS publico apontando para a instalacao;
- Client ID e Client Secret da aplicacao.

## Configurar primeiro no Sandbox

1. Acesse o PayPal Developer Dashboard.
2. Crie ou selecione uma aplicacao REST em **Apps & Credentials**.
3. Comece no ambiente **Sandbox**.
4. Copie o Client ID e o Client Secret.
5. Cadastre um webhook com `https://seu-dominio/webhooks/paypal`.
6. Marque o evento `PAYMENT.CAPTURE.COMPLETED`.
7. Copie o Webhook ID.

## Configurar no Julian Play

1. Abra **Manutencao**.
2. Localize **Recebimento internacional com PayPal**.
3. Selecione **Sandbox (testes)**.
4. Informe Client ID, Client Secret e Webhook ID.
5. Em **URL publica desta instalacao**, informe apenas a origem HTTPS, por
   exemplo `https://amplaytv.julianplay.com.br`.
6. Ative **Oferecer PayPal nas renovacoes pelo WhatsApp**.
7. Confirme a senha atual e salve.

Depois que o cliente for localizado no fluxo de renovacao e escolher o plano,
o WhatsApp oferecera PIX ou PayPal.

Ao escolher PayPal, o cliente recebe o link oficial de aprovacao. O sistema
confere a ordem diretamente na API do PayPal, valida referencia, moeda e valor,
registra o pagamento e renova o cliente uma unica vez.

## Colocar em producao

1. Conclua um pagamento de teste no Sandbox.
2. Crie ou selecione as credenciais **Live** da aplicacao.
3. Cadastre o mesmo webhook no ambiente Live.
4. No Julian Play, altere o ambiente para **Producao**.
5. Informe as credenciais e o Webhook ID de producao.
6. Salve e faca uma cobranca real de valor baixo.

Nunca envie Client Secret, tokens ou credenciais por mensagem e nunca os
grave no Git.
