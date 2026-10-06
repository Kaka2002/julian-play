
## Assistente de gestão por WhatsApp na versão 1.3.47

- Implementado: modo opcional e desligado por padrão. A instalação cadastra os WhatsApps administrativos autorizados na Manutenção; somente esses números acionam o assistente.
- Nesta primeira etapa, o assistente responde `ajuda`, resumo do mês, vencimentos de hoje/amanhã e consulta de cliente. As consultas são somente leitura, registradas em eventos e isoladas no banco/DATA_DIR da instalação.
- Não gera cobrança, não baixa pagamento, não renova, não altera clientes e não modifica as campanhas, a fila, os horários ou as respostas automáticas existentes. Painel Mestre inalterado; administrador, comerciais e instalações locais recebem a opção.
- Limitação: exige WhatsApp conectado, recurso habilitado e número autorizado. Ações administrativas ficam para etapa futura, com confirmação explícita.
- Validação: sintaxe, testes dedicados de autorização, consultas e preservação de pagamentos; 175 testes internos, 11 testes de navegador, geração do pacote e teste de instalação limpa aprovados. O manifesto externo continua sem assinatura quando a chave privada Ed25519 não está configurada.

## Implementado: envio manual ou pelo robô na versão 1.3.46

- A ficha oferece Preparar PIX manual ao lado de Enviar PIX pelo robô. Modelos também oferecem preparação manual, incluindo PIX quando previsto pelo modelo. A escolha é por ação; não muda os agendamentos existentes. Para operação exclusivamente manual, desligar envios proativos em Manutenção.
- A preparação independe da conexão WhatsApp, abre uma prévia com cópia de texto e link para conversa com mensagem preenchida. Abrir/copiar não registra entrega, nota de envio ou renovação. O usuário confirma o envio no próprio WhatsApp.
- PIX usa o provedor atual: Mercado Pago cria cobrança pelo serviço existente; PIX estático usa a configuração da instalação e requer conferência do comprovante. Cada preparação de PIX gera uma cobrança; não repetir a preparação para reenviar o mesmo texto. Não promete ausência de bloqueios.
- Afeta administrador, comercial no servidor e instalação local; Painel Mestre inalterado. Preserva bancos, configurações, sessões, backups e isolamento DATA_DIR. Sem migração, seed ou mudança de valores iniciais. Aplicar deploy/atualização; nenhuma ação manual de dados.
- Validação: sintaxe, testes de rotas e proteção de HTML, 173 testes internos e 11 testes de navegador aprovados; diff, geração oficial e teste de pacote limpo aprovados. Envio real depende de confirmação humana no aparelho; nenhum envio real é feito nos testes.

- A versão de entrega atual é **1.3.45**. Em `Modelos > Marca do Painel`, a imagem lateral de fundo pode ser definida por URL ou enviada pelo botão `Procurar imagem de fundo`; ela é independente da logo e a imagem padrão continua em uso quando o campo fica vazio. Afeta painel administrador, comerciais e instalações locais; Painel Mestre inalterado.\r\n\r\n- A versão de entrega atual é **1.3.44**. Onde a privacidade financeira estiver ativada, valores ocultos passam a usar `R$ ***` e o botão exibe um olho fechado; ao revelar os valores, o botão exibe o olho aberto. A preferência continua exclusiva do navegador e os valores, cálculos, bancos e históricos não são alterados. Afeta painel administrador, comerciais e instalações locais; Painel Mestre inalterado.\r\n\r\n- A versão de entrega atual é **1.3.43**. A sincronização do Mercado Pago inicializa e agenda automaticamente o Relatório de Liberações diário pela API oficial quando o Access Token já estiver configurado. Quando o arquivo fica pronto, o sistema importa créditos, débitos e rendimentos com identificadores únicos, preserva o histórico importado e tenta novamente após falha em vez de marcar uma sincronização incompleta como concluída. O saldo exibido continua sendo conciliado sem reescrever pagamentos ou despesas já registrados; a migração `2026-09-23-017-movimentos-mercado-pago` registra as movimentações externas. Afeta painel administrador, comerciais e instalações locais; Painel Mestre inalterado.\r\n\r\n# Auditoria das melhorias recomendadas

Atualizada em 11/09/2026. Este documento registra o estado comprovado no
código; itens operacionais externos não são marcados como implementados.

## Implementado

- Relatório semanal do Assistente em 25/09/2026: a versão **1.3.64** responde `como foi a semana?` e variações equivalentes somente para os WhatsApps de gestão autorizados. A mensagem consolida a semana atual, de segunda-feira até a consulta, com recebimentos, rendimentos, despesas, saldo, comprovantes pendentes, clientes vencidos e vencimentos dos próximos sete dias. É uma consulta local: não cria cobranças, confirma pagamentos, altera clientes, interfere no robô comercial, Telegram, campanhas ou filas. Afeta administrador, comerciais no servidor e instalação local; Painel Mestre, bancos, sessões, configurações, backups e DATA_DIR são preservados. Sem migração, API externa ou custo adicional. Validação: sintaxe, teste do Assistente, suíte interna, diff e pacote oficial.

