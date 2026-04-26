import { expect, test } from '@playwright/test'

test('loads v2 app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible()
})
