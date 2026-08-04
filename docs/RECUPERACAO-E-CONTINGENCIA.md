# Recuperação e contingência

Este procedimento evita improviso durante falhas. Os tempos abaixo são metas operacionais propostas, não garantias contratuais.

## Metas

| Cenário | RPO (perda máxima desejada) | RTO (retorno desejado) |
|---|---:|---:|
| Código ou dependência defeituosa | zero dado persistente | 10 minutos |
| Banco SQLite corrompido | último backup diário aprovado | 2 horas |
| Falha do disco `D:` | última cópia externa aprovada | 2 horas |
| Perda completa do computador | último backup fora da máquina | 4 horas após haver computador substituto |

Sem uma cópia confirmada fora do computador, a última meta não existe na prática. Uma pasta no disco `C:` melhora a tolerância à falha do `D:`, mas não é recuperação de desastre.

## Falha após atualização

1. Não execute novos `npm install` na pasta ativa.
2. Consulte os logs do PM2 e `/ready` local.
3. O `update-windows.ps1` tenta restaurar automaticamente o commit e as dependências anteriores.
4. Confirme que somente os processos que estavam online voltaram a subir.
5. Confirme que `julian-amplaytv` continua parada.
6. Se o rollback automático falhar, preserve `D:\JulianPlayDados\backups\deploy-recovery` e use a versão anterior ali registrada antes de qualquer nova tentativa.

## Banco corrompido ou restauração

1. Coloque o robô afetado em manutenção e pare apenas o processo correspondente.
2. Não substitua o banco original; renomeie-o para quarentena e preserve os arquivos `-wal` e `-shm`, quando existirem.
3. Escolha o backup mais recente cuja interface mostre integridade `ok`, teste `aprovada` e SHA-256.
4. Prefira a cópia externa já exercitada.
5. Use a ação **Restaurar** na Manutenção, confirmando a senha atual.
6. Inicie somente o processo afetado e valide login, quantidade de clientes, pagamentos, configurações e WhatsApp.
7. Registre horário, arquivo restaurado, hash e diferença de dados observada.

## Perda completa do computador

1. Bloqueie o acesso público ou retire temporariamente os hostnames do túnel.
2. Garanta que a máquina antiga e sua sessão do WhatsApp estão desligadas.
3. Instale Node.js, PM2, Git e `cloudflared` em uma máquina substituta.
4. Recupere o código da `main` e os diretórios de dados do backup externo.
5. Restaure separadamente Painel Mestre, administrador e cada instalação, mantendo `DATA_DIR`, porta e processo próprios.
6. Importe chaves e credenciais apenas do cofre seguro; nunca de documentação ou Git.
7. Inicie primeiro o Painel Mestre, depois o administrador. AMPLAYTV permanece parada até decisão explícita.
8. Teste tudo localmente antes de mover os hostnames do Cloudflare.
9. Só reconecte o WhatsApp depois de confirmar que nenhum processo antigo continua ativo.

## Exercício trimestral

- Restaurar uma cópia externa em pasta temporária.
- Executar `PRAGMA quick_check` e conferir tabelas/quantidades essenciais.
- Subir a aplicação temporariamente com `DISABLE_WHATSAPP=1` e porta isolada.
- Validar login, configurações, clientes, pagamentos e histórico.
- Destruir a cópia temporária ao final e registrar o resultado sem dados pessoais.
- Medir o tempo real e revisar as metas de RPO/RTO.

## Segundo computador de contingência

Uma cópia de código não é um standby útil sem dados recentes, chaves e um procedimento testado. Quando houver segunda máquina:

- mantenha dados cifrados e sincronizados de forma controlada;
- não coloque o processo do WhatsApp no início automático;
- não aponte o DNS para os dois túneis ao mesmo tempo;
- exija confirmação manual de que a produção antiga está parada;
- teste restauração com `DISABLE_WHATSAPP=1` antes de qualquer corte real.

Referências: [NIST SP 800-34](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final), [Cloudflare Access e validação do token na origem](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) e [ANPD — segurança para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-vf.pdf).
