import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { classDisplayName } from '../src/lib/class.logic.js';
import { DEMO_LABS, MANUAL_LABS, PRACTICE_LABS, type SeedLab } from './labs.js';

const prisma = new PrismaClient();

const TEACHER = {
  name: 'Dr. Meera Krishnan',
  email: 'teacher@vlab.dev',
  password: 'teacher123',
};

const STUDENTS = [
  { name: 'Aarav Sharma', email: 'student1@vlab.dev', classCode: 'CBADL1' },
  { name: 'Priya Patel', email: 'student2@vlab.dev', classCode: 'CBADL1' },
  { name: 'Rohan Mehta', email: 'student3@vlab.dev', classCode: 'CBADL1' },
  { name: 'Ananya Iyer', email: 'student4@vlab.dev', classCode: 'CBADL1' },
  { name: 'Kabir Singh', email: 'student5@vlab.dev', classCode: 'CBADL1' },
  { name: 'Ishita Rao', email: 'student6@vlab.dev', classCode: 'CBADL2' },
  { name: 'Dev Malhotra', email: 'student7@vlab.dev', classCode: 'CBADL2' },
  { name: 'Sara Khan', email: 'student8@vlab.dev', classCode: 'CBADL3' },
  { name: 'Nikhil Joshi', email: 'student9@vlab.dev', classCode: 'CBADL3' },
];

const STUDENT_PASSWORD = 'student123';

const CLASSES = [
  {
    joinCode: 'CBADL1',
    section: 'CC1',
    batch: 'A',
    schedule: 'Monday · 10:00–12:00',
    room: 'Lab 204',
  },
  {
    joinCode: 'CBADL2',
    section: 'CC1',
    batch: 'B',
    schedule: 'Wednesday · 10:00–12:00',
    room: 'Lab 204',
  },
  {
    joinCode: 'CBADL3',
    section: 'CC3',
    batch: 'A',
    schedule: 'Tuesday · 10:00–12:00',
    room: 'Lab 206',
  },
  {
    joinCode: 'CBADL4',
    section: 'CC3',
    batch: 'B',
    schedule: 'Thursday · 10:00–12:00',
    room: 'Lab 206',
  },
];

const COURSE = {
  courseCode: '23CSE3118',
  courseTitle: 'Container Based Application Development Lab',
  courseShort: 'CBAD',
};

const ASSIGNMENTS: Record<string, { labId: string; dueInDays: number; instructions: string }[]> = {
  CBADL1: [
    {
      labId: 'seed-lab-demo',
      dueInDays: 1,
      instructions:
        'Run the six short commands and open the Files and Docker tabs for your teacher.',
    },
    {
      labId: 'seed-lab-01',
      dueInDays: 3,
      instructions: 'Complete every task and upload the terminal screenshots for each step.',
    },
    {
      labId: 'seed-lab-02',
      dueInDays: 7,
      instructions: 'Submit the Dockerfile, the build output, and a screenshot of the Hello World page.',
    },
    {
      labId: 'seed-lab-03',
      dueInDays: 10,
      instructions: 'Submit the inspect JSON, the logs, and a screenshot of the replacement container.',
    },
    {
      labId: 'seed-lab-04',
      dueInDays: 14,
      instructions: 'Submit the service response, the docker run command, and the logs.',
    },
    {
      labId: 'seed-lab-05',
      dueInDays: 18,
      instructions: 'Submit a screenshot proving both containers share the network.',
    },
    {
      labId: 'seed-lab-06',
      dueInDays: 22,
      instructions: 'Submit the replica list before and after scaling down, plus the stats output.',
    },
    {
      labId: 'seed-lab-07',
      dueInDays: 25,
      instructions: 'Submit the stats, process list, health report, and your monitoring note.',
    },
  ],
  CBADL2: [
    {
      labId: 'seed-lab-01',
      dueInDays: 4,
      instructions: 'Complete the verification tasks and upload your screenshots.',
    },
    {
      labId: 'seed-lab-02',
      dueInDays: 8,
      instructions: 'Submit the Dockerfile and a screenshot of the running page.',
    },
  ],
  CBADL3: [
    {
      labId: 'seed-lab-03',
      dueInDays: 5,
      instructions: 'Submit the inspect output, the logs, and the final container screenshot.',
    },
    {
      labId: 'seed-lab-04',
      dueInDays: 9,
      instructions: 'Submit the service response and the command you used.',
    },
  ],
  CBADL4: [
    {
      labId: 'seed-lab-01',
      dueInDays: 6,
      instructions: 'Complete the verification tasks and upload your screenshots.',
    },
  ],
};

