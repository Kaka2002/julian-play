
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


## Avisos de ativacao Lume Player — versao 1.3.88

- A instalacao administradora com configuracao privada explicita consulta a cada minuto a fila autenticada do site Lume Player e usa o WhatsApp conectado para enviar confirmacoes de licencas pagas. A conta conectada deve corresponder a conta configurada. Sem arquivo .lume-whatsapp.json no DATA_DIR, a rotina nao inicia.
- Comercial provisionado e cliente local comercial permanecem desabilitados pela regra central instalacaoAdministrador. Mestre inalterado. Preserva bancos, sessoes, listas, pagamentos, configuracoes, backups e DATA_DIR; sem migracao ou seed. A configuracao nao e copiada para outras instalacoes ou pacotes.
- O site exige telefone e consentimento na compra publica; guarda os dados e a fila cifrados, verifica novamente aprovacao/licenca antes de entregar o aviso e usa recibos temporarios. Pedidos antigos sem consentimento nao sao enviados. O diario local contem apenas referencia e resultado, sem texto ou destinatario.
- A rotina usa a fila e protecoes proativas existentes, sem cadastro de clientes ou lancamentos financeiros. Computador e WhatsApp devem estar conectados. Aceite do envio nao comprova leitura/entrega. Falha antes de chamar sendMessage pode ser retomada; envio incerto fica para revisao e nao repete automaticamente. Nenhuma mensagem real foi disparada na validacao local.
- Acao manual: enviar o pacote publico e whatsapp.php para a hospedagem privada; publicar esta versao pelo fluxo oficial e reiniciar o painel administrador depois do upload. Confirmar envio real em compra autorizada e revisar casos incertos na fila privada. Crontab nao e necessario para o WhatsApp.
- Validacao: testes isolados PHP da fila/recibos/consentimento, testes Node de deduplicacao/perfis/falhas, sintaxe, diff e pacote. Verificacao em aparelho real e pagamento real permanecem pendentes.


## Diagnostico WhatsApp Lume — versao 1.3.89

- Aceita aviso explicitamente marcado como TESTE para licenca trial. A mensagem nao confirma pagamento; preserva periodo original e informa que nenhuma licenca foi alterada. A fila PHP exige autenticacao e opt-in privado restrito ao aparelho e destinatario autorizados; referencia estavel evita repeticoes. Nao insere pedido nem pagamento.
- Administrador opt-in afetado; Mestre e perfis comerciais/locais inalterados. Bancos, sessoes, configuracoes e DATA_DIR preservados; sem migracao. Upload do PHP e configuracao privada, deploy oficial e acionamento unico sao necessarios. Testes locais usam transporte simulado; envio real permanece pendente ate upload/acionamento e confirmacao no aparelho.


## Destinatario LID nos avisos Lume — versao 1.3.90

- Consulta real do telefone autorizado retornou identificador @lid. O consumidor rejeitava esse formato antes de reservar/envio, deixando o aviso claimed ate a lease expirar. Aceita agora LID numerico somente retornado por getNumberId para o telefone da fila autenticada; nunca interpreta LID como telefone, nem aceita grupos. Diario e deduplicacao preservados.
- Afeta administrador opt-in Lume; Mestre, comercial e local inalterados. Preserva licenca trial, vencimento, banco, sessao, configuracoes, backups e DATA_DIR; sem migracao. Acao: deploy oficial; aviso claimed retoma depois da lease existente sem recriar pedido nem apagar diario. Nenhuma mensagem enviada durante diagnostico. Testes simulados cobrem LID, grupo rejeitado e envio unico.
## Implementado: organização de Rendimentos — 1.3.91

- Saldo do relatório substitui a conciliação bancária na interface; consulta e sincronização aparecem juntas abaixo do saldo. Título Rendimentos permanece no início. Campos e comparação manuais saem da tela, sem excluir registros ou alterar serviços financeiros.
- Administrador, comercial provisionado e local afetados; Mestre inalterado. Bancos, configurações, sessões, backups e DATA_DIR preservados. Sem migração; recarregar após deploy. Validação: sintaxe, diff e pacote oficial.
## Implementado: autofill e otimização de navegação — 1.3.92

- Bloqueio solicitado ao gerenciador no HTML fora de login; campos novos vazios protegidos, preservando edição e digitação. Campos financeiros mantêm tipo de texto durante máscara. Observador limita trabalho a novos formulários/campos e inicialização única.
- Reduzidas gravações de ultimoAcessoEm a uma por minuto; autenticação continua verificando banco, expiração e revogação em cada requisição. Medição de menus lentos registra apenas rota fixa, duração, status e correlação.
- Parcial: causa da demora antes da página aparecer ainda não confirmada. Rotas sem autenticação rápidas e SQLITE_BUSY histórico não bastam para concluir causa. Validar páginas autenticadas após deploy e revisar log navegacao-lenta. Extensões podem ignorar hints de autofill; preservados padrões do sistema e valores salvos, não há limpeza indiscriminada de campos.
- Os quatro perfis recebem proteção e sessão compartilhadas; financeiro apenas administrador/comercial/local. Bancos, tokens, sessões, configurações, backups e DATA_DIR preservados. Sem migração. Validação: dez testes de segurança, controle monetário e teste de navegador; sintaxe, diff e pacote oficial. Ação: deploy e recarregar páginas.
## Implementado: evitar escrita desnecessária ao listar clientes — 1.3.93

- Consulta inicial de estados evita dois UPDATEs em toda abertura de clientes quando não há vencimento a atualizar. Preserva regras de expirar e reativar, datas e isolamento. Teste mantém lista legível sob transação de outra conexão quando não há mudanças.
- Parcial: causa exata do 502 após envio ainda não confirmada. Tempos de vários segundos e SQLITE_BUSY observados; alteração reduz uma fonte comprovada de disputa. Cliente recebeu mensagem; nenhum envio real/reenvio executado.
- Administrador, comercial e local afetados; Mestre sem mudança de interface. Bancos, sessões, configurações, backups e DATA_DIR preservados. Sem migração; deploy e conferir navegação. Validação: teste de concorrência e estados, sintaxe, diff e pacote oficial.
## Implementado com validação real pendente: indicação e aviso de bônus — 1.3.94

- Escolha de indicador por ID e campanha de origem na ficha; campanha ativa sinalizada. Vínculo existente imutável ao trocar campanha, sem repetição de crédito. Campanha histórica inativa pode ser registrada, com acompanhamento pausado; bônus já ganho preservado. Saldo legado usa identificação de origem existente, sem somar crédito.
- Aviso ao programar bônus e salvar, reservado uma vez por cliente/vencimento; envia fora da resposta HTTP, com fila/proteções/digitação humanizada existentes. Desconexão antes da reserva informa novo salvamento; falha/incerteza após reserva exige revisão, sem reenvio automático. Histórico distingue envio confirmado e sem ID. Interrupção antes de entrar na fila exige revisão manual.
- Financeiro mantém 0,00 no bônus; preço contratado preservado para renovação paga. Status aplicado encerra mensagem especial e avisos seguintes usam fluxo normal. Mudança de mensagens de bônus lista campanhas de origem sem depender da ativa.
- Administrador, comercial provisionado e local afetados; Mestre inalterado. Bancos, créditos, modelos, sessões, configurações, backups e DATA_DIR preservados; sem migração. Limitação: cadastro e vínculo são etapas distintas, erro de vínculo após salvar exige revisão. Validação automatizada de indicação/campanha/deduplicação, financeiro, interface, sintaxe, diff e pacote; comandos comercial e gestão e digitação em aparelho real pendentes. Após deploy conferir seleção e aviso autorizado.
## Implementado: teste alinhado ao nome da campanha — 1.3.95

- Teste de navegador procura Indique e ganhe 3 meses, em vez de Campanha — 2 indicados. A falha do GitHub era uma expectativa de rótulo desatualizada; preservadas as verificações de identificação sem crédito adicional e aplicação do bônus.
- Sem alteração funcional nos quatro perfis ou em bancos, créditos, modelos, sessões, configurações, backups e DATA_DIR. Sem migração. Validar suíte completa de navegador, sintaxe, diff e pacote; publicar e repetir deploy se a validação anterior o interrompeu. Validação em aparelho real da entrega 1.3.94 continua pendente.

## Implementado: validação real do aviso de bônus — 13/10/2026

- Criado cadastro temporário explicitamente autorizado na instalação administradora, com saldo fictício de um mês e datas futuras. Cadastro normal preservado; sem pagamento ou envio durante a preparação. Código 1.3.95 inalterado; demais perfis preservados.
- Operador confirmou recebimento e ausência de repetição ao salvar novamente. Cadastro temporário e seu histórico removidos, com preservação do cadastro normal. Nenhum saldo fictício adicionado ao cadastro real.
## Implementado: Bônus com dias informados — 1.3.96

- Opção única Bônus; dias manuais calculam vencimento exato. Consumo arredondado para cima em blocos de 30 dias, conforme escolha do operador. Saldo insuficiente ou dias inválidos bloqueados; repetição do mesmo ciclo não duplica baixa/Financeiro. Valor registrado 0,00, preço contratado preservado.
- Datas de bônus antigos mantidas ao reabrir sem mudanças; regra legada preservada fora do formulário atualizado. Administrador, comercial/local afetados; Mestre inalterado. Bancos, créditos, configurações, sessões, backups e DATA_DIR preservados. Sem migração; recarregar após deploy e conferir período. Validação: testes de 45/30 dias, saldo, rejeições e idempotência, navegador, sintaxe, diff e pacote.
- Concluída validação real da programação de bônus: recebimento e ausência de repetição confirmados pelo operador. Cadastro temporário removido com conferência de preservação do cadastro normal; sem pagamento criado. Validação comercial/gestão confirmada pelo operador.

