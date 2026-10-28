const { test, expect } = require('@playwright/test');

test('campanha exige validade e mostra o prazo salvo no modelo',async({page})=>{
    await autenticar(page);await page.goto('/modelos');
    const card=page.locator('.model-card').filter({has:page.getByRole('heading',{name:'Amizade que vale presente',exact:true})});
    await card.getByTitle('Editar modelo').click();
    await page.getByLabel('Título',{exact:true}).fill('Amizade que vale presente');
    await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('1');
    await page.getByLabel('Validade da campanha (horário de Brasília)',{exact:true}).fill('2099-12-31T23:59');
    await page.getByRole('button',{name:'Salvar modelo',exact:true}).click();
    await expect(page).toHaveURL(/\/modelos\?mensagem=/);
    await expect(card).toContainText('31/12/99');
});

test('desativar campanha bloqueia novas indicacoes e apresenta ausencia de campanha vigente',async({page})=>{
    await autenticar(page);await page.goto('/modelos');
    const card=page.locator('.model-card').filter({has:page.getByRole('heading',{name:'Amizade que vale presente',exact:true})});
    await card.getByTitle('Editar modelo').click();
    await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('0');
    await page.getByRole('button',{name:'Salvar modelo',exact:true}).click();
    await page.goto('/indicacoes');await expect(page.getByRole('heading',{name:'Nenhuma campanha de indicação ativa',exact:true})).toBeVisible();
    await expect(page.locator('form[action="/indicacoes"]')).toHaveCount(0);
});

for(const consulta of ['perfil','packages','assinatura'])test('Aura Sigma consulta '+consulta+' sem exibir token ou senha',async({page})=>{
    await autenticar(page);await page.goto('/paineis');
    const linha=page.locator('.device-card').filter({hasText:'Aura E2E isolado'});await linha.getByTitle('Editar painel').click();
    await expect(page.getByLabel('Token da API',{exact:true})).toHaveValue('');
    await page.getByRole('combobox',{name:'Consulta',exact:true}).selectOption(consulta);
    if(consulta==='assinatura')await page.getByLabel('Usuário exato no Aura').fill('assinatura-ficticia-e2e');
    await page.getByRole('button',{name:'Consultar Aura/Sigma',exact:true}).click();
    if(consulta==='perfil'){await expect(page.getByText('Saldo em créditos',{exact:true})).toBeVisible();await expect(page.getByText('7',{exact:true})).toBeVisible();}
    if(consulta==='packages')await expect(page.getByText('Mensal ficticio',{exact:true})).toBeVisible();
    if(consulta==='assinatura')await expect(page.getByText('assinatura-e2e',{exact:true})).toBeVisible();
    await expect(page.locator('body')).not.toContainText('SEGREDO-NAO-EXIBIR');await expect(page.locator('body')).not.toContainText('sigma-token-e2e-ficticio');
});

