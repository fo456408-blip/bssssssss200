import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

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

export class ReportPDFService {
  /**
   * Helper to resolve Chromium executable path (Chrome / Edge / Puppeteer Bundled)
   */
  private static getChromiumExecutablePath(): string | undefined {
    const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (fs.existsSync(chromePath)) return chromePath;
    if (fs.existsSync(edgePath)) return edgePath;
    return undefined;
  }

  /**
   * Helper to locate and convert real EngCode logo to base64 Data URI
   */
  private static getRealEngCodeLogoBase64(): string {
    const possiblePaths = [
      path.join(__dirname, '../../../frontend/public/assets/images/logo.png'),
      path.join(__dirname, '../../../frontend/public/assets/images/logo.webp'),
      path.join(process.cwd(), '../frontend/public/assets/images/logo.png'),
      path.join(process.cwd(), '../frontend/public/assets/images/logo.webp'),
      path.join(__dirname, '../../public/assets/images/logo.png'),
    ];

    for (const logoPath of possiblePaths) {
      if (fs.existsSync(logoPath)) {
        const mimeType = logoPath.endsWith('.webp') ? 'image/webp' : 'image/png';
        const fileData = fs.readFileSync(logoPath).toString('base64');
        return `data:${mimeType};base64,${fileData}`;
      }
    }
    return '';
  }

  /**
   * Generates clean HTML template for the Monthly Report
   */
  private static generateReportHTML(data: MonthlyReportPDFData): string {
    const isPaid = data.summary.paymentStatus === 'PAID';
    const paymentBadgeText = isPaid ? 'مكتمل المسدد (مدفوع)' : 'مستحق (غير مدفوع)';
    const paymentBadgeBg = isPaid ? '#ECFDF5' : '#FEF2F2';
    const paymentBadgeColor = isPaid ? '#047857' : '#B91C1C';
    const paymentBadgeBorder = isPaid ? '#A7F3D0' : '#FECACA';

    const logoBase64 = this.getRealEngCodeLogoBase64();

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');

    @page {
      size: A4 portrait;
      margin: 10mm 10mm 10mm 10mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      width: 100%;
      background-color: #F7F3EE;
      font-family: 'Cairo', sans-serif;
      color: #241A15;
      margin: 0 auto;
    }

    .report-outer-card {
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(50, 29, 20, 0.04);
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 20mm);
      justify-content: space-between;
    }

    /* 1. Header Banner Redesign */
    .header-banner {
      background: linear-gradient(135deg, #321D14 0%, #42261A 60%, #5A3825 100%);
      color: #FFFFFF;
      padding: 20px 26px;
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
      height: 52px;
      width: auto;
      object-fit: contain;
    }

    .brand-text h1 {
      font-size: 19px;
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
      font-size: 10.5px;
      font-weight: 800;
      padding: 3px 12px;
      border-radius: 20px;
      margin-bottom: 4px;
    }

    .title-section h2 {
      font-size: 17px;
      font-weight: 900;
      color: #FFFFFF;
      line-height: 1.2;
    }

    .title-section p {
      font-size: 10px;
      font-weight: 600;
      color: #A58F80;
      margin-top: 2px;
    }

    .content-body {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
    }

    /* 2. Student Identity Card */
    .student-card {
      background: #F7F3EE;
      border: 1px solid #E6DDD5;
      border-radius: 14px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .student-info-group h3 {
      font-size: 17px;
      font-weight: 900;
      color: #321D14;
      margin-bottom: 3px;
    }

    .student-info-group p {
      font-size: 11.5px;
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
      font-size: 10.5px;
      font-weight: 700;
      color: #5A3825;
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      padding: 3px 10px;
      border-radius: 8px;
    }

    .section-title {
      font-size: 13.5px;
      font-weight: 900;
      color: #321D14;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      border-right: 4px solid #C8A46A;
      padding-right: 8px;
    }

    /* 3. Performance Dashboard & KPI Section */
    .kpi-wrapper {
      display: flex;
      gap: 12px;
    }

    /* Featured Primary Hero KPI Card */
    .kpi-hero-card {
      background: linear-gradient(135deg, #321D14 0%, #5A3825 100%);
      color: #FFFFFF;
      border-radius: 14px;
      padding: 14px 16px;
      width: 170px;
      shrink: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid #C8A46A;
      box-shadow: 0 4px 10px rgba(50, 29, 20, 0.15);
    }

    .kpi-hero-title {
      font-size: 11px;
      font-weight: 800;
      color: #C8A46A;
    }

    .kpi-hero-value {
      font-size: 26px;
      font-weight: 900;
      color: #FFFFFF;
      margin: 4px 0;
    }

    .progress-bar-bg {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: #C8A46A;
      border-radius: 3px;
    }

    /* Secondary KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      flex: 1;
    }

    .kpi-card {
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      border-radius: 12px;
      padding: 10px 8px;
      text-align: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .kpi-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #8B6248;
      margin-bottom: 4px;
    }

    .kpi-value {
      font-size: 17px;
      font-weight: 900;
      color: #5A3825;
    }

    .kpi-value.gold { color: #C8A46A; }
    .kpi-value.emerald { color: #059669; }
    .kpi-value.amber { color: #D97706; }
    .kpi-value.rose { color: #DC2626; }

    /* 4. Courses Table */
    .table-container {
      border: 1px solid #E6DDD5;
      border-radius: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
    }

    thead {
      background: #5A3825;
      color: #FFFFFF;
      display: table-header-group;
    }

    th {
      padding: 9px 12px;
      font-weight: 800;
      text-align: right;
    }

    th.center, td.center {
      text-align: center;
    }

    tbody tr {
      border-bottom: 1px solid #E6DDD5;
      page-break-inside: avoid;
    }

    tbody tr:nth-child(even) {
      background: #F7F3EE;
    }

    td {
      padding: 9px 12px;
      font-weight: 700;
      color: #321D14;
    }

    .progress-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      background: #FEF3C7;
      color: #92400E;
      font-weight: 800;
      font-size: 10.5px;
    }

    /* 5. Two Column Breakdown */
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      page-break-inside: avoid;
    }

    .detail-card {
      background: #FFFFFF;
      border: 1px solid #E6DDD5;
      border-radius: 12px;
      padding: 12px 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
    }

    .detail-card h4 {
      font-size: 12.5px;
      font-weight: 900;
      color: #321D14;
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 1px solid #E6DDD5;
    }

    .metric-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .metric-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
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
      border-radius: 12px;
      padding: 12px 16px;
      page-break-inside: avoid;
    }

