- A versão de entrega atual é **1.3.44**. Onde a privacidade financeira estiver ativada, valores ocultos passam a usar `R$ ***` e o botão exibe um olho fechado; ao revelar os valores, o botão exibe o olho aberto. A preferência continua exclusiva do navegador e os valores, cálculos, bancos e históricos não são alterados. Afeta painel administrador, comerciais e instalações locais; Painel Mestre inalterado.\r\n\r\n- A versão de entrega atual é **1.3.43**. A sincronização do Mercado Pago inicializa e agenda automaticamente o Relatório de Liberações diário pela API oficial quando o Access Token já estiver configurado. Quando o arquivo fica pronto, o sistema importa créditos, débitos e rendimentos com identificadores únicos, preserva o histórico importado e tenta novamente após falha em vez de marcar uma sincronização incompleta como concluída. O saldo exibido continua sendo conciliado sem reescrever pagamentos ou despesas já registrados; a migração `2026-09-23-017-movimentos-mercado-pago` registra as movimentações externas. Afeta painel administrador, comerciais e instalações locais; Painel Mestre inalterado.\r\n\r\n# Auditoria das melhorias recomendadas

Atualizada em 11/09/2026. Este documento registra o estado comprovado no
código; itens operacionais externos não são marcados como implementados.

## Implementado

- Sincronização de rendimentos Mercado Pago em 23/09/2026: a página Financeiro > Rendimentos consulta o relatório de liberações pronto na conta e importa apenas `asset_management_gain`, com deduplicação por operação externa. Demais movimentos não entram como rendimento. Depende do relatório de liberações configurado no Mercado Pago e do Access Token já protegido no cofre da instalação.

- Rendimentos financeiros em 23/09/2026: incluída a página **Financeiro > Rendimentos** para registrar créditos da conta, com descrição, valor, data, instituição financeira e observações. O saldo mensal soma pagamentos válidos de clientes e rendimentos válidos, e subtrai as despesas válidas. Cada origem permanece separada; o lançamento pode ser editado ou removido do resumo, preservando o histórico. A migração `014-rendimentos-financeiros` cria a estrutura isolada com backup prévio. Afeta administrador, comerciais e instalações locais; Mestre inalterado. Nenhum acesso bancário é armazenado.

- Cópia de campos da ficha de cliente em 23/09/2026: a versão **1.3.40** adiciona ícone de cópia nos campos textuais e URLs da ficha, inclusive nas conexões de aplicativo acrescentadas durante a edição. Campos com lista de escolha, `Indicado por`, `Valor do Plano` e `Assinatura App` ficam sem o ícone. A cópia é local ao navegador e não altera nem envia dados do cliente. Afeta administrador, comerciais e instalações locais; Mestre inalterado. Validado com sintaxe, teste direcionado, suíte interna, diff, pacote e instalação limpa.

- Versionamento visual em 20/09/2026: a versão oficial do pacote foi atualizada para **1.3.38** e o Painel Administrativo passou a mostrar o selo abaixo do nome do sistema, usando a mesma origem (`package.json`) do Painel Mestre. A alteração é visual e não modifica bancos, clientes, sessões ou configurações.

- Comprovantes PIX recebidos pelo WhatsApp em 19/09/2026: mídias JPG, PNG e PDF de até 5 MB são vinculadas ao cliente e ao plano atual como pendência única de conferência. Em `Financeiro > Abrir pagamentos pendentes`, o administrador abre o arquivo, confere o pagamento no banco, informa o identificador PIX ou observação e confirma a renovação auditada. A confirmação registra `PIX (comprovante WhatsApp)` como forma de pagamento. O robô não responde ao comprovante e pausa o atendimento; arquivos inválidos, mensagens repetidas ou contatos sem cliente não criam cobrança. A migração `013-comprovantes-pix-whatsapp` cria o índice operacional com o backup prévio. Afeta administrador, comerciais e instalações locais; Mestre inalterado. Dados, sessões e configurações são preservados. Validação: sintaxe, teste direcionado, suíte interna, diff, pacote e teste de pacote limpo.

- Controle de despesas e comparação de caixa em 19/09/2026: incluída a página **Financeiro > Despesas** para lançar, editar e remover pagamentos efetuados, com categorias, forma de pagamento e observações. O resumo mensal mostra receita efetivamente recebida, despesas válidas e saldo, sem misturar projeção recorrente com movimentação real de caixa. A remoção é lógica e auditada, e a migração `012-despesas-financeiras` cria a estrutura com backup prévio do banco. Afeta painel administrador, clientes comerciais no servidor e instalações locais; Painel Mestre inalterado. Clientes, pagamentos existentes, sessões, configurações e backups são preservados. Validado com sintaxe, suíte interna, diff, pacote e teste de pacote limpo.

