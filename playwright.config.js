const { defineConfig } = require('@playwright/test');

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
        headless: true,
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROME_PATH
                || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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