    .notes-box h4 {
      font-size: 12px;
      font-weight: 900;
      color: #92400E;
      margin-bottom: 3px;
    }

    .notes-box p {
      font-size: 11px;
      font-weight: 700;
      color: #78350F;
      line-height: 1.45;
    }

    /* 7. Footer Redesign */
    .footer-bar {
      background: #F7F3EE;
      border-top: 1px solid #E6DDD5;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9.5px;
      font-weight: 700;
      color: #8B6248;
    }

    .footer-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .footer-logo {
      height: 20px;
      width: auto;
      object-fit: contain;
    }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10.5px;
      font-weight: 800;
    }

    .section-block {
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="report-outer-card">
    <!-- 1. Header Banner -->
    <div class="header-banner">
      <div class="brand-section">
        ${logoBase64 ? `<img src="${logoBase64}" class="brand-logo" alt="EngCode Logo" />` : ''}
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
      <div class="student-card section-block">
        <div class="student-info-group">
          <h3>اسم الطالب: ${data.student.fullName}</h3>
          <p>رقم التليفون / اسم المستخدم: ${data.student.username} | ${data.student.grade || 'المرحلة الثانوية'}</p>
        </div>
        <div class="student-meta-group">
          <span class="meta-tag">الفترة: ${data.period.start} إلى ${data.period.end}</span>
          <span class="meta-tag">العام الدراسي: ${data.student.academicYear}</span>
        </div>
      </div>

      <!-- 3. KPI Performance Dashboard -->
      <div class="section-block">
        <div class="section-title">لوحة ملخص الأداء الشهري</div>
        <div class="kpi-wrapper">
          <!-- Primary Hero KPI -->
          <div class="kpi-hero-card">
            <div>
              <div class="kpi-hero-title">التقدم العام الكلي</div>
              <div class="kpi-hero-value">${data.summary.courseProgressPercent}%</div>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${Math.min(data.summary.courseProgressPercent, 100)}%;"></div>
            </div>
          </div>

          <!-- Secondary KPI Grid -->
          <div class="kpi-grid">
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
              <div class="kpi-value ${isPaid ? 'emerald' : 'rose'}" style="font-size: 12px;">${isPaid ? 'مدفوع ✓' : 'غير مدفوع'}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Courses Table -->
      <div class="section-block">
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
              ${data.courses.length > 0 ? data.courses.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td class="center">${c.completedLessons} من أصل ${c.totalLessons} درس</td>
                  <td class="center"><span class="progress-pill">${c.progressPercent}%</span></td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="3" class="center" style="color: #8B6248;">لا تتوفر بيانات كورسات مسجلة لهذا الشهر</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. Two Column Breakdown -->
      <div class="two-col-grid section-block">
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
      <div class="two-col-grid section-block">
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
        <div class="notes-box section-block">
          <h4>ملاحظات وتوصيات المعلم</h4>
          <p>${data.teacherNotes}</p>
        </div>
      ` : ''}
    </div>

    <!-- 8. Redesigned Footer -->
    <div class="footer-bar">
      <div class="footer-brand">
        ${logoBase64 ? `<img src="${logoBase64}" class="footer-logo" alt="EngCode Logo" />` : ''}
        <span>EngCode by Ahmed Hamed — التقرير الأكاديمي الشهري</span>
      </div>
      <span>رمز الطالب: @${data.student.username}</span>
      <span>تم إصداره آلياً من منصة EngCode</span>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generates a professional A4 Arabic PDF document Buffer for a monthly student report
   */
  static async generateMonthlyReportPDF(data: MonthlyReportPDFData): Promise<Buffer> {
    const html = this.generateReportHTML(data);
    const executablePath = this.getChromiumExecutablePath();

    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' as any });

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
}