- Modelos alternativos da campanha em 25/09/2026: a versão **1.3.63** mantém **Amizade que vale presente** e cria **Indique e ganhe 3 meses**, com a regra de dois novos clientes, três meses ativos de cada um e benefício liberado após conferência, sem acúmulo. Em Modelos, somente o texto deixado como Ativo é usado; ativar um desativa as demais campanhas automaticamente. Não altera envios, WhatsApp, Telegram, regra de revisão ou dados de clientes.

- Programa de indicação com revisão manual em 25/09/2026: a versão **1.3.62** apresenta a nova regra da campanha — duas indicações, três mensalidades reais de cada indicado e três meses de crédito somente após revisão humana. `Campanhas > Controlar indicações` registra e acompanha os vínculos; pagamentos de bônus não qualificam, e telefone ou MAC iguais entre indicador e indicado são bloqueados. O benefício nunca é enviado ou aplicado automaticamente: a liberação manual só credita o saldo de três meses, que continua dependendo da aplicação controlada na ficha do cliente. O modelo **Amizade que vale presente** pode ser editado em `Modelos`. A migração 018 é formal, com backup pré-migração. WhatsApp, Telegram, filas e envios automáticos permanecem inalterados. Afeta administrador, comerciais no servidor e instalação local; Painel Mestre, sessões, configurações, backups e DATA_DIR são preservados. Validação: sintaxe, teste da regra, suíte, diff e pacote oficial.

- Paginação das prioridades do Dashboard em 25/09/2026: a versão **1.3.61** limita o bloco a três registros por página e usa uma paginação independente dos vencimentos, evitando crescimento vertical causado por pendências. Falhas técnicas da fila de mensagens não são exibidas no Dashboard, porque não são ações administrativas do operador. O Dashboard mostra Campanha de indicação primeiro, Receita mensal em seguida, Clientes com Vencimento Próximo em terceiro e Prioridades do dia por último. A ação continua apenas abrindo a área de revisão correspondente. Afeta administrador, comerciais no servidor e instalação local; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Sem migração, API externa ou custo adicional. Validação: sintaxe, teste do Dashboard, suíte interna, diff e pacote oficial.

- Prioridades do dia no Dashboard em 25/09/2026: a versão **1.3.60** exibe até cinco pendências operacionais ordenadas e um link direto para a área responsável ou para a Central de Pendências. A visualização reutiliza dados existentes e não conclui pendências, envia mensagens ou altera clientes. Afeta administrador, comerciais no servidor e instalação local; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Sem migração, API externa ou custo adicional. Validação: sintaxe, teste do Dashboard, suíte interna, diff e pacote oficial.

- Radar diário da gestão em 25/09/2026: a versão **1.3.59** responde `o que preciso resolver hoje?` com recebimentos confirmados do dia, comprovantes aguardando conferência, clientes vencidos e vencimentos próximos. A resposta somente organiza a consulta; não envia cobrança, não confirma pagamento e não altera cliente, inclusive durante a leitura do radar. Afeta administrador, comerciais no servidor e instalação local; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Sem migração, API externa ou custo adicional. Validação: sintaxe, testes do Assistente, suíte interna, diff e pacote oficial.

- Carteira e contexto do Assistente em 25/09/2026: a versão **1.3.58** consulta clientes vencidos, vencimentos nos próximos dias e a projeção dos valores mensais de contratos vencidos, sem criar cobranças. Após consultar um cliente, o número autorizado pode fazer perguntas curtas sobre ele por até trinta minutos; esse contexto fica somente em memória e por número autorizado. A tela Manutenção lista os novos exemplos. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Validação: sintaxe, testes de carteira e contexto, suíte, diff e pacote.

- Retomada do robô comercial após gestão em 25/09/2026: a versão **1.3.57** reconhece pelo texto as mensagens do Assistente que o WhatsApp reenviar sem ID completo. Elas não são tratadas como atendimento humano, portanto não pausam o robô comercial. Depois de uma consulta de gestão, `menu`, saudações e demais palavras-chave comerciais respondem normalmente. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Validação: sintaxe, teste de evento sem ID, suíte, diff e pacote.

- Entendimento local ampliado do Assistente em 25/09/2026: a versão **1.3.56** entende variações naturais de resumo financeiro, vencimentos e consulta de cliente sem API ou custo externo, por exemplo `quanto recebi este mês?`, `quais clientes vencem hoje?` e `situação do cliente Ana`. O escopo continua limitado às consultas e confirmações explícitas já autorizadas; `menu` segue no robô comercial. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Validação: sintaxe, testes de intenções, suíte, diff e pacote.