- Conferência de receita em Financeiro em 19/09/2026: a página de despesas compara o total recorrente projetado com os pagamentos válidos do mês, destaca valores iguais, diferença a receber ou recebido acima da projeção. O comparativo é somente informativo e não modifica os registros financeiros; o Dashboard mantém apenas a visão resumida de recorrente e recebido.

- A conferência de receita também está em **Financeiro > Despesas**, ao lado de despesas e saldo mensal. Assim, a análise do mês reúne projeção recorrente, recebido real, diferença entre ambos e resultado após custos.

- Vendas com pagamento antecipado passaram a ser destacadas positivamente no Dashboard e no Financeiro quando realizadas no mês filtrado. Planos Trimestral, Semestral e Anual pagos em períodos anteriores compõem somente a receita recorrente mensal equivalente, sem serem somados novamente como caixa ou nova venda; a diferença entre caixa e recorrência não é apresentada como atraso.

- O indicador de vendas antecipadas passou a abranger somente Trimestral, Semestral e Anual, com desconto comparado ao valor mensal multiplicado pelo período contratado. O percentual por plano e a economia do mês tornam a estratégia comercial auditável.

- A venda antecipada do mês é exibida sem misturar contratos antigos ainda vigentes, preservando a leitura correta de caixa e recorrência.

- Prevenção de PIX duplicado em 18/09/2026: quando o WhatsApp devolve o erro interno de getter depois de tentar enviar o QR Code, o sistema trata o resultado como inconclusivo e não envia o documento PNG nem o PIX copia e cola. Falhas explícitas de outra natureza mantêm os fallbacks existentes. Afeta administrador, clientes comerciais e instalações locais; Painel Mestre inalterado. Dados, cobranças, configurações, sessões e backups são preservados, sem migração. Validado em teste isolado, sintaxe e diff; suíte completa e confirmação no telefone pendentes.

- Menu comercial sem Bônus Mensal em 18/09/2026: o robô exclui o plano técnico Bônus Mensal da relação comercial e renumera os demais planos a partir de 1. O crédito de bônus continua restrito à ficha de cliente, onde já possui as validações de saldo e auditoria. Afeta administrador, clientes comerciais e instalações locais; Painel Mestre inalterado. Dados, bancos, PIX, sessões, backups e configurações são preservados, sem migração. Validado com teste específico, sintaxe, diff e suíte interna com 160 testes aprovados; a atualização da instância local depende de recuperação do registro do PM2.

- Correção de entrega WhatsApp/PIX em 17/09/2026: destinos resolvidos como
  `@lid` agora são tentados antes do telefone `@c.us`, o envio textual aguarda
  a confirmação disponível e resposta vazia não dispara uma segunda tentativa,
  evitando a duplicidade vista no aviso de vencimento próximo. A mídia do QR
  tenta imagem, documento PNG e código copia e cola em sequência. O cliente
  também reutiliza o cache Web `2.3000.1047557390` quando esse arquivo existe,
  mantendo a sessão e os dados persistentes. Afeta o painel administrador,
  clientes comerciais no servidor e instalações locais; o Painel Mestre fica
  fora do fluxo. Bancos, configurações, sessões, backups e dados do cliente
  são preservados. Limitação: o cache fixado só é ativado onde o arquivo
  anterior está disponível; sem ele, a biblioteca usa a versão Web atual.
  Validação: `node --check`, teste de envio sem ID e de prevenção de
  duplicidade, suíte interna, testes de navegação, geração do pacote e
  workflow remoto. Após o deploy, a chegada no telefone do cliente ainda
  precisa ser conferida em uma tentativa real.

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

- Rollback operacional de 17/09/2026: reversão preparada para o commit-base `1395d8a` de 16/09/2026 às 21:57, última revisão anterior às alterações recentes de compatibilidade do WhatsApp. Bancos, configurações, backups, sessões `.wwebjs_auth`, diretórios `DATA_DIR` e PM2 são preservados; falta aplicar o deploy e validar um envio real de PIX.

- Correção de inicialização WhatsApp em 17/09/2026: diagnóstico confirmou sessão presa em `autenticado` sem evento `ready`, causando falha de texto e mídia. `whatsapp-web.js` foi atualizado e fixado em `1.34.7`, com a injeção oficial atualizada. Dados, configurações, backups, sessões e `DATA_DIR` preservados; 143 testes internos passaram. A validação remota exige o processo alcançar `conectado` e um envio real de PIX após o deploy.
- Envio PIX ajustado em 17/09/2026: texto e QR usam `sendSeen=false`, removendo a chamada secundária que falhava com `sendSeen` ausente sem alterar o conteúdo da cobrança. Validação interna e navegador devem ser repetidas; dados e sessões preservados.

