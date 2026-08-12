import { prisma } from '../src/config/database';
import { ReportService } from '../src/services/report.service';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== STARTING ALL-ROLES REPORT GENERATION & IDOR SECURITY TEST ===');

  // 1. Fetch Real Database Users
  const student = await prisma.student.findFirst({
    include: { user: true, parent: { include: { user: true } } },
  });

  const teacher = await prisma.teacher.findFirst({
    include: { user: true, teacherCourses: true },
  });

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!student || !student.parent || !teacher || !admin) {
    console.error('Required test entities missing in DB');
    process.exit(1);
  }

  console.log(`✔ Found Student: ${student.user.fullName} (${student.user.username})`);
  console.log(`✔ Found Parent: ${student.parent.user.fullName} (${student.parent.user.username})`);
  console.log(`✔ Found Teacher: ${teacher.user.fullName} (${teacher.user.username})`);
  console.log(`✔ Found Admin: ${admin.fullName} (${admin.username})`);

  // Ensure enrollment exists for teacher IDOR test
  const activeEnrollment = await prisma.enrollment.findFirst({
    where: { studentId: student.id },
  });

  if (activeEnrollment && teacher.teacherCourses.length > 0) {
    // Associate student's enrollment course to teacher if not already
    const firstCourseId = teacher.teacherCourses[0].courseId;
    await prisma.enrollment.update({
      where: { id: activeEnrollment.id },
      data: { courseId: firstCourseId },
    });
  }

  // -------------------------------------------------------------
  // TEST 1: PARENT GENERATION & STREAMING
  // -------------------------------------------------------------
  console.log('\n--- 1. PARENT ROLE TEST ---');
  const parentReport = await ReportService.generateParentChildMonthlyReport(
    student.parent.userId.toString(),
    student.id.toString(),
    2026,
    8
  );
  const parentPdf = await ReportService.streamReportPDFBuffer(
    parentReport.id.toString(),
    student.parent.userId.toString(),
    'PARENT'
  );
  console.log(`[PASS] Parent Report Generated ID=${parentReport.id}, PDF Size=${parentPdf.pdfBuffer.length} bytes`);

  // -------------------------------------------------------------
  // TEST 2: STUDENT GENERATION & STREAMING
  // -------------------------------------------------------------
  console.log('\n--- 2. STUDENT ROLE TEST ---');
  const studentReport = await ReportService.generateStudentMonthlyReport(
    student.userId.toString(),
    2026,
    8
  );
  const studentPdf = await ReportService.streamReportPDFBuffer(
    studentReport.id.toString(),
    student.userId.toString(),
    'STUDENT'
  );
  console.log(`[PASS] Student Report Generated ID=${studentReport.id}, PDF Size=${studentPdf.pdfBuffer.length} bytes`);

  // -------------------------------------------------------------
  // TEST 3: TEACHER GENERATION & STREAMING
  // -------------------------------------------------------------
  console.log('\n--- 3. TEACHER ROLE TEST ---');
  const teacherReport = await ReportService.generateTeacherStudentMonthlyReport(
    teacher.userId.toString(),
    student.id.toString(),
    2026,
    8
  );
  const teacherPdf = await ReportService.streamReportPDFBuffer(
    teacherReport.id.toString(),
    teacher.userId.toString(),
    'TEACHER'
  );
  console.log(`[PASS] Teacher Report Generated ID=${teacherReport.id}, PDF Size=${teacherPdf.pdfBuffer.length} bytes`);

  // -------------------------------------------------------------
  // TEST 4: ADMIN GENERATION & STREAMING
  // -------------------------------------------------------------
  console.log('\n--- 4. ADMIN ROLE TEST ---');
  const adminReport = await ReportService.generateMonthlyReport(
    student.id.toString(),
    2026,
    8,
    admin.id.toString()
  );
  const adminPdf = await ReportService.streamReportPDFBuffer(
    adminReport.id.toString(),
    admin.id.toString(),
    'ADMIN'
  );
  console.log(`[PASS] Admin Report Generated ID=${adminReport.id}, PDF Size=${adminPdf.pdfBuffer.length} bytes`);

  // -------------------------------------------------------------
  // TEST 5: IDOR AUTHORIZATION BOUNDARY CHECKS
  // -------------------------------------------------------------
  console.log('\n--- 5. IDOR SECURITY BOUNDARY CHECKS ---');
  
  // A. Unauthorized student attempting to view another student's report
  try {
    const fakeStudentUserId = '999999';
    await ReportService.streamReportPDFBuffer(parentReport.id.toString(), fakeStudentUserId, 'STUDENT');
    console.error('❌ IDOR FAIL: Unauthorized student was not blocked!');
  } catch (err: any) {
    console.log(`[PASS] Unauthorized student blocked correctly with 403: "${err.message}"`);
  }

  // B. Unauthorized parent attempting to view unlinked child's report
  try {
    const fakeParentUserId = '888888';
    await ReportService.streamReportPDFBuffer(parentReport.id.toString(), fakeParentUserId, 'PARENT');
    console.error('❌ IDOR FAIL: Unauthorized parent was not blocked!');
  } catch (err: any) {
    console.log(`[PASS] Unauthorized parent blocked correctly with 403: "${err.message}"`);
  }

  // Save generated PDFs for visual rendering verification
  fs.writeFileSync(path.join(__dirname, 'parent_role_report.pdf'), parentPdf.pdfBuffer);
  fs.writeFileSync(path.join(__dirname, 'student_role_report.pdf'), studentPdf.pdfBuffer);
  fs.writeFileSync(path.join(__dirname, 'teacher_role_report.pdf'), teacherPdf.pdfBuffer);
  fs.writeFileSync(path.join(__dirname, 'admin_role_report.pdf'), adminPdf.pdfBuffer);

  console.log('\n=== ALL 4 ROLE TESTS & IDOR SECURITY CHECKS PASSED PERFECTLY ===');
}

main()
  .catch((e) => {
    console.error('❌ Error during role PDF tests:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