- Indicador “digitando…” para conversas LID em 25/09/2026: a versão **1.3.55** envia o estado diretamente ao telefone resolvido pelo WhatsApp Web, sem tratar o identificador LID interno como número do cliente. A mesma espera configurada para resposta humanizada também é aplicada ao Assistente de gestão; caso o WhatsApp a recuse, a resposta continua sem interrupção. A regra permanente e o teste de regressão impedem que alterações posteriores removam essa compatibilidade. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Validação: sintaxe, testes do assistente e `git diff --check`; teste visual depende de uma mensagem real após o deploy.

- Comandos exclusivos do Assistente sem prefixo em 25/09/2026: a versão **1.3.54** aceita diretamente `resumo do mês`, vencimentos, consulta de cliente e conferência de comprovantes pelo WhatsApp autorizado, pois não são gatilhos do robô comercial. A tela Manutenção mantém essa lista como lembrete. `menu` continua comercial e `menu gestão` abre a ajuda administrativa. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Validação: sintaxe, testes dedicados e `git diff --check`.

- Separação entre robô comercial e Assistente de gestão em 25/09/2026: a versão **1.3.53** mantém as palavras-chave comerciais, inclusive `menu`, disponíveis para números também autorizados para gestão. O assistente administrativo só responde a comandos com `gestão` no início ou no fim, por exemplo `gestão resumo do mês` e `menu gestão`; a confirmação de comprovante usa `GESTÃO CONFIRMAR <número>`. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões, backups e DATA_DIR são preservados. Validação: sintaxe, testes dedicados e `git diff --check`.

- Conferência assistida de comprovantes em 25/09/2026: a versão **1.3.52** permite listar comprovantes pendentes e confirmar uma renovação somente após prévia e confirmação explícita pelo WhatsApp autorizado. A conferência bancária continua humana; dados, sessões e histórico são preservados.

- Assistente e digitação para contatos LID em 25/09/2026: a versão **1.3.51** compara o LID da mensagem com o número autorizado resolvido pelo WhatsApp e restaura a simulação de “digitando…” pela conversa do telefone real quando o LID não fornece um chat. Falhas de resolução ou digitação não interrompem o atendimento comercial. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões e backups permanecem inalterados. Validação: sintaxe, testes do assistente, suíte, pacote e instalação limpa.

- Resposta automática para contatos identificados por LID em 25/09/2026: a versão **1.3.50** resolve o telefone real antes de responder e mantém o LID como alternativa. Isso recupera o envio quando o WhatsApp Web falha nos getters internos do LID. A autorização do Assistente de gestão também usa o telefone resolvido. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, dados, configurações, sessões e backups permanecem inalterados. Validação: sintaxe, testes do assistente, suíte, pacote e instalação limpa.

- Isolamento do Assistente WhatsApp em 25/09/2026: a versão **1.3.49** impede que uma falha de consulta ou envio do assistente interrompa o atendimento comercial. Quando o assistente não conseguir responder, a mensagem segue para o fluxo automático já existente. Afeta administrador, comerciais no servidor e instalações locais; Painel Mestre, bancos, configurações, sessões e backups permanecem inalterados. Validação: sintaxe, testes do assistente, suíte, pacote e instalação limpa.

- Assinatura do manifesto do pacote em 25/09/2026: a versão **1.3.48** permite ao gerador usar uma chave Ed25519 por caminho protegido, definido por `LICENSE_PRIVATE_KEY_PATH` ou por `licenseSigningPrivateKeyPath` no arquivo local ignorado do Painel Mestre. A chave privada não entra no Git, no pacote nem no manifesto; o pacote traz somente hash, metadados e assinatura verificável pela chave pública distribuída. A configuração atual aponta para uma chave existente cuja pública corresponde à chave do pacote, sem rotação. Afeta a geração e a validação das entregas para administrador, comercial e instalação local; Painel Mestre, bancos, sessões, backups e dados de clientes permanecem inalterados. Validação: assinatura e verificação com chave temporária, sintaxe, suíte, pacote e instalação limpa.

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

## Dashboard sem prioridades duplicadas — versão 1.3.65

- Implementado: vencimentos de clientes e testes presentes na lista completa de próximos vencimentos são omitidos das prioridades antes da paginação. Outras pendências permanecem disponíveis; o bloco é ocultado quando vazio e a Central de Pendências continua acessível no cabeçalho e menu.
- Afeta administrador, cliente comercial no servidor e instalação local; Painel Mestre inalterado. Preserva bancos, configurações, sessões, backups e DATA_DIR. Sem migração ou ação manual de dados; requer atualização do aplicativo.
- Validação: sintaxe JavaScript e diff aprovados; 181 testes internos aprovados; pacote oficial gerado com manifesto assinado. Publicação e reinício da produção pendentes.

