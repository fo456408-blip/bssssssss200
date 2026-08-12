import { prisma } from '../config/database';

async function main() {
  const courses = await prisma.course.findMany({
    include: { academicYear: true },
  });
  const bookingRequests = await prisma.bookingRequest.findMany();

  console.log('\n--- COURSES (المواد الدراسية) ---', courses.length);
  console.log(JSON.stringify(courses, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

  console.log('\n--- BOOKING REQUESTS ---', bookingRequests.length);
  console.log(JSON.stringify(bookingRequests, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

main().finally(() => prisma.$disconnect());
