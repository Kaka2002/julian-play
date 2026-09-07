# Auditoria das melhorias recomendadas

Atualizada em 07/09/2026. Este documento registra o estado comprovado no
código; itens operacionais externos não são marcados como implementados.

## Implementado

- Versão 1.3.36: a Central de Pendências passou a permitir editar título,
  detalhe, observação e prioridade, além de concluir ou excluir uma pendência.
  Cada decisão é protegida por sessão e CSRF, registrada em eventos e ligada à
  chave da origem; nenhum cliente, pagamento, campanha ou histórico é apagado.
  A edição pode reabrir uma decisão anterior, enquanto a correção da situação
  na origem continua removendo o item calculado naturalmente.
- Perfis da 1.3.36: painel administrador, cliente comercial no servidor e
  instalação local recebem as ações; o Painel Mestre permanece inalterado. A
  tabela auxiliar guarda somente estado administrativo e metadados da
  pendência, sem copiar dados de negócio. Validada com testes específicos,
  incluindo editar, concluir, excluir e preservação da origem, além de sintaxe
  JavaScript e `git diff --check`.

- Versão 1.3.35: detecção segura de possíveis clientes duplicados por WhatsApp
  normalizado e endereço MAC válido, incluindo os acessos de aplicativo. Grupos
  relacionados são consolidados, classificados pela situação dos cadastros e
  exibidos em `/clientes/duplicados`, na lista de clientes e na Central de
  Pendências. O administrador revisa cada ficha e corrige o identificador na
  origem; o sistema não une, exclui ou altera cadastros automaticamente.
- Perfis da 1.3.35: painel administrador, cliente comercial no servidor e
  instalação local recebem o diagnóstico; o Painel Mestre permanece
  inalterado. Cadastros anonimizados e identificadores incompletos são
  ignorados. Não há tabela, migração ou seed, e bancos, configurações,
  pagamentos, históricos, backups e sessões são preservados. Validada em banco
  temporário, rota protegida, integração com a central, suíte interna,
  navegação real, sintaxe, diff e pacote local limpo.

- Versão 1.3.34: conciliação financeira diagnóstica executada diariamente e
  também sob demanda em `/financeiro/conciliacao`. A rotina aponta cobrança
  aprovada sem pagamento vinculado, pagamento removido ou ausente, divergência
  de valor e vencimento do cliente anterior ao vencimento concedido pelo
  pagamento. As ocorrências entram na Central de Pendências com link para a
  conferência financeira e cada execução registra evento de auditoria.
- Perfis da 1.3.34: painel administrador, cliente comercial no servidor e
  instalação local recebem a rotina; o Painel Mestre permanece inalterado. A
  conciliação não corrige valores, receitas ou acessos automaticamente, não
  cria tabela, migração ou seed e preserva bancos, configurações, pagamentos,
  históricos, backups e sessões. Não há ação manual após deploy. Validada com
  testes isolados das quatro divergências e do cenário íntegro, proteção da
  rota, agendamento, suíte interna, navegação real, sintaxe, diff e pacote
  local limpo.

- Versão 1.3.33: Central de Pendências protegida e compartilhada pelos painéis
  de clientes. A tela consolida vencimentos e testes, contatos de CRM e
  atendimentos, cobranças pendentes ou falhas, mensagens incertas, renovações
  de painéis, campanhas pausadas, WhatsApp desconectado e backup atrasado.
  Prioridade, área responsável, referência de prazo, cliente ou origem e link
  de resolução são calculados diretamente das fontes existentes. Busca,
  filtros e paginação não criam cópias dos dados; o item desaparece quando a
  condição real é resolvida e o histórico permanece na área de origem.
- Perfis da 1.3.33: painel administrador, cliente comercial no servidor e
  instalação local recebem a central dentro do painel já autenticado. O
  Painel Mestre mantém sua Central de Saúde própria. Bancos, configurações,
  pagamentos, históricos, backups e sessões são preservados; não existe nova
  tabela, migração, seed nem ação manual após deploy. Validada com testes de
  consolidação e resolução, suíte interna, navegação real, sintaxe, diff e
  pacote local limpo.