## Bônus automático por campanha — versão 1.3.66

- Implementado: Amizade que vale presente libera 1 mês de saldo após 1 indicado registrar a primeira mensalidade paga; Indique e ganhe 3 meses libera 3 meses após 2 indicados registrarem 3 mensalidades cada. A conferência usa o histórico local de pagamentos e roda na inicialização, a cada minuto, ao registrar indicação e ao abrir seu controle; independe da conexão WhatsApp.
- A campanha ativa em Modelos é vinculada à indicação no registro. Trocar a campanha pausa os vínculos da outra regra, sem convertê-los nem somar promoções. Os vínculos antigos conservam a regra original de 2 indicados/3 mensalidades. Modelos de campanha personalizados com outra chave não recebem uma regra presumida; a interface solicita ativar uma das duas campanhas conhecidas.
- Uma indicação não pode ser reutilizada depois do crédito nem por outro indicador. Pagamentos de bônus, testes, excluídos e sem valor positivo não qualificam; registros com o mesmo vencimento contam como um ciclo. Registros legados sem vencimento usam o ID do pagamento. Um pagamento trimestral não é convertido automaticamente em três mensalidades. Pagamentos históricos válidos já registrados contam, inclusive em indicações antigas elegíveis na campanha ativa.
- Crédito, consumo dos vínculos e nota de auditoria são gravados em uma transação exclusiva com rollback. A migração 019 mantém histórico e cria o livro de créditos, com backup prévio pelo executor formal. Se um pagamento for excluído depois de concedido o bônus, o crédito não é retirado automaticamente: revisar o saldo e registrar o motivo na ficha. Não há estorno retroativo de bônus já utilizado.
- O crédito altera somente o saldo. O operador escolhe Bônus Mensal na ficha e confere o vencimento antes de salvar. O ciclo consome um crédito e registra R$ 0,00 no Financeiro, preservando valor do plano e assinatura do aplicativo. Salvar um formulário antigo preserva créditos automáticos recebidos enquanto ele estava aberto. Valores zerados em ciclos anteriores à atualização não são reconstruídos por suposição.
- Novos modelos: aviso de 1 mês liberado, aviso de 3 meses liberados e confirmação do bônus aplicado com vencimento e saldo. Em Modelos são editáveis; na ficha do cliente podem ser preparados para envio manual. Crédito e aplicação pelo tipo de plano não enviam mensagens. O fluxo separado já existente de aplicar bônus e avisar pelo robô permanece uma ação explícita do operador.
- Afeta painel administrador, cliente comercial no servidor e instalação local. Painel Mestre inalterado. Preserva bancos, configurações, modelos personalizados, sessões, backups e isolamento DATA_DIR. Sem API externa ou custo adicional. Após atualizar, conferir a campanha ativa em Modelos, registrar vínculos em Campanhas > Controlar indicações e usar o plano Bônus Mensal quando desejado. A atualização pode creditar vínculos antigos já elegíveis.
- Validação: sintaxe JavaScript, suíte interna, testes de regras, migração, preservação de valores e modelos, rollback, repetição e formulário antigo; testes de navegador; diff e pacote oficial. 186 testes internos e 12 testes de navegador aprovados. Publicação e reinício da produção ainda não executados.

## Origem e uso de bônus de 1 ou 3 meses — versão 1.3.67

- Implementado: a ficha oferece Bônus — 1 mês e Bônus — 3 meses, conforme saldo disponível; o plano do ciclo atual continua visível para edição. Os tipos internos são Bônus Mensal e Bônus Trimestral. Ambos ficam fora do catálogo comercial e do menu de venda. Catálogos existentes são preservados; somente o tipo trimestral ausente é acrescentado.
- Ao escolher o bônus, a ficha sugere o início no vencimento vigente ou na data atual se vencido, e calcula um ou três meses de calendário. O operador confere antes de salvar. O serviço valida saldo e registra 1 ou 3 meses consumidos, pagamento de R$ 0,00 e vínculo às origens em uma transação; preserva valor contratado e assinatura App. Não envia mensagens. Reabrir e salvar o mesmo ciclo não desconta novamente; trocar a duração para o mesmo vencimento já registrado é rejeitado.
- A seção Origem e histórico de bônus mostra campanha, indicado quando conhecido, registro, quantidade recebida, utilizada, ajustada e restante. Créditos novos de indicação possuem vínculo automático ao livro de créditos da campanha. Consumo segue os créditos mais antigos primeiro; baixas manuais de saldo aparecem como ajustes, separadas do uso. O fluxo explícito de aplicar e avisar existente também registra o uso por origem.
- A migração 020, com backup prévio pelo executor formal, importa apenas o saldo anterior como Origem não identificada. Não inventa a campanha nem reconstrói uso passado. Créditos da versão anterior são mostrados à parte como histórico de liberação, sem somar novamente ao saldo.
- Para saldo antigo, o operador escolhe a origem, quantidade e opcionalmente o indicado em Identificar sem adicionar saldo. A classificação não aumenta créditos nem altera vencimento ou Financeiro. Permite classificar parte do saldo; valida o dono do crédito e bloqueia repetição da mesma submissão. A identificação e o responsável ficam auditados.
- Afeta administrador, cliente comercial no servidor e instalação local; Painel Mestre inalterado. Preserva dados, bancos, modelos personalizados, configurações, sessões, backups e DATA_DIR. Sem API externa ou custo adicional. Após atualizar, identificar apenas os saldos antigos cuja origem o operador conhece e conferir datas antes de usar o plano de bônus. Créditos já utilizados antes desta versão não recebem origem presumida.
- Validação: testes isolados de migração e saldo nulo legado, identificação parcial/repetida, acesso a crédito de outro cliente, crédito automático, consumo de 3 meses, preservação do preço, uso único e rollback; suíte interna, navegador, sintaxe, diff e pacote oficial. 192 testes internos e 13 cenários de navegador aprovados (12 na suíte e o novo fluxo na repetição após ajustar seletores). Sintaxe e diff aprovados. Publicação e reinício da produção não executados.

