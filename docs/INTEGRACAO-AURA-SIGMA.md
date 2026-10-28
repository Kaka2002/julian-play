# Aura / Sigma — primeira etapa (1.4.21)

Esta entrega habilita consultas. Criacao, renovacao, alteracao de plano, vinculo automatico e webhooks ainda nao estao habilitados. A assinatura paga da API pertence ao fornecedor; o Julian Play nao a contrata.

## Preparar o acesso

1. Ativar a API de Revenda na conta do Aura quando desejar iniciar a homologacao real. Conferir o preco e as condicoes na propria conta.
2. Gerar no Aura um token chamado Julian Play Consulta, com me.read, customers.read, servers.read e packages.read. Guardar o segredo exibido uma unica vez, sem envia-lo em chat ou captura.
3. No Julian Play, abrir Paineis e editar o painel desejado, ou criar um registro separado para a homologacao. Nao trocar automaticamente os paineis usados por contratos existentes.
4. Escolher Aura / Sigma — consulta de revenda. Informar a base https://auratvpainel.com/api/reseller-api/v1 e o token no campo Token da API. Deixar Renovacao automatica desligada. Confirmar a senha atual e salvar.
5. Campo de token vazio em edicoes posteriores preserva o valor salvo. O segredo usa o cofre da propria instalacao. Ausencia da chave privada impede salvar esse conector; nunca criar uma chave nova para substituir uma existente sem o procedimento de rotacao.

## Homologar somente leitura

Usar Consultar Aura/Sigma no cadastro salvo. Consultar conexao/saldo, servidores, pacotes e assinatura por usuario exato. Conferir ID, servidor, pacote, conexoes e vencimento com a ficha do Aura. Nao buscar por telefone para vincular contratos. Usuario ambiguo exige revisao pelo identificador externo antes das futuras escritas. Catálogos mostram uma pagina por vez; consultar as paginas restantes no formulario.

O painel nao importa esses resultados no cadastro local nem salva novas credenciais de assinantes nesta etapa. Senhas e URLs de playlist da resposta sao descartadas. Consulta nao confirma pagamento, nao renova, nao envia WhatsApp e nao altera saldo. O saldo e o informado pelo fornecedor; outros operadores podem modifica-lo.

## Falhas

401: token invalido/expirado. 402: conferir assinatura da API ou condicoes/saldo da operacao. 403: conferir escopos, permissao use reseller api e restricao de IP. 404: assinatura nao encontrada para a revenda. 409: usuario ambiguo. 429: esperar a cota; tokens e outros sistemas compartilham a cota de 120/minuto por usuario/tenant. Sem repeticao automatica. Falha de rede/Cloudflare/HTML nao e tratada como consulta bem-sucedida.

## Proximas etapas

Vinculo auditado de cliente/acesso local ao ID externo; criacao e renovacao assistidas com pacote, telas, custo e vencimento confirmados; estado persistente da operacao e reconciliacao apos timeout; somente entao pagamento confirmado, automatizacao e webhooks HMAC com deduplicacao. Renovacao do contrato documentado nao recebe dias/pacote no corpo; nao simular duracao apenas alterando vencimento. Em nenhuma etapa usar a fila REST generica para escrever no Sigma.

Base tecnica: Sigma Reseller API, OpenAPI 3.1.0 / versao 1.0.0, contrato fornecido em llms.txt pelo operador. Documentacao do fornecedor: https://auratvpainel.com/integrations/reseller-api/api-reference . Sem teste real enquanto a API nao estiver ativa e o token nao estiver configurado.