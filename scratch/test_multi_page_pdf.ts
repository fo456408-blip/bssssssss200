import { ReportPDFService, MonthlyReportPDFData } from '../src/services/report-pdf.service';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('--- TESTING MULTI-PAGE FLOW ---');

  const multiPageData: MonthlyReportPDFData = {
    reportTitle: 'التقرير الأكاديمي الشهري - أغسطس 2026',
    reportMonthName: 'أغسطس',
    reportYear: 2026,
    generatedDateFormatted: '11/08/2026',
    timezone: 'Africa/Cairo',
    student: {
      fullName: 'أحمد محمد عبد الرحمن',
      username: 'ahmed_student_2026',
      grade: 'الصف الثاني الثانوي - شعبة علمي رياضة',
      academicYear: '2026/2027',
    },
    period: {
      start: '2026-08-01',
      end: '2026-08-31',
    },
    summary: {
      courseProgressPercent: 88,
      attendancePercent: 96,
      quizAveragePercent: 91,
      assignmentAveragePercent: 94,
      paymentStatus: 'PAID',
    },
    courses: [
      { name: 'Computer Science & Programming (Python & Web Development)', completedLessons: 14, totalLessons: 16, progressPercent: 87 },
      { name: 'Data Structures & Algorithms in C++ (Advanced Problem Solving)', completedLessons: 10, totalLessons: 12, progressPercent: 83 },
      { name: 'Artificial Intelligence & Machine Learning Fundamentals', completedLessons: 8, totalLessons: 8, progressPercent: 100 },
      { name: 'Full-Stack Web Development with React & Node.js', completedLessons: 15, totalLessons: 20, progressPercent: 75 },
      { name: 'Mobile App Development with Flutter & Dart', completedLessons: 6, totalLessons: 10, progressPercent: 60 },
      { name: 'Database Engineering with PostgreSQL & Prisma ORM', completedLessons: 12, totalLessons: 12, progressPercent: 100 },
    ],
    quizzes: { totalQuizzes: 12, completedQuizzes: 12, averageScorePercent: 91, passedCount: 12, failedCount: 0 },
    assignments: { totalAssignments: 10, submittedCount: 10, lateCount: 1, gradedCount: 10, averageScorePercent: 94 },
    attendance: { totalSessions: 16, presentCount: 15, lateCount: 1, absentCount: 0, excusedCount: 0, attendancePercent: 96 },
    payment: { monthlyFee: 450, status: 'PAID', paymentDate: '2026-08-01', paymentMethod: 'فودافون كاش' },
    teacherNotes: 'أظهر الطالب أحمد تفوقاً استثنائياً في جميع المواد البرمجية وخاصة في تطبيق خوارزميات الذكاء الاصطناعي وبناء برمجيات متطورة. يوصى بمواصلة المشاركة في المسابقات البرمجية القادمة وحل تمارين التحدي الإضافية. كما لوحظ التزام تام بمواعيد الحضور والمشاركة الفعالة أثناء الجلسات التفاعلية.',
  };

  const buffer = await ReportPDFService.generateMonthlyReportPDF(multiPageData);
  const pdfPath = path.join(__dirname, 'test_multipage_report.pdf');
  fs.writeFileSync(pdfPath, buffer);
  console.log('✔ Multi-page Report PDF generated at:', pdfPath);
}

main().catch(console.error);