## Implementado: paginação com Início e Fim — versão 1.3.97

- Implementado acesso direto à primeira e última página na paginação compartilhada e no histórico de mensagens informativas. Mantém filtros, quantidade por página e parâmetros próprios de cada lista; controles de limite ficam desabilitados ou ausentes conforme o componente existente.
- Afeta administrador, cliente comercial provisionado e instalação local nas listas que usam estes componentes. Mestre sem alteração de interface. Bancos, configurações, bônus, sessões, backups e DATA_DIR preservados; sem migração ou alteração de permissões. Após deploy, recarregar a página.
- Validação: sintaxe dos dois arquivos JavaScript, links da paginação com filtros e parâmetro personalizado, diff e geração do pacote oficial.

## Implementado: posição da tela na paginação — versão 1.3.98

- Paginação mantém sua posição visual ao mudar página ou quantidade por página, inclusive Clientes e históricos. Guarda apenas destino, índice e posição na sessão da aba, consumidos na próxima navegação para o mesmo caminho e destino exato, com validade de um minuto. Links para nova aba não alteram esta posição. Nenhum conteúdo pessoal armazenado.
- Afeta administrador, comercial provisionado e cliente local que usam o layout compartilhado; Mestre sem alteração. Bancos, configurações, bônus, sessões WhatsApp, backups e DATA_DIR preservados; sem migração. Recarregar após deploy. Validação: sintaxe, navegação simulada no Chromium com alteração da altura da lista e quantidade, diff e pacote oficial.

## Implementado: indicações contam somente renovações — versão 1.3.99

- Primeira assinatura paga excluída: conta ciclos pagos distintos e desconta um, com mínimo zero. Amizade que vale presente libera um mês após a primeira renovação; Indique e ganhe 3 meses exige duas renovações de cada um dos dois indicados. Interface identifica renovações. Duplicações do mesmo vencimento, bônus, teste, zero e registros excluídos não contam. Sem vencimento, o identificador do pagamento distingue ciclos, conforme regra legada.
- Créditos já concedidos, campanha de origem e saldo preservados, sem estorno automático. Histórico sem registro da assinatura inicial é contado conservadoramente: primeiro ciclo disponível fica excluído; exige conferência manual, sem inventar pagamento. Modelos novos explicam renovações; textos existentes personalizados preservados e devem ser revisados em Modelos após deploy para divulgar a nova regra.
- Afeta administrador, comercial provisionado e instalação local. Mestre sem nova interface. Bancos, pagamentos, bônus, configurações, sessões WhatsApp, backups e DATA_DIR preservados; sem migração. Nenhum envio real executado. Validação: sintaxe, testes isolados de primeira assinatura/renovações, ciclos repetidos, crédito e saldo, diff e pacote oficial.

## Implementado: campanha ativa no dashboard — versão 1.3.100

- Bloco Campanha de indicação identifica o nome da campanha ativa usando a regra central do serviço, mesmo sem indicações em acompanhamento. Sem campanha válida única, informa nenhuma campanha de indicação ativa. Histórico e origem dos bônus continuam independentes da campanha atual.
- Afeta administrador, comercial provisionado e instalação local; Mestre sem alteração de interface. Preserva bancos, créditos, configurações, modelos, sessões WhatsApp, backups e DATA_DIR. Sem migração; recarregar após deploy. Validação: sintaxe, conferência do vínculo entre consulta e apresentação, diff e pacote oficial.

## Implementado: posição na atualização automática — versão 1.4.0

- Recarga automática após resposta HTML válida guarda a posição vertical imediatamente antes da navegação e restaura no mesmo destino. Ajuste automático da quantidade de vencimentos do dashboard também preserva posição. Reutiliza o estado de navegação da aba com validade curta e consumo único; não altera navegação manual entre áreas. Falhas de consulta mantêm a página aberta conforme proteção existente.
- Afeta administrador, comercial provisionado e cliente local nas telas com atualização automática compartilhada; Mestre sem alteração. Bancos, bônus, configurações, sessões WhatsApp, backups e DATA_DIR preservados; sem migração. Recarregar após deploy. Versionamento passa de 1.3.100 para 1.4.0 conforme solicitação do operador, regra permanente registrada em AGENTS.
- Validação: sintaxe, preservação de posição em Chromium com recarga automática simulada e diff; pacote oficial gerado.

## Parcial: recuperação WhatsApp sem sobrepor limpeza — versão 1.4.1

- Registros mostraram conexão, LOGOUT, limpeza e recuperação por erro do navegador sobrepostas. Operador confirmou remoção do aparelho vinculado. Causa original do LOGOUT não comprovada. Recuperação automática agora ignora reinício durante limpeza; reconexão segue fluxo existente. Eventos de autenticação, estado, ready e desconexão do cliente antigo não alteram a instância atual; autenticação repetida não rebaixa conexão pronta.
- Afeta administrador, comercial provisionado e local; Mestre inalterado. Bancos, configurações, sessões existentes, backups e DATA_DIR preservados. Limpeza após LOGOUT real e novo QR manual mantêm comportamento anterior. Sem migração. Sessão real não reiniciada durante diagnóstico. Aplicar deploy e conferir estabilidade no celular; validação real prolongada pendente. Envios, digitação e resolução LID inalterados.
- Validação: sintaxe, simulação de recuperação durante limpeza, revisão dos eventos, diff e pacote oficial.

## Implementado: rendimentos com oito registros por página — versão 1.4.2

- Lista de rendimentos usa paginação compartilhada com oito linhas fixas, Anterior/Próxima, números, Início/Fim e preservação da posição. Filtros mantidos nos links; totais continuam calculados com todos os registros filtrados, independentemente da página. Página fora dos limites ajustada.
- Afeta administrador, comercial provisionado e cliente local; Mestre inalterado. Bancos, lançamentos, configurações, sessões, backups e DATA_DIR preservados; sem migração. Recarregar após deploy. Validação: sintaxe, teste de rendimentos existente, conferência da paginação e diff; pacote oficial.

## Implementado: parabéns automáticos independentes do bônus — versão 1.4.3

- Agendador verifica a cada 30 segundos e na partida, após licença válida: aniversário do dia às 10h ou posteriormente, no fuso America/Sao_Paulo. Retoma quando painel/WhatsApp estiverem disponíveis ainda no mesmo dia; não envia atrasado no dia seguinte. Parabéns com faixas festivas e nome da empresa configurada; novas instalações sem marca real predefinida. Clientes anonimizados, opt-out e telefones inválidos excluídos. Data 29/02 somente no próprio dia, sem antecipação.
- Reserva atômica em cliente_notas por cliente/ano impede repetição após reinício ou concorrência, independente do marcador de bônus. Envios passam pela fila e proteções proativas, com digitação humanizada configurada; telefone cadastrado resolvido por getNumberId, sem usar LID como número. Reconfere conexão, dia e cadastro antes de reservar/enviar. Falhas anteriores à reserva são tentadas no próximo ciclo; interrupção após reserva, falha ou ausência de confirmação exigem revisão no histórico, sem reenvio cego. Não há garantia de entrega exatamente uma vez pelo provedor.
- Bônus, saldo, vencimento, mensagens de bônus, aprovação manual e Financeiro inalterados. Afeta administrador, comercial provisionado e instalação local; Mestre sem novo agendador. Bancos, configurações, modelos, sessões WhatsApp, backups e DATA_DIR preservados. Sem migração. Deploy ativa o novo envio, inclusive aniversariantes ainda pendentes de hoje após 10h.
- Validação: teste isolado de horário, conexão, retomada, duplicação, ano seguinte, opt-out, virada do dia, erro incerto e preservação do bônus/Financeiro; regressões de renovação/PIX, sintaxe, diff e pacote. Validação real de parabéns/digitação e comandos comercial/gestão pendente, conforme AGENTS; nenhum envio real disparado nesta preparação.

## Implementado: compatibilidade LID nos parabéns — versão 1.4.4

- Na validação autorizada, agendador percorreu fila sem registrar envio. Revisão identificou rejeição de destinos LID retornados por getNumberId. Corrigido para aceitar o destino c.us ou LID resolvido a partir do telefone cadastrado, sem converter LID em telefone. Causa exata do salto na tentativa real não registrada pelo cliente antigo; novo teste simula e verifica envio ao LID. Digitação humanizada e proteções anteriores preservadas.
- Cadastro temporário da validação removido pelo ID/marcador após conferir ausência de envio e integridade do cadastro normal. Sem bônus ou pagamento concedido. Validação em aparelho real ainda pendente após novo deploy; não afirmar entrega ou digitação visual confirmadas.
- Administrador, comercial provisionado e local afetados; Mestre inalterado. Bancos, dados, configurações, sessões, bônus e backups preservados; sem migração. Publicar e atualizar para repetir teste autorizado. Validação: sintaxe, regressão de aniversário com destino LID, diff e pacote oficial.