## Aviso de agradecimento por bônus de indicação — versão 1.3.68

- Implementado: a ficha possui uma caixa inicialmente desmarcada para programar avisos automáticos de bônus. Com saldo de bônus, os avisos de 5, 2, 1 dia, no vencimento e uma hora antes usam texto editável que informa campanha e período, agradece a indicação e incentiva novos encaminhamentos. Eles seguem até o operador aplicar o bônus e atualizar o vencimento. Sem marcação ou sem saldo, a renovação mantém a mensagem normal.
- Ao consumir o bônus pelo plano interno ou alterar a data de início ou vencimento, a caixa é desligada automaticamente. Enquanto houver bônus programado, o aviso não inclui PIX. A nova regra da campanha ativa exige duas indicações com duas mensalidades pagas de cada indicado para liberar três meses.
- Migração 021 preserva todos os dados e inicia a opção desligada. Afeta administrador, comerciais no servidor e instalação local; Painel Mestre inalterado. Validação: sintaxe e testes dedicados de campanhas, bônus e ações de cliente aprovados.

## Controle de ciclo do aviso de bônus — versão 1.3.69

- Implementado: a seleção Controle do aviso de bônus mostra Não programado, Aviso de bônus programado e Bônus aplicado. Apenas o estado programado aciona os avisos especiais, facilitando a conferência antes de qualquer envio.
- Ao aplicar o bônus ou salvar nova data de início ou vencimento de um ciclo programado, o status muda automaticamente para Bônus aplicado. Um novo ciclo precisa ser programado pelo operador.
- Migração 022 converte marcações existentes para Programado e preserva os demais dados. Afeta administrador, comerciais no servidor e instalação local; Painel Mestre inalterado.
- Dashboard: acompanhamento agrupado por quem indicou, com campanha, progresso dos indicados, pendências de mensalidades e previsão informativa de liberação a partir do vencimento cadastrado. O crédito permanece automático somente após os pagamentos reais.

## Confirmação de período de bônus — versão 1.3.70

- Implementado: após salvar Bônus — 1 mês ou Bônus — 3 meses, a confirmação manual do cliente muda de nome e envia um texto próprio: benefício por indicação, período sem cobrança, início, vencimento e orientação de que não há pagamento ou renovação naquele ciclo.
- Planos pagos mantêm a confirmação de assinatura atual. A confirmação do bônus é enviada somente quando o operador clicar no botão; não cria cobrança nem altera o saldo já consumido ao salvar o ciclo. Afeta administrador, comerciais e instalações locais; Painel Mestre inalterado. Sem migração; dados e configurações existentes preservados.

## Acompanhamento visual do bônus — versão 1.3.71

- Implementado: cartão de resumo do bônus na ficha do cliente, com saldo, origem, indicado, estado do aviso, vencimento e próxima ação. O cronograma lista os cinco avisos do ciclo atual e informa se cada um está pendente ou enviado, incluindo o horário registrado.
- A visualização é somente leitura: não envia mensagens, não cria cobrança e não consome crédito. Afeta administrador, comerciais e instalações locais; Painel Mestre inalterado. Sem migração; créditos, pagamentos, histórico, sessões e configurações existentes são preservados.

## Aplicação guiada de bônus no vencimento — versão 1.3.72

- Implementado: no vencimento de um bônus programado, o resumo exibe o atalho Aplicar 1 mês de bônus. A ficha abre com o plano interno e as datas calculadas, aguardando revisão e o salvamento explícito do operador.
- O atalho não altera dados sozinho. Saldo, financeiro, WhatsApp e histórico só mudam pelo fluxo já existente de Salvar cliente e confirmação manual. Afeta administrador, comerciais e instalações locais; Painel Mestre inalterado. Sem migração e com dados existentes preservados.

