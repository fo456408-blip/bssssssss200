import '../config/env';
import { prisma } from '../config/database';
import puppeteer, { Browser } from 'puppeteer';
import { Server } from 'http';
import express from 'express';
import path from 'path';
import fs from 'fs';
import app from '../app';

const PORT = 5040;
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

async function runBrowserTest() {
  const distPath = path.resolve(process.cwd(), '../frontend/dist');
  console.log('Dist path:', distPath, 'Exists:', fs.existsSync(distPath));

  const testApp = express();
  testApp.use('/api', app);
  testApp.use(express.static(distPath));
  testApp.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  await new Promise<void>((res) => {
    server = testApp.listen(PORT, () => {
      console.log(`Join Page 3-Step Test Server running on port ${PORT}`);
      res();
    });
  });

  const executablePath =
    process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : undefined;

  // Seed test course and group for browser flow
  const { prisma } = await import('../config/database');
  const academicYear = await prisma.academicYear.findFirst();
  const testCourse = await prisma.course.create({
    data: {
      academicYearId: academicYear!.id,
      code: `JOIN_CRS_${Date.now()}`,
      name: 'البرمجة والذكاء الاصطناعي',
      grade: 'FIRST_SECONDARY',
      defaultMonthlyFee: 350,
      description: 'دورة شاملة في البرمجة والذكاء الاصطناعي لطلاب الصف الأول الثانوي',
      isActive: true,
    },
  });

  const testGroup = await prisma.group.create({
    data: {
      courseId: testCourse.id,
      name: 'مجموعة 1 السبت والاثنين والاربعاء',
      maxCapacity: 25,
      schedule: JSON.stringify([
        { dayOfWeek: 'SATURDAY', startTime: '18:00', endTime: '19:00' },
        { dayOfWeek: 'MONDAY', startTime: '18:00', endTime: '19:00' },
        { dayOfWeek: 'WEDNESDAY', startTime: '18:00', endTime: '19:00' },
      ]),
    },
  });

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log('\n========================================');
  console.log('STARTING JOIN PAGE 3-STEP FLOW BROWSER AUDIT');
  console.log('========================================\n');

  try {
    // ----------------------------------------------------
    // TEST 1: DESKTOP (1440x900) - STEPPER & COURSE SELECTION
    // ----------------------------------------------------
    console.log('--- 1. Testing Desktop Flow (1440x900) ---');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1200));

    // Verify 3 Steps indicator inside stepper container
    const stepTitles = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('main .z-10 span'));
      return titles.map((t) => t.textContent?.trim()).filter(Boolean);
    });

    const isThreeSteps =
      stepTitles.length === 3 &&
      stepTitles.includes('المادة الدراسية') &&
      stepTitles.includes('المجموعة') &&
      stepTitles.includes('بيانات الطالب وولي الأمر');
    record('Stepper has Exactly 3 Named Steps', isThreeSteps, `Titles: ${JSON.stringify(stepTitles)}`);

    // Verify Step 1 Courses rendered
    const courseCards = await page.$$('main button');
    record('Step 1 Course Cards Rendered', courseCards.length > 0, `Found ${courseCards.length} courses`);

    if (courseCards.length > 0) {
      // Select First Course
      await courseCards[0].click();
      await new Promise((r) => setTimeout(r, 600));

      // ----------------------------------------------------
      // TEST 2: STEP 2 - GROUP SELECTION & ARABIC SCHEDULE
      // ----------------------------------------------------
      console.log('\n--- 2. Testing Step 2 - Group Selection & Schedule Formatting ---');
      const step2Active = await page.evaluate(() => {
        const h2 = document.querySelector('h2');
        return h2?.textContent?.includes('الخطوة 2');
      });
      record('Transition to Step 2 (Group Selection)', Boolean(step2Active), 'Current step = Step 2');

      // Check Schedule formatting (No raw JSON)
      const pageText = await page.evaluate(() => document.body.innerText);
      const hasRawJson = pageText.includes('[{') || pageText.includes('"dayOfWeek"') || pageText.includes('SATURDAY');
      record('No Raw JSON Visible Anywhere in UI', !hasRawJson, 'Raw JSON schedule parsed cleanly');

      const groupCards = await page.$$('main button');
      record('Step 2 Group Cards Rendered', groupCards.length > 0, `Found ${groupCards.length} group options`);

      if (groupCards.length > 0) {
        // Select First Group
        await groupCards[0].click();
        await new Promise((r) => setTimeout(r, 600));

        // ----------------------------------------------------
        // TEST 3: STEP 3 - FORM & SUMMARY BOX
        // ----------------------------------------------------
        console.log('\n--- 3. Testing Step 3 - Student/Parent Form & Read-only Summary ---');
        const step3Active = await page.evaluate(() => {
          const h2 = document.querySelector('h2');
          return h2?.textContent?.includes('الخطوة 3');
        });
        record('Transition to Step 3 (Form Submission)', Boolean(step3Active), 'Current step = Step 3');

        const summaryText = await page.evaluate(() => {
          const summary = document.querySelector('.bg-\\[\\#F7F3EE\\]');
          return summary?.textContent || '';
        });

        const hasSummaryDetails = summaryText.includes('الصف الدراسي') && summaryText.includes('حضور سنتر');
        record('Read-only Selection Summary Preserved', hasSummaryDetails, 'Course, Grade, Year & Mode rendered read-only');

        // Test Back Navigation (Step 3 -> Step 2)
        const backBtn = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.find((b) => b.textContent?.includes('تغيير المجموعة'));
        });

        if (backBtn) {
          await (backBtn as any).click();
          await new Promise((r) => setTimeout(r, 400));
          const backToStep2 = await page.evaluate(() => document.querySelector('h2')?.textContent?.includes('الخطوة 2'));
          record('Back Navigation (Step 3 -> Step 2)', Boolean(backToStep2), 'Preserves selections');

          // Re-select group to return to Step 3
          const groupBtn2 = (await page.$$('main button'))[0];
          if (groupBtn2) await groupBtn2.click();
          await new Promise((r) => setTimeout(r, 400));
        }

        // Fill Form Inputs & Submit Booking
        const uniquePhone = `010${Math.floor(10000000 + Math.random() * 90000000)}`;
        const parentPhone = `011${Math.floor(10000000 + Math.random() * 90000000)}`;

        await page.type('input[placeholder*="أحمد محمد"]', 'طالب اختبار الفحص البرمجي');
        await page.type('input[placeholder="01012345678"]', uniquePhone);
        await page.type('input[placeholder*="محمد علي"]', 'ولي أمر طالب الاختبار');
        await page.type('input[placeholder="01098765432"]', parentPhone);

        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await new Promise((r) => setTimeout(r, 1500));

          const successRendered = await page.evaluate(() => {
            return document.body.innerText.includes('تم إرسال طلب الحجز بنجاح');
          });
          record('Step 4 Success Confirmation Screen', successRendered, 'Booking submitted successfully');
        }
      }
    }

    // ----------------------------------------------------
    // TEST 4: MOBILE RESPONSIVE STEPPER (390x844)
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Mobile Layout (390x844) ---');
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/join`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 600));

    const mobileStepperOverflow = await page.evaluate(() => {
      const stepper = document.querySelector('.w-full.dir-rtl');
      if (!stepper) return true;
      return stepper.scrollWidth > stepper.clientWidth;
    });

    record('Mobile Stepper Responsiveness (No Horizontal Overflow)', !mobileStepperOverflow, 'Stepper fits 390px viewport');
  } catch (err: any) {
    console.error('Browser Test Error:', err);
  } finally {
    try {
      const { prisma } = await import('../config/database');
      await prisma.bookingRequest.deleteMany({ where: { courseId: testCourse.id } });
      await prisma.group.deleteMany({ where: { courseId: testCourse.id } });
      await prisma.course.delete({ where: { id: testCourse.id } });
    } catch (e) {}

    if (browser) await browser.close();
    if (server) server.close();

    console.log('\n========================================');
    console.log(`JOIN PAGE 3-STEP E2E AUDIT COMPLETED: PASS = ${passCount}, FAIL = ${failCount}`);
    console.log('========================================\n');
  }
}

runBrowserTest();
