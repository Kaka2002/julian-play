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