## Parcial: validação real de parabéns após 1.4.4 — 15/10/2026

- Versão e conexão conferidas; teste autorizado acionado pelo agendador com cadastro temporário isolado e datas contratuais futuras. Reserva anual registrada, resultado sem confirmação do provedor marcado incerto; nenhum reenvio automático. Recebimento e digitação visual aguardam confirmação do operador. Cadastro normal, bônus e pagamentos não alterados. Remover somente cadastro temporário por ID/marcador após confirmação, preservando o cadastro normal; nunca excluir por telefone.
- Operação restrita à instalação administradora; Mestre, comercial e local sem alteração. Sem mudança de código/versão, migração ou novo deploy. Teste não comprova entrega. Nenhum identificador pessoal registrado nesta documentação.

- Conclusão da validação real: operador confirmou recebimento dos parabéns; não observou a digitação, cuja validação visual permanece pendente. Sem reenvio. Cadastro temporário e registros vinculados removidos em transação por ID/marcador, após verificar ausência de pagamento e comparar cadastro normal antes/depois. Cadastro normal e bônus preservados; nenhum teste temporário remanescente desta validação.

## Implementado: data de hoje nos novos lançamentos — versão 1.4.5

- Novo rendimento e nova despesa abrem com a data corrente em America/Sao_Paulo, independente do mês filtrado; operador pode alterar manualmente. Edição conserva a data já salva. Filtros e lançamentos existentes inalterados.
- Afeta administrador, comercial provisionado e cliente local; Mestre sem alteração. Bancos, valores, datas salvas, configurações, sessões e backups preservados; sem migração. Recarregar após deploy. Validação: sintaxe e renderização dos dois formulários com mês diferente e datas de edição, diff e pacote oficial.

## Parcial: diagnóstico persistente do ciclo WhatsApp — versão 1.4.6

- Investigação da partida: estado atual UNPAIRED/aguardando_qr, diretório de autenticação presente. Última partida foi direto para QR sem autenticação; antes dela há LOGOUT no log acumulado. Logs antigos sem timestamp por evento não permitem datar exatamente a perda nem provar sua causa. Pasta existente não significa vínculo ainda válido. Correção 1.4.1 evita corrida de recuperação, mas não elimina logout remoto.
- Adicionado histórico técnico limitado aos últimos 60 eventos com hora UTC: partida, QR inicial, autenticação, estado, conexão, falha, desconexão/motivo e encerramento solicitado. Grava somente no DATA_DIR/whatsapp-ciclo-sessao.log; arquivo excluído do Git. Sem QR, telefone, URL ou credencial. Falha de gravação não interrompe WhatsApp. Eventos QR e falha de autenticação de instâncias antigas também ignorados, completando proteção existente.
- Afeta administrador, comercial provisionado e local; Mestre sem alteração. Bancos, sessão existente, configurações, bônus e backups preservados; sem migração. Não foi apagada sessão nem disparado novo QR manual durante investigação. Após deploy, se estado continuar UNPAIRED, operador precisa vincular pelo celular. Estabilidade após reinício e causa de logout permanecem pendentes de observação; não é correção comprovada da origem do logout. Envios, digitação e LID não alterados.
- Validação: sintaxe, teste isolado de limite/horários e ausência de dados sensíveis, diff e pacote oficial. Sem envio real.

## Implementado: resposta rápida ao gerar QR e reconectar — versão 1.4.7

- Evidência de 16/10: conectado às 14:02:44 UTC, encerramento solicitado pela ação manual de novo QR às 14:02:55 UTC e QR pronto às 14:03:24 UTC; captura mostrou 502 na rota manual. A rota aguardava todo fechamento/remoção/inicialização antes do redirect. Alterada para iniciar em segundo plano e redirecionar imediatamente; QR continua consultando estado. Isso reduz exposição à demora HTTP, sem afirmar resolução de todo 502 do túnel.
- Novo QR, reconexão e troca de número compartilham trava por processo para não iniciar operações simultâneas. Troca de número bloqueada enquanto outra operação ocorre; proteção administrativa existente preservada. Falha assíncrona registrada no log, sem segunda resposta HTTP. Operações não são duráveis após reinício do processo; operador deve conferir estado, não repetir cegamente.
- Afeta administrador, comercial provisionado e instalação local nas rotas de manutenção; Mestre sem mudança. Novo QR manual continua removendo autenticação, reconexão segura preserva sessão. Bancos, configurações, backups e DATA_DIR preservados; nenhuma operação real de QR/reinício executada nos testes. Sem migração; recarregar após deploy. Envios, digitação e LID inalterados.
- Validação: teste HTTP com inicialização bloqueada confirma redirect imediato, deduplicação, bloqueio de troca de número e liberação da trava; sintaxe, diff e pacote oficial.

## Parcial: Web atual para investigar logout recorrente — versão 1.4.8

- Eventos de 16/10 confirmam conexão às 14:11:54 UTC e LOGOUT às 14:16:59 UTC sem encerramento solicitado no intervalo. Esta ocorrência não foi a ação manual de novo QR. Há recarga/contexto destruído próximo; isso não comprova causa do logout.
- Removido pin implícito do HTML Web antigo. Padrão passa a usar versão atual entregue pelo WhatsApp com webVersionCache none, evitando servir HTML histórico do projeto. WWEBJS_WEB_VERSION explícita continua opt-in e usa cache estrito quando arquivo existe; autenticação LocalAuth e diretórios preservados. Nenhum cache ou sessão apagado nesta entrega. Teste controlado de compatibilidade, não correção comprovada do LOGOUT remoto; estabilidade e comandos reais precisam ser conferidos após deploy.
- Afeta administrador, comercial provisionado e local; Mestre sem WhatsApp próprio. Banco, configurações existentes, bônus, sessões e backups preservados. Sem migração. Após publicar/deploy, vincular no QR se UNPAIRED e acompanhar histórico; não gerar QR novamente quando conectado. Possível incompatibilidade com Web atual deve ser revisada antes de ampliar uso; reversão pode usar versão explícita validada. Fluxos de envio, digitação e LID inalterados.
- Validação: sintaxe, política executada em ambientes sem pin e com pin explícito, deduplicação existente, diff e pacote oficial. Não houve reinício ou envio real durante preparação.

## Implementado: confirmação completa do período de bônus — versão 1.4.9

- Modelo Bônus aplicado — confirmação do período inclui dias concedidos, início e vencimento com horários, valor explícito R$ 0,00 sem cobrança, saldo restante e retorno às condições normais na renovação seguinte. Início usa dataInicio salva, não a data do envio. Novas variáveis inicio e diasBonus disponíveis na edição de modelos; data ausente informa Não informado.
- Atualiza somente texto exatamente igual ao padrão anterior; modelos personalizados e ativo/inativo preservados. Envio manual pelo modelo continua sem descontar saldo, renovar, gerar pagamento ou aplicar novo bônus. Não unifica o botão legado Aplicar bônus e avisar: não usar depois do consumo pelo plano Bônus.
- Afeta administrador, comercial provisionado e cliente local; Mestre inalterado. Bancos, saldo, campanhas, preço contratado, datas, sessões e backups preservados. Sem migração estrutural. Após deploy, abrir Enviar modelo para carregar padrão atualizado; textos personalizados precisam incorporar as novas variáveis se desejado. Nenhum envio real realizado, transporte/digitação/LID inalterados.
- Validação: sintaxe, teste de renderização de datas/dias/zero/saldo e preservação de texto e estado personalizado, regressões de indicação, diff e pacote oficial.

## Recuperacao de estado e partida WhatsApp — versao 1.4.10

- Implementado: consulta de saude restaura conectado quando o mesmo cliente ja completou ready e volta a CONNECTED depois de oscilacao. Consultas de clientes substituidos nao alteram a instancia atual. CONNECTED antes de ready nao habilita envios. Recuperacao automatica aguarda inicializacao em andamento ate o maior timeout configurado (minimo cinco minutos) mais trinta segundos, evitando encerrar o navegador durante a partida; apos limite, fluxo seguro existente permanece disponivel.
- Evidencia operacional: partida de hoje teve erros de contexto destruido e terminou aguardando QR; nao ha LOGOUT registrado no intervalo. Estas correcoes tratam falhas comprovadas no controle local, sem afirmar causa resolvida de perda remota do vinculo ou de Chrome residual. Sessao que ja solicita QR pode exigir vinculacao manual apos deploy. Estabilidade diaria continua pendente de observacao.
- Afeta administrador, comercial provisionado e local; Mestre sem mudanca. Bancos, configuracoes, sessao existente, bonus, backups e DATA_DIR preservados; sem migracao. Transportes, digitacao e LID inalterados; nenhum envio real ou reinicio operacional executado.
- Validacao: sintaxe, quatro testes isolados de recuperacao/ready/concorrencia/partida, regressoes de diagnostico e manutencao, diff e pacote oficial. Publicar e executar deploy; conferir vinculo e estabilidade apos proxima partida.

## Pagina atual destacada — versao 1.4.11

