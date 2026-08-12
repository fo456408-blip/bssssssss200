import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

export interface MonthlyReportPDFData {
  reportTitle: string;
  reportMonthName: string;
  reportYear: number;
  generatedDateFormatted: string;
  timezone: string;
  student: {
    fullName: string;
    username: string;
    grade: string;
    academicYear: string;
  };
  period: {
    start: string;
    end: string;
  };
  summary: {
    courseProgressPercent: number;
    attendancePercent: number;
    quizAveragePercent: number;
    assignmentAveragePercent: number;
    paymentStatus: string;
  };
  courses: Array<{
    name: string;
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
  }>;
  quizzes: {
    totalQuizzes: number;
    completedQuizzes: number;
    averageScorePercent: number;
    passedCount: number;
    failedCount: number;
  };
  assignments: {
    totalAssignments: number;
    submittedCount: number;
    lateCount: number;
    gradedCount: number;
    averageScorePercent: number;
  };
  attendance: {
    totalSessions: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    excusedCount: number;
    attendancePercent: number;
  };
  payment: {
    monthlyFee: number;
    status: string;
    paymentDate?: string;
    paymentMethod?: string;
  };
  teacherNotes?: string;
}

export function generateReportHTML(data: MonthlyReportPDFData): string {
  const isPaid = data.summary.paymentStatus === 'PAID';
  const paymentBadgeText = isPaid ? 'مكتمل المسدد (مدفوع)' : 'مستحق (غير مدفوع)';
  const paymentBadgeBg = isPaid ? '#ECFDF5' : '#FEF2F2';
  const paymentBadgeColor = isPaid ? '#047857' : '#B91C1C';
  const paymentBadgeBorder = isPaid ? '#A7F3D0' : '#FECACA';

  const logoBase64 = fs.existsSync(path.join(__dirname, '../../public/assets/images/logo.png'))
    ? fs.readFileSync(path.join(__dirname, '../../public/assets/images/logo.png')).toString('base64')
    : '';

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');

    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      width: 210mm;
      height: 297mm;
      background-color: #F7F3EE;
      margin: 0 auto;
    }

    body {
      font-family: 'Cairo', sans-serif;
      color: #241A15;
      padding: 10mm 10mm;
      display: flex;
      flex-direction: column;
    }

    /* Outer Frame Container */
    .report-container {
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(50, 29, 20, 0.05);
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    /* 1. Header Banner */
    .header-banner {
      background: linear-gradient(135deg, #321D14 0%, #42261A 60%, #5A3825 100%);
      color: #FFFFFF;
      padding: 24px 28px;
      border-bottom: 4px solid #C8A46A;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand-logo {
      height: 48px;
      width: auto;
      object-fit: contain;
    }

    .brand-text h1 {
      font-size: 20px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: -0.5px;
      line-height: 1.2;
    }

    .brand-text p {
      font-size: 11px;
      font-weight: 700;
      color: #C8A46A;
      margin-top: 2px;
    }

    .title-section {
      text-align: left;
    }

    .title-badge {
      display: inline-block;
      background: rgba(200, 164, 106, 0.2);
      border: 1px solid rgba(200, 164, 106, 0.4);
      color: #C8A46A;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 6px;
    }

    .title-section h2 {
      font-size: 18px;
      font-weight: 900;
      color: #FFFFFF;
      line-height: 1.2;
    }

    .title-section p {
      font-size: 10px;
      font-weight: 600;
      color: #A58F80;
      margin-top: 3px;
    }

    /* Content Body */
    .content-body {
      padding: 24px 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      flex: 1;
    }

    /* 2. Student Info Card */
    .student-card {
      background: #F7F3EE;
      border: 1px solid #E6DDD5;
      border-radius: 14px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .student-info-group h3 {
      font-size: 16px;
      font-weight: 900;
      color: #321D14;
      margin-bottom: 4px;
    }

    .student-info-group p {
      font-size: 12px;
      font-weight: 700;
      color: #8B6248;
    }

    .student-meta-group {
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .meta-tag {
      font-size: 11px;
      font-weight: 700;
      color: #5A3825;
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      padding: 3px 10px;
      border-radius: 8px;
    }

    /* Section Headings */
    .section-title {
      font-size: 14px;
      font-weight: 900;
      color: #321D14;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      border-right: 4px solid #C8A46A;
      padding-right: 8px;
    }

    /* 3. KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }

    .kpi-card {
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      border-radius: 12px;
      padding: 12px 10px;
      text-align: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
    }

    .kpi-label {
      font-size: 11px;
      font-weight: 700;
      color: #8B6248;
      margin-bottom: 6px;
    }

    .kpi-value {
      font-size: 18px;
      font-weight: 900;
      color: #5A3825;
    }

    .kpi-value.gold { color: #C8A46A; }
    .kpi-value.emerald { color: #059669; }
    .kpi-value.amber { color: #D97706; }
    .kpi-value.rose { color: #DC2626; }

    /* 4. Course Table */
    .table-container {
      border: 1px solid #E6DDD5;
      border-radius: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    thead {
      background: #5A3825;
      color: #FFFFFF;
    }

    th {
      padding: 10px 14px;
      font-weight: 800;
      text-align: right;

    }

    th.center, td.center {
      text-align: center;
    }

    tbody tr {
      border-bottom: 1px solid #E6DDD5;
    }

    tbody tr:nth-child(even) {
      background: #F7F3EE/50;
    }

    td {
      padding: 10px 14px;
      font-weight: 700;
      color: #321D14;
    }

    .progress-pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      background: #FEF3C7;
      color: #92400E;
      font-weight: 800;
      font-size: 11px;
    }

    /* 5. Two Column Grid */
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .detail-card {
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      border-radius: 14px;
      padding: 14px 16px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
    }

    .detail-card h4 {
      font-size: 13px;
      font-weight: 900;
      color: #321D14;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #E6DDD5;
    }

    .metric-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .metric-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11.5px;
    }

    .metric-name {
      color: #8B6248;
      font-weight: 700;
    }

    .metric-val {
      color: #321D14;
      font-weight: 800;
    }

    /* 6. Teacher Notes Box */
    .notes-box {
      background: #FFFBEB;
      border: 1px solid #FCD34D;
      border-radius: 14px;
      padding: 14px 18px;
    }

    .notes-box h4 {
      font-size: 13px;
      font-weight: 900;
      color: #92400E;
      margin-bottom: 4px;
    }

    .notes-box p {
      font-size: 11.5px;
      font-weight: 700;
      color: #78350F;
      line-height: 1.5;
    }

    /* 7. Footer */
    .footer-bar {
      background: #F7F3EE;
      border-top: 1px solid #E6DDD5;
      padding: 12px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      color: #8B6248;
    }

    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <!-- 1. Header Banner -->
    <div class="header-banner">
      <div class="brand-section">
        ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" class="brand-logo" alt="EngCode Logo" />` : ''}
        <div class="brand-text">
          <h1>EngCode by Ahmed Hamed</h1>
          <p>أكاديمية تعليم التكنولوجيا والبرمجة للمرحلة الثانوية</p>
        </div>
      </div>
      <div class="title-section">
        <div class="title-badge">وثيقة أكاديمية رسمية</div>
        <h2>التقرير الأكاديمي الشهري</h2>
        <p>شهر ${data.reportMonthName} ${data.reportYear} | تاريخ الإصدار: ${data.generatedDateFormatted}</p>
      </div>
    </div>

    <!-- Content Body -->
    <div class="content-body">
      <!-- 2. Student Info Card -->
      <div class="student-card">
        <div class="student-info-group">
          <h3>اسم الطالب: ${data.student.fullName}</h3>
          <p>رقم التليفون / اسم المستخدم: ${data.student.username} | ${data.student.grade || 'المرحلة الثانوية'}</p>
        </div>
        <div class="student-meta-group">
          <span class="meta-tag">الفترة: ${data.period.start} إلى ${data.period.end}</span>
          <span class="meta-tag">العام الدراسي: ${data.student.academicYear}</span>
        </div>
      </div>

      <!-- 3. KPI Summary -->
      <div>
        <div class="section-title">ملخص الأداء الشهري العام</div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">التقدم العام</div>
            <div class="kpi-value gold">${data.summary.courseProgressPercent}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">نسبة الحضور</div>
            <div class="kpi-value emerald">${data.summary.attendancePercent}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">متوسط الاختبارات</div>
            <div class="kpi-value gold">${data.summary.quizAveragePercent}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">متوسط الواجبات</div>
            <div class="kpi-value amber">${data.summary.assignmentAveragePercent}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">اشتراك الشهر</div>
            <div class="kpi-value ${isPaid ? 'emerald' : 'rose'}" style="font-size: 13px;">${isPaid ? 'مدفوع ✓' : 'غير مدفوع'}</div>
          </div>
        </div>
      </div>

      <!-- 4. Courses Table -->
      <div>
        <div class="section-title">تقدم الكورسات والمواد الدراسية</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>الكورس / المادة الدراسية</th>
                <th class="center">الدروس المكتملة</th>
                <th class="center">نسبة الإنجاز</th>
              </tr>
            </thead>
            <tbody>
              ${data.courses.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td class="center">${c.completedLessons} من أصل ${c.totalLessons} درس</td>
                  <td class="center"><span class="progress-pill">${c.progressPercent}%</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. Two Column Breakdown -->
      <div class="two-col-grid">
        <!-- Quizzes Box -->
        <div class="detail-card">
          <h4>تفاصيل الاختبارات والكويزات</h4>
          <div class="metric-list">
            <div class="metric-row">
              <span class="metric-name">إجمالي الاختبارات المقررة:</span>
              <span class="metric-val">${data.quizzes.totalQuizzes} اختبار</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">الاختبارات المكتملة:</span>
              <span class="metric-val">${data.quizzes.completedQuizzes} اختبار</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">متوسط درجات الاختبارات:</span>
              <span class="metric-val" style="color: #C8A46A;">${data.quizzes.averageScorePercent}%</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">عدد مرات النجاح / عدم الاجتياز:</span>
              <span class="metric-val">${data.quizzes.passedCount} نجاح | ${data.quizzes.failedCount} إخفاق</span>
            </div>
          </div>
        </div>

        <!-- Assignments Box -->
        <div class="detail-card">
          <h4>تفاصيل الواجبات والتسليمات</h4>
          <div class="metric-list">
            <div class="metric-row">
              <span class="metric-name">إجمالي الواجبات المطلوبة:</span>
              <span class="metric-val">${data.assignments.totalAssignments} واجب</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">عدد الواجبات المسلمة:</span>
              <span class="metric-val">${data.assignments.submittedCount} واجب</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">التسليمات المتأخرة:</span>
              <span class="metric-val">${data.assignments.lateCount} واجبات</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">متوسط تقييم الواجبات:</span>
              <span class="metric-val" style="color: #D97706;">${data.assignments.averageScorePercent}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Attendance & Payments Grid -->
      <div class="two-col-grid">
        <!-- Attendance Box -->
        <div class="detail-card">
          <h4>سجل الحضور والغياب</h4>
          <div class="metric-list">
            <div class="metric-row">
              <span class="metric-name">إجمالي الحصص المقررة:</span>
              <span class="metric-val">${data.attendance.totalSessions} حصص</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">حضور / تأخير / غياب:</span>
              <span class="metric-val">${data.attendance.presentCount} حضور | ${data.attendance.lateCount} تأخير | ${data.attendance.absentCount} غياب</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">نسبة الالتزام بالحضور:</span>
              <span class="metric-val" style="color: #059669;">${data.attendance.attendancePercent}%</span>
            </div>
          </div>
        </div>

        <!-- Payment Box -->
        <div class="detail-card">
          <h4>حالة الاشتراكات والرسوم</h4>
          <div class="metric-list">
            <div class="metric-row">
              <span class="metric-name">قيمة الاشتراك الشهري:</span>
              <span class="metric-val">${data.payment.monthlyFee} ج.م</span>
            </div>
            <div class="metric-row">
              <span class="metric-name">حالة السداد:</span>
              <span class="status-badge" style="background: ${paymentBadgeBg}; color: ${paymentBadgeColor}; border: 1px solid ${paymentBadgeBorder};">
                ${paymentBadgeText}
              </span>
            </div>
            ${data.payment.paymentDate ? `
              <div class="metric-row">
                <span class="metric-name">تاريخ وسيلة السداد:</span>
                <span class="metric-val">${data.payment.paymentDate} (${data.payment.paymentMethod || 'إلكتروني'})</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- 7. Teacher Notes -->
      ${data.teacherNotes ? `
        <div class="notes-box">
          <h4>ملاحظات وتوصيات المعلم</h4>
          <p>${data.teacherNotes}</p>
        </div>
      ` : ''}
    </div>

    <!-- 8. Footer -->
    <div class="footer-bar">
      <span>منصة EngCode by Ahmed Hamed — تقرير أكاديمي رسمي آلي</span>
      <span>رمز المتابعة: @${data.student.username}</span>
      <span>صفحة 1 من 1</span>
    </div>
  </div>
</body>
</html>
  `;
}

function getChromiumExecutablePath(): string | undefined {
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  return undefined;
}

export async function generatePuppeteerPDF(data: MonthlyReportPDFData): Promise<Buffer> {
  const html = generateReportHTML(data);
  const executablePath = getChromiumExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

async function run() {
  const sampleData: MonthlyReportPDFData = {
    reportTitle: 'التقرير الأكاديمي الشهري - أغسطس 2026',
    reportMonthName: 'أغسطس',
    reportYear: 2026,
    generatedDateFormatted: '11/08/2026',
    timezone: 'Africa/Cairo',
    student: {
      fullName: 'أحمد محمد علي',
      username: '01500000001',
      grade: 'الصف الأول الثانوي',
      academicYear: '2026/2027',
    },
    period: {
      start: '2026-08-01',
      end: '2026-08-31',
    },
    summary: {
      courseProgressPercent: 85,
      attendancePercent: 92,
      quizAveragePercent: 88,
      assignmentAveragePercent: 90,
      paymentStatus: 'PAID',
    },
    courses: [
      {
        name: 'Computer Science & Programming (Python & Web Development)',
        completedLessons: 12,
        totalLessons: 15,
        progressPercent: 80,
      },
    ],
    quizzes: {
      totalQuizzes: 4,
      completedQuizzes: 4,
      averageScorePercent: 88,
      passedCount: 4,
      failedCount: 0,
    },
    assignments: {
      totalAssignments: 3,
      submittedCount: 3,
      lateCount: 0,
      gradedCount: 3,
      averageScorePercent: 90,
    },
    attendance: {
      totalSessions: 8,
      presentCount: 7,
      lateCount: 1,
      absentCount: 0,
      excusedCount: 0,
      attendancePercent: 92,
    },
    payment: {
      monthlyFee: 350,
      status: 'PAID',
      paymentDate: '2026-08-02',
      paymentMethod: 'فودافون كاش',
    },
    teacherNotes: 'طالب ممتاز ومجتهد، يظهر تفوقاً ملحوظاً في حل التمارين البرمجية والتسليم في المواعيد المحددة.',
  };

  const buffer = await generatePuppeteerPDF(sampleData);
  const pdfPath = path.join(__dirname, 'test_puppeteer_report.pdf');
  fs.writeFileSync(pdfPath, buffer);
  console.log('Puppeteer PDF Generated at:', pdfPath);
}

run().catch(console.error);
