import { PrismaClient, UserRole, StudentGrade, SessionStatus, AttendanceStatus, QuestionType, QuizAttemptStatus, AssignmentStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed process for EngCode by Ahmed Hamed platform (DEVELOPMENT ONLY)...');

  // Password hash for dev accounts: "DevPassword123!"
  const salt = await bcrypt.genSalt(10);
  const devPasswordHash = await bcrypt.hash('DevPassword123!', salt);

  // 1. Create Admin User
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: devPasswordHash,
      fullName: 'Development Admin',
      role: UserRole.ADMIN,
      phone: '01000000000',
      email: 'admin@ahmedhamed.online',
      isActive: true,
    },
  });
  console.log('✔ Seeded Admin User:', adminUser.username);

  // 2. Create Teacher User & Teacher Profile
  const teacherUser = await prisma.user.upsert({
    where: { username: 'ahmed_teacher' },
    update: {},
    create: {
      username: 'ahmed_teacher',
      passwordHash: devPasswordHash,
      fullName: 'Ahmed Teacher',
      role: UserRole.TEACHER,
      phone: '01100000000',
      email: 'ahmed.teacher@ahmedhamed.online',
      isActive: true,
    },
  });

  const teacher = await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      userId: teacherUser.id,
      specialization: 'Programming & Artificial Intelligence',
      bio: 'Senior Software Engineer & Lead Instructor for Secondary Computer Science.',
    },
  });
  console.log('✔ Seeded Teacher Profile:', teacherUser.fullName);

  // 3. Create Parent User & Parent Profile
  const parentUser = await prisma.user.upsert({
    where: { username: 'mohamed_parent' },
    update: {},
    create: {
      username: 'mohamed_parent',
      passwordHash: devPasswordHash,
      fullName: 'Mohamed Parent',
      role: UserRole.PARENT,
      phone: '01200000000',
      email: 'mohamed.parent@example.com',
      isActive: true,
    },
  });

  const parent = await prisma.parent.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: {
      userId: parentUser.id,
      occupation: 'Civil Engineer',
      notes: 'Parent of Ahmed and Omar Mohamed',
    },
  });
  console.log('✔ Seeded Parent Profile:', parentUser.fullName);

  // 4. Create Students (Ahmed Mohamed & Omar Mohamed)
  const student1User = await prisma.user.upsert({
    where: { username: 'ahmed_student' },
    update: {},
    create: {
      username: 'ahmed_student',
      passwordHash: devPasswordHash,
      fullName: 'Ahmed Mohamed',
      role: UserRole.STUDENT,
      phone: '01500000001',
      email: 'ahmed.mohamed@example.com',
      isActive: true,
    },
  });

  const student1 = await prisma.student.upsert({
    where: { userId: student1User.id },
    update: { parentId: parent.id },
    create: {
      userId: student1User.id,
      parentId: parent.id,
      grade: StudentGrade.FIRST_SECONDARY,
      schoolName: 'Al-Amal Secondary School',
      dateOfBirth: new Date('2009-05-14'),
    },
  });

  const student2User = await prisma.user.upsert({
    where: { username: 'omar_student' },
    update: {},
    create: {
      username: 'omar_student',
      passwordHash: devPasswordHash,
      fullName: 'Omar Mohamed',
      role: UserRole.STUDENT,
      phone: '01500000002',
      email: 'omar.mohamed@example.com',
      isActive: true,
    },
  });

  const student2 = await prisma.student.upsert({
    where: { userId: student2User.id },
    update: { parentId: parent.id },
    create: {
      userId: student2User.id,
      parentId: parent.id,
      grade: StudentGrade.FIRST_SECONDARY,
      schoolName: 'Al-Amal Secondary School',
      dateOfBirth: new Date('2010-08-22'),
    },
  });
  console.log('✔ Seeded Students:', student1User.fullName, '&', student2User.fullName);

  // 5. Academic Year
  const academicYear = await prisma.academicYear.upsert({
    where: { name: '2026 / 2027' },
    update: {},
    create: {
      name: '2026 / 2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      isCurrent: true,
    },
  });

  // 6. Subject
  const subject = await prisma.subject.upsert({
    where: { code: 'CS_SEC1' },
    update: {},
    create: {
      code: 'CS_SEC1',
      name: 'Computer Science & Programming',
      description: 'Secondary School Level 1 Computer Science Curriculum',
    },
  });

  // 7. Course & Teacher Association
  const course = await prisma.course.upsert({
    where: { code: 'PROG_SEC1_2026' },
    update: {},
    create: {
      code: 'PROG_SEC1_2026',
      name: 'Programming - First Secondary',
      description: 'Full Programming & Computational Thinking Course for 1st Secondary Students.',
      subjectId: subject.id,
      academicYearId: academicYear.id,
      defaultMonthlyFee: 350.00,
      isActive: true,
    },
  });

  await prisma.teacherCourse.upsert({
    where: {
      teacherId_courseId: {
        teacherId: teacher.id,
        courseId: course.id,
      },
    },
    update: {},
    create: {
      teacherId: teacher.id,
      courseId: course.id,
    },
  });

  // 8. Group A
  const groupA = await prisma.group.create({
    data: {
      courseId: course.id,
      name: 'Group A',
      maxCapacity: 30,
      schedule: 'Saturday 4:00 PM - 6:00 PM',
    },
  });

  // Assign students to Group A
  await prisma.groupStudent.createMany({
    data: [
      { studentId: student1.id, groupId: groupA.id },
      { studentId: student2.id, groupId: groupA.id },
    ],
    skipDuplicates: true,
  });

  // 9. Enrollments
  const enrollment1 = await prisma.enrollment.create({
    data: {
      studentId: student1.id,
      courseId: course.id,
      academicYearId: academicYear.id,
      monthlyFee: 350.00,
    },
  });

  const enrollment2 = await prisma.enrollment.create({
    data: {
      studentId: student2.id,
      courseId: course.id,
      academicYearId: academicYear.id,
      monthlyFee: 350.00,
    },
  });

  // 10. Lessons (3 Lessons)
  const lesson1 = await prisma.lesson.create({
    data: {
      courseId: course.id,
      lessonNumber: 1,
      title: 'مقدمة في البرمجة والتفكير المنطقي',
      description: 'فهم مفهوم الخوارزميات وتدفق البيانات وكتابة أول برنامج.',
      isPublished: true,
      videos: {
        create: [
          {
            title: 'المحاضرة الأولى: المفاهيم الأساسية',
            r2StorageKey: 'courses/prog_sec1/lesson_1_intro.mp4',
            durationSeconds: 2700,
            videoOrder: 1,
          },
        ],
      },
    },
  });

  const lesson2 = await prisma.lesson.create({
    data: {
      courseId: course.id,
      lessonNumber: 2,
      title: 'المتغيرات وأنواع البيانات',
      description: 'دراسة المتغيرات العددية والنصية والمنطقية وطرق تخزين القيم.',
      isPublished: true,
      videos: {
        create: [
          {
            title: 'المحاضرة الثانية: العمليات الرياضية والمتغيرات',
            r2StorageKey: 'courses/prog_sec1/lesson_2_variables.mp4',
            durationSeconds: 3600,
            videoOrder: 1,
          },
        ],
      },
    },
  });

  const lesson3 = await prisma.lesson.create({
    data: {
      courseId: course.id,
      lessonNumber: 3,
      title: 'الجمل الشرطية والقرارات البرمجية',
      description: 'استخدام If-Else للتحكم في مسار تنفيذ البرنامج.',
      isPublished: true,
      videos: {
        create: [
          {
            title: 'المحاضرة الثالثة: الجمل الشرطية',
            r2StorageKey: 'courses/prog_sec1/lesson_3_conditionals.mp4',
            durationSeconds: 3200,
            videoOrder: 1,
          },
        ],
      },
    },
  });

  // 11. Student Video Progress
  await prisma.studentLessonProgress.create({
    data: {
      studentId: student1.id,
      lessonId: lesson1.id,
      isCompleted: true,
      watchedDurationSeconds: 2700,
      lastWatchedAt: new Date(),
    },
  });

  // 12. Quiz for Lesson 1
  const quiz1 = await prisma.quiz.create({
    data: {
      lessonId: lesson1.id,
      title: 'اختبار مقدمة البرمجة والتفكير المنطقي',
      description: 'اختبار تقييمي لقياس فهم الطلاب للمفاهيم الأساسية.',
      durationMinutes: 20,
      passingScore: 60.0,
      maxAttempts: 3,
      isPublished: true,
      questions: {
        create: [
          {
            questionText: 'ما هي الخطوات الإجرائية مرتبة منطقياً لحل مشكلة ما؟',
            type: QuestionType.MCQ,
            points: 5.0,
            questionOrder: 1,
            options: {
              create: [
                { optionText: 'الخوارزمية (Algorithm)', isCorrect: true, optionOrder: 1 },
                { optionText: 'المتغير (Variable)', isCorrect: false, optionOrder: 2 },
                { optionText: 'المصفوفة (Array)', isCorrect: false, optionOrder: 3 },
              ],
            },
          },
          {
            questionText: 'البرمجة هي تحويل الخوارزميات إلى تعليمات يفهمها الحاسوب.',
            type: QuestionType.TRUE_FALSE,
            points: 5.0,
            questionOrder: 2,
            options: {
              create: [
                { optionText: 'صواب', isCorrect: true, optionOrder: 1 },
                { optionText: 'خطأ', isCorrect: false, optionOrder: 2 },
              ],
            },
          },
        ],
      },
    },
  });

  // Quiz Attempt for Student 1
  await prisma.quizAttempt.create({
    data: {
      quizId: quiz1.id,
      studentId: student1.id,
      attemptNumber: 1,
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() - 1800000),
      score: 100.0,
      isPassed: true,
      status: QuizAttemptStatus.SUBMITTED,
    },
  });

  // 13. Assignment for Lesson 2
  const assignment1 = await prisma.assignment.create({
    data: {
      lessonId: lesson2.id,
      title: 'واجب المتغيرات والعمليات الحسابية',
      description: 'اكتب برنامجاً يحسب المساحة والمحيط لمستطيل بناءً على مدخلات المستخدم.',
      dueDate: new Date(Date.now() + 86400000 * 3), // 3 days from now
      maxScore: 20.0,
      isPublished: true,
    },
  });

  // Student 1 Assignment Submission & Grading
  await prisma.studentAssignment.create({
    data: {
      assignmentId: assignment1.id,
      studentId: student1.id,
      submissionText: '# Solution in Python\nwidth = float(input())\nheight = float(input())\nprint(width * height)',
      fileUrl: 'https://storage.engcode.online/live_sol.py',
      storageKey: 'assignments/sub_student1.py',
      originalFilename: 'live_sol.py',
      fileSizeBytes: BigInt(512),
      mimeType: 'text/x-python',
      status: AssignmentStatus.GRADED,
      score: 19.5,
      feedback: 'ممتاز جداً! كود نظيف وتسمية متغيرات ممتازة.',
      submittedAt: new Date(Date.now() - 86400000),
      gradedAt: new Date(),
    },
  });

  // 14. Class Sessions & Attendance
  const session1 = await prisma.classSession.create({
    data: {
      groupId: groupA.id,
      lessonId: lesson1.id,
      sessionDate: new Date('2026-09-05T16:00:00Z'),
      topic: 'شرح خوارزميات التفكير المنطقي',
      status: SessionStatus.COMPLETED,
    },
  });

  await prisma.attendance.createMany({
    data: [
      { sessionId: session1.id, studentId: student1.id, status: AttendanceStatus.PRESENT },
      { sessionId: session1.id, studentId: student2.id, status: AttendanceStatus.PRESENT },
    ],
  });

  console.log('✔ EngCode database seed process completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
