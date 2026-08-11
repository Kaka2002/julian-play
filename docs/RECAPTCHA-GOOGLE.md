# Google reCAPTCHA v2 no login

O Julian Play suporta o reCAPTCHA v2 de caixa de selecao ("Nao sou um robo")
no login do Painel Mestre e dos paineis de clientes. A verificacao e sempre
feita no servidor; a chave secreta nunca e entregue ao navegador.

## Comportamento seguro

- O reCAPTCHA so e usado quando `RECAPTCHA_SITE_KEY` e
  `RECAPTCHA_SECRET_KEY` estiverem preenchidas.
- Sem as duas chaves, o CAPTCHA matematico assinado existente continua ativo.
  Isto preserva o acesso de instalacoes locais sem internet.
- Depois de ativado, uma falha de rede com o Google bloqueia o login em vez de
  aceitar uma resposta sem verificacao.
- `RECAPTCHA_ALLOWED_HOSTNAMES` e opcional. Quando informado, recebe os
  dominios separados por virgula e o servidor tambem confere o `hostname`
  devolvido pelo Google.

## Cadastro no Google

Crie uma chave do tipo **reCAPTCHA v2 > Caixa de selecao "Nao sou um robo"**
no console do Google. Cadastre os dominios sem `https://` e sem caminhos, por
exemplo `painel.julianplay.com.br` e `gestao.julianplay.com.br`. Para uma
instalacao local, use uma chave separada que inclua `localhost`.

Referencias oficiais:

- https://developers.google.com/recaptcha/docs/display?hl=pt-BR
- https://developers.google.com/recaptcha/docs/verify

## Ativacao

Defina as tres variaveis no ambiente do processo PM2; nunca as grave no Git
nem em arquivos enviados ao cliente. A chave de site e publica, mas a chave
secreta deve ficar restrita ao responsavel pela instalacao.

No servidor, a mesma chave registrada para `julianplay.com.br` pode ser
aplicada ao Painel Mestre e aos paineis comerciais desse dominio. Para novas
instalacoes comerciais, o provisionador herda as variaveis do Painel Mestre.
