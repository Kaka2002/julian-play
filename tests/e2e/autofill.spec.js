const { test, expect } = require('@playwright/test');
const { desativarAtalhosGerenciadorSenhas } = require('../../services/securityService');

test('autofill fica restrito ao login e não apaga edição ou digitação', async ({ page }) => {
    await page.setContent(desativarAtalhosGerenciadorSenhas(`<html><head></head><body>
        <form action="/login"><input name="usuario" autocomplete="username"><input name="senha" type="password" autocomplete="current-password"></form>
        <form action="/financeiro/rendimentos"><input name="descricao"><input name="valor" inputmode="decimal"><input name="existente" value="Cadastro existente"><input name="confirmacao" type="password" value=""></form>
        <div id="resultado"></div></body></html>`));
    const descricao = page.locator('input[name="descricao"]');
    const valor = page.locator('input[name="valor"]');
    await expect(descricao).toHaveAttribute('autocomplete', 'off');
    await expect(valor).toHaveAttribute('data-lpignore', 'true');
    await expect(page.locator('input[name="usuario"]')).toHaveAttribute('autocomplete', 'username');
    await expect(page.locator('input[name="senha"]')).toHaveAttribute('type', 'password');
    await page.evaluate(() => {
        document.querySelector('[name="descricao"]').value = 'usuario-injetado';
        document.querySelector('[name="valor"]').value = 'senha-injetada';
        document.querySelector('[name="usuario"]').value = 'login-permitido';
        document.querySelector('#resultado').textContent = 'Mudança fora de formulário';
    });
    await expect(descricao).toHaveValue('');
    await expect(valor).toHaveValue('');
    await expect(page.locator('[name="existente"]')).toHaveValue('Cadastro existente');
    await expect(page.locator('[name="usuario"]')).toHaveValue('login-permitido');
    await descricao.pressSequentially('Rendimento digitado');
    await page.locator('[name="confirmacao"]').pressSequentially('segredo-digitado');
    await page.evaluate(() => document.querySelector('#resultado').textContent = 'Outra alteração');
    await expect(descricao).toHaveValue('Rendimento digitado');
    await expect(page.locator('[name="confirmacao"]')).toHaveValue('segredo-digitado');
    await page.evaluate(() => {
        const form = document.createElement('form');
        form.innerHTML = '<input name="dinamico">';
        document.body.append(form);
    });
    await expect(page.locator('[name="dinamico"]')).toHaveAttribute('autocomplete', 'off');
    await expect(page.locator('[name="dinamico"]')).toHaveAttribute('data-lpignore', 'true');
});