test('CRM distribui acoes sem sobrepor historico longo em desktop e celular',async({page},testInfo)=>{
    await autenticar(page);
    for(const largura of [1920,1280,390]){
        await page.setViewportSize({width:largura,height:1080});await page.goto('/crm');
        const linha=page.locator('.crm-table tbody tr').filter({hasText:'Lead E2E Layout'});
        await expect(linha).toBeVisible();
        const historico=linha.locator('[data-label="Histórico"] .cell-muted');
        expect(await historico.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
        const area=linha.locator('[data-label="Ações"]');const limites=await area.boundingBox();
        const botoes=area.locator('.row-actions .button');await expect(botoes).toHaveCount(7);
        for(const botao of await botoes.all()){const r=await botao.boundingBox();expect(r.x).toBeGreaterThanOrEqual(limites.x);expect(r.x+r.width).toBeLessThanOrEqual(limites.x+limites.width+1);}
        const texto=await historico.boundingBox(),acoes=await area.boundingBox();
        expect(texto.x+texto.width<=acoes.x+1||texto.y+texto.height<=acoes.y+1).toBe(true);
        await page.screenshot({path:testInfo.outputPath('crm-'+largura+'.png'),fullPage:true});
    }
});

async function autenticar(page) {
    await page.goto('/login');
    const pergunta = await page.locator('label', { hasText: 'Confirmação humana' }).innerText();
    const numeros = pergunta.match(/\d+/g).map(Number);
    const resposta = pergunta.includes('−') || pergunta.includes('-')
        ? numeros[0] - numeros[1]
        : numeros[0] + numeros[1];

    await page.getByLabel('Usuário').fill('e2e-admin');
    await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Segura-2026');
    await page.getByLabel(/Confirmação humana/).fill(String(resposta));
    await page.getByRole('button', { name: 'Acessar painel' }).click();
    await expect(page).not.toHaveURL(/\/login/);
}

test('protege o painel sem autenticação', async ({ page }) => {
    await page.goto('/clientes');
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('button', { name: 'Acessar painel' })).toBeVisible();
    await expect(page.getByLabel('Usuário')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await expect(page.getByLabel('Usuário')).not.toHaveAttribute('data-lpignore', 'true');
    await expect(page.getByLabel('Senha', { exact: true })).not.toHaveAttribute('data-lpignore', 'true');
});

test('painel autenticado não exibe Hoje nem barra horizontal no menu', async ({ page }) => {
    await autenticar(page);
    await page.goto('/clientes');

    await expect(page.getByRole('link', { name: 'Painel', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hoje', exact: true })).toHaveCount(0);

    const menu = page.locator('nav').first();
    await expect(menu).toBeVisible();
    const dimensoes = await menu.evaluate(elemento => ({
        larguraVisivel: elemento.clientWidth,
        larguraConteudo: elemento.scrollWidth
    }));
    expect(dimensoes.larguraConteudo).toBeLessThanOrEqual(dimensoes.larguraVisivel + 1);
});

test('cadastro de cliente pede aniversario somente como dia e mes', async ({ page }) => {
    await autenticar(page);
    await page.goto('/clientes/novo');

    const aniversario = page.getByLabel('Aniversário (dia/mês)');
    await expect(aniversario).toHaveAttribute('type', 'text');
    await expect(aniversario).toHaveAttribute('placeholder', 'DD/MM');
    await expect(aniversario).toHaveAttribute('maxlength', '5');
    await aniversario.fill('0804');
    await expect(aniversario).toHaveValue('08/04');
});

test('campanhas disponiveis aparecem separadas do historico', async ({ page }) => {
    await autenticar(page);
    await page.goto('/campanhas');

    await expect(page.getByRole('heading', { name: 'Campanhas disponíveis' })).toBeVisible();
    await expect(page.getByText('Nenhuma campanha vigente para criar bônus', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Campanhas registradas' })).toBeVisible();
});

test('central de pendencias consolida riscos e permite filtrar por area', async ({ page }) => {
    await autenticar(page);
    await page.goto('/pendencias');

    await expect(page.getByRole('heading', { name: 'Central de Pendências' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Pendências/ })).toHaveClass(/active/);
    await expect(page.getByText('WhatsApp desconectado')).toBeVisible();
    await expect(page.getByText('Total aberto')).toBeVisible();
    await page.getByLabel('Filtrar área').selectOption('whatsapp');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/area=whatsapp/);
    await expect(page.getByText('WhatsApp desconectado')).toBeVisible();
    await expect(page.locator('.pending-item .badge.muted')).toHaveText('Área responsável: WhatsApp');
});

test('central de pendencias oferece editar concluir e excluir com confirmacao', async ({ page }) => {
    await autenticar(page);
    await page.goto('/pendencias');

    await expect(page.getByText('Editar', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Concluir' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excluir' }).first()).toBeVisible();

    await page.getByText('Editar', { exact: true }).first().click();
    await expect(page.locator('form[action="/pendencias/editar"] input[name="titulo"]').first()).toBeVisible();
    await expect(page.locator('form[action="/pendencias/editar"] textarea[name="detalhe"]').first()).toBeVisible();
});

test('financeiro abre conciliacao diagnostica sem alterar dados', async ({ page }) => {
    await autenticar(page);
    await page.goto('/financeiro');
    await page.getByRole('link', { name: 'Conciliar financeiro' }).click();
    await expect(page).toHaveURL(/\/financeiro\/conciliacao/);
    await expect(page.getByRole('heading', { name: 'Conciliação Financeira' })).toBeVisible();
    await expect(page.getByText(/A rotina é diagnóstica/)).toBeVisible();
    await page.getByRole('button', { name: 'Executar agora' }).click();
    await expect(page).toHaveURL(/mensagem=/);
    await expect(page.getByText(/Conciliação concluída/)).toBeVisible();
});

test('clientes oferece revisão segura de possíveis duplicados', async ({ page }) => {
    await autenticar(page);
    await page.goto('/clientes/todos');
    await page.getByRole('link', { name: 'Ver duplicados' }).click();
    await expect(page.getByRole('heading', { name: 'Possíveis clientes duplicados' })).toBeVisible();
    await expect(page.getByText('O sistema não une nem exclui clientes automaticamente.')).toBeVisible();
});

test('manutencao exibe controles independentes para o robo', async ({ page }) => {
    await autenticar(page);
    await page.goto('/manutencao');

    await expect(page.getByLabel('Robô responder mensagens recebidas')).toHaveValue('1');
    await expect(page.getByLabel('Robô enviar mensagens do painel e avisos automáticos')).toHaveValue('1');
    await expect(page.getByText(/o robô fica dormindo/)).toBeVisible();
});

test('manutencao mantem senhas e WhatsApp opcional sem preenchimento indevido', async ({ page }) => {
    await autenticar(page);
    await page.goto('/manutencao');

    await expect(page.getByLabel('Usuário do painel')).toHaveValue('admin');
    await expect(page.getByLabel('Nova senha', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Nova senha', { exact: true })).toHaveAttribute('type', 'text');
    await expect(page.getByLabel('Nova senha', { exact: true })).toHaveClass(/campo-segredo-manual/);
    await expect(page.getByLabel('Confirmar nova senha', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Senha atual para confirmar a alteração')).toHaveValue('');
    await expect(page.getByLabel('WhatsApp de controle para alertas (opcional)')).toHaveValue('');
    await expect(page.getByLabel('WhatsApp de controle para alertas (opcional)')).toHaveAttribute('data-autofill-empty', 'true');

    const whatsapp = page.getByLabel('WhatsApp de controle para alertas (opcional)');
    const senhaAtual = page.getByLabel('Senha atual para confirmar a alteração');
    await whatsapp.evaluate(el => { el.value = 'admin'; });
    await senhaAtual.evaluate(el => { el.value = 'senha-injetada'; });
    await whatsapp.click();
    await page.waitForTimeout(150);
    await expect(whatsapp).toHaveValue('');
    await senhaAtual.click();
    await page.waitForTimeout(150);
    await expect(senhaAtual).toHaveValue('');

    await page.getByRole('button', { name: 'Gerar backup agora' }).click();
    await expect(page).toHaveURL(/\/manutencao\?mensagem=/);
    const formularioExportar = page.locator('form[action="/manutencao/backups/exportar"]').first();
    const formularioCopiar = page.locator('form[action="/manutencao/backups/copiar"]').first();
    await expect(formularioExportar.locator('[name="senhaExportacao"]')).toHaveValue('');
    await expect(formularioExportar.locator('[name="senhaConfirmacao"]')).toHaveValue('');
    await expect(formularioCopiar.locator('[name="pastaExterna"]')).toHaveValue('');
    await expect(formularioCopiar.locator('[name="senhaConfirmacao"]')).toHaveValue('');
    await expect(formularioExportar.locator('[name="senhaExportacao"]')).toHaveAttribute('type', 'text');
    await expect(formularioCopiar.locator('[name="senhaConfirmacao"]')).toHaveAttribute('type', 'text');
});

test('upload da logo grava a imagem e nao o token CSRF', async ({ page }) => {
    await autenticar(page);
    await page.goto('/modelos');

    const pngUmPixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9Z7sAAAAASUVORK5CYII=',
        'base64'
    );
    await page.locator('input[type="file"][name="logo"]').last().setInputFiles({
        name: 'logo-e2e.png',
        mimeType: 'image/png',
        buffer: pngUmPixel
    });

    await expect(page).toHaveURL(/\/modelos\?mensagem=/);
    await expect(page.getByText('Logo atualizada com sucesso')).toBeVisible();
    const carregou = await page.locator('img[alt="Logo atual"]').evaluate(img => img.naturalWidth > 0);
    expect(carregou).toBe(true);
});

test('indicações mostram regra ativa e modelos de bônus podem ser editados', async ({ page }) => {
    await autenticar(page);
    await page.goto('/modelos');
    const campanha=page.locator('.model-card').filter({has:page.getByRole('heading',{name:'Amizade que vale presente',exact:true})});
    await campanha.getByTitle('Editar modelo').click();
    await page.getByLabel('Título',{exact:true}).fill('Amizade que vale presente');
    await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('1');
    await page.getByLabel('Validade da campanha (horário de Brasília)',{exact:true}).fill('2099-12-31T23:59');
    await page.getByRole('button',{name:'Salvar modelo',exact:true}).click();
    await expect(page).toHaveURL(/\/modelos\?mensagem=/);
    await page.goto('/indicacoes');
    await expect(page.getByRole('heading', { name: 'Programa de indicação' })).toBeVisible();
    await expect(page.getByText('1 indicado(s), 1 renovação(ões) paga(s) por indicado: 1 mês(es) de bônus. A primeira assinatura não conta.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Quem indicou')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Liberar 3 meses' })).toHaveCount(0);
    await page.goto('/modelos');
    const card = page.locator('.model-card').filter({ hasText: 'Indicação — bônus de 1 mês(es) liberado' });
    await expect(card).toBeVisible();
    await card.getByRole('link', { name: 'Editar modelo' }).click();
    await expect(page.locator('select[name=plano]')).toHaveValue('bonus');
    await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Indicação — bônus de 1 mês(es) liberado');
});

test('identifica saldo antigo e oferece bônus de três meses preservando preço', async ({ page }) => {
    await autenticar(page);
    await page.goto('/clientes/2/editar');
    const historico = page.locator('#historico-bonus');
    await expect(historico.getByRole('heading', { name: 'Origem e histórico de bônus' })).toBeVisible();
    await page.locator('#tipoPlanoId').selectOption({ label: 'Bônus' });
    await page.locator('#diasContrato').fill('90');
    await expect(page.locator('#valorPlano')).toHaveValue('35,00');
    await expect(page.locator('#diasContrato')).toHaveValue('90');
    await expect(page.locator('#dataVencimento')).toHaveValue('2099-04-01T23:59');
    const form = historico.locator('form');
    await form.locator('select[name="campanhaChave"]').selectOption('campanha_indique_ganhe_tres_meses');
    await form.locator('input[name="indicado"]').fill('Indicado de teste');
    await form.getByRole('button', { name: 'Identificar sem adicionar saldo' }).click();
    await expect(page.locator('input[name="bonusMeses"]')).toHaveValue('3');
    await expect(historico.getByRole('cell', { name: /Indique e ganhe 3 meses/ })).toBeVisible();
    await expect(historico.locator('form')).toHaveCount(0);
    await page.locator('#tipoPlanoId').selectOption({ label: 'Bônus' });
    await page.locator('#diasContrato').fill('90');
    await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
    await page.goto('/clientes/2/editar');
    await expect(page.locator('input[name="bonusMeses"]')).toHaveValue('0');
    await expect(page.locator('#valorPlano')).toHaveValue('35,00');
    await expect(page.locator('#historico-bonus').getByText('Bônus utilizado: 3 mês(es)', { exact: true })).toBeVisible();
});
test('ficha oferece indicador por ID e campanha de origem independente da ativa', async ({ page }) => {
    await autenticar(page);
    await page.goto('/clientes/novo');
    const indicador = page.locator('select[name="indicadorClienteId"]');
    await expect(indicador).toBeVisible();
    expect(await indicador.locator('option').count()).toBeGreaterThan(1);
    await expect(indicador.locator('option').nth(1)).toContainText(/ID \d+/);
    const campanha = page.locator('select[name="campanhaIndicacaoChave"]');
    await campanha.selectOption('campanha_amizade_presente');
    await expect(campanha).toHaveValue('campanha_amizade_presente');
    await expect(page.getByText(/Campanha ativa:/)).toBeVisible();
});

test('teste pendente aguarda horas e recalcular funciona no teste e no plano', async ({ page }) => {
    await autenticar(page);
    await page.goto('/clientes/novo');
    await page.locator('#tipoPlanoId').selectOption({label:'Teste Grátis'});
    await expect(page.locator('#statusCliente')).toHaveValue('pendente');
    await expect(page.locator('#dataInicio')).toHaveValue('');
    await expect(page.locator('#dataVencimento')).toHaveValue('');
    await page.locator('#statusCliente').selectOption('teste');
    await expect(page.locator('#horasTeste')).toHaveAttribute('required','');
    await page.locator('#horasTeste').selectOption('02 horas');
    const inicio=await page.locator('#dataInicio').inputValue();
    const fim=await page.locator('#dataVencimento').inputValue();
    expect(new Date(fim)-new Date(inicio)).toBe(7200000);
    await page.locator('#dataVencimento').fill('2030-01-01T10:00');
    await page.locator('#recalcularVencimento').click();
    await expect(page.locator('#dataVencimento')).toHaveValue(fim);
    await page.locator('#tipoPlanoId').selectOption({label:'Mensal (30 dias)'});
    await page.locator('#statusCliente').selectOption('ativo');
    await page.locator('#dataInicio').fill('2026-10-19T10:00');
    await page.locator('#recalcularVencimento').click();
    await page.evaluate(() => {
        const campo = document.createElement('input');
        campo.name = 'verificacao-autofill-dinamico';
        document.querySelector('form.client-form').append(campo);
    });
    await expect(page.locator('[name="verificacao-autofill-dinamico"]')).toHaveAttribute('data-autofill-protegido', 'true');
    await expect(page.locator('#diasContrato')).toHaveValue('30');
    await expect(page.locator('#valorPlano')).not.toHaveValue('');
    await expect(page.locator('#dataVencimento')).toHaveValue('2026-11-19T10:00');
});

test('login orienta captcha expirado e bloqueia repeticao enquanto valida', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => {
        const captcha=document.createElement('div');captcha.className='g-recaptcha';document.querySelector('form').append(captcha);
        window.grecaptcha={getResponse:()=>''};window.captchaLoginExpirado();
    });
    await expect(page.locator('#login-status')).toContainText('expirou');
    await page.getByLabel('Senha', {exact:true}).fill('ficticia');
    await page.getByLabel(/Confirmação humana/).fill('1');
    await page.getByRole('button',{name:'Acessar painel'}).click();
    await expect(page.locator('#login-status')).toContainText('Marque Não sou um robô');
    await page.evaluate(()=>{
        window.estadosEnvio=[];
        window.grecaptcha.getResponse=()=> 'token-ficticio';
        document.querySelector('form').addEventListener('submit',evento=>{
            window.estadosEnvio.push(evento.defaultPrevented);
            evento.preventDefault(); // Mantem o documento para observar o estado durante a espera.
        });
    });
    await page.getByRole('button',{name:'Acessar painel'}).click();
    await expect(page.getByRole('button',{name:'Validando acesso…'})).toBeDisabled();
    await page.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(await page.evaluate(()=>window.estadosEnvio)).toEqual([false,true]);
    await expect(page.locator('#login-status')).toContainText('Validando a confirmação');
});

test('navega entre manutencao painel e clientes sem perder a resposta', async ({ page }) => {
    await autenticar(page);
    for (const [nome, caminho] of [['Manutenção', '/manutencao'], ['Painel', '/clientes'], ['Clientes', '/clientes/todos'], ['Painel', '/clientes']]) {
        const [resposta] = await Promise.all([
            page.waitForNavigation(),
            page.getByRole('link', { name: nome, exact: true }).first().click()
        ]);
        expect(resposta.status()).toBe(200);
        expect(new URL(page.url()).pathname).toBe(caminho);
        await expect(page.locator('body')).not.toContainText('Não foi possível abrir o Painel agora.');
    }
});
test('reconhece e desfaz assinaturas do mesmo responsável sem excluir cadastros', async ({page})=>{
    await autenticar(page);
    await page.goto('/clientes/duplicados');
    const grupo=page.locator('article').filter({hasText:'Assinatura E2E Casa × Assinatura E2E Bar'});
    await grupo.getByRole('button',{name:'Mesmo responsável, assinaturas diferentes'}).click();
    await expect(page.getByText('Nenhuma duplicidade forte encontrada.')).toBeVisible();
    const vinculo=page.locator('article').filter({hasText:'Assinatura E2E Casa × Assinatura E2E Bar'});
    await expect(vinculo.getByText('Contratos separados · mesmo responsável')).toBeVisible();
    await vinculo.getByRole('button',{name:'Desfazer vínculo'}).click();
    await expect(page.getByRole('button',{name:'Mesmo responsável, assinaturas diferentes'})).toBeVisible();
    await expect(page.getByText('Nenhum vínculo reconhecido.')).toBeVisible();
});

test('comprovante pessoal pode ser anexado e removido sem salvar edição financeira',async({page})=>{
    await autenticar(page);await page.goto('/clientes/5/editar#renovar');
    const renovar=page.locator('#formRenovarCliente');
    await renovar.locator('#renovarTipoPlanoId').selectOption({label:'Mensal (30 dias)'});
    await renovar.locator('[name="enviarMensagem"]').uncheck();
    await renovar.locator('[name="formaPagamento"]').selectOption('Pix');
    await renovar.locator('#renovarValorPlano').fill('35,00');
    await renovar.locator('#renovarDiasContrato').fill('30');
    await renovar.getByLabel('Anexar comprovante após registrar este pagamento').check();
    await renovar.locator('[name="dataPagamento"]').fill(new Date().toISOString().slice(0,16));
    expect(await renovar.evaluate(form=>Array.from(form.elements).filter(el=>el.willValidate&&!el.validity.valid).map(el=>el.name))).toEqual([]);
    await renovar.getByRole('button',{name:'Renovar cliente',exact:true}).click();
    await expect(page).toHaveURL(/\/clientes\/5\/pagamentos\/\d+\/editar.*#comprovantes$/);
    await expect(page.getByText('Nenhum comprovante anexado.',{exact:true})).toBeVisible();
    const valor=page.getByLabel('Valor do Plano (R$)',{exact:true});const original=await valor.inputValue();await valor.fill('47,00');
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkvkAAAAASUVORK5CYII=','base64');
    await page.getByLabel('Comprovante (opcional)',{exact:true}).setInputFiles({name:'comprovante.png',mimeType:'image/png',buffer:png});
    await page.getByRole('button',{name:'Anexar comprovante',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Comprovante anexado. Pagamento e vencimento preservados.');
    await expect(valor).toHaveValue('47,00');
    const link=page.getByRole('link',{name:'Ver comprovante 1',exact:true});const url=await link.getAttribute('href');
    const arquivo=await page.request.get(url);expect(arquivo.status()).toBe(200);expect(await arquivo.body()).toEqual(png);
    const preview=await page.context().newPage();await preview.goto(url);await expect(preview.locator('img')).toBeVisible();expect(await preview.locator('img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);await preview.close();
    await page.reload();await expect(valor).toHaveValue(original);await expect(link).toBeVisible();
    const historico=await page.context().newPage();await historico.goto('/clientes/5/editar#renovar');
    await expect(historico.locator('#renovar').getByText('1 comprovante',{exact:true})).toBeVisible();
    const gerenciar=historico.getByRole('link',{name:'Gerenciar comprovantes',exact:true});
    await expect(gerenciar).toHaveAttribute('href',new RegExp('/pagamentos/\\d+/editar#comprovantes$'));
    await gerenciar.click();await expect(historico.getByRole('button',{name:'Remover comprovante 1',exact:true})).toBeVisible();
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Remover comprovante 1',exact:true}).click();await expect(link).toBeVisible();
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remover comprovante 1',exact:true}).click();
    await expect(page.getByText('Nenhum comprovante anexado.',{exact:true})).toBeVisible();await expect(valor).toHaveValue(original);
    await historico.goto('/clientes/5/editar#renovar');await expect(historico.locator('#renovar').getByText('Sem comprovante',{exact:true})).toBeVisible();
    await expect(historico.getByRole('link',{name:'Anexar comprovante',exact:true})).toBeVisible();await historico.close();
});
