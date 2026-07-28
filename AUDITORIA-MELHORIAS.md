# Auditoria das melhorias recomendadas

Atualizada em 28/07/2026. Este documento registra o estado comprovado no
código; itens operacionais externos não são marcados como implementados.

## Implementado

- Credenciais de clientes e integrações cifradas com AES-256-GCM, migração
  idempotente, rotação de chave e kit de recuperação cifrado.
- Backup diário verificado, cópia externa opcional, alerta de falha,
  `PRAGMA quick_check` e teste de restauração.
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
  intervalos, pausa, retomada e cancelamento de campanhas.
- Estado central de disco, memória, backup, WhatsApp, cobranças e versão por
  instalação no Painel Mestre.
- Testes automatizados para perfis, permissões, segurança, pagamentos,
  renovação externa, backup, atualização, criptografia e isolamento.

## Parcial

- Backup: falta retenção separada diária/semanal/mensal e exercício mensal
  agendado com relatório.
- Pagamento manual: concluído para PayPal pessoal. Estorno corrige a receita e
  preserva o acesso para decisão explícita, evitando suspensão acidental.
- Campanhas: falta indicador manual de reclamação e pausa por taxa agregada de
  erros/bloqueios.
- Migrações: existe `schema_migrations`, mas parte do legado ainda está na
  inicialização do SQLite; novos módulos devem migrar gradualmente para um
  arquivo por versão.
- Rotas: pagamentos manuais foram extraídos para
  `routes/pagamentosRoute.js`; os demais domínios de
  `routes/clientesRoute.js` ainda devem ser extraídos gradualmente.
- Observabilidade: falta comparar versão instalada com a última versão
  disponível e padronizar correlação estruturada em todos os logs.

## Pendente

- Cloudflare Access no Painel Mestre, que depende de configuração na conta
  Cloudflare e de uma política de acesso definida pelo proprietário.
- Central de tarefas, pesquisa global, linha do tempo unificada, detecção de
  duplicados, conciliação diária, exportação de auditoria e política operacional
  de retenção/exclusão.
- Teste automatizado de instalação em uma máquina Windows limpa.

## Ação externa obrigatória

- Aumentar a RAM física/virtual do servidor para no mínimo 8 GB, preferivelmente
  16 GB. Código não substitui capacidade de memória.
- Manter mais de 10 GB livres no disco do servidor.
- Manter `julian-amplaytv` parado enquanto a cliente utilizar a instalação
  local.
