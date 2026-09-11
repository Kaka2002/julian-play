# Rotação segura de credenciais

Este procedimento vale para a produção em `Julianelli-CP` e deve ser
executado em uma janela de manutenção. Nenhum valor de senha, token, chave ou
cookie deve ser enviado ao Git, ao terminal compartilhado ou a este projeto.

## Inventário atual

Os arquivos `.julian-master-install.json` e `.julian-play-install.json` são
locais e ignorados pelo Git. Eles podem conter hash de senha, material de
sessão/licença e chaves do reCAPTCHA. O arquivo não deve ser versionado nem
copiado para a pasta de entrega ao cliente.

As credenciais de Mercado Pago, PayPal, webhooks e acessos de aplicativos ficam
nas configurações de cada instalação. Quando `JULIAN_SECRET_KEY` está
disponível, os valores reversíveis são protegidos por AES-256-GCM no banco.
Trocar a chave do cofre sem uma migração controlada torna esses valores
indisponíveis; não substitua `JULIAN_SECRET_KEY` manualmente.

## Ordem recomendada

1. Confirme uma cópia de recuperação recente dos bancos administrativo e
   mestre. Mantenha a máquina atual e a sessão do WhatsApp fora de qualquer
   procedimento de migração durante a rotação.
2. No Mercado Pago, crie um novo Access Token e uma nova assinatura de webhook.
   Atualize a instalação pela tela **Manutenção**, teste uma cobrança e só
   depois revogue os valores antigos.
3. No PayPal, crie um novo Client Secret e, se usado, um novo Webhook ID.
   Atualize a instalação pela tela **Manutenção**, valide uma notificação e só
   depois revogue a credencial anterior.
4. Gere novas URLs ou segredos dos webhooks de alerta externos, atualize a
   configuração e faça um teste de alerta. O workflow de monitoramento público
   está desativado; não é necessário reativá-lo.
5. Troque a senha do Painel Mestre e invalide as sessões administrativas. A
   senha é armazenada somente como hash em `passwordHash`; nunca edite o hash
   manualmente sem gerar um novo com o serviço de senha do projeto.
6. Se o segundo fator TOTP ou o reCAPTCHA tiverem sido expostos, gere novos
   valores no provedor, atualize o ambiente do processo correspondente e
   reinicie apenas depois de testar o login.
7. Não troque `licenseSigningPrivateKey`, `licenseSigningSecret`,
   `licenseAdminToken` ou `JULIAN_SECRET_KEY` nesta janela. Essas chaves exigem
   migração coordenada e teste de todas as instalações, pois podem afetar
   licenças existentes e dados cifrados.

## Verificações depois de cada etapa

- `pm2 status` mostra `julian-master` e `julian-play-admin` como `online`.
- `Invoke-WebRequest http://127.0.0.1:9000/ready -UseBasicParsing` retorna
  HTTP 200 para o Mestre.
- `Invoke-WebRequest http://127.0.0.1:10001/ready -UseBasicParsing` retorna
  HTTP 200 para o painel de clientes.
- O login do Mestre funciona em uma janela anônima e o Cloudflare Access exige
  autenticação em `https://mestre.julianplay.com.br`.
- Uma integração alterada é testada antes da revogação do valor anterior.

Se uma verificação falhar, pare a rotação, preserve o valor anterior ainda
ativo e restaure a configuração anterior a partir do backup protegido. Não
apague valores cifrados do banco para tentar recuperar uma chave perdida.

## Limpeza

Depois de confirmar todos os testes, remova cópias temporárias de configurações
que contenham credenciais. Preserve somente o backup protegido exigido pela
política de recuperação, fora do Git e fora da pasta de entrega ao cliente.
