# Migração definitiva do servidor para este computador

Este fluxo migra o Painel Mestre e o administrador do servidor para este
computador. Ele preserva `C:\JulianPlay\dados` e mantém AMPLAYTV parada.

O pacote tambem preserva as imagens personalizadas em `assets`, os backups,
os relatorios operacionais de migracao e o estado de avisos fora de horario.
Cache antigo do Chrome/WhatsApp Web e copias antigas do script de deploy nao
sao necessarios para restaurar o sistema e ficam fora da exportacao.

Os dados maiores ficam no disco `D:`:

- administrador: `D:\JulianPlayDados\admin`;
- Painel Mestre: `D:\JulianPlayDados\master`;
- instalações comerciais futuras: `D:\JulianPlayDados\clientes`;
- pacotes, extração e backups da migração: `D:\MigracaoJulianPlay`.

## Ordem obrigatória

1. Atualize o repositório nos dois computadores.
2. No servidor, execute `1-EXPORTAR-NO-SERVIDOR.ps1 -CorteFinal` como
   Administrador. O script para e salva os processos antes de copiar bancos e
   sessão do WhatsApp.
3. Copie o ZIP e o `.sha256` para `D:\MigracaoJulianPlay\Recebidos` neste
   computador por SCP, SFTP ou unidade segura.
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

## Ambiente seguro do PM2

Se os arquivos `.julian-play-install.json` e `.julian-master-install.json`
não existirem no servidor, execute também
`3-EXPORTAR-AMBIENTE-SEGURO-NO-SERVIDOR.ps1`. O script copia apenas as
variáveis permitidas do `dump.pm2`, exige as credenciais indispensáveis e não
mostra os valores no terminal.

Mantenha esse JSON fora do repositório e informe seu caminho ao importador com
`-AmbienteSeguro`. O arquivo contém segredos: nunca o abra no terminal, envie
pelo chat ou versione. Apague-o somente depois da homologação e do backup
definitivo.

## Copiar a AMPLAYTV sem iniciar o robô

A AMPLAYTV usa um fluxo separado porque a cliente continua executando outra
instalação. O objetivo é copiar os dados para este computador e deixar o
processo ausente da lista ativa do PM2, com a porta `11004` fechada.

1. No servidor, gere novamente o ambiente seguro com
   `3-EXPORTAR-AMBIENTE-SEGURO-NO-SERVIDOR.ps1`. A nova cópia inclui a seção
   `amplaytv`; o arquivo anterior à versão 1.2.10 não serve para esta etapa.
2. Ainda no servidor, confirme que `julian-amplaytv` está parado e execute
   `4-EXPORTAR-AMPLAYTV-PARADA-NO-SERVIDOR.ps1 -ConfirmarParada`.
3. Copie o ZIP, seu `.sha256` e o novo ambiente seguro para
   `D:\MigracaoJulianPlay\Recebidos`.
4. Neste computador, execute
   `5-IMPORTAR-AMPLAYTV-PARADA-NESTE-COMPUTADOR.ps1`, informando o ZIP, o
   ambiente seguro e `-ConfirmarOrigemParada`.
5. Confirme que os dados estão em
   `D:\JulianPlayDados\clientes\amplaytv`, que a porta `11004` não está em
   escuta e que a AMPLAYTV aparece como parada no Painel Mestre.

O importador valida o manifesto, os hashes e os bancos antes da troca, cria
backup para rollback, atualiza o caminho no Painel Mestre e grava a
configuração PM2 sem iniciar o robô. Quando a cliente deixar de usar a
instalação atual, o botão `Iniciar robô` do Painel Mestre poderá registrar e
iniciar a configuração migrada. Até essa autorização, não clique nele.