- Implementado: paginacao compartilhada e Pendencias identificam pagina atual com aria-current. Estilo ativo tem prioridade sobre tema noturno, com fundo azul, texto branco, peso e contorno; modo claro mantem mesmo destaque. Historico de mensagens informativas agora mostra numeros e identifica a pagina atual; corrigidos destinos de Inicio, Anterior e Fim. Filtros e preservacao da rolagem mantidos.
- Afeta administrador, comercial provisionado e instalacao local nas listas do painel; Mestre sem alteracao. Bancos, configuracoes, sessoes, bonus e backups preservados; sem migracao ou alteracao de permissoes. Recarregar apos deploy.
- Validacao: sintaxe dos tres arquivos, verificacao do estilo computado em Chromium nos temas claro/noturno e da marcacao ativa, diff e pacote oficial. Sem envios reais.

## Desenvolvimento consolidado no D: — 19/10/2026

- Arquivos auxiliares do antigo workspace copiados para .codex/arquivo-c, com verificacao SHA-256 por arquivo. Originais no C: preservados: limpeza bloqueada pela revisao automatica, pendente de autorizacao explicita. Pasta .codex ja excluida do Git e do pacote. Nao sobrescrever codigo atual com scripts historicos.
- Configuracao privada local do Mestre passou a apontar a chave existente copiada para seu DATA_DIR no D:, sem rotacao. Origem preservada. Nao registrar conteudo da chave em documentacao, Git ou entrega. Processo Mestre em execucao pode manter configuracao anterior ate proximo reinicio/deploy; nao apagar origem antes de validar esse reinicio.
- Desenvolvimento passa a usar D:\julian-play, inclusive arquivos temporarios de trabalho em .codex. Dados operacionais continuam nos DATA_DIR isolados em D:. PM2, ferramentas instaladas e perfil do usuario no C: nao foram transferidos. Sem mudanca de versao funcional.
- Afeta workspace e configuracao local do Mestre; administrador, comercial e local sem mudanca funcional. Bancos, sessoes, configuracoes e backups preservados. Validacao por hashes das copias; limpeza da origem e inventario completo de pastas sem acesso permanecem pendentes.

- Limpeza autorizada em 19/10/2026: removidas somente as duas pastas residuais do C: apos conferir ausencia de outros arquivos e igualdade SHA-256 da chave ja migrada. Chave preservada no DATA_DIR do Mestre no D:, com configuracao local apontando para esse destino. Nenhum processo reiniciado nesta limpeza; arquivos auxiliares do workspace antigo continuam preservados no C:.

## Teste pendente e indicacao antes da assinatura — versao 1.4.12

- Implementado: plano Teste Gratis em Pendente salva sem inicio, vencimento e duracao; datas antigas nao fazem pendente expirar automaticamente. Avisos de teste excluem pendente, suspenso e cancelado. Testes deixam de receber os avisos genericos de plano, usando o agendador proprio. Suspensao conserva datas mas bloqueia esses avisos; nao promete congelar e retomar tempo restante.
- Ao mudar para Teste, horas sao obrigatorias. Servidor calcula inicio corrente em America/Sao_Paulo na transicao e vencimento pelas horas/minutos selecionados; salvar novamente enquanto teste nao reinicia o periodo. Edicao de inicio de teste ja iniciado recalcula a partir do inicio informado. Interface nao inicia teste ao escolher apenas o plano. Botao Recalcular valida campos e usa horas no teste ou regra de dias/meses existente no plano.
- Indicado por pode ser vinculado no teste, com campanha de origem preservada, estado aguardando_assinatura e zero renovacoes contabilizadas. Passa a ativa quando status ativo, plano nao teste/bonus e valor positivo. Primeira assinatura permanece excluida; renovacoes validas continuam liberando creditos conforme campanha. Vinculos antigos ainda ativos para testes/pendentes passam a aguardar; beneficios ja liberados e saldos nao sao estornados.
- Afeta administrador, comercial provisionado e local; Mestre sem nova funcao. Bancos, pagamentos, campanhas, bonus, sessoes, configuracoes e backups preservados; sem nova coluna/migracao estrutural. Atualizacoes de estado usam transacao existente por instalacao. Rascunhos .codex explicitamente ignorados no Git; ja excluidos do pacote.
- Validacao: sintaxe, teste isolado de periodo/avisos/assinatura/credito unico, regressao de indicacoes, navegador Chromium com formulario real (pendente, horas, recalculo e mensal), diff e pacote oficial. Nenhum envio real; transporte, digitacao e LID inalterados. Apos deploy recarregar e salvar cadastros ainda nao iniciados como Pendente. Mensagens anteriormente enviadas nao sao desfeitas; envios ja em andamento devem ser conferidos no historico.

- Complemento 1.4.12: Prioridades do dia e Central de Pendencias mostram teste pendente como teste aguardando inicio, prioridade baixa, sem prazo de vencimento e com instrucao de marcar Teste e escolher horas. Datas antigas nao geram alerta de teste vencido para pendentes. Consulta inclui plano para distinguir pendencia comercial de teste; estado ativo/suspenso segue regra anterior. Teste isolado confere tipo, prioridade, texto e prazo vazio.

- Limite de validacao local: teste E2E integrado adicionado para o ciclo e botao, mas a tentativa local parou no global-setup porque o servidor isolado nao respondeu em 30 segundos. Validacao direta no Chromium do HTML real passou sem erros de script. Regressoes de servico executadas com CI=1 para usar o timeout maior ja previsto no helper, devido a lentidao local; nao foi alterado timeout do produto.

- Protecao adicional 1.4.12: novo plano de teste salvo como Ativo sem inicio/duracao validos fica Pendente; consultas de avisos exigem duracao preenchida. Cadastros legados sem horas precisam ser revisados e iniciados explicitamente antes de receber avisos de teste. Regressao final: 24 testes de acoes/cadastro/indicacoes e seis de pendencias/ciclo passaram; E2E integrado continua pendente pelo timeout de partida local.

## Implementado: validacao completa e recalculo — versao 1.4.13

- Corrigidos dois cenarios de regressao que ainda criavam dados incompatíveis com 1.4.12: indicado elegivel agora possui plano mensal pago ativo; teste vencido representa periodo historico ja iniciado e expirado com duracao, em vez de tentar iniciar novo teste no passado sem horas. Assercoes de credito unico, catalogo e filtros preservadas. Nenhuma regra funcional relaxada para aprovar testes.
- Deploy 1.4.12 informado pelo operador foi recusado na validacao candidata (221 passaram, dois falharam), antes da etapa de parada de producao. Nao contornar validacao nem forcar publicacao.
- Afeta testes e recalculo do formulario no administrador, comercial provisionado e instalacao local; Mestre sem alteracao funcional. Demais regras 1.4.12 preservadas. Bancos, sessoes, campanhas, bonus, configuracoes e backups preservados. Sem migracao ou envio real. Validacao final: npm test com 223 aprovados e zero falhas; npm run test:e2e com 16 aprovados e zero falhas, sem ignorar testes. Sintaxe JavaScript e diff conferidos. Pacote oficial e ZIP externo preparados para a entrega. Publicacao e deploy permanecem manuais; workflow remoto da 1.4.13 pendente ate push.

- Validacao ampliada 1.4.13 encontrou e corrigiu interacao real: a protecao de autofill limpava dias/valor/datas calculados em formularios novos. O formulario de cliente agora marca como legitimos somente os valores que ele proprio deriva das escolhas de plano/horas/recalculo, usando o marcador ja reconhecido pela protecao; campos alheios e login mantem suas regras. Teste de navegador confere persistencia apos o intervalo de vigilancia.

- Servidor E2E: desativado somente o disparador periodico de indicacoes que ainda iniciava apesar de WhatsApp/agendadores anunciados como desligados. Acoes e servicos reais de indicacao permanecem nos testes; credito/transacao/deduplicacao continuam cobertos pela suite interna. Evita trabalho de fundo concorrente com navegacao no banco isolado; nao altera agendadores em producao nem ignora assercoes.

- Conferencia do pacote 1.4.13 identificou ZIP externo antigo na raiz sendo incluido no ZIP interno (cerca de 300 MB extras). Gerador oficial agora exclui ZIPs preexistentes, hashes de ZIP, outputs e relatorios Playwright. Tambem exclui .env, exportacoes ambiente-seguro, chaves privadas PEM e conversas legadas; assets de execucao e chave publica continuam no pacote. Apenas filtro da copia para staging: originais, bancos, sessao WhatsApp, backups, configuracoes e processos PM2 nao sao removidos nem alterados. Afeta entrega local compartilhada; sem mudanca nas permissoes ou nos quatro perfis em execucao. Validacao adicional: parse PowerShell, filtro positivo/negativo, regressao de entrega e inspecao dos ZIPs gerados.

- Resultado adicional: 20 testes de backup/atualizacao/manifesto passaram. Filtro e parse PowerShell aprovados; pacote assinado e ZIP externo conferidos, sem ZIPs aninhados, dados ou configuracoes privadas. Documentos internos AGENTS, CONTEXTO e AUDITORIA tambem excluidos da entrega ao cliente; continuam versionados no repositorio. Originais internos preservados.

## Implementado: limite dos testes de indicacoes no deploy — 1.4.14

