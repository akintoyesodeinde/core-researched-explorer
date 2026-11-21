import { expect, test } from '@playwright/test';

test('sends a Boolean query and count, then renders chart and keyboard-operable controls', async ({
  page,
}) => {
  await page.route('**/api/core/works**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalHits: 20,
        results: [
          {
            id: 1,
            title: 'Drone delivery systems',
            authors: [],
            abstract: null,
            yearPublished: 2024,
          },
          {
            id: 2,
            title: 'Last-mile aerial logistics',
            authors: ['Research Author'],
            abstract: 'Research abstract',
            yearPublished: 2022,
          },
          {
            id: 3,
            title: 'Autonomous delivery research',
            authors: null,
            abstract: null,
            yearPublished: null,
          },
        ],
      }),
    });
  });

  await page.goto('/');
  await page.getByLabel('Boolean query').fill('drone AND (package OR delivery)');
  await page.getByLabel('Number of papers').selectOption('20');
  await page.getByRole('button', { name: 'Search' }).press('Enter');

  await expect(page.getByText(/Retrieved 3 paper\(s\)/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Publication year distribution' })).toBeVisible();
  await expect(page.locator('.year-chart svg')).toBeVisible();
  await expect(page.locator('table tbody tr')).toHaveCount(2);
  await expect(page.getByText(/1 paper\(s\) excluded/)).toBeVisible();

  await page.getByLabel('Boolean query').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Number of papers')).toBeFocused();
});

test('supports abstract expand/collapse, sorting, year cross-filtering, pagination, and shared URLs', async ({
  page,
}) => {
  const longAbstract = 'A'.repeat(260);
  await page.route('**/api/core/works**', async (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') ?? '0');

    if (offset >= 10) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          totalHits: 25,
          results: [
            {
              id: 11,
              title: 'Second page drone study',
              authors: ['Second Author'],
              abstract: 'Short second-page abstract.',
              yearPublished: 2023,
            },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalHits: 25,
        results: [
          {
            id: 1,
            title: 'Older drone logistics paper',
            authors: ['Author One'],
            abstract: longAbstract,
            yearPublished: 2021,
            doi: '10.1000/older',
          },
          {
            id: 2,
            title: 'Recent aerial delivery paper',
            authors: ['Author Two'],
            abstract: 'Brief summary',
            yearPublished: 2024,
            doi: '10.1000/recent',
          },
        ],
      }),
    });
  });

  await page.goto('/?q=drone%20AND%20sensor&limit=10');
  await expect(page.getByLabel('Boolean query')).toHaveValue('drone AND sensor');
  await expect(page.locator('.paper-card')).toHaveCount(2);

  const toggle = page.getByRole('button', { name: 'Show more' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await page.getByLabel('Sort retrieved').selectOption('newest');
  await expect(page.locator('.paper-card h3').first()).toHaveText('Recent aerial delivery paper');

  await page.getByRole('button', { name: 'Show year table' }).click();
  await page.locator('.year-filter-btn').nth(1).click();
  await expect(page.locator('.active-filter')).toContainText('2024');
  await expect(page.locator('.paper-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear year filter' }).click();
  await expect(page.locator('.paper-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.page-indicator')).toHaveText('Page 2');
  await expect(page.locator('.paper-card h3').first()).toHaveText('Second page drone study');
  await expect(page).toHaveURL(/offset=10/);
});

test('renders cleanly on mobile viewports without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/core/works**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        totalHits: 2,
        results: [
          {
            id: 1,
            title: 'Responsive layout paper',
            authors: ['Mobile Researcher'],
            abstract: 'Testing mobile card wrapping.',
            yearPublished: 2024,
          },
        ],
      }),
    });
  });

  await page.goto('/');
  await page.getByLabel('Boolean query').fill('drone AND sensor');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.paper-card')).toHaveCount(1);

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

test('shows loading, empty, and error states with intercepted API responses', async ({ page }) => {
  await page.route('**/api/core/works**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ totalHits: 0, results: [] }),
    });
  });

  await page.goto('/');
  await page.getByLabel('Boolean query').fill('drone delivery');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Searching CORE...')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No papers found' })).toBeVisible();

  await page.unroute('**/api/core/works**');
  await page.route('**/api/core/works**', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '30' },
      contentType: 'application/json',
      body: '{}',
    }),
  );
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'Search unavailable' })).toBeVisible();
  await expect(page.getByText(/30 seconds/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
