# Estado operacional atual

Atualizado em 04/08/2026. Este documento é a fonte de verdade do ambiente em produção. As seções antigas de `CONTEXTO-PARA-CODEX.md` permanecem apenas como histórico.

## Produção ativa

| Componente | Situação atual |
|---|---|
| Computador | `Julianelli-CP` (Windows) |
| Código administrativo | `D:\julian-play` |
| Dados persistentes | `D:\JulianPlayDados` |
| Painel Mestre | processo `julian-master`, porta `9000` |
| Painel administrador | processo `julian-play-admin`, porta `10001` |
| Instalação local independente | processo `julian-play-cliente`, porta `10000`, dados em `C:\JulianPlay\dados` |
| AMPLAYTV migrada | `D:\JulianPlayDados\clientes\amplaytv`, processo e porta `11004` parados |
| Túnel público | serviço Windows `Cloudflared`, túnel `julian-play-casa` |
| Endereços ativos | Painel Mestre: `mestre.julianplay.com.br`; painel de clientes: `painel.julianplay.com.br` e alias `gestao.julianplay.com.br` |
| VPS antigo | parado; somente contingência histórica, não atualizar nem iniciar sem migração formal dos dados |

Nunca execute a mesma sessão do WhatsApp em duas máquinas ou dois processos. O `julian-play-cliente` da porta 10000 é independente; não deve ser parado durante o deploy administrativo.

## Controles implantados no código

- Deploy em duas fases: prepara, instala dependências, valida sintaxe e testes fora da pasta ativa; só então troca a versão.
- Rollback automático de código e `node_modules` se a nova versão não responder em `/ready` com a versão esperada.
- PM2 usa sinal de prontidão e encerramento gracioso; somente processos previamente online voltam a subir.
- `julian-amplaytv` permanece explicitamente parada durante deploy e recuperação.
- O workflow de monitoramento público foi desativado; a validação do projeto continua no workflow `Validacao do Julian Play`.
- `/health` detalhado é local; solicitações externas recebem somente estado resumido, sem números ou últimos contatos.
- Backups copiados externamente são reabertos como SQLite e comparados por SHA-256.
- O exercício mensal restaura preferencialmente a cópia externa, quando disponível.
- Mensagens proativas possuem fila persistente criptografada e retomada controlada após reinício. Itens que ainda aguardavam são retomados; um envio interrompido no meio fica como `incerto` para revisão manual, evitando repetição automática.
- Exclusão direta de clientes foi substituída por exportação do titular e anonimização auditável.
- A dependência `sqlite3` está na versão 6.0.1; a auditoria das dependências de produção não encontrou vulnerabilidades conhecidas em 04/08/2026.

## Pendências que dependem de decisão ou recurso externo

1. Confirmar no painel que a pasta de backup é realmente sincronizada para fora deste computador e gerar uma cópia validada. A tela só mostra proteção efetiva após uma cópia externa recente; uma segunda pasta em outro disco local não protege contra roubo, incêndio ou perda completa da máquina.
2. Rotacionar qualquer webhook, token ou senha que já tenha aparecido em imagem, histórico, terminal ou conversa.
3. Preparar uma segunda máquina física somente depois de definir o procedimento de sincronização. Ela deve permanecer fria, sem iniciar a sessão do WhatsApp automaticamente.
4. Executar trimestralmente a recuperação completa documentada em `docs/RECUPERACAO-E-CONTINGENCIA.md`.

## Critérios de operação saudável

- Portas `9000`, `10000` e `10001` respondem; `11004` permanece fechada enquanto AMPLAYTV estiver local.
- `https://mestre.julianplay.com.br/ready`, `https://painel.julianplay.com.br/ready` e `https://gestao.julianplay.com.br/ready` retornam HTTP 200.
- PM2 mostra `julian-master`, `julian-play-admin` e `julian-play-cliente` online.
- O último backup local e a cópia externa mostram integridade SQLite, SHA-256 e exercício aprovado.
- O Painel Mestre não mostra instalação ativa com versão diferente da versão do repositório publicado.

Referências: [Cloudflare Access para aplicação self-hosted](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [NIST SP 800-34 — planejamento de contingência](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final) e [guia de segurança da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-vf.pdf).

## Atualização operacional de 11/09/2026

- O proprietário informou que o Cloudflare Access do Painel Mestre já foi configurado. A configuração deve continuar sendo validada externamente, mas seus e-mails, tokens e políticas não devem ser registrados neste repositório.
- A topologia pública foi confirmada: `mestre.julianplay.com.br` atende o Painel Mestre; `painel.julianplay.com.br` e `gestao.julianplay.com.br` atendem o mesmo painel de clientes. O instalador do Mestre passa a usar `mestre.julianplay.com.br` como domínio padrão para novas instalações.
- A revisão dos arquivos rastreados não encontrou padrões de tokens, chaves privadas ou autorizações literais. Ainda é necessário rotacionar qualquer credencial que tenha sido exposta fora dos arquivos, especialmente webhooks, tokens de pagamento, senhas e chaves de sessão.