- Corrigida divergencia local/CI: suite de indicacoes usa 90 segundos por processo isolado, em vez de 30 segundos no deploy local. Dois testes foram encerrados aos 30 segundos no candidato 1.4.13; a mesma versao passou no GitHub. Todas as assercoes e a recusa de atualizacao por falha permanecem.
- Diagnostico do helper agora distingue timeout, codigo de saida, sinal e erro do processo. Sem mudanca nas regras de indicacao ou bonus, na aplicacao ou nos quatro perfis. Bancos, configuracoes, sessoes, backups e isolamento preservados; sem envio real ou acao manual nos dados.
- Validacao: 11/11 testes de indicacoes aprovados (265,6s); os dois casos interrompidos anteriormente passaram, um deles em 34,5s. Sintaxe JavaScript, simulacao ETIMEDOUT e diff aprovados. Pacote assinado e ZIP externo 1.4.14 gerados e inspecionados (zero entradas proibidas). Suite inteira de 223 testes nao repetida nesta mudanca restrita aos testes; ultimo deploy teve 221 aprovados e dois timeouts. Limitacao conhecida: suite completa continua demorada no computador de producao; esta entrega nao promete reducao do tempo total do deploy. Nova validacao remota pendente do push.

## Implementado: login e reducao de disputa no banco — 1.4.15

- Falha externa de reCAPTCHA tem mensagem propria, continua negando acesso e nao penaliza o usuario como tentativa invalida. Formulario informa expiracao/espera e bloqueia envio repetido. CAPTCHA valido, senha, TOTP, CSRF e sessoes mantem as protecoes existentes.
- Modelos inicializados uma vez por grupo/processo com compartilhamento concorrente e nova tentativa apos falha; consultas seguintes nao tentam gravar padroes. Edicoes consultadas diretamente; exclusao e restauracao invalidam inicializacao. Indicacoes sem trabalho nao abrem transacao de escrita; com trabalho mantem releitura, atomicidade e credito unico.
- Espera SQLite limitada a 5 segundos para travas curtas; sem troca do journal, WAL, alteracao no formato do banco ou nas copias de backup. Administrador, comercial e local afetados; Mestre sem mudanca de permissao. Dados, sessoes, configuracoes e isolamento preservados.
- Limitacoes: nao garante disponibilidade da rede/Google e nao afirma eliminar toda causa de lentidao. Suite completa e navegador em andamento antes da entrega; nenhuma mensagem real ou alteracao de dados de producao executada.

- Login tambem devolve resposta HTTP 503 segura em excecoes do banco/handler, evitando espera sem resposta no Express 4. Sem vazamento de detalhe interno ou criacao de cookie de sessao; regressao especifica adicionada. Validacao completa reiniciada apos essa ultima alteracao.

- Validacao encontrou timeout local de 30s tambem na copia/restauracao externa. Limite padrao dos processos isolados alinhado em 90s no local/CI, com overrides existentes preservados. Primeira suite completa: 225 passaram e um timeout; nova suite completa em andamento antes de liberar comandos. Nao ha reducao do tempo total prometida nem remocao de testes.

## Implementado: deploy reaproveita validacao completa correspondente — 1.4.15

- npm run test:entrega executa npm ci, testes internos e navegador em copia isolada no D:. Confere fontes antes/depois e emite aprovacao DPAPI Windows CurrentUser, com prazo de 48h e hashes das fontes/lockfile e Node exato. Sem chave privada em arquivos do projeto; cache .codex nao integra Git nem pacote.
- Deploy confere os arquivos efetivos do candidato contra aprovacao. Mudanca, cache ausente/invalido/vencido ou outro usuario/maquina/Node executa os testes normalmente. Backup, PM2, dependencias, prontidao e rollback mantidos. Mestre/administrador/comercial/local preservam isolamento e dados; sem mudanca de permissao ou envio real.
- Testes direcionados de recusa e simulacao da funcao PowerShell real aprovados. Validacao completa final em andamento. Limitacoes: GitHub e outro computador nao recebem aprovacao local; documentos Markdown sao excluidos da identidade de codigo, texto CRLF/LF e normalizado e binarios sao exatos; o deploy ainda faz instalacao, backup, reinicio e verificacao de saude.

- Conferencia real de todas as fontes versus git archive aprovada usando indice/arvore temporarios, sem commit ou mudanca no indice real. Testes de CRLF/LF em arquivo auxiliar, integridade binaria e integracao PowerShell aprovados. Nova suite completa reiniciada sobre esse codigo final; so o resultado dela podera gerar comprovante.

## Aprovacao final 1.4.15

- Executado npm run test:entrega sobre copia isolada com dependencias instaladas pelo lockfile: 228/228 testes internos (zero falhas/ignorados) e 17/17 testes de navegador aprovados. Comprovante protegido emitido automaticamente pelo fluxo completo. Sintaxe JavaScript, PowerShell e diff aprovados.
- Nenhuma acao em dados, sessao ou processos de producao; sem envio real. Publicacao/deploy manuais ainda pendentes. As execucoes anteriores interrompidas ou com timeout sao historico da investigacao, nao a aprovacao usada pelo deploy. Pacote/ZIP em conferencia final.

- Entrega final concluida: 228 testes internos e 17 de navegador aprovados pelo fluxo completo, comprovante real reconhecido contra o candidato Git, pacote 1.4.15 assinado e assinatura verificada. ZIP externo final de 15.750.639 bytes com hash acompanhante. Inspecao interna/externa sem conteudo privado; nove relatorios antigos da pasta de envio foram movidos para rascunhos privados .codex, preservados e excluidos da entrega. Nenhum commit/push/deploy ou envio real executado. Falhas externas do Google continuam sujeitas a rede/provedor; a entrega trata a indisponibilidade e reduz escritas desnecessarias, sem prometer disponibilidade externa ou eliminar toda causa de lentidao.

### Implementado — navegacao do dashboard 1.4.16

- Retirada do diagnostico completo de manutencao no carregamento do Painel: consulta assincrona somente das datas dos backups para manter prioridade de backup atrasado. Inventarios/migracoes/retencao continuam na Manutencao; sem cache, sem escrita ou alteracao de permissao.
- GET /clientes trata falha async/sincrona com HTTP 503 e Retry-After, sem detalhes privados; observabilidade diferencia resposta concluida de conexao interrompida e registra duracao/correlacao. Regressao real de rota simula SQLITE_BUSY e impede uso do diagnostico completo.
- Perfis: dashboard administrador/comercial servidor/local; Mestre preservado, observabilidade compartilhada. Dados, pagamentos, bonus, configuracoes, backups, sessoes WhatsApp e isolamento preservados. Deploy necessario; sem correcao manual de dados, envio real ou migracao.
- Validacao completa e artefatos em andamento antes da entrega.

### Parcial — intermitencia 502 entre dominio e origem (20/10/2026)

- Origem respondeu rapidamente no acompanhamento e sem reinicio no horario do incidente. Tunel ativo com 3–4 conexoes e mais um erro contabilizado, sem log historico suficiente para determinar a causa especifica. Registro de interrupcoes permite diferenciar futuras ocorrencias. Nao declarar solucionado exclusivamente por uma navegacao bem-sucedida. Nenhuma mudanca de tunel ou sessao executada.
- Diagnostico operacional adicional: operador executou como administrador o roteiro privado .codex/habilitar-log-cloudflared.ps1. Comando anterior do servico preservado em backup privado; habilitado log warn em .codex/cloudflared-erros.log, sem debug/cabecalhos. Reiniciado somente Cloudflared; prontidao publica confirmada. Mantidos protocolo http2, token-file, rotas, bancos, PM2 e sessao WhatsApp. Script com parse aprovado e rollback da configuracao caso o dominio nao confirme prontidao. Avisos iniciais de reconexao nao sao prova da causa do incidente anterior. Contadores do tunel sao agregados de todos os hostnames, nao comprovam erro especifico do dominio. Log permanece privado, fora de Git/pacotes; alteracao operacional afeta acesso externo dos paineis no servidor, nao instalacao local.
- Relatorio operacional antigo nao versionado em migrations/ultimo-relatorio.json (26/09) preservado com hash conferido em .codex/relatorios-suporte-preservados-20261020, impedindo inclusao indevida no pacote. Nenhum dado apagado ou arquivo ativo dos DATA_DIR alterado.
## Ajuste operacional WARP/Cloudflare no servidor — 20/10/2026

- Identificado WARP Free conectado em modo MASQUE no mesmo Windows do Cloudflared 2026.7.3. Logs registraram conexoes duplicadas, timeouts IPv6 e perda das conexoes do tunel durante mudanca da VPN, enquanto origem /ready permanecia 200 em 2–4ms. Reproducao confirma interferencia do caminho de rede; nao prova que todo 502 historico tenha a mesma causa. Orientacao primaria da equipe Cloudflare: https://github.com/cloudflare/cloudflared/issues/1466 .
- Operador autorizou explicitamente primeiro as exclusoes por hostname region1.v2.argotunnel.com e region2.v2.argotunnel.com. Ambas foram gravadas, mas dump efetivo mostrou rotas somente da primeira regiao; houve nova queda com WARP ativo. Apos aprovacao explicita adicional para 40 IPs, adicionados somente os 20 IPv4 e 20 IPv6 atualmente resolvidos desses dois nomes, sem faixas maiores. Listas anteriores e inclusoes exatas preservadas em .codex, privadas e fora de artefatos; demais exclusoes mantidas. Nao desativado firewall nem alteradas rotas de outros servicos intencionalmente; enderecos Cloudflare podem ser compartilhados por outros servicos, efeito informado e autorizado.
- Operador reiniciou somente Cloudflared apos desconectar WARP para diagnostico. VPN foi restabelecida para o estado conectado habitual. Apos aplicar os IPs, dump confirmou rotas de ambas as regioes, tunel com quatro conexoes e prontidao publica 200 em aproximadamente 113ms. WhatsApp do painel continuou conectado, sem novo QR ou envio real. Falhas no intervalo da reaplicacao das rotas foram observadas; acompanhamento posterior necessario para confirmar estabilidade prolongada.
- Configuracao operacional afeta acesso externo dos paineis hospedados neste Windows (Mestre, administrador e comerciais); instalacao local em outro computador inalterada. Nao incorporar VPN/rotas locais como padrao de instalador, nem excluir automaticamente futuros IPs sem revisao: enderecos DNS podem mudar. Preservados protocolo http2 e configuracao/token-file do tunel, processos PM2, DATA_DIR, bancos, configuracoes e sessoes WhatsApp. Ajuste ja aplicado no servidor, independente do deploy de codigo 1.4.16.
## Conclusao da entrega 1.4.16