- Versão 1.3.32: 22 rotas de cadastro e ações individuais extraídas para
  `routes/clientesAcoesRoute.js`, com dependências injetadas e proteção de
  renovação duplicada por instância. Status, consentimento, ficha, notas,
  pagamentos, bônus e mensagens preservam os serviços existentes; privacidade
  continua no módulo dedicado, com exclusão direta bloqueada.
- Perfis da 1.3.32: administrador de clientes, comercial no servidor e cliente
  local usam a extração; Painel Mestre mantém suas próprias rotas. Nenhum
  banco, configuração, histórico, backup ou sessão é alterado pela refatoração.
  Sem migração ou ação adicional após deploy/atualização. Validação: sintaxe
  JavaScript, comparação dos 22 handlers, sete testes novos, suíte interna,
  diff, geração oficial e teste de pacote limpo. Navegador não executado.

- Credenciais de clientes e integrações cifradas com AES-256-GCM, migração
  idempotente, rotação de chave e kit de recuperação cifrado.
- Backup diário verificado, cópia externa opcional, alerta de falha,
  `PRAGMA quick_check`, retenção diária/semanal/mensal e exercício mensal de
  restauração isolada com relatório do último backup recuperável.
- Renovação PIX e PayPal API idempotente; fila de renovação externa com novas
  tentativas.
- PayPal manual com fila própria, comprovante JPG/PNG/PDF dentro do `DATA_DIR`,
  conferência obrigatória pelo administrador, ID de transação único,
  vencimentos anterior/novo, confirmação idempotente e registro de estorno.
- CAPTCHA, CSRF, limitação persistente de login, TOTP opcional e auditoria.
- Sessões administrativas persistentes, armazenadas somente pelo hash do token,
  tela `/sessoes` e revogação total.
- Novas senhas administrativas exigem no mínimo 12 caracteres.
- Consentimento de marketing, opt-out por palavras-chave, limite diário,
  limite semanal por cliente, horário comercial, dias úteis, lotes,
  intervalos, pausa, retomada e cancelamento de campanhas. Reclamações podem
  ser registradas no histórico da campanha, bloqueiam imediatamente novos
  envios de marketing e a campanha pausa automaticamente quando a taxa
  configurável de erros ultrapassa o limite.
- Estado central de disco, memória, backup, WhatsApp, cobranças e versão por
  instalação no Painel Mestre.
- Testes automatizados para perfis, permissões, segurança, pagamentos,
  renovação externa, backup, atualização, criptografia e isolamento.
- Executor formal de migrações com um arquivo por versão, checksum, duração,
  backup verificado antes da alteração, transação, rollback e relatório por
  instalação. Sessões, pagamentos manuais e índices operacionais já usam o
  novo fluxo.
- Observabilidade inclui identificador de correlação por requisição e evento,
  versão instalada, versão esperada e estado de atualização no `/health`.
- O pacote gerado possui teste automatizado que o extrai em diretório
  temporário e reprova banco, sessão do WhatsApp, backups ou dados persistentes.
- Testes Playwright validam em Chrome a proteção da rota, o login real, o
  Painel e a ausência de transbordamento horizontal no menu usando ambiente
  totalmente isolado.
- A otimização de memória consulta o estado real do PM2 e reinicia somente
  processos `online`; processos parados ou com erro permanecem intocados.
- A fila persistente elimina texto e mídia cifrados após confirmação do envio,
  preservando metadados de auditoria e mantendo conteúdo somente para mensagens
  pendentes, incertas ou com falha.
- Campanhas calculam a previsão real antes do disparo e permitem novo envio
  depois do limite semanal, sem bloqueio permanente pelo histórico antigo.
- Manutenção mede páginas livres e conteúdo protegido do SQLite e oferece
  compactação por senha, com backup verificado, `VACUUM` e `quick_check`.