## Resumo de bônus recolhível — versão 1.3.73

- Implementado: o resumo inicia com saldo e status em uma única linha. Ver detalhes expande origem, próxima ação e cronograma; Ocultar detalhes reduz novamente o bloco.
- A mudança é visual e local à tela, sem envio, cobrança, alteração de saldo ou migração. Afeta administrador, comerciais e instalações locais; Painel Mestre inalterado. Dados existentes preservados.

## Bônus para acompanhar no Dashboard — versão 1.3.74

- Implementado: faixa compacta no card de campanha do Dashboard, com até três clientes em aviso de bônus programado, saldo, prazo e link direto para a ficha. Mais registros não ampliam a lista: ficam disponíveis pelo botão Ver todos.
- A visualização não executa automação, mensagem, cobrança ou alteração de dados. Afeta administrador, comerciais e instalações locais; Painel Mestre inalterado. Sem migração e com dados existentes preservados.

## Filtros e resumo mensal de bônus — versão 1.3.75

- Implementado: filtro de bônus na lista de clientes para localizar saldo disponível, aviso programado ou ciclo aplicado, preservando busca, demais filtros, paginação e exportação.
- Implementado: indicador compacto de ciclos de bônus aplicados no mês dentro da faixa existente de acompanhamento no Dashboard. Não envia mensagens, não consome saldo nem altera financeiro.
- Afeta administrador, comerciais e instalações locais; Painel Mestre inalterado. Sem migração e com dados existentes preservados.

## Modelo automático ao encerrar teste grátis — versão 1.3.76

- Implementado: o aviso automático de término de teste usa o modelo editável de convite para assinatura, incluindo os planos comerciais atuais e mantendo o estado visual de “digitando…” antes do envio.
- O registro de aviso existente evita repetição por ciclo. Não cria cobrança, não altera o cadastro e não envia se o WhatsApp estiver desconectado.
- Afeta administrador, comerciais e instalações locais; Painel Mestre inalterado. Sem migração e com dados existentes preservados.

## Modo noturno do painel — versão 1.3.77

- Implementado: ícone compacto no cabeçalho para alternar todo o painel entre modo noturno e claro, preservando a preferência no navegador. A navegação não cria segunda linha e permite rolagem horizontal discreta em larguras menores.
- A mudança é somente visual e não grava dados do cliente nem altera configurações da instalação. Afeta Painel Mestre, administrador, comerciais e instalações locais; sem migração.
- Corrigido: controles claros, etiquetas e paginação agora usam fundo escuro e texto legível no modo noturno; o contraste do modo claro foi preservado.
- Corrigido: marca d’água do modo noturno ganhou brilho e mistura de tela para destacar a identidade visual sem fundo escuro aparente.
- Melhorado: fundo do modo noturno recebeu degradê azul-petróleo e luzes suaves para leitura mais confortável, mantendo o contraste dos componentes.
- Corrigido: bandeiras de país são distribuídas no pacote como imagens locais e exibidas no seletor e nas listas sem depender de emoji, fonte instalada ou serviço externo.
- Melhorado: formulário de cliente redistribui país/DDD, telefone, aniversário e origem, priorizando a leitura integral do número e reduzindo campos que não precisam ocupar a largura total.
- Corrigido: no modo noturno, cartões de receita, tabelas, campos destacados, prévias e listas deixam de usar branco intenso; adotam tons azul-acinzentados com texto claro e barras de progresso visíveis.
- Corrigido: a zona protegida de exclusão de cliente usa fundo escuro e contraste próprio no modo noturno, sem suavizar a identificação das ações destrutivas.
- Melhorado: pesquisas de Clientes, Financeiro, CRM, Atendimentos e Pendências filtram automaticamente durante a digitação e mostram um X para limpar, restaurando a lista conforme os filtros ativos.
- Corrigido: a pesquisa não recarrega mais a página durante a digitação. O filtro visual é imediato e preserva o cursor; em Clientes, os resultados completos são atualizados em segundo plano, sem substituir o campo de busca.
- Melhorado: todos os campos de confirmação de senha da Manutenção começam mascarados e exibem um ícone de olho para mostrar ou ocultar o conteúdo localmente. O recurso não grava, copia nem transmite a senha.

## Implementado: configuração inicial do relatório Mercado Pago — versão 1.3.77

