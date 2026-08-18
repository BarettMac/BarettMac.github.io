// @ts-check
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');

const INDEX_URL = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

/** @param {import('@playwright/test').Page} page */
async function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function tileValue(page, index) {
  return page.locator('#tiles .tile').nth(index).locator('.val').innerText();
}

test.describe('Retirement withdrawal plan dashboard', () => {
  test('loads with nominal (Actual $) figures by default, no console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await page.goto(INDEX_URL);

    await expect(page.locator('#tiles .tile')).toHaveCount(4);
    await expect(page.locator('#currencySeg button[data-c="nominal"]')).toHaveClass(/on/);
    await expect(page.locator('#currencySeg button[data-c="real"]')).not.toHaveClass(/on/);

    expect(await tileValue(page, 0)).toBe('$968,672');
    expect(await tileValue(page, 1)).toBe('$1,450,845');
    expect(await tileValue(page, 2)).toBe('4.1%');
    expect(await tileValue(page, 3)).toBe('$1.51M');

    await expect(page.locator('#footnote')).toContainText('nominal');
    await expect(page.locator('svg')).toHaveCount(4);

    expect(errors).toEqual([]);
  });

  test('switching to Today\'s $ shows inflation-adjusted figures and back again', async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await page.goto(INDEX_URL);

    await page.locator('#currencySeg button[data-c="real"]').click();
    await expect(page.locator('#currencySeg button[data-c="real"]')).toHaveClass(/on/);

    expect(await tileValue(page, 0)).toBe('$957,762');
    expect(await tileValue(page, 1)).toBe('$608,691');
    expect(await tileValue(page, 3)).toBe('$1.03M');
    await expect(page.locator('#footnote')).toContainText("today's dollars");

    await page.locator('#currencySeg button[data-c="nominal"]').click();
    await expect(page.locator('#currencySeg button[data-c="nominal"]')).toHaveClass(/on/);
    expect(await tileValue(page, 0)).toBe('$968,672');
    await expect(page.locator('#footnote')).toContainText('nominal');

    expect(errors).toEqual([]);
  });

  test('detail and year-range filters re-render without errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await page.goto(INDEX_URL);

    await page.locator('#detailSeg button[data-d="detailed"]').click();
    await expect(page.locator('#lg-acc .lg')).toHaveCount(8); // detailed account series

    await page.locator('#rangeSeg button', { hasText: 'Next 10 years' }).click();
    await expect(page.locator('svg')).toHaveCount(4);

    expect(errors).toEqual([]);
  });
});
