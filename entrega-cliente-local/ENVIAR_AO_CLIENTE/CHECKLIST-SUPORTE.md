# Checklist Para Suporte

Use este checklist quando o cliente disser que nÃ£o funcionou.

## Antes De Instalar

- Windows 10 ou 11.
- Google Chrome instalado.
- Node.js LTS instalado.
- Arquivo `julian-play-app.zip` estÃ¡ na pasta recebida.
- Internet funcionando.

## Depois De Instalar

- Abrir painel: http://julianplay.local:10000
- Abrir licenÃ§a: http://julianplay.local:10000/licenca
- Abrir WhatsApp: http://julianplay.local:10000/qr

## InformaÃ§Ãµes Que O Cliente Deve Enviar

- Print da tela com erro.
- ID da instalaÃ§Ã£o em `/licenca`.
- Chave da mÃ¡quina em `/licenca`.
- Se o WhatsApp aparece conectado em `/qr`.
- HorÃ¡rio em que o problema aconteceu.

## Comando Para Ver Status

Se precisar abrir o PowerShell:

```powershell
pm2 status
```

## Comando Para Logs

```powershell
pm2 logs julian-play-cliente --lines 100
```

