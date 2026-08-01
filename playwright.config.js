const fs = require('fs');
const { defineConfig } = require('@playwright/test');

const chromePadrao = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const navegadorConfigurado = process.env.PLAYWRIGHT_CHROME_PATH
    || (fs.existsSync(chromePadrao) ? chromePadrao : '');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [['line']],
    globalSetup: require.resolve('./tests/e2e/global-setup'),
    use: {
        baseURL: 'http://127.0.0.1:11999',
        viewport: { width: 1920, height: 1080 },
        headless: true,
        launchOptions: {
            ...(navegadorConfigurado ? { executablePath: navegadorConfigurado } : {}),
            args: [
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-component-update',
                '--no-first-run'
            ]
        },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    }
});
