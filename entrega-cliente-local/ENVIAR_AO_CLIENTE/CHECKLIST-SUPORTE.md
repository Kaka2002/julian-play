# Checklist Para Suporte

Use este checklist quando o cliente disser que não funcionou.

## Antes De Instalar

- Windows 10 ou 11.
- Google Chrome instalado.
- Node.js LTS instalado.
- Arquivo `julian-play-app.zip` está na pasta recebida.
- Internet funcionando.

## Depois De Instalar

- Abrir painel: http://localhost:10000
- Abrir licença: http://localhost:10000/licenca
- Abrir WhatsApp: http://localhost:10000/qr

## Informações Que O Cliente Deve Enviar

- Print da tela com erro.
- ID da instalação em `/licenca`.
- Se o WhatsApp aparece conectado em `/qr`.
- Horário em que o problema aconteceu.

## Comando Para Ver Status

Se precisar abrir o PowerShell:

```powershell
pm2 status
```

## Comando Para Logs

```powershell
pm2 logs julian-play-cliente --lines 100
```
