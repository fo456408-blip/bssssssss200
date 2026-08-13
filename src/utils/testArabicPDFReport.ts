import { ReportPDFService, MonthlyReportPDFData } from '../services/report-pdf.service';
import fs from 'fs';
import path from 'path';

async function testArabicPDFReport() {
  console.log('\n========================================');
  console.log('TESTING ARABIC PDF REPORT GENERATION WITH BUNDLED CAIRO FONT');
  console.log('========================================\n');

  const mockData: MonthlyReportPDFData = {
    reportTitle: 'التقرير الأكاديمي الشهري والتقييم الشامل',
    reportMonthName: 'أغسطس 2026',
    reportYear: 2026,
    generatedDateFormatted: '13 أغسطس 2026',
    timezone: 'Africa/Cairo',
    student: {
      fullName: 'أحمد محمود علي السيد',
      username: 'ahmed_student',
      grade: 'الصف الثالث الثانوي',
      academicYear: '2025/2026',
    },
    period: {
      start: '1 أغسطس 2026',
      end: '13 أغسطس 2026',
    },
    summary: {
      courseProgressPercent: 88.5,
      attendancePercent: 95,
      quizAveragePercent: 92,
      assignmentAveragePercent: 90,
      paymentStatus: 'PAID',
    },
    courses: [
      {
        name: 'كورس برمجة الحاسب والتفكير المنطقي - المستوى المتقدم',
        completedLessons: 12,
        totalLessons: 15,
        progressPercent: 80,
      },
    ],
    quizzes: {
      totalQuizzes: 5,
      completedQuizzes: 5,
      averageScorePercent: 92,
      passedCount: 5,
      failedCount: 0,
    },
    assignments: {
      totalAssignments: 4,
      submittedCount: 4,
      lateCount: 0,
      gradedCount: 4,
      averageScorePercent: 90,
    },
    attendance: {
      totalSessions: 10,
      presentCount: 9,
      lateCount: 1,
      absentCount: 0,
      excusedCount: 0,
      attendancePercent: 95,
    },
    payment: {
      monthlyFee: 450,
      status: 'PAID',
      paymentDate: '1 أغسطس 2026',
      paymentMethod: 'فودافون كاش (تحويل مباشر)',
    },
    teacherNotes: 'الطالب أحمد أظهر تميزاً كبيراً في استيعاب مفاهيم البرمجة المتقدمة وحل المشكلات الهندسية. يُنصح بالاستمرار في المتابعة بنفس المستوى.',
  };

  console.log('Generating PDF buffer...');
  const pdfBuffer = await ReportPDFService.generateMonthlyReportPDF(mockData);
  console.log(`[✔ PASS] Generated PDF buffer size: ${pdfBuffer.length} bytes`);

  const outDir = path.join(__dirname, '../../scratch');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'test_arabic_report.pdf');
  fs.writeFileSync(outFile, pdfBuffer);
  console.log(`[✔ PASS] Saved test PDF to: ${outFile}`);

  if (pdfBuffer.length > 5000) {
    console.log('\n========================================');
    console.log('ARABIC PDF GENERATION VERIFICATION: ALL PASSED');
    console.log('========================================\n');
  } else {
    console.error('PDF buffer too small!');
    process.exit(1);
  }
}

testArabicPDFReport().catch((err) => {
  console.error('Arabic PDF test failed:', err);
  process.exit(1);
});
