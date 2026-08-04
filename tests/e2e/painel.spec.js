const { test, expect } = require('@playwright/test');

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
    await expect(page.getByText('Amizade que vale presente', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Campanhas registradas' })).toBeVisible();
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
    await expect(page.getByLabel('Confirmar nova senha', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Senha atual para confirmar a alteração')).toHaveValue('');
    await expect(page.getByLabel('WhatsApp de controle para alertas (opcional)')).toHaveValue('');
    await expect(page.getByLabel('WhatsApp de controle para alertas (opcional)')).toHaveAttribute('data-autofill-empty', 'true');
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
