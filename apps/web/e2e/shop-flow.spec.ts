import { expect, test, type Page } from '@playwright/test';
import { gstinCheckDigit } from '@nexbill/shared';

const stamp = Date.now();
const owner = { email: `e2e-owner-${stamp}@example.com`, password: 'Passw0rd123' };
const gstin = (() => { const b = '29AAPFU0939F1Z'; return b + gstinCheckDigit(b); })();

async function register(page: Page, email: string, business: string): Promise<void> {
  await page.goto('/register', { waitUntil: 'networkidle' });
  await page.getByLabel('Your name').fill('Ravi Kumar');
  await page.getByLabel('Business name').fill(business);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(owner.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/onboarding');
}
const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();

test.describe.configure({ mode: 'serial' });

test.describe('a hardware shop from sign-up to reports', () => {
  let page: Page;
  let invoiceNumber = '';
  test.beforeAll(async ({ browser }) => { page = await browser.newPage(); });
  test.afterAll(async () => { await page.close(); });

  test('business onboarding', async () => {
    await register(page, owner.email, 'Sri Lakshmi Hardware');
    await page.getByLabel('Mobile').fill('9876543210');
    await page.getByLabel('Address').fill('12 Market Road');
    await page.getByLabel('City / town').fill('Bengaluru');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Hardware & building/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(/registered under GST/).check();
    await page.getByLabel('GSTIN').fill('29AAPFU0939F1ZX'); // wrong checksum
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'GSTIN is not valid' })).toBeVisible();
    await page.getByLabel('GSTIN').fill(gstin);
    await page.getByLabel(/selling prices include GST/).uncheck();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'How should your invoices look?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    // first product through the wizard
    await page.getByLabel('Product name').fill('MS Square Pipe 40x40');
    await page.getByLabel(/Selling price/).fill('1000');
    await page.getByLabel(/Purchase price/).fill('700');
    await page.getByLabel('Stock in hand').fill('50');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Add a supplier (optional)' })).toBeVisible();
    await page.getByLabel('Supplier name').fill('Tata Steel Dealer');
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await expect(page.getByRole('heading', { name: 'You are ready to bill' })).toBeVisible();
    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByText("Today's revenue")).toBeVisible();
  });

  test('add a product', async () => {
    await page.goto('/products/new');
    await page.getByLabel('Product name').fill('Asian Paints Primer 1L');
    await page.getByLabel('HSN / SAC code').fill('3208');
    await page.getByRole('textbox', { name: /Selling price/ }).fill('250');
    await page.getByRole('textbox', { name: 'Purchase price' }).fill('180');
    await page.getByLabel('Barcodes').fill('8901234500011');
    await page.getByLabel(/Minimum stock/).fill('5');
    await page.getByLabel('Opening stock').fill('20');
    await page.getByRole('button', { name: 'Save product' }).click();
    await page.waitForURL('**/products');
    await expect(page.getByRole('cell', { name: /Asian Paints Primer 1L/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: '20 PCS' })).toBeVisible();
  });

  test('create a customer', async () => {
    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Ramesh Constructions');
    await dialog.getByLabel('Mobile').fill('9845012345');
    await dialog.getByLabel('Credit limit (₹)').fill('50000');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await toast(page, 'Customer saved');
    await expect(page.getByRole('cell', { name: /Ramesh Constructions/ })).toBeVisible();
  });

  test('generate an invoice from the POS using the keyboard and a barcode', async () => {
    await page.goto('/pos');
    const search = page.getByLabel('Search or scan product');
    await expect(search).toBeFocused();
    await search.fill('MS Square');
    await expect(page.getByRole('option').first()).toContainText('MS Square Pipe 40x40');
    await search.press('Enter');
    await search.fill('2*8901234500011'); // scanner input with a quantity prefix
    await search.press('Enter');
    await expect(page.getByLabel('Quantity for Asian Paints Primer 1L')).toHaveValue('2');
    // 1000 + 500 = 1500 taxable, 18% GST => 1770
    await expect(page.getByTestId('pos-total')).toHaveText('₹1,770.00');
    await page.keyboard.press('F4');
    await page.getByPlaceholder('Search by name, mobile or GSTIN').fill('Ramesh');
    await page.getByRole('button', { name: /Ramesh Constructions/ }).click();
    await page.keyboard.press('F6'); // split: 770 cash now, 1000 on credit
    const split = page.getByRole('dialog');
    await split.getByPlaceholder('0.00').first().fill('770');
    await expect(split.getByText('On credit to Ramesh Constructions')).toBeVisible();
    await split.getByRole('button', { name: 'Complete bill' }).click();
    await expect(page.getByRole('dialog', { name: 'Bill complete' })).toBeVisible();
    invoiceNumber = (await page.getByTestId('invoice-number').textContent()) ?? '';
    expect(invoiceNumber).toMatch(/^INV\/\d\d-\d\d\/0001$/);
    await page.keyboard.press('Enter'); // new bill
    await expect(search).toBeFocused();
    await expect(page.getByText('Start a new bill')).toBeVisible();
  });

  test('record a payment against the invoice', async () => {
    await page.goto('/sales');
    await page.getByRole('cell', { name: invoiceNumber }).click();
    await expect(page.getByText('₹1,000.00 outstanding')).toBeVisible();
    await page.getByRole('button', { name: 'Record payment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount (₹)').fill('400');
    await dialog.getByLabel('Mode').selectOption('UPI');
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await toast(page, 'Payment recorded');
    await expect(page.getByText('₹600.00 outstanding')).toBeVisible();
  });

  test('print the invoice (A4 and thermal layouts)', async () => {
    await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed++; }; });
    const sheet = page.locator('.print-sheet');
    await expect(sheet).toContainText('Tax Invoice');
    await expect(sheet).toContainText(gstin);
    await expect(sheet).toContainText(invoiceNumber);
    await expect(sheet).toContainText('CGST');
    await expect(sheet).toContainText('₹1,770.00');
    await page.getByLabel('Print format').selectOption('THERMAL_80');
    await expect(sheet).toContainText('Thank you! Visit again.');
    await page.getByRole('button', { name: 'Print / PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden(); // only the invoice sheet prints
    await expect(sheet).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });

  test('process a partial return', async () => {
    await page.getByRole('button', { name: 'Return', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Return quantity for Asian Paints Primer 1L').fill('1');
    await dialog.getByRole('button', { name: 'Create credit note' }).click();
    await toast(page, /Credit note CN\//);
    // 295 credited against the 600 due
    await expect(page.getByText('₹305.00 outstanding')).toBeVisible();
    await page.goto('/sales-returns');
    await expect(page.getByRole('cell', { name: invoiceNumber })).toBeVisible();
  });

  test('check inventory and the stock ledger', async () => {
    await page.goto('/inventory');
    const primer = page.getByRole('row', { name: /Asian Paints Primer 1L/ });
    await expect(primer).toContainText('19 PCS'); // 20 - 2 sold + 1 returned
    await expect(page.getByRole('row', { name: /MS Square Pipe 40x40/ })).toContainText('49 PCS');
    await page.getByRole('tab', { name: 'Movement history' }).click();
    await expect(page.getByRole('row', { name: /SALE RETURN/ })).toContainText('+1');
    await expect(page.getByRole('row', { name: new RegExp(`SALE.*${invoiceNumber.replace(/\//g, '\\/')}`) }).first()).toBeVisible();
  });

  test('generate reports', async () => {
    await page.goto('/reports');
    await expect(page.getByRole('row', { name: /₹1,770\.00/ })).toBeVisible();
    await page.getByRole('button', { name: 'Profit & cash summary' }).click();
    // revenue 1500 - 250 returned = 1250; COGS 700 + 360 - 180 = 880; gross 370
    await expect(page.getByText('₹1,250.00')).toBeVisible();
    await expect(page.getByText('₹370.00').first()).toBeVisible();
    await page.goto('/gst');
    await expect(page.getByText(/Preparation reports only/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /B2C others/ })).toBeVisible();
    await page.getByRole('tab', { name: 'GSTR-3B summary' }).click();
    await expect(page.getByText('3.1(a) Outward taxable supplies')).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('Ramesh Constructions').first()).toBeVisible();
  });

  test('a second tenant sees none of the first tenant\'s data', async ({ browser }) => {
    const other = await browser.newPage();
    await register(other, `e2e-other-${stamp}@example.com`, 'Beta Traders');
    for (const path of ['/products', '/customers', '/sales', '/inventory']) {
      await other.goto(path);
      await expect(other.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(other.locator('table')).toBeVisible();
      await expect(other.getByText(/Sri Lakshmi|MS Square Pipe|Asian Paints|Ramesh/)).toHaveCount(0);
    }
    await other.close();
  });
});
