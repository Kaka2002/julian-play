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

test('protege a Central Hoje sem autenticação', async ({ page }) => {
    await page.goto('/hoje');
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('button', { name: 'Acessar painel' })).toBeVisible();
});

test('autentica e apresenta pendências priorizadas na Central Hoje', async ({ page }) => {
    await autenticar(page);
    await page.goto('/hoje');

    await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Hoje/ })).toBeVisible();
    await expect(page.getByText('Cliente E2E Vencido está vencido')).toBeVisible();
    await expect(page.getByText('WhatsApp desconectado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Resolver' }).first()).toBeVisible();
});
