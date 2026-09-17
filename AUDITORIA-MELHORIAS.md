# Auditoria das melhorias recomendadas

Atualizada em 17/09/2026. Este documento registra o estado comprovado no
código; itens operacionais externos não são marcados como implementados.

## Implementado

- Corrigido o caso em que o deploy deixava o WhatsApp conectado, porém os
  indicadores de compatibilidade permaneciam `false`. A sessão restaurada
  podia conter `window.WWebJS` parcial, fazendo o whatsapp-web.js pular o
  `LoadUtils` oficial. A compatibilidade agora recarrega esse loader uma vez
  antes de aplicar o resolvedor e só libera o envio quando `sendMessage` e
  `sendSeen` estão disponíveis. Afeta o painel administrador, clientes
  comerciais no servidor e instalações locais; preserva banco, configurações,
  históricos, backups e sessão. Validado com 151 testes internos, testes de
  navegação, geração do pacote e teste específico de recuperação do loader.

- Corrigida a falha seguinte do envio de QR em sessões restauradas:
  `window.Store.ChatGetters` podia estar ausente, causando erro em
  `getIsNewsletter` antes do envio da mídia. A compatibilidade recupera o
  módulo oficial quando disponível e instala somente os getters de canal e
  transmissão como fallback. Bancos, configurações, históricos, backups e
  sessão permanecem preservados; validado na suíte interna completa.

- A exposição parcial da Store também podia omitir `Store.User`, interrompendo
  o envio ao montar a origem da mensagem com `getMaybeMeLidUser`. O serviço
  agora recupera o módulo oficial ou usa o identificador da conexão autenticada
  como fallback seguro. A alteração preserva os dados da instalação e foi
  validada na suíte interna completa.

- Correção definitiva da falha `window.WWebJS.sendSeen is not a function` no
  envio de texto e QR PIX: o whatsapp-web.js pode deixar esse helper ausente
  em uma sessão conectada. A compatibilidade instala um wrapper seguro que
  preserva o helper original quando possível e não bloqueia o envio quando a
  marcação de leitura falha. O health local expõe
  `compatibilidadeSendSeenAplicada` e `compatibilidadeSendMessageAplicada`
  para conferência operacional. Afeta o
  painel administrador, clientes comerciais no servidor e instalações locais;
  preserva banco, configurações, cobranças, históricos, backups e sessão do
  WhatsApp. Validado com `node --check`, suíte interna completa (151 testes),
  `git diff --check` e geração do pacote; o fluxo PIX usa ainda
  `sendSeen: false` como proteção independente. Exige deploy e teste real de
  entrega. A compatibilidade também não cria mais `window.WWebJS` durante a
  autenticação: ela aguarda a injeção oficial do `LoadUtils`, evitando que
  `sendMessage` fique ausente na sessão.

- O deploy do Windows passou a respeitar `PM2_HOME` já definido no terminal e
  usa o caminho padrão `.pm2` apenas quando não há configuração. Isso impede
  que o código atualizado seja aplicado a um daemon PM2 diferente do processo
  em produção. Nenhum banco, sessão ou backup é alterado. Validado com parse do
  PowerShell e `git diff --check`; requer novo deploy da rotina de atualização.
- O envio de QR PIX e textos usa `chat.sendMessage` como caminho principal e
  `client.sendMessage` apenas como fallback quando a conversa não puder ser
  carregada. A mudança evita conclusões sem ID observadas em produção e mantém
  a validação contra autoenvio. Validada na suíte interna completa (149 testes)
  e no pacote local limpo.

- Correção da falha `window.Store.QueryExist is not a function` observada em
  produção: a compatibilidade recupera o módulo `WAWebQueryExistsJob` quando
  disponível, aceita as variantes legadas e usa fallback somente para chats
  presentes na Store. A camada passou para a versão 2 e informa `queryExist`
  no resultado de instalação. Preserva banco, configurações e sessão do
  WhatsApp. Validada com teste específico de Store sem `QueryExist`, sintaxe e
  suíte operacional; requer deploy e confirmação de entrega em cliente real.

