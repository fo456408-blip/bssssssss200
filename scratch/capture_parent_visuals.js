const puppeteer = require('puppeteer');
const path = require('path');

async function capture() {
  console.log('--- CAPTURING PARENT PORTAL VISUAL SCREENSHOTS ---');
  const fs = require('fs');
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : fs.existsSync(edgePath) ? edgePath : undefined;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  
  // 1. Desktop Viewport (1440x900)
  await page.setViewport({ width: 1440, height: 900 });

  try {
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });

    // Click quick login pill for Parent
    await page.waitForSelector('button');
    const buttons = await page.$$('button');
    let parentBtn = null;
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes('Parent')) {
        parentBtn = b;
        break;
      }
    }

    if (parentBtn) {
      console.log('Found Parent quick login button, clicking...');
      await parentBtn.click();
    } else {
      await page.waitForSelector('input[type="text"]');
      await page.type('input[type="text"]', 'ahmed_parent');
      await page.type('input[type="password"]', 'parent123');
      await page.click('button[type="submit"]');
    }

    await page.waitForFunction(() => window.location.pathname.includes('/parent'), { timeout: 10000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    const artifactsDir = 'C:/Users/ah456/.gemini/antigravity/brain/de85fb69-d9d9-45b2-854b-08a259a059ba';
    await page.screenshot({ path: path.join(artifactsDir, 'parent_dashboard_desktop.png'), fullPage: true });
    console.log('✔ Captured parent_dashboard_desktop.png');

    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(artifactsDir, 'parent_dashboard_mobile.png'), fullPage: true });
    console.log('✔ Captured parent_dashboard_mobile.png');

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(page.url().replace('/dashboard', '/children'), { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(artifactsDir, 'parent_child_detail_desktop.png'), fullPage: true });
    console.log('✔ Captured parent_child_detail_desktop.png');

    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(artifactsDir, 'parent_child_detail_mobile.png'), fullPage: true });
    console.log('✔ Captured parent_child_detail_mobile.png');

    await browser.close();
    console.log('--- CAPTURE COMPLETED ---');
  } catch (err) {
    console.error('Capture failed with error:', err);
    await browser.close();
  }
}

capture().catch(console.error);
