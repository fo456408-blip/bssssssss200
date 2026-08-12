import puppeteer, { Browser, Page } from 'puppeteer';
import { Server } from 'http';
import express from 'express';
import path from 'path';
import fs from 'fs';

const PORT = 5035;
const BASE_URL = `http://localhost:${PORT}`;

let server: Server;
let browser: Browser;
let passCount = 0;
let failCount = 0;

function record(title: string, success: boolean, detail: string) {
  if (success) {
    passCount++;
    console.log(`[✔ PASS] ${title}: ${detail}`);
  } else {
    failCount++;
    console.error(`[✖ FAIL] ${title}: ${detail}`);
  }
}

const distPath = path.resolve(process.cwd(), '../frontend/dist');
console.log('Dist path resolved to:', distPath, 'Exists:', fs.existsSync(distPath));

const testApp = express();
testApp.use(express.static(distPath));
testApp.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

async function runBrowserTest() {
  await new Promise<void>((res) => {
    server = testApp.listen(PORT, () => {
      console.log(`Landing Page Header Test server running on port ${PORT}`);
      res();
    });
  });

  const executablePath =
    process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : undefined;

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log('\n========================================');
  console.log('STARTING LANDING PAGE HEADER NAVIGATION BROWSER VERIFICATION');
  console.log('========================================\n');

  try {
    // ----------------------------------------------------
    // TEST 1: DESKTOP HEADER NAVIGATION
    // ----------------------------------------------------
    console.log('--- 1. Testing Desktop Navigation (1280x800) ---');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root nav', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 500));

    // Test Logo
    const logoLink = await page.$('nav a[href="/"], header a[href="/"], a.group[href="/"]');
    record('Desktop Logo Found', Boolean(logoLink), 'Logo link present in nav');
    if (logoLink) {
      await logoLink.click();
      record('Desktop Logo Navigation', page.url() === `${BASE_URL}/` || page.url() === `${BASE_URL}`, `URL=${page.url()}`);
    }

    // Helper to test hash scrolling
    const testHashLink = async (linkText: string, expectedSectionId: string) => {
      const links = await page.$$('nav a');
      let targetLink = null;
      for (const l of links) {
        const text = await page.evaluate((el) => el.textContent?.trim(), l);
        if (text === linkText) {
          targetLink = l;
          break;
        }
      }

      if (!targetLink) {
        record(`Desktop Nav Link [${linkText}]`, false, 'Link not found');
        return;
      }

      await targetLink.click();
      await new Promise((r) => setTimeout(r, 700));

      const isVisible = await page.evaluate((secId) => {
        if (secId === 'hero') {
          return window.scrollY < 300;
        }
        const el = document.getElementById(secId);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.top >= -100 && rect.top < 450;
      }, expectedSectionId);

      record(`Desktop Scroll to [${linkText}] (#${expectedSectionId})`, isVisible, `Section #${expectedSectionId} top in viewport`);
    };

    await testHashLink('طريقة التعلم', 'why-engcode');
    await testHashLink('المميزات', 'features');
    await testHashLink('التقرير الشهري', 'monthly-report');
    await testHashLink('عن المحاضر', 'about-instructor');
    await testHashLink('الأسئلة الشائعة', 'faq');
    await testHashLink('الرئيسية', 'hero');

    // Test Login & Join internal links
    await page.click('a[href="/login"]');
    await new Promise((r) => setTimeout(r, 400));
    record('Desktop Nav to /login', page.url().includes('/login'), `URL=${page.url()}`);

    // Direct hash URL from another page to home hash
    await page.goto(`${BASE_URL}/#faq`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 800));
    const faqIsVisibleFromHash = await page.evaluate(() => {
      const el = document.getElementById('faq');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= -100 && rect.top < 450;
    });
    record('Direct Hash URL /#faq Scroll', faqIsVisibleFromHash, 'Navigated to /#faq and scrolled cleanly');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.click('a[href="/join"]');
    await new Promise((r) => setTimeout(r, 400));
    record('Desktop Nav to /join', page.url().includes('/join'), `URL=${page.url()}`);

    // ----------------------------------------------------
    // TEST 2: MOBILE HEADER NAVIGATION
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Mobile Navigation (375x667) ---');
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 800));

    // Open Mobile Drawer
    const menuBtn = await page.$('nav button');
    if (menuBtn) {
      await menuBtn.click();
      await new Promise((r) => setTimeout(r, 400));

      const drawerVisible = await page.evaluate(() => {
        const drawer = document.querySelector('nav div.md\\:hidden');
        return drawer !== null;
      });
      record('Mobile Menu Drawer Open', drawerVisible, 'Drawer rendered');

      // Click FAQ link in mobile menu via evaluate
      await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('nav div.md\\:hidden a'));
        const faqLink = anchors.find((a) => a.textContent?.includes('الأسئلة الشائعة'));
        if (faqLink) (faqLink as HTMLElement).click();
      });
      await new Promise((r) => setTimeout(r, 800));

      const drawerClosed = await page.evaluate(() => {
        const drawer = document.querySelector('nav div.md\\:hidden');
        return drawer === null;
      });
      record('Mobile Menu Closes after Navigation', drawerClosed, 'Drawer closed successfully');
    }

    // ----------------------------------------------------
    // TEST 3: DIRECT ROUTE NAVIGATION (NO 404s)
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Direct Route URLs ---');
    const resHome = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    record('Direct URL /', resHome?.status() === 200 || resHome?.status() === 304, `HTTP ${resHome?.status()}`);

    const resLogin = await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    record('Direct URL /login', resLogin?.status() === 200 || resLogin?.status() === 304, `HTTP ${resLogin?.status()}`);

    const resJoin = await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' });
    record('Direct URL /join', resJoin?.status() === 200 || resJoin?.status() === 304, `HTTP ${resJoin?.status()}`);
  } catch (err: any) {
    console.error('Browser Test Error:', err);
  } finally {
    if (browser) await browser.close();
    if (server) server.close();

    console.log('\n========================================');
    console.log(`HEADER BROWSER VERIFICATION COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  }
}

runBrowserTest();