- Validacao completa real concluida por npm run test:entrega com codigo 0: npm ci em copia isolada, 230 testes internos aprovados (1286,1s), zero falhas e zero ignorados, seguidos de 18 testes de navegador aprovados (1,3min). Inclui simulacao de SQLITE_BUSY no dashboard, resumo de backup, interrupcao de resposta e navegacao Manutencao/Painel/Clientes. Sintaxe dos cinco JavaScript alterados e git diff --check aprovados; scripts privados de diagnostico com parse aprovado. Nenhuma mensagem real enviada.
- Comprovante Windows DPAPI emitido automaticamente. Conferencia posterior contra git archive de arvore temporaria reconheceu o candidato final, sem alterar indice real ou criar commit. Deploy do mesmo candidato, usuario, Windows e Node dentro de 48h reutiliza a aprovacao; ausencia/divergencia repete testes conforme regra existente.
- Pacote oficial 1.4.16 gerado e assinatura Ed25519 verificada. ZIP interno e externo inspecionados: nenhuma entrada privada/banco/sessao/relatorio operacional. ZIP externo final 15.752.613 bytes; hash acompanhante atualizado. Codigo, versao, contexto e auditoria compoem a mesma entrega. Sem commit, push ou deploy de codigo executado; workflow 1.4.16 depende do novo push (anterior 1.4.15 aprovado).
- Depois das 40 exclusoes IP autorizadas: WARP conectado, rotas efetivas de ambas as regioes, quatro conexoes ativas do tunel e prontidao publica confirmada repetidamente. Sem novas falhas no log durante acompanhamento apos a reaplicacao das rotas; WhatsApp conectado. Operador confirmou navegacao do Julian Play e acesso ao Aura TV+ normais com WARP ligado. Falhas durante as trocas de rede foram registradas separadamente. Ajuste operacional ja aplicado; estabilidade de longo prazo e mudancas futuras de DNS exigem acompanhamento, sem promessa de eliminar todo 502 possivel.
- Acao restante para codigo: publicar os oito arquivos alterados e executar deploy 1.4.16; instalacao local recebe pacote oficial atualizado, preservando dados/configuracao/sessao. Ajustes de VPN pertencem somente a este servidor e nao sao distribuidos ao cliente.

### Implementado — sincronizacao historica e deduplicacao atomica 1.4.17

## Sincronizacao historica de rendimentos Mercado Pago — 1.4.17 (21/10/2026)

- Diagnostico real somente leitura: arquivo anteriormente disponivel para 20/10 continha apenas saldos inicial/final, sem operacao de rendimento. Solicitado ao provedor um novo relatorio fechado daquele dia; tarefa e consultas privadas guardadas em .codex, sem token no arquivo nem nos logs. Nenhum valor presumido ou lancado manualmente. Recuperacao operacional sera confirmada somente apos arquivo/operacao disponiveis.
- Botao Sincronizar Mercado Pago solicita atualizacao do historico do mes consultado (mes passado fecha no ultimo segundo local; mes corrente vai ate a consulta) e importa dos arquivos disponiveis somente operacoes ausentes. Agendador inclui o mes do dia anterior para recuperar creditos tardios e a virada do mes; mantem horario de 10h e acompanhamento de pendencias. Estado de versao passa a historico-mensal-v3 somente ao concluir, sem sobrescrever configuracoes do cliente.
- Relatorios reais podem retornar date_created em vez de generation_date/last_modified; reconhecimento e ordenacao passam a considerar esse campo. Novas tarefas sao acompanhadas por GET /v1/account/release_report/task/{id}; somente o arquivo exato retornado pela tarefa confirma conclusao. Pendencias legadas sem esse controle usam periodo coberto e geracao posterior a solicitacao. Novas tarefas nao sao apagadas antes da confirmacao. Requisicoes simultaneas compartilham a importacao em andamento no processo. Downloads possuem limite de 15s. Mensagem da interface informa processamento ainda pendente mesmo quando ja importou parte dos rendimentos.
- Rendimento, identificador externo e auditoria gravados atomicamente em conexao exclusiva ao proprio DB_PATH, com rollback e nova conferencia de unicidade dentro da transacao. Repeticao/concorrencia nao adiciona saldo novamente. SOURCE_ID/OPERATION_ID/TRANSACTION_ID preservados; sem ID, usa identidade do conteudo independente do nome do arquivo. Compatibilidade com chaves antigas feita sem recriar lancamento; arquivos lidos dos mais antigos aos recentes. Removidos, valores e edicoes existentes preservados. Datas de novas importacoes usam America/Sao_Paulo; nao reescreve datas historicas existentes. Movimentos com mesmo identificador usam INSERT OR IGNORE.
- Perfis afetados: financeiro administrador, comercial provisionado e instalacao local com Mercado Pago configurado; Mestre nao recebe funcionalidade financeira nem mudanca de permissao. Preserva isolamento DATA_DIR/DB_PATH, bancos, pagamentos, bonus, configuracoes, backups, PM2 e sessao WhatsApp. Sem migracao, seed ou envio de mensagem. Novas instalacoes mantem credenciais vazias. Necessario deploy/atualizacao; sem ajuste manual de valores.
- Regressao direcionada: 12/12 testes aprovados, incluindo dia faltante, relatorios sobrepostos sem ID, date_created, removidos preservados, concorrencia, rollback, mes enviado pelo botao, mes passado e limite UTC/Sao Paulo. Validacao completa por npm run test:entrega e artefatos em andamento antes dos comandos de publicacao. API real pode demorar para concluir relatorios; nao tratar tarefa pendente como rendimento zero.
- Recuperacao operacional confirmada em 21/10: tarefa do novo relatorio fechado de 20/10 passou de data-ready a processed e recebeu arquivo. Conferencia real encontrou a operacao de rendimento, e o monitor da instalacao administradora a importou automaticamente pela deduplicacao existente. Consulta posterior confirmou um unico lancamento e seu vinculo ao identificador do provedor, sem alterar os demais dias. Nao foram digitados valores manualmente, alteradas credenciais ou enviadas mensagens. Rendimento do dia 20 resolvido antes do deploy; melhoria permanente 1.4.17 permanece em validacao.
- Revisao adicional validou que pendencia concluida de mes anterior nao substitui o periodo automatico atual. Primeira execucao completa interrompida para esse ajuste, sem comprovante de aprovacao; suites completas reiniciadas sobre as fontes finais.

- Consulta real a tarefa validou os estados data-ready/processed e o arquivo final. Regressao adicional impede que relatorio antigo com date_created aparente futura confirme tarefa nova. Execucoes preliminares completas foram interrompidas antes da conclusao para incorporar as revisoes; nenhuma foi usada como comprovante. Validacao integral reiniciada sobre o codigo final.

- Conclusao da entrega 1.4.17: npm run test:entrega aprovado com npm ci isolado, 236 testes internos (1310,6s) e 18 testes de navegador (1,2min), sem falhas. Sintaxe dos JavaScript alterados e git diff --check conferidos. Comprovante DPAPI de 48h emitido automaticamente e reconhecido contra candidato git archive, sem alterar indice real nem criar commit.
- Pacote oficial 1.4.17 gerado, manifesto Ed25519 valido e versao interna conferida; pacote sem bancos, sessoes, segredos ou arquivos privados. ZIP externo recriado com hash acompanhante (15.757.421 bytes). Nenhum envio WhatsApp real. Mesmos perfis e dados preservados descritos acima; sem migracao ou ajuste manual depois do deploy.
- Recuperacao do dia 20 ja aplicada pelo monitor existente; correcao permanente do botao aguarda publicacao/deploy. Commit, push e deploy nao executados nesta entrega. Workflow remoto 1.4.17 depende do novo push; workflow da versao publicada 1.4.16 foi confirmado aprovado. Provedor pode levar minutos para processar novo relatorio, acompanhado automaticamente sem duplicacao.

## Implementado: atualizacao de seguranca do Cloudflared — 27/10/2026