- A sincronização de rendimentos trata a resposta `Configuration not found for user` como relatório ainda não criado, além do retorno HTTP 404 já suportado. Com Access Token de produção válido, o painel cria e agenda o relatório diário automaticamente; depois usa o primeiro arquivo processado para importar somente rendimentos elegíveis, com a deduplicação existente.
- Afeta painel administrador, clientes comerciais no servidor e instalação local; Painel Mestre inalterado. Access Token, bancos, configurações, rendimentos, sessões, backups e `DATA_DIR` são preservados. Sem migração. A ação manual após a atualização é confirmar o Access Token em Manutenção e clicar em Sincronizar Mercado Pago; o primeiro arquivo pode depender da próxima geração diária do provedor.
- Corrigido: a configuração diária do relatório não envia `value`, pois a API aplica esse atributo apenas às agendas semanal e mensal. A cobertura de teste verifica o formato para impedir a regressão de `Invalid frequency`.
- Implementado: o monitoramento sincroniza rendimentos Mercado Pago diariamente a partir das 10:00 em `America/Sao_Paulo`. Uma execução manual não bloqueia a rotina e a rotina não duplica valores porque o serviço preserva a deduplicação por identificador externo. Se o processo estiver parado às 10:00, a primeira verificação posterior do dia executa uma única sincronização.
- Corrigido: quando o relatório agendado ainda não contém os movimentos do dia, o sistema solicita uma geração específica para o intervalo atual e acompanha o processamento até a disponibilidade. O dia só é marcado como sincronizado após o relatório estar pronto; a importação percorre os relatórios processados e preserva a deduplicação por identificador externo.

## Correção: relatório manual atual de rendimentos Mercado Pago — versão 1.3.78

- Corrigido: um relatório diário agendado já existente não encerra mais a busca por um rendimento lançado depois da sua geração. A primeira sincronização solicita o arquivo do intervalo atual e mantém a rotina pendente até aquele arquivo ser processado.
- A solicitação pendente é registrada por dia, arquivo e horário somente para controle interno; valores continuam deduplicados pelo identificador externo. Administrador, clientes comerciais no servidor e instalações locais são afetados; Painel Mestre inalterado. Access Token, bancos, rendimentos, configurações, sessões, backups e `DATA_DIR` são preservados. Sem migração.
- Ação após deploy: clicar uma vez em Sincronizar Mercado Pago. Validação: sintaxe JavaScript, testes internos, diff e pacote local.

## Correção: compatibilidade na solicitação de relatório Mercado Pago — versão 1.3.79

- Corrigido: a criação manual do relatório repete os mesmos parâmetros UTC em formulário codificado somente se a API rejeitar o JSON com `Must specify begin_date parameter`. A tarefa retornada também é registrada para aguardar exatamente a geração solicitada.
- Afeta administrador, clientes comerciais no servidor e instalações locais; Painel Mestre inalterado. Preserva Access Token, banco, rendimentos, configurações, sessões, backups e `DATA_DIR`; sem migração. Validação: sintaxe, testes internos, diff e pacote local.

## Correção: parâmetros do relatório Mercado Pago — versão 1.3.80

- Corrigido: a solicitação manual conserva JSON e envia as datas UTC também como parâmetros da URL, evitando a rejeição HTTP 415 do formulário e permitindo que contas que leem parâmetros reconheçam `begin_date` e `end_date`.
- Afeta administrador, clientes comerciais no servidor e instalações locais; Painel Mestre inalterado. Preserva Access Token, banco, rendimentos, configurações, sessões, backups e `DATA_DIR`; sem migração. Validação: sintaxe, testes internos, diff e pacote local.

## Correção: validação de entrega Mercado Pago — versão 1.3.81

- Corrigido: teste interno atualizado para validar a chamada atual do relatório Mercado Pago com parâmetros UTC na URL e JSON. O deploy volta a aceitar a versão compatível 1.3.80.
- Não muda dados ou comportamento funcional; sem migração. Validação: suíte interna completa, sintaxe, diff e pacote local.

## Correção: UTC sem milissegundos no relatório Mercado Pago — versão 1.3.82

- Corrigido: o relatório manual envia datas UTC até os segundos, formato aceito pelo Mercado Pago em teste controlado com HTTP 202. A API retornava `Must specify begin_date parameter` ao receber milissegundos.
- A tarefa de hoje foi aceita e permanece em processamento no Mercado Pago. Valores continuam deduplicados por identificador externo. Sem migração; Access Token, banco, rendimentos, configurações, sessões, backups e `DATA_DIR` preservados. Validação: solicitação controlada HTTP 202, sintaxe, testes internos, diff e pacote local.

## Correção: reconhecimento de relatório pronto Mercado Pago — versão 1.3.83

- Corrigido: arquivos listados pelo Mercado Pago com estado `enabled` são tratados como disponíveis para download e importação, assim como `processed`. A confirmação relaciona o relatório ao período e ao horário de geração, porque o ID da tarefa e o ID do relatório são diferentes.
- Limitação confirmada: a API de Relatórios fecha o período de hoje às 23:59 e gera o arquivo às 03:00 do dia seguinte; não oferece o rendimento intradiário antes desse fechamento. Após a geração, a importação é automática e deduplicada. Sem migração; dados e segredos preservados. Validação: consulta segura da tarefa/lista, sintaxe, testes internos, diff e pacote local.