- O envio passou a tentar a API direta do cliente quando `getChatById` não
  retorna uma conversa, mantendo a exigência de ID e destinatário confirmado.
  Assim, uma Store sem conversa carregada não interrompe prematuramente o
  envio, e respostas vazias continuam sendo tratadas como falha. Validado na
  suíte interna completa (150 testes).

- A compatibilidade agora recupera também `WAWebFindChatAction` e usa o
  `FindOrCreateChat.findOrCreateLatestChat` oficial quando o telefone não está
  na coleção local. O chat real passa a ser carregado antes do envio de texto
  ou QR. Validado com teste de conversa ausente e preservação da confirmação
  por ID; requer novo deploy e teste real de entrega.

- O health local passou a informar `compatibilidadeQueryExistAplicada`, sem
  expor esse detalhe no endpoint público. Isso permite validar a camada antes
  do teste de envio. Validado na suíte interna e preserva todos os dados da
  instalação.

- Correção do envio de QR PIX em 17/09/2026: o telefone `@c.us` cadastrado é
  priorizado e LIDs retornados pelo WhatsApp só são aceitos quando a conversão
  confirma o mesmo telefone. Identificadores divergentes ou da própria conta
  conectada são rejeitados. A confirmação agora exige ID de mensagem e valida o
  destinatário; retornos sem ID não são registrados como sucesso. O fallback
  PIX copia e cola segue disponível quando a mídia falhar. Afeta painéis de
  clientes no servidor e instalações locais, preservando bancos, clientes,
  cobranças, configurações e sessões. Validada com `node --check`, testes de
  resolução de LID e confirmação de envio; requer deploy e teste real para um
  telefone de cliente distinto do administrador.

- Correção operacional do envio de QR Code PIX: a compatibilidade de
  `window.WWebJS.getChat` agora aguarda por até 30 segundos a inicialização da
  Store do WhatsApp Web, cria o namespace mínimo quando a Store chega primeiro
  e evita avaliações concorrentes durante navegações da página. O indicador de
  saúde só registra a camada como aplicada depois de sucesso real, permitindo
  confirmar no `/health` antes de testar um envio. A saúde consulta também o
  `AuthStore.AppState` e o identificador autenticado quando `Store.AppState`
  está sendo reconstruído, evitando falso estado de sessão presa.
  Nenhum banco, cliente, cobrança, configuração ou sessão é alterado. Afeta
  o painel administrador, clientes comerciais no servidor e instalações
  locais; o Painel Mestre não usa essa sessão. Validada com testes de
  compatibilidade imediata e de espera pela Store, sintaxe, suíte interna,
  E2E e pacote local; requer novo deploy e um envio real de teste.

- Versão 1.3.38: criada rota protegida `/mensagens-informativas` para envio
  manual de orientação com texto e múltiplas imagens a todos os clientes
  selecionados. A funcionalidade é independente de campanhas e respeita
  clientes ativos com telefone válido e opt-out de WhatsApp. Imagens ficam no
  DATA_DIR da instalação; não há compartilhamento entre instalações. Validada
  com `node --check` e `git diff --check`. Requer abrir a nova rota no painel
  após o deploy.

- Versão 1.3.37: a identificação "Licenciado para" fica restrita às telas
  Painel e Manutenção do painel administrador; as demais telas continuam sem
  essa faixa. Nenhum dado ou configuração é alterado. Validada por inspeção
  da renderização e checagem de sintaxe JavaScript.

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
- Cloudflare Access no Painel Mestre: configuração informada pelo proprietário
  como concluída para `mestre.julianplay.com.br`; nenhum segredo, e-mail ou
  política é armazenado no projeto. `gestao.julianplay.com.br` é alias do
  painel de clientes e não deve ser usado como endereço do Mestre.
- Topologia pública: documentação e instalador alinhados ao domínio do Mestre
  (`mestre.julianplay.com.br`) e aos aliases do painel de clientes
  (`painel.julianplay.com.br` e `gestao.julianplay.com.br`).
- Revisão de credenciais: nenhum padrão de segredo literal foi encontrado nos
  arquivos rastreados; a rotação de credenciais já exibidas em imagens,
  terminal ou conversas continua uma ação externa obrigatória.