- Atualizacao operacional autorizada do servico Windows Cloudflared de 2026.7.3 para 2026.10.4, release oficial mais recente consultada, com correcao posterior ao minimo 2026.10.2 indicado no aviso eMudhra. Fonte: https://blog.cloudflare.com/emudhra-certificate-compromise/ . Versao do aplicativo Julian Play inalterada; sem deploy de codigo.
- Download oficial do repositorio cloudflare/cloudflared; SHA256 conferido com digest da release antes e depois da instalacao: 411b16d40c8d872243efeb52c550053d00af0a8a97fbb32e730fb8aba429eaa8. Executavel anterior preservado em backup privado na .codex, fora de Git e pacotes. Script privado com parse PowerShell aprovado e restauracao prevista em caso de falha.
- Reiniciado somente Cloudflared. Comando do servico conferido identico ao anterior, mantendo token-file, HTTP/2 e demais parametros. Nao alterados WARP, rotas, certificados de origem, verificacao TLS ou configuracao do tunel. Preservados PM2, DATA_DIR/DB_PATH, bancos, configuracoes, backups e sessoes WhatsApp; nenhum envio real.
- Afeta acesso externo do Mestre, administrador e comerciais hospedados neste Windows; instalacoes locais em outros computadores nao foram atualizadas. Validacao efetiva: binario instalado 2026.10.4, servico Running, prontidao publica /ready e pagina inicial do painel com HTTP 200 apos reinicio. Sem teste funcional autenticado dos quatro perfis, sem suite interna/navegador ou geracao de pacote nesta manutencao exclusiva do conector. Nao equivale a validacao de entrega de codigo.
- Limites: reinicio pode interromper conexoes persistentes; nao foi criada replica temporaria e nao se afirma ausencia de interrupcao. Outras maquinas/conectores exigem conferencia propria. Atualizacao aplicada neste servidor, sem acao manual adicional nele; acompanhar saude do tunel. Nenhum segredo registrado.

## Implementado: assinaturas do mesmo responsavel — 1.4.18 (28/10/2026)

- Revisao de duplicados permite reconhecer pares de contratos com mesmo WhatsApp como assinaturas diferentes do mesmo responsavel e desfazer o vinculo. Reconhecimento manual e auditado, sem unir/excluir cadastros ou alterar acessos, pagamentos, vencimentos e historicos. Apenas a coincidencia de telefone daquele par deixa de gerar pendencia; MAC repetido e novos cadastros continuam exigindo revisao. Mudanca posterior do telefone invalida o reconhecimento anterior.
- Migracao formal 023 cria tabela de vinculos no proprio DB_PATH, sem reescrever contratos; backup pre-migracao pelo mecanismo existente. Vinculo e auditoria gravados em transacao exclusiva e atomica. Sem seed ou configuracoes reais como padrao. Interface mostra contratos reconhecidos com acesso a cada ficha e acao de desfazer.
- Comprovantes recebidos por WhatsApp com varias assinaturas exigem escolha explicita: reenviar imagem/PDF com legenda assinatura e o identificador informado pelo robo. Identificador de outro contato e rejeitado; nenhuma cobranca e criada enquanto houver ambiguidade. Mantem conferencia humana antes de renovar, deduplicacao por mensagem e contratos separados. Escolha tambem e exigida para telefones repetidos ainda nao reconhecidos. Usa resolucao LID/telefone existente e digitacao durante a espera configurada; respeita bloqueio de respostas/licenca. Nao modifica fluxo de comandos comerciais/gestao nem envia mensagem real em testes automatizados.
- Perfis: compartilhado entre administrador, comercial provisionado e instalacao local, sempre dentro de DATA_DIR/DB_PATH; Mestre nao ganha rotas de clientes nem muda permissoes. Preserva bancos, configuracoes, backups, sessoes WhatsApp e PM2. Versao do pacote 1.4.18. Necessario deploy/atualizacao para aplicar, seguido de reconhecimento manual dos pares legitimos; nenhum vinculo real aplicado durante desenvolvimento.
- Validacao: seis regressoes direcionadas iniciais aprovadas, incluindo preservacao de contratos/auditoria, MAC, terceiro cadastro, desfazer e comprovante ambiguo/contrato alheio/LID. Adicionados teste simulado de digitacao/telefone real/bloqueio do robo e teste de navegador para reconhecer/desfazer. Sintaxe JavaScript e git diff --check aprovados. Suites completas, pacote/ZIP e teste fisico comercial/gestao ainda pendentes antes da entrega; nao publicar como validado enquanto houver pendencias.
- Limites: vinculo e por par de assinaturas, nao uma nova entidade global de pessoa; nomes Casa/Bar continuam editaveis pelo operador. Campanhas/aniversarios nao foram agrupados por responsavel nesta entrega. Fluxos legados que consultam nome/telefone podem exigir usuario especifico; vinculo nao autoriza renovacao coletiva. Identificacao na legenda requer reenvio da midia; nao guarda comprovante sem contrato.

- Validacao fisica candidata concluida em 28/10: servicos da versao candidata executados com banco ficticio isolado e sessao WhatsApp ja conectada, sem novo QR/inicializacao de navegador e sem alterar clientes reais. Tres respostas enviadas exclusivamente ao contato autorizado: menu comercial, ajuda da gestao e pedido de identificacao da assinatura. Operador confirmou recebimento das tres e estado digitando antes das respostas. Teste nao equivale a recebimento de midia real nem comprova fluxo LID real; esses casos possuem regressao simulada. Nenhum numero pessoal registrado na documentacao.

- Primeira validacao integral: 239 testes internos aprovados, mas navegador terminou com 18 aprovados e uma falha. Causa identificada na preparacao E2E: novos contratos ficticios foram inseridos antes do cadastro de bonus, deslocando seu ID historico. Corrigida somente a ordem de criacao das fixtures; expectativa de bonus preservada. Reexecucao completa do navegador: 19/19 aprovados. Novo npm run test:entrega iniciado nas fontes finais em prioridade Idle, com monitor privado que interrompe apenas sua arvore de testes apos tres respostas locais lentas/falhas consecutivas. Nao usar a execucao anterior como comprovante nem considerar pacote antecipado como liberado; artefatos serao recriados apos aprovacao final.
- Incidente de navegacao durante validacao: operador apresentou 524 em Manutencao. /ready local e publico responderam 200, mas /login local e publico excederam 8s; consulta independente somente leitura de configuracoes concluiu em 97ms. Log da aplicacao registrou interrupcao de /manutencao em aproximadamente 125s. Depois de encerrados os testes, /login respondeu em 28ms local e 150ms publico, sem reiniciar servicos, alterar tunel/WARP ou dados; operador confirmou Manutencao aberta e navegacao mais rapida. Coincidencia temporal sugere disputa por recursos, mas nao comprova causa unica. Novo teste de navegador em baixa prioridade manteve /login em 35ms local e 117ms publico. Nao declarar correcao definitiva do 524 nem atribuir falha somente ao Cloudflare.

- Revisao adicional de privacidade antes da entrega: migracao 023 passa a remover os vinculos quando um cadastro e anonimizado, tem o telefone alterado ou e excluido, evitando reter o telefone antigo na tabela de reconhecimento. Gatilhos executam junto da operacao do cadastro e independem de foreign_keys habilitado na conexao. Oito regressoes direcionadas aprovadas, incluindo preservacao dos demais contratos e limpeza de vinculos/telefone. Repeticao integral anterior interrompida intencionalmente para incluir esta protecao, sem aprovacao reutilizavel. Validacao integral reiniciada nas fontes finais; painel real respondeu 200 em 28ms na conferencia.

## Conclusao da validacao local 1.4.18

- npm run test:entrega final aprovado com codigo 0: npm ci isolado, 240 testes internos aprovados (1349,8s), 19 testes de navegador aprovados (1,3min), zero falhas e zero ignorados. Comprovante DPAPI emitido pelo validador oficial, vigente por 48h para as mesmas fontes, dependencias e Node. Execucao final em prioridade Idle: 96 medidas do login real, maximo 1321ms e nenhuma interrupcao por lentidao. Teste fisico comercial, gestao e escolha da assinatura confirmado anteriormente pelo operador.
- Pacote oficial e ZIP externo recriados depois da aprovacao integral. Manifesto Ed25519 verificado com a chave publica existente; nenhuma chave criada ou substituida. Versao interna 1.4.18 e bytes da migracao 023 conferidos. Ambos ZIPs inspecionados sem bancos, sessoes, segredos, .codex, configuracao privada ou relatorio operacional. ZIP externo: 15.762.550 bytes, SHA256 a357077b28fb4e4823a0e816d37f0b39b084414d952fe83b6f5bb3019cc40003. Artefato anterior preservado privadamente; fontes auxiliares e destinatario de teste nao integram Git/pacotes.
- Codigo e pacote implementados; publicacao, deploy e reconhecimento operacional dos pares legitimos constituem a proxima etapa. Nenhum cadastro real unido, excluido, renovado ou alterado durante os testes. Perfil Mestre nao recebe funcionalidade de clientes; administrador, comercial no servidor e instalacao local compartilham a melhoria dentro do proprio DATA_DIR/DB_PATH. Mesmas limitacoes descritas acima, sem promessa de eliminacao definitiva dos 524.

## Entrega operacional concluida — 1.4.18 (28/10/2026)

