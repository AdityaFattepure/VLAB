import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEACHER = {
  name: 'Dr. Meera Krishnan',
  email: 'teacher@vlab.dev',
  password: 'teacher123',
};

const STUDENTS = [
  { name: 'Aarav Sharma', email: 'student1@vlab.dev' },
  { name: 'Priya Patel', email: 'student2@vlab.dev' },
  { name: 'Rohan Mehta', email: 'student3@vlab.dev' },
  { name: 'Ananya Iyer', email: 'student4@vlab.dev' },
  { name: 'Kabir Singh', email: 'student5@vlab.dev' },
];

const STUDENT_PASSWORD = 'student123';
const CLASS_NAME = 'CBADL — Batch A';
const JOIN_CODE = 'CBADL1';

const DOCKER_LAB = {
  id: 'seed-lab-docker-basics',
  title: 'Docker Basics',
  template: 'docker-dind',
  description:
    'Your own isolated Docker daemon. Complete each task inside this terminal; the checker inspects the daemon state, not the command text.',
  tasks: [
    {
      order: 1,
      title: 'Run a container named web',
      description:
        'Start a container named web from the nginx image (nginx:alpine is already cached).\n\nExample: docker run -d --name web nginx:alpine',
      checkCommand: "docker ps --filter name=^/web$ --format '{{.Names}}'",
      expectedOutputContains: 'web',
      expectedExitCode: 0,
    },
    {
      order: 2,
      title: 'Build an image tagged myapp:v1',
      description:
        'Build the sample app at /root/app and tag it myapp:v1.\n\nExample: docker build -t myapp:v1 /root/app',
      checkCommand: "docker images --format '{{.Repository}}:{{.Tag}}' | grep -qx 'myapp:v1'",
      expectedOutputContains: null,
      expectedExitCode: 0,
    },
    {
      order: 3,
      title: 'Create a volume named data',
      description: 'Create a Docker volume named data.\n\nExample: docker volume create data',
      checkCommand: "docker volume ls -q | grep -qx 'data'",
      expectedOutputContains: null,
      expectedExitCode: 0,
    },
  ],
};

const LINUX_LAB = {
  id: 'seed-lab-linux-basics',
  title: 'Linux Basics',
  template: 'linux-basic',
  description: 'A plain Ubuntu container. Practise files and users; the checker verifies the filesystem.',
  tasks: [
    {
      order: 1,
      title: 'Create a file containing vlab',
      description: 'Create /root/lab/hello.txt with the word vlab in it.\n\nExample: echo vlab > /root/lab/hello.txt',
      checkCommand: "test -f /root/lab/hello.txt && grep -q vlab /root/lab/hello.txt",
      expectedOutputContains: null,
      expectedExitCode: 0,
    },
    {
      order: 2,
      title: 'Create a user named analyst',
      description: 'Add a Linux user called analyst.\n\nExample: useradd -m analyst',
      checkCommand: 'id analyst >/dev/null 2>&1',
      expectedOutputContains: null,
      expectedExitCode: 0,
    },
  ],
};

async function main() {
  const passwordHash = await bcrypt.hash(TEACHER.password, 10);
  const studentHash = await bcrypt.hash(STUDENT_PASSWORD, 10);

  const teacher = await prisma.user.upsert({
    where: { email: TEACHER.email },
    update: { name: TEACHER.name, role: 'teacher' },
    create: { name: TEACHER.name, email: TEACHER.email, passwordHash, role: 'teacher' },
  });

  const students = [];
  for (const s of STUDENTS) {
    students.push(
      await prisma.user.upsert({
        where: { email: s.email },
        update: { name: s.name, role: 'student' },
        create: { name: s.name, email: s.email, passwordHash: studentHash, role: 'student' },
      }),
    );
  }

  const klass = await prisma.class.upsert({
    where: { joinCode: JOIN_CODE },
    update: { name: CLASS_NAME, teacherId: teacher.id },
    create: { name: CLASS_NAME, joinCode: JOIN_CODE, teacherId: teacher.id },
  });

  for (const student of students) {
    await prisma.classMember.upsert({
      where: { classId_studentId: { classId: klass.id, studentId: student.id } },
      update: {},
      create: { classId: klass.id, studentId: student.id },
    });
  }

  async function upsertLab(lab: typeof DOCKER_LAB) {
    // Stable ids keep the seed idempotent even if the teacher renames a lab.
    // The title fallback adopts labs created before ids were pinned.
    const existing =
      (await prisma.lab.findUnique({ where: { id: lab.id } })) ??
      (await prisma.lab.findFirst({ where: { title: lab.title, createdBy: teacher.id } }));
    const row = existing
      ? await prisma.lab.update({
          where: { id: existing.id },
          data: { description: lab.description, template: lab.template },
        })
      : await prisma.lab.create({
          data: {
            id: lab.id,
            title: lab.title,
            description: lab.description,
            template: lab.template,
            createdBy: teacher.id,
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

  const dockerLab = await upsertLab(DOCKER_LAB);
  const linuxLab = await upsertLab(LINUX_LAB);

  const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  for (const lab of [dockerLab, linuxLab]) {
    await prisma.assignment.upsert({
      where: { labId_classId: { labId: lab.id, classId: klass.id } },
      update: { dueAt: due },
      create: { labId: lab.id, classId: klass.id, dueAt: due },
    });
  }

  console.log('Seed complete.');
  console.log(`  Teacher : ${TEACHER.email} / ${TEACHER.password}`);
  console.log(`  Students: student1@vlab.dev … student5@vlab.dev / ${STUDENT_PASSWORD}`);
  console.log(`  Class   : ${CLASS_NAME} (join code ${JOIN_CODE})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
