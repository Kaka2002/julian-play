# Migração definitiva do servidor para este computador

Este fluxo migra o Painel Mestre e o administrador do servidor para este
computador. Ele preserva `C:\JulianPlay\dados` e mantém AMPLAYTV parada.

## Ordem obrigatória

1. Atualize o repositório nos dois computadores.
2. No servidor, execute `1-EXPORTAR-NO-SERVIDOR.ps1 -CorteFinal` como
   Administrador. O script para e salva os processos antes de copiar bancos e
   sessão do WhatsApp.
3. Copie o ZIP e o `.sha256` para este computador por SCP, SFTP ou unidade
   segura.
4. Compare o SHA-256 antes de importar.
5. Neste computador, execute `2-IMPORTAR-NESTE-COMPUTADOR.ps1` como
   Administrador e informe `-ConfirmarServidorParado`.
6. Valide `http://127.0.0.1:10001`, `http://127.0.0.1:9000`, bancos, login e
   WhatsApp.
7. Ative o túnel residencial `julian-play-casa` e direcione `painel` e
   `gestao` para ele.
8. Teste os endereços HTTPS por outra rede.
9. Mantenha o VPS disponível para rollback por alguns dias. Só depois cancele
   a conta.

O ZIP contém credenciais e sessão do WhatsApp. Guarde-o em local privado e
apague-o com segurança depois da homologação e do backup definitivo.