## Correcao de duplicidade do menu em 18/09/2026

- Correcao sobre a versao 1.3.37: o envio de imagens do robo preserva as opcoes originais, sem `waitUntilMsgSent`, e trata retorno sem ID como inconclusivo, encerrando a tentativa sem repetir como documento ou texto. O log nao declara entrega confirmada sem ID. Falhas explicitas continuam usando as alternativas existentes.
- Afeta administrador, clientes comerciais e instalacoes locais; Painel Mestre inalterado. Preserva bancos, configuracoes, backups, sessoes e DATA_DIR, sem migracao. A regra de atendimento humano permanece igual.
- Validacao automatizada cobre retorno vazio/com objeto sem ID, envio pelo chat/direto, legenda sem texto duplicado, ID valido e erro explicito. Executados: 10 testes de regressao, suite interna com 156 testes aprovados, node --check, git diff --check, geracao oficial e teste de pacote limpo aprovados. Testes de navegador nao executados nesta correcao de envio.
- Depois de aplicar a atualizacao, conferir um unico envio real de menu com imagem no telefone. Ausencia de ID nao comprova entrega; erros explicitos e timeout continuam sujeitos ao comportamento de reserva existente.

- Ajuste apos teste real de 18/09: a imagem falhou com erro interno de getter e o texto reserva chegou. Retirada a opcao adicional waitUntilMsgSent introduzida nesta correcao, restaurando o envio original que havia entregue a foto. Protecao contra duplicidade sem ID mantida; entrega visual ainda depende de novo teste real.

## Compatibilidade de midia WhatsApp em 18/09/2026

- O erro de getter persistiu apos retirar waitUntilMsgSent. O relato https://github.com/wwebjs/whatsapp-web.js/issues/201922 descreve colisao do campo privado __x_id da midia com o MsgKey da mensagem; o trecho correspondente existe na biblioteca 1.34.7 instalada.
- Adaptacao versionada em compatibilidadeMidiaService remove apenas message.__x_id do objeto final de envio no navegador, antes de construir o modelo. Guarda de estrutura recusa versoes desconhecidas, aplicacao idempotente e refeita apos reinjecao. Nao modifica node_modules nem repete envio. Protecao de retorno sem ID mantida.
- Afeta imagens e outras midias enviadas pelo cliente WhatsApp do administrador, comerciais e locais; Mestre inalterado. Preserva bancos, sessao, cache, configuracoes e backups. Sem migracao ou deploy nesta sessao; requer reinicio do processo e teste real com menu.
- Validacao inclui reproducao isolada da colisao de ID, fonte real instalada, idempotencia, reinjecao e preservacao de texto. Confirmacao de entrega real continua pendente.

- Resultado: 159 testes internos aprovados, incluindo tres novos de compatibilidade e dez de duplicidade; sintaxe dos JavaScripts e git diff --check aprovados. Entrega real apos reinicio permanece pendente; acesso do agente ao PM2 bloqueado por EPERM.

## Bloqueio definitivo de fallback PIX em 18/09/2026

- O teste real confirmou que a falha de mídia pode variar e ainda assim o QR original é exibido. Por isso, a cobrança PIX não possui mais fallback para PNG como documento ou texto copia e cola após a tentativa de QR Code. Cada solicitação cria somente uma tentativa de mensagem.
- Em caso de falha de confirmação, o log registra que o fallback foi bloqueado. Não há reenvio automático, pois uma segunda cobrança poderia induzir pagamento duplicado.
- Validação automatizada cobre falha conhecida e falha genérica de mídia, ambas com uma única chamada de envio. Requer reiniciar o processo administrador e confirmar uma nova solicitação de plano no WhatsApp.

## Paginação padrão de cinco registros em 18/09/2026

- Implementado: a paginação inicia em 5 registros em todas as telas paginadas, inclusive Pendências e histórico de licenças do Painel Mestre. O seletor foi atualizado para iniciar em 5; dados e configurações existentes são preservados.
- Validação concluída: 92 testes direcionados, suíte interna com 160 testes, verificações de sintaxe e diff, pacote local e teste de instalação limpa aprovados.

## Botão de retorno ao topo no Financeiro em 18/09/2026

- Implementado: o botão de retorno ao topo passa a surgir após uma rolagem curta, tornando-o disponível no Financeiro também quando a página possui poucos registros.

## Receita recorrente e receita recebida em 19/09/2026

- Implementado: a projeção recorrente considera somente o valor proporcional dos planos ativos. A receita recebida no mês soma os pagamentos válidos, incluindo aplicativo apenas no pagamento ou renovação que o registrou, permitindo comparar projeção e valor real.
- Validação concluída: testes de cálculo e interface, suíte interna, sintaxe, pacote local e teste de instalação limpa aprovados.