- Codigo funcional commitado e enviado a origin/main em 41f13b9420f3ab05e487bf86357dc1368dbeda1b. Workflow Validacao do Julian Play aprovado: https://github.com/Kaka2002/julian-play/actions/runs/40727401870 . Validacao remota final success, sem reexecucao de jobs nem alteracao das expectativas.
- Deploy oficial D:\julian-play\deploy.ps1 concluido com codigo 0, reutilizando o comprovante completo compativel antes de parar producao. Foram reiniciados somente os processos que estavam online: administrador e Mestre. Prontidao dos dois confirmada; administrador local /ready 200 em 31ms, publico /ready 200 em 135ms e /login 200 em 66ms; Mestre porta 9000 /ready 200 em 31ms e /login 200 em 6ms. Sessao e dados preservados pelo procedimento oficial. Primeira chamada auxiliar encerrou na consulta inicial por captura de stderr como RemoteException; roteiro privado foi corrigido para capturar stdout/stderr separados e aguardar codigo real, sem alterar deploy.ps1 ou ignorar validacoes. Nao houve troca de producao naquela primeira tentativa.
- Reconhecido operacionalmente o par legitimo de assinaturas indicado pelo operador, depois de conferir mesmo telefone valido e usuarios distintos. Comparacao antes/depois confirmou todos os campos dos dois cadastros e seus pagamentos inalterados; somente vinculo e auditoria foram gravados. Alerta do par desapareceu. Nenhum cliente foi unido, excluido ou renovado, e nenhuma mensagem foi enviada aos clientes envolvidos. Nomes, numeros e dados pessoais nao registrados aqui.
- Deploy recriou pacote local assinado. Pacote e ZIP externo foram novamente sincronizados e conferidos: manifesto Ed25519 valido, sem arquivos privados/bancos/sessoes. ZIP final de entrega: 15.762.546 bytes, SHA256 c0761b8af5843ee4f4e3759689726e029d505e134b254c31cfc9a2d95c7b9dd4. Esse e o hash vigente, substituindo os hashes de preparacoes anteriores registrados acima. Artefatos continuam fora do Git. Versao anterior do ZIP preservada privadamente.
- Perfis e limites mantidos: melhoria compartilhada por administrador, comercial no servidor e cliente local; Mestre apenas atualizado/validado, sem rotas de clientes. Dados de cada instalacao permanecem isolados. Para outras instalacoes, atualizar pelo pacote oficial e reconhecer manualmente pares legitimos; nao copiar dados do administrador. Campanhas/aniversarios nao foram agrupados por responsavel; fluxos legados de busca podem exigir usuario especifico. Comprovante ambiguo requer reenvio com legenda da assinatura; conferencia humana continua obrigatoria. Incidente 524 nao e declarado definitivamente eliminado: navegacao recuperada sem reinicio durante diagnostico, e validacao final monitorada manteve painel disponivel.
- Este fechamento altera apenas documentacao, sem fontes funcionais, dependencias ou versao. O codigo funcional correspondente permanece aquele aprovado na CI e aplicado pelo deploy. Nao e necessario repetir suites funcionais por este registro operacional.

## Implementado: comprovantes opcionais no historico de pagamentos — 1.4.19 (28/10/2026)

- Historico de cada assinatura oferece Comprovantes; tela de edicao do pagamento permite anexar, visualizar e remover arquivos separadamente do formulario financeiro. Criacao manual/renovacao oferece opcao de abrir a anexacao depois de registrar o pagamento; envio de confirmacao permanece condicionado a opcao existente. Anexar ou remover nao confirma pagamento, renova assinatura, envia WhatsApp ou altera valor/vencimento. Campos financeiros ainda nao salvos permanecem na tela durante upload/remocao.
- JPG, PNG e PDF verificados por conteudo, ate 5 MB por arquivo e cinco anexos por pagamento. Conteudo original guardado em BLOB no proprio DB_PATH com tamanho, tipo, SHA256 e data. Sem arquivos soltos/publicos, sem nomes originais em logs ou auditoria. Arquivo repetido no mesmo pagamento e idempotente; nao sobrescreve anexos anteriores. Exibicao exige sessao, clienteId e pagamentoId corretos, sem cache e com cabecalhos restritivos. Upload e remocao exigem CSRF; remocao pede confirmacao do operador e preserva o pagamento.
- Migracao formal 024 cria tabela/indice/gatilhos, com backup pre-migracao existente. Anexo e auditoria gravados atomicamente em conexao exclusiva; sem alterar contratos/pagamentos anteriores. Backups completos do banco incluem os bytes dos anexos. Anonimizacao e exclusao de cliente ou exclusao fisica do pagamento removem os anexos associados; pagamento excluido logicamente nao permite leitura ou novo anexo. Backups antigos seguem a politica existente, sem promessa de apagar dados de copias historicas. Exportacao JSON de titular nao incorpora bytes de anexos; podem ser consultados pelo pagamento. Comprovantes do robo existentes permanecem no fluxo de pagamentos pendentes, sem conversao/migracao de seus arquivos nesta entrega.
- Compartilhado por administrador, comercial provisionado e cliente local, isolado no respectivo DATA_DIR/DB_PATH. Mestre nao recebe rotas financeiras/clientes. Preserva configuracoes, pagamentos, vencimentos, acessos, assinaturas vinculadas, backups, sessoes WhatsApp e processos PM2. Sem seed nem credenciais/dados reais como padrao. Necessario deploy/atualizacao, sem ajuste manual de dados; comprovante e opcional e inserido pelo operador no pagamento correto.
- Validacao direcionada: quatro testes aprovados cobrindo integridade, permissao por assinatura, sessao/CSRF, limites, duplicidade, preservacao financeira/mensagens, backup e anonimizacao. Cenario de navegador aprovado: pagamento com opcao de anexo, upload, imagem aberta no Chrome, preservacao de edicao nao salva, recarregamento e remocao. Preparacao do cenario corrigida para preencher forma/valor/data obrigatorios e respeitar protecao contra autofill, sem reduzir expectativas. Acrescentadas verificacoes positivas de JPG/PDF; suites integrais e pacote/ZIP pendentes antes da entrega. Nenhum comprovante ou pagamento real alterado durante desenvolvimento.

- Validacao integral anterior interrompida automaticamente pelo monitor apos tres respostas locais lentas/falhas consecutivas; nao gerou aprovacao e nao houve deploy nem reinicio de servicos. Conferencia posterior retornou /login 200 em 32ms no administrador e 164ms no Mestre. Nova validacao completa iniciada em prioridade Idle, mantendo protecao e expectativas; nao se atribui causalidade unica a coincidencia com os testes.

- Validacao integral final aprovada por npm run test:entrega: npm ci em copia isolada, 244 testes internos (1467,0s) e 20 cenarios de navegador (1,5min), sem falhas. Comprovante DPAPI emitido automaticamente para fontes finais, Node e dependencias, vigente por 48h. Monitor realizou 105 consultas locais, maior tempo 599ms, sem interrupcao ou reinicio. Sintaxe dos JavaScript alterados e git diff --check aprovados. Nenhum pagamento/comprovante real modificado; sem envio WhatsApp nesta entrega, que nao altera seu fluxo.

- Pacote e ZIP externo 1.4.19 gerados pelo roteiro oficial; manifesto Ed25519 valido, versao e novos arquivos conferidos, sem bancos/sessoes/arquivos privados. Esta preparacao esta aprovada para publicacao; deploy e CI remota serao registrados apos conclusao. Artefatos fora do Git, versao anterior do ZIP preservada privadamente.

## Fechamento operacional 1.4.19

- Codigo funcional publicado em origin/main: 029748ec100c6fd0f70c0a028da90698c18e580e. Workflow Validacao do Julian Play aprovado, incluindo testes internos, navegador e pacote limpo: https://github.com/Kaka2002/julian-play/actions/runs/40745342221 . Sem reexecucao de jobs, reducao de expectativas ou bypass de validacao.
- Deploy oficial concluido com codigo 0, reutilizando somente o comprovante integral compativel com o candidato. Backups conferidos antes da troca; reiniciados somente administrador e Mestre, que estavam online. Prontidao confirmada nos dois; migracao 024 conferida somente leitura no banco administrador. Sem alterar comprovantes/pagamentos reais durante validacao. Dados/configuracoes/sessoes preservados pelo procedimento oficial.
- Pos-deploy: administrador /ready 200 em 31ms e /login 200 em 18ms; Mestre /ready 200 em 5ms e /login 200 em 6ms; painel publico /ready 200 em 143ms e /login 200 em 84ms. Status administrativo autorizado confirmou WhatsApp conectado. Estas medicoes pontuais nao representam garantia de desempenho permanente.
- Pacote interno recriado pelo deploy; pacote e ZIP externo sincronizados novamente pelo gerador oficial, manifesto Ed25519 valido e fontes novas byte a byte conferidas. Sem arquivos privados, bancos ou sessoes. ZIP final: 15.771.695 bytes; SHA256 9a6b66d52d08152530984de93229884b5d61b58a61946a05fc5bd399b451b87d. Hash acompanhante confere; artefatos fora do Git. Versao anterior preservada privadamente.
- Uso: cliente > historico de pagamentos > Comprovantes; opcional, JPG/PNG/PDF de ate 5 MB, cinco anexos por pagamento. Renovacao pode abrir a anexacao apos registro mediante opcao. Nao requer novo cadastro ou configuracao. Em outras instalacoes comerciais/locais, aplicar o atualizador oficial preservando seus DATA_DIR/DB_PATH; Mestre nao recebe rotas financeiras. Sem acao manual de dados neste servidor. Limites de exportacao JSON e arquivos legados do robo permanecem os descritos acima.
- Este fechamento altera somente documentacao operacional; codigo funcional, dependencias e versao continuam os aprovados nas suites e CI. Nao exige nova execucao funcional para este registro.