- Rotas de campanhas, pagamentos manuais, catálogos (Planos, Apps e
  Dispositivos) e Painéis possuem módulos próprios. As ações sensíveis de
  Painéis preservam a confirmação da senha atual.
- A página de Manutenção e as operações de diagnóstico, backup, restauração,
  exportação, cópia externa e compactação do banco possuem módulo próprio com
  as mesmas confirmações de senha e restrições por perfil.
- O monitoramento público executa a cada 15 minutos, confirma três falhas antes
  de alertar e também pode ser iniciado manualmente.
- Eventos operacionais possuem prévia e retenção protegida de 180/365 dias com
  backup, senha, compactação e validação; históricos financeiros, segurança,
  privacidade, auditoria, exclusões e reclamações são permanentes.
- CRM/leads possui módulo de rotas próprio, incluindo conversão em cliente e
  envio comercial pelo WhatsApp.
- Atendimentos possui módulo de rotas próprio, preservando filtros, notas na
  ficha do cliente, estados e acompanhamento pelo WhatsApp.
- Financeiro e exportação CSV possuem módulo próprio. Proteção, novo QR,
  reconexão e troca do número do WhatsApp também possuem módulo próprio, com a
  mesma restrição centralizada para instalações administradoras.
- Licença, identidade do robô, imagens, PIX, PayPal, monitoramento e acesso da
  Manutenção possuem módulo próprio, preservando senhas e restrições de perfil.
- Toda mudança funcional, correção ou refatoração relevante passa a atualizar
  este arquivo e `CONTEXTO-PARA-CODEX.md` na mesma entrega; `AGENTS.md` recebe
  novas regras permanentes quando aplicável.

## Parcial

- Pagamento manual: concluído para PayPal pessoal. Estorno corrige a receita e
  preserva o acesso para decisão explícita, evitando suspensão acidental.
- Migrações: o fluxo formal está concluído para toda alteração nova.
  Privacidade, campanhas, itens e eventos históricos já possuem migrações
  formais; a inicialização compatível permanece temporariamente como rede de
  segurança para instalações antigas.
- Rotas: pagamentos manuais, entrada/governança de campanhas, catálogos,
  Painéis, CRM/leads, Atendimentos, Financeiro, configurações e controles do
  WhatsApp, manutenção de banco/backups e ações individuais de clientes foram
  extraídos para módulos próprios. Renderização e auxiliares ainda permanecem
  no arquivo histórico. A sequência restante é: controles operacionais da
  Manutenção; dashboard/listagens; modelos; preparação comercial/renovação;
  revisão final do agregador.
  Os outros domínios do arquivo histórico
  continuam sendo separados somente quando forem alterados, evitando uma
  reescrita ampla sem benefício funcional.
- Observabilidade: o Painel Mestre compara automaticamente a versão devolvida
  por cada `/health` com a versão do próprio código publicado, sem variável
  manual.

## Pendente

- Cloudflare Access no Painel Mestre, que depende de configuração na conta
  Cloudflare e de uma política de acesso definida pelo proprietário.
- Pesquisa global, linha do tempo unificada, exportação de auditoria e política
  operacional de retenção/exclusão.
- Execução do instalador completo em uma máquina Windows física recém-formatada
  permanece como homologação externa; conteúdo, ausência de dados persistentes
  e atualização com preservação são testados automaticamente.

## Ação externa obrigatória

- Aumentar a RAM física/virtual do servidor para no mínimo 8 GB, preferivelmente
  16 GB. Código não substitui capacidade de memória.
- Manter mais de 10 GB livres no disco do servidor.
- Manter `julian-amplaytv` parado enquanto a cliente utilizar a instalação
  local.


- Versão 1.3.37: a edição de atendimentos agora abre o próprio registro e permite alterar motivo, prioridade, descrição e data do próximo contato. A atualização preserva cliente, status e histórico, registra a alteração e foi validada com 143 testes internos e 11 testes E2E.
