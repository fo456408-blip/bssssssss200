import { prisma } from '../src/config/database';
import { ReportService } from '../src/services/report.service';
import { ReportPDFService } from '../src/services/report-pdf.service';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('--- STARTING LIVE PARENT MONTHLY REPORT E2E TEST ---');

  // 1. Find a real parent user and linked child in DB
  const parent = await prisma.parent.findFirst({
    include: { user: true, students: { include: { user: true } } },
  });

  if (!parent || parent.students.length === 0) {
    console.error('No parent or linked student found');
    process.exit(1);
  }

  const child = parent.students[0];
  console.log(`✔ Parent User: ${parent.user.fullName} (${parent.user.username})`);
  console.log(`✔ Linked Child: ${child.user.fullName} (${child.user.username})`);

  // 2. Generate Monthly Report for Child (Month: 8, Year: 2026)
  const report = await ReportService.generateParentChildMonthlyReport(
    parent.userId.toString(),
    child.id.toString(),
    2026,
    8
  );

  console.log(`✔ Generated Monthly Report ID: ${report.id}, Version: v${report.version}`);

  // 3. Stream PDF Buffer directly for verification
  const { pdfBuffer, filename } = await ReportService.streamReportPDFBuffer(
    report.id.toString(),
    parent.userId.toString(),
    'PARENT'
  );

  const outPath = path.join(__dirname, 'live_parent_report.pdf');
  fs.writeFileSync(outPath, pdfBuffer);
  console.log(`✔ PDF Buffer Streamed Successfully: ${outPath} (${pdfBuffer.length} bytes)`);

  console.log('--- LIVE E2E TEST COMPLETED SUCCESSFULLY ---');
}

main()
  .catch((e) => {
    console.error('❌ E2E Test Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
