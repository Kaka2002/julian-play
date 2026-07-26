# Regras de desenvolvimento e entrega

Estas regras se aplicam a toda alteracao neste repositorio. O sistema possui duas formas de execucao que compartilham o mesmo codigo e ambas devem continuar funcionando.

## Continuidade entre sessoes

Antes de iniciar qualquer tarefa, leia tambem `CONTEXTO-PARA-CODEX.md`. Esse
arquivo registra arquitetura, estado operacional, migracoes, Cloudflare e
decisoes que precisam sobreviver ao historico local do Codex.

Depois de mudancas importantes de infraestrutura, arquitetura, entrega ou
operacao, atualize `CONTEXTO-PARA-CODEX.md`. Nunca grave nele senhas, tokens,
cookies, chaves ou outros segredos.

## Ambientes suportados

### Servidor Windows

- Codigo publicado em `C:\bots\julian-play`.
- O Painel Mestre cria e administra instalacoes isoladas.
- Cada instalacao possui porta, banco, sessao do WhatsApp, processo PM2 e `DATA_DIR` proprios.
- O perfil e definido principalmente por `LICENSE_ROLE`, `LICENSE_CUSTOMER_NAME` e `JULIAN_PLAY_APP_NAME`.
- O deploy oficial e executado por `deploy.ps1`, acionado pelo GitHub Actions depois de push na branch `main`.

### Instalacao local no computador do cliente

- A entrega oficial fica em `entrega-cliente-local\ENVIAR_AO_CLIENTE`.
- `julian-play-app.zip` deve ser gerado por `entrega-cliente-local\USO_INTERNO_NAO_ENVIAR\CRIAR-PACOTE-APP.ps1`.
- Instalacao e atualizacao usam `INSTALAR-PAINEL.ps1` e `ATUALIZAR-PAINEL.ps1` da pasta de entrega.
- Banco, configuracoes, backups e sessao do WhatsApp existentes devem ser preservados nas atualizacoes.
- O cliente nao recebe `.git`, bancos, sessoes do WhatsApp, backups, arquivos internos do servidor ou segredos.

## Regras para qualquer alteracao

1. Identificar se a mudanca e compartilhada, exclusiva do Painel Mestre, exclusiva de uma instalacao administradora ou exclusiva de cliente comercial/local.
2. Nao usar a existencia de `LICENSE_CUSTOMER_NAME` como unica indicacao de permissao. Para diferenciar administrador e cliente, usar a regra central `instalacaoAdministrador()` quando aplicavel.
3. Manter dados de cada instalacao dentro do respectivo `DATA_DIR`/`DB_PATH`. Nunca fazer uma instalacao ler ou alterar o banco ou a sessao de outra.
4. Valores iniciais de uma instalacao nova nao podem sobrescrever valores ja gravados em `configuracoes`.
5. Alteracoes de interface condicionadas por perfil devem ter a mesma protecao na rota ou servico que executa a acao. Esconder somente o botao nao e suficiente.
6. Operacoes centralizadas no Painel Mestre nao devem ser duplicadas no painel administrador de clientes.
7. Nao alterar scripts de instalacao ou atualizacao sem confirmar que banco, `.wwebjs_auth`, backups, configuracao local e processos PM2 continuam preservados.
8. Nao colocar dados reais da JULIAN PLAY como padrao de novas instalacoes. Nome da empresa, imagens e dados PIX devem iniciar vazios para o cliente preencher.
9. Nao executar seed de demonstracao em instalacoes reais.
10. Nao incluir `entrega-cliente-local\ENVIAR_AO_CLIENTE.zip` ou `julian-play-app.zip` no Git. Esses arquivos sao artefatos gerados.

## Validacao obrigatoria

Depois de alterar JavaScript:

```powershell
node --check caminho\arquivo-alterado.js
```

Depois de alterar PowerShell, validar o parse do arquivo. Antes da entrega, executar tambem:

```powershell
git diff --check
powershell -NoProfile -ExecutionPolicy Bypass -File .\entrega-cliente-local\USO_INTERNO_NAO_ENVIAR\CRIAR-PACOTE-APP.ps1
```

Quando a alteracao afetar configuracoes iniciais, validar usando um banco temporario novo e confirmar separadamente que configuracoes existentes continuam prevalecendo.

Quando a alteracao afetar perfil ou permissao, validar ao menos os cenarios:

- Painel Mestre;
- painel de clientes administrador;
- cliente comercial provisionado no servidor;
- instalacao local do cliente.

## Entrega obrigatoria ao concluir uma alteracao

Sempre informar comandos prontos para:

1. revisar, adicionar somente os arquivos da mudanca, criar commit e fazer push para `origin main`;
2. atualizar manualmente o servidor com `C:\bots\julian-play\deploy.ps1`;
3. gerar ou recriar o pacote `ENVIAR_AO_CLIENTE` localmente;
4. gerar o ZIP externo da pasta para envio;
5. instalar uma nova copia local ou atualizar uma instalacao local existente, conforme o caso.

O `deploy.ps1` deve recriar o pacote de instalacao local no servidor depois de uma atualizacao bem-sucedida.