function dueDate(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

async function upsertLab(lab: SeedLab, teacherId: string) {
  // Stable ids keep the seed idempotent even if the teacher renames a lab.
  // The title fallback adopts labs created before ids were pinned.
  const existing =
    (await prisma.lab.findUnique({ where: { id: lab.id } })) ??
    (await prisma.lab.findFirst({ where: { title: lab.title, createdBy: teacherId } }));

  const row = existing
    ? await prisma.lab.update({
        where: { id: existing.id },
        data: {
          title: lab.title,
          description: lab.description,
          template: lab.template,
          code: lab.code,
          objective: lab.objective,
          co: lab.co,
          estimatedMinutes: lab.estimatedMinutes,
        },
      })
    : await prisma.lab.create({
        data: {
          id: lab.id,
          title: lab.title,
          description: lab.description,
          template: lab.template,
          code: lab.code,
          objective: lab.objective,
          co: lab.co,
          estimatedMinutes: lab.estimatedMinutes,
          createdBy: teacherId,
        },
      });

  for (const task of lab.tasks) {
    await prisma.task.upsert({
      where: { labId_order: { labId: row.id, order: task.order } },
      update: {
        title: task.title,
        description: task.description,
        checkCommand: task.checkCommand,
        expectedOutputContains: task.expectedOutputContains,
        expectedExitCode: task.expectedExitCode,
      },
      create: { labId: row.id, ...task },
    });
  }

  return row;
}

async function main() {
  const passwordHash = await bcrypt.hash(TEACHER.password, 10);
  const studentHash = await bcrypt.hash(STUDENT_PASSWORD, 10);

  const teacher = await prisma.user.upsert({
    where: { email: TEACHER.email },
    update: { name: TEACHER.name, role: 'teacher' },
    create: { name: TEACHER.name, email: TEACHER.email, passwordHash, role: 'teacher' },
  });

  const students = new Map<string, { id: string; name: string }>();
  for (const student of STUDENTS) {
    const row = await prisma.user.upsert({
      where: { email: student.email },
      update: { name: student.name, role: 'student' },
      create: {
        name: student.name,
        email: student.email,
        passwordHash: studentHash,
        role: 'student',
      },
    });
    students.set(student.email, row);
  }

  const classes = new Map<string, { id: string }>();
  for (const klass of CLASSES) {
    const meta = {
      ...COURSE,
      section: klass.section,
      batch: klass.batch,
      schedule: klass.schedule,
      room: klass.room,
    };
    const row = await prisma.class.upsert({
      where: { joinCode: klass.joinCode },
      update: { ...meta, name: classDisplayName(meta), teacherId: teacher.id },
      create: {
        ...meta,
        name: classDisplayName(meta),
        joinCode: klass.joinCode,
        teacherId: teacher.id,
      },
    });
    classes.set(klass.joinCode, row);
  }

  for (const student of STUDENTS) {
    const user = students.get(student.email);
    const klass = classes.get(student.classCode);
    if (!user || !klass) continue;
    await prisma.classMember.upsert({
      where: { classId_studentId: { classId: klass.id, studentId: user.id } },
      update: {},
      create: { classId: klass.id, studentId: user.id },
    });
  }

  const allSeededLabs = [...MANUAL_LABS, ...DEMO_LABS, ...PRACTICE_LABS];
  const labs = new Map<string, { id: string }>();
  for (const lab of allSeededLabs) {
    const row = await upsertLab(lab, teacher.id);
    labs.set(lab.id, row);
  }

  // Early builds created the practice labs with random ids. Remove those
  // duplicates so the library is exactly the seeded labs.
  const seededLabIds = allSeededLabs.map((lab) => lab.id);
  const legacyLabs = await prisma.lab.findMany({
    where: {
      createdBy: teacher.id,
      id: { notIn: seededLabIds },
      title: { in: ['Docker Basics', 'Linux Basics', 'Linux'] },
    },
    select: { id: true },
  });
  if (legacyLabs.length > 0) {
    await prisma.lab.deleteMany({
      where: { id: { in: legacyLabs.map((lab) => lab.id) } },
    });
  }

  // Keep the first section on the handout experiments plus the short demo
  // tour. Practice labs remain available in the library but are not part of
  // the teaching plan.
  const teachingLabIds = [...MANUAL_LABS, ...DEMO_LABS].map((lab) => lab.id);
  const firstClass = classes.get('CBADL1');
  if (firstClass) {
    await prisma.assignment.deleteMany({
      where: {
        classId: firstClass.id,
        labId: { notIn: teachingLabIds },
      },
    });
  }

  for (const [classCode, plan] of Object.entries(ASSIGNMENTS)) {
    const klass = classes.get(classCode);
    if (!klass) continue;
    for (const item of plan) {
      const lab = labs.get(item.labId);
      if (!lab) continue;
      await prisma.assignment.upsert({
        where: { labId_classId: { labId: lab.id, classId: klass.id } },
        update: {
          dueAt: dueDate(item.dueInDays),
          instructions: item.instructions,
          requiresSubmission: true,
        },
        create: {
          labId: lab.id,
          classId: klass.id,
          dueAt: dueDate(item.dueInDays),
          instructions: item.instructions,
          requiresSubmission: true,
        },
      });
    }
  }

  console.log('Seed complete.');
  console.log(`  Teacher : ${TEACHER.email} / ${TEACHER.password}`);
  console.log(`  Students: student1@vlab.dev … student9@vlab.dev / ${STUDENT_PASSWORD}`);
  console.log('  Classes :');
  for (const klass of CLASSES) {
    const row = classes.get(klass.joinCode);
    console.log(
      `    ${row?.id ?? '?'}  ${classDisplayName({ ...COURSE, section: klass.section, batch: klass.batch })} (${klass.joinCode})`,
    );
  }
  console.log(
    `  Labs    : ${MANUAL_LABS.length} handout + ${DEMO_LABS.length} demo + ${PRACTICE_LABS.length} practice`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
