import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4186'

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL,
    browserName: 'firefox',
    launchOptions: {
      firefoxUserPrefs: {
        'signon.rememberSignons': true,
        'signon.autofillForms': true,
      },
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4186 --strictPort',
    url: baseURL + '/fit-best/',
  },
})