- Procedimento de rotação segura documentado em
  `docs/ROTACAO-DE-CREDENCIAIS.md`, separando integrações que podem ser
  trocadas gradualmente das chaves de licença/cofre que exigem migração.

## Pendente

- Pesquisa global, linha do tempo unificada, exportação de auditoria e política
  operacional de retenção/exclusão.
- Execução do instalador completo em uma máquina Windows física recém-formatada
  permanece como homologação externa; conteúdo, ausência de dados persistentes
  e atualização com preservação são testados automaticamente.

## Ação externa obrigatória

- A medição operacional de 11/09/2026 encontrou 15,73 GB de RAM total e
  865,59 GB livres no disco D:, atendendo os mínimos de hardware. Manter a
  limpeza periódica de logs/temporários e repetir a medição quando houver
  aumento de carga; a memória livre observada foi de 3,41 GB naquele momento.
- Manter `julian-amplaytv` parado enquanto a cliente utilizar a instalação
  local.

## Validações operacionais de 11/09/2026

- Dependências de produção: `npm audit --omit=dev` foi executado com acesso ao
  registro. As correções seguras atualizaram `js-yaml` e `body-parser` e
  fixaram `qs` em `6.16.0` por override. O resultado caiu de 9 para 5
  vulnerabilidades; permanecem 5 vulnerabilidades altas no `extract-zip`
  transitivo da cadeia Puppeteer/`whatsapp-web.js`. A correção disponível
  exigiria uma mudança incompatível de Puppeteer e não foi forçada.
- A alteração de dependências foi validada com 143 testes internos, 11 testes
  de navegador e geração do pacote local limpo. O manifesto continua sem
  assinatura quando `LICENSE_PRIVATE_KEY` não está configurada no ambiente.

## Atualização de 16/09/2026

- Privacidade de valores monetários: o botão de olho foi retirado do menu e
  colocado ao lado de “Receita Mensal Recorrente” e no cabeçalho da tela
  Financeiro; na página de pagamentos manuais ele fica junto ao cabeçalho da
  própria tela. O estado fechado mascara
  os valores exibidos como `R$ •••`; ao abrir, os valores voltam a aparecer. A
  preferência fica somente no navegador, não altera dados, cálculos, campos
  de edição ou mensagens enviadas. Afeta o painel administrador, clientes
  comerciais no servidor e instalações locais; o Painel Mestre não usa este
  layout. As páginas Clientes, Editar cliente e Históricos não exibem o botão
  e mantêm seus valores visíveis. A correção do escape da expressão regular
  garante que o botão alterne de fato entre máscara e valor original. Validada
  com teste E2E focado, suíte interna (143 testes), navegador (11 testes),
  pacote local limpo e geração dos artefatos. Validar visualmente o botão e a
  troca de estado após o deploy.

- Privacidade e dados do cliente: o aviso, os campos de confirmação e as ações
  de exportação, anonimização e exclusão agora usam o mesmo alinhamento interno
  do título do painel. A separação entre as ações ficou visível sem alterar
  rotas, validações, permissões, bancos, históricos ou dados do cliente.
- A mudança visual afeta o painel administrador, clientes comerciais no
  servidor e instalações locais; o Painel Mestre não usa essa seção. Foi
  validada com a suíte interna (143 testes), os testes de navegador (11) e o
  pacote local limpo; a conferência visual da ficha deve ser feita após o
  deploy.


- Versão 1.3.37: a edição de atendimentos agora abre o próprio registro e permite alterar motivo, prioridade, descrição e data do próximo contato. A atualização preserva cliente, status e histórico, registra a alteração e foi validada com 143 testes internos e 11 testes E2E.

## Correção de 17/09/2026

- O envio automático de QR Code PIX passou a resolver o destinatário pelo ID
  atual do WhatsApp Web antes de anexar a mídia, com fallback para o número
  cadastrado. Corrige o erro de getter sem `id` registrado em uma renovação,
  preservando cobranças, clientes, bancos, sessões e mensagens de texto. A
  validação inclui resolução simulada de LID, 143 testes internos, 11 testes
  E2E, geração do pacote e teste de pacote local limpo.