## Recuperação de rendimentos ao iniciar — versão 1.3.84

- O monitor consulta os relatórios disponíveis na primeira execução após iniciar, inclusive antes das 10h. Nesse caso apenas importa arquivos já prontos, sem antecipar a solicitação diária e sem marcar a rotina das 10h como concluída. Tarefas pendentes continuam sendo consultadas mesmo antes das 10h.
- Diagnóstico de 05/10: a API respondeu HTTP 200; os arquivos disponíveis para os períodos de 03/10 e 04/10 continham somente saldo inicial e total, sem crédito de rendimento. A solicitação de 05/10 foi registrada às 10h e estava pendente. E-mail de relatório pronto não comprova que o CSV inclui crédito intradiário. Nenhum valor foi lançado manualmente nesta correção.
- Afeta administrador, comercial provisionado e instalação local; Painel Mestre inalterado. Sem migração; bancos, configurações, tokens, sessões WhatsApp, backups e DATA_DIR preservados. Validação: consulta real somente de leitura à API e ao banco; testes de horário, inicialização, pendência e ausência de token; sintaxe JS, diff e pacote. Ação operacional: aplicar deploy e reiniciar pelo fluxo oficial; conferir o resultado na tela após o monitor executar.

## Proteção da recarga automática contra falha transitória — versão 1.3.85

- A lista de clientes e os painéis que usam autoAtualizarPaginaScript verificam a resposta HTTP antes da navegação automática. HTTP de erro, conteúdo não HTML, timeout de dez segundos ou falha de conexão preservam a página atual e permitem nova tentativa no intervalo seguinte. Ao retornar à aba, aguarda quinze segundos sem interação; respeita campos em edição e aba oculta, inclusive após o fetch.
- Diagnóstico: a URL da captura possui _atualizado, parâmetro da recarga automática; em 05/10 às 15h52 houve 502, seguido de recuperação via Ctrl+F5. Verificações locais e públicas posteriores retornaram HTTP 200. Há SQLITE_BUSY recorrente nos logs, mas não foi comprovada relação causal com o 502 específico; não houve reinício PM2 nesse horário e não havia evento do túnel disponível nesse intervalo.
- Limitação: a verificação prévia e a navegação são requisições distintas; uma nova falha entre elas ainda pode causar erro. Esta proteção reduz a navegação automática durante indisponibilidade conhecida, sem resolver a causa do túnel/origem. Não modifica banco, processos ou serviço Cloudflare.
- Afeta administrador, cliente comercial provisionado e instalação local; Painel Mestre inalterado. Preserva banco, configurações, sessões WhatsApp, backups e DATA_DIR; sem migração. Teste executa o script real com respostas 502, falha de rede, recuperação, campo em edição, aba oculta e retorno à aba. Validação: sintaxe JS, teste de regressão, diff e pacote local. Ação operacional: deploy oficial; recarregar uma vez a página existente para carregar o novo script.
## Implementado: visibilidade monetária no Financeiro — 1.3.86

- Botão de olho disponível em todas as telas da área financeira, sem duplicar o controle já existente. Reutiliza a preferência do navegador e mascara também campos de valor, saldo inicial e saldo bancário, preservando seus valores na submissão.
- Administrador, comercial provisionado e instalação local afetados; Mestre inalterado. Bancos, configurações, sessões, backups e DATA_DIR preservados. Sem migração; recarregar após deploy. Validação: sintaxe, teste do controle, diff e pacote oficial.
- Pendente: obter saldo atual Mercado Pago. Consulta real somente de leitura ao perfil funcionou (HTTP 200), mas o recurso de saldo recusou a credencial configurada (HTTP 403). Não há integração automática de saldo nesta entrega. Ocultar valores é privacidade visual, não controle de acesso nem proteção de exportações.
## Implementado parcialmente: saldo Mercado Pago — 1.3.87

- Disponível em Rendimentos: saldo do último relatório, período, horário da consulta e botão de atualização. Sincronismo de rendimentos existente atualiza a mesma informação. Total explícito validado sem somar rendimentos novamente; consultas antigas não substituem períodos mais novos. Falhas preservam a consulta anterior.
- Limitação: saldo atual em tempo real permanece indisponível pela credencial configurada (HTTP 403). A interface identifica o valor como saldo de relatório. Conciliação mensal, receitas e rendimentos não são alterados pela consulta.
- Administrador, comercial provisionado e local afetados; Mestre inalterado. Bancos, tokens, configurações existentes, sessões, backups e DATA_DIR preservados. Sem migração; após deploy consultar saldo na tela. Validação: leitura real de relatório, teste de cálculo/zero/ausência/total duplicado, sintaxe, diff e pacote oficial.
