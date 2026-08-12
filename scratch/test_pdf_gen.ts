import { ReportPDFService, MonthlyReportPDFData } from '../src/services/report-pdf.service';
import fs from 'fs';
import path from 'path';

async function main() {
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

  const buffer = await ReportPDFService.generateMonthlyReportPDF(sampleData);
  const outputPath = path.join(__dirname, 'test_sample_report.pdf');
  fs.writeFileSync(outputPath, buffer);
  console.log('PDF Generated Successfully at:', outputPath, 'Size:', buffer.length, 'bytes');
}

main().catch(console.error);