- O envio do QR e da mensagem de erro agora usa `linkPreview: false`, evitando
  a consulta instável de prévia de links do WhatsApp Web. A alteração afeta os
  quatro perfis e preserva dados, sessões e textos; requer novo deploy e um
  teste manual de renovação para confirmar o envio da mídia.
- A dependência `whatsapp-web.js` foi fixada na 1.34.6 para evitar a regressão
  de envio de imagens da 1.34.7. Como o erro de getter sem id também ocorreu
  com a sessão conectada, o QR passa a ser enviado como documento PNG
  escaneável; não há alteração de cobrança, banco ou sessão.
- Quando o anexo também falha, o código copia e cola é enviado como texto para
  manter a cobrança operacional sem depender de mídia.
- Para destinatários `@lid`, o QR tenta também o telefone real em `@c.us`,
  recuperado pelo WhatsApp Web. Isso permite contornar falha de `getChat` no
  LID sem apagar sessão, clientes, cobranças ou históricos.
- Como a falha continuou para `@c.us` e `@lid`, o cliente passou a instalar
  `services/whatsappCompatService.js` no processo do WhatsApp. O helper
  `window.WWebJS.getChat` agora consulta `Store.Chat.get`/`Store.Chat.find`
  antes do caminho antigo que lança `getChat`; a sessão e os dados das quatro
  formas de execução são preservados. Foram executados os testes internos,
  E2E, verificação de sintaxe e geração do pacote; ainda é necessária uma
  renovação manual após o deploy para confirmar o comportamento no WhatsApp
  Web conectado.
- A saúde da sessão agora reconhece `getState() === 'CONNECTED'` mesmo sem o
  evento `ready`, evitando reinícios após autenticação e permitindo os envios
  somente quando o WhatsApp Web confirmou a conexão.

- Controle de ativação atômica: a primeira consulta com fingerprint vincula a licença em uma atualização condicional SQLite; concorrências posteriores são registradas e bloqueadas sem alterar dados da instalação.

- Manifesto de pacote: gerador Ed25519 criado para registrar versão, arquivo, tamanho e SHA-256; a distribuição só deve ser feita após configurar a chave privada do Painel Mestre.

- Versão 1.3.38: menu Pendências reposicionado para depois de Manutenção, preservando rota, destaque ativo e permissões.

- Manifesto do pacote: instalador e atualizador conferem nome, tamanho, SHA-256, algoritmo e presença da assinatura antes de extrair ou atualizar. Pacotes sem manifesto continuam compatíveis por enquanto.

- Identificação comercial: o painel exibe Licenciado para e o ID da instalação em todas as páginas autenticadas, sem expor segredos.

- Política Ed25519 para novas licenças: emissão no Painel Mestre bloqueia quando a chave privada não está configurada e assina novos códigos exclusivamente com Ed25519. Códigos HMAC antigos continuam legíveis para migração; instalações existentes não são alteradas.

- Aceite de contrato: rota autenticada `/contrato` apresenta regras de uso e registra versão, data, usuário e evento de auditoria após o aceite.

- Download individual revogável: tokens do Painel Mestre têm expiração, limite de downloads e endpoint de revogação, sem expor o pacote quando inválidos.

- Exportação de auditoria: botão na Manutenção gera CSV dos eventos administrativos registrados.

- Operação: Playwright mantido como dependência de desenvolvimento e protegido por .npmrc com include=dev; instalação do Chromium validada e 
pm run test:e2e executado com 11 testes aprovados.


## Atualização de 09/09/2026

- Mensagens informativas: layout final corrigido com listas de clientes, transferência, upload e botão no rodapé esquerdo sem sobreposição. A funcionalidade permanece independente de campanhas.
- Playwright: dependência de desenvolvimento preservada por `.npmrc` (`include=dev`), Chromium instalado e teste E2E final aprovado com 11 de 11 testes.

- Mensagens informativas: corrigida validação do formulário para permitir envio quando há clientes selecionados e avisar apenas quando a lista está vazia. 11 testes E2E aprovados.

- Monitoramento público: endpoint do Painel Mestre corrigido para mestre.julianplay.com.br/ready, alinhado ao serviço julian-master.

- Mensagens informativas: corrigido ReferenceError no carregamento da rota e confirmada abertura normal após deploy. 11 testes E2E aprovados.

- Mensagens informativas: adicionada mensagem específica quando nenhuma imagem é selecionada antes do envio. 11 testes E2E aprovados.

- Mensagens informativas: corrigida validação persistente após tentativa sem cliente; alteração de seleção libera o envio. 11 testes E2E aprovados.

- Mensagens informativas: clientes transferidos para selecionados agora são marcados para envio, evitando validação incorreta. 11 testes E2E aprovados.

- Mensagens informativas: histórico visual dos envios implementado, registrando data, destinatários, texto e imagens no DATA_DIR da instalação.

- Histórico de informativos limitado a 7 dias, com limpeza lógica automática na leitura.

- Histórico de informativos ajustado para retenção de 2 dias, substituindo automaticamente registros mais antigos.

- Processo de entrega atualizado para permitir deploy após push e validação local, acompanhando o workflow em paralelo.
- Monitoramento público: workflow agendado removido a pedido; a validação do projeto permanece ativa.
- Teste de governança atualizado para confirmar que o monitoramento público permanece desativado.

- Conciliação financeira: pagamentos removidos permanecem apenas para auditoria e deixam de gerar divergências órfãs. Registros ativos sem pagamento continuam sinalizados. Alteração compartilhada pelos perfis; dados preservados; validação pendente de execução da conciliação em produção.

- Teste de conciliação atualizado para confirmar que pagamentos removidos não geram divergência; cobranças sem pagamento, valores divergentes e acesso desatualizado continuam detectados.

- Conciliação financeira: adicionada navegação direta Voltar ao financeiro na tela de conciliação.

- Mensagens informativas: texto e histórico receberam espaçamento e tipografia alinhados à tela de clientes; últimos envios agora são paginados em 5 registros por página.

- Painel Mestre: botão flutuante de voltar ao topo adicionado a todas as telas, exibido apenas quando há rolagem vertical suficiente.

- Mensagens informativas: histórico alinhado ao formulário, com tipografia e espaçamento consistentes; prévias de imagens movidas para a coluna de upload, miniaturizadas e limitadas ao espaço vertical disponível.

- Proteção efetiva do backup externo: a interface só sinaliza proteção fora do computador após confirmação explícita e cópia SQLite/SHA-256 validada nas últimas 36 horas. Cópias manuais também atualizam o último horário validado; ausência ou atraso permanece visível como pendência. Afeta os quatro perfis, preserva dados e exige configurar um destino externo real e gerar a primeira cópia após o deploy.
- Validação operacional em 11/09/2026: o proprietário confirmou acesso ao
  destino `G:\\Meu Drive\\BackupsJulianPlay` e a presença de cópia diária com
  manifesto. A confirmação da sincronização externa foi concluída.
- Exercício de restauração aprovado em 11/09/2026: cópia externa validada com
  `quick_check`, aplicação iniciada em porta isolada sem WhatsApp e login/painel
  conferidos visualmente. A limpeza da pasta temporária é a última ação manual.

eady ao PM2 assim que o servidor HTTP inicia, antes da inicialização do WhatsApp. A rota /ready mantém a validação efetiva do banco; isso evita reinícios causados por wait_ready sem alterar bancos, configurações ou sessões.


- Correção operacional 11/09/2026: bot.js envia o sinal ready ao PM2 assim que o servidor HTTP inicia, antes da inicialização do WhatsApp. A rota /ready mantém a validação efetiva do banco; isso evita reinícios causados por wait_ready sem alterar bancos, configurações ou sessões.

- Correção operacional 11/09/2026: o atualizador aguarda o encerramento real de processos residuais e recria processos PM2 ausentes durante a recuperação, evitando falhas secundárias no rollback por PID obsoleto. Validar com testes internos e exercício de atualização.
- Validação da correção de deploy em 11/09/2026: 143 testes internos, 11 testes de navegador e geração do pacote local aprovados.
