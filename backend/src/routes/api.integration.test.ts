import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'integration-test-secret';
process.env.UPLOADS_DIR = path.resolve(process.cwd(), 'uploads-test');

let app: ReturnType<typeof import('../app.js').createApp>;
let prisma: PrismaClient;

describe('teacher / class / assignment / submission flow', () => {
  const teacher = { name: 'Test Teacher', email: 'teacher.integration@vlab.dev', password: 'secret123' };
  const student = { name: 'Test Student', email: 'student.integration@vlab.dev', password: 'secret123' };
  const outsider = { name: 'Other Student', email: 'outsider.integration@vlab.dev', password: 'secret123' };

  let teacherToken = '';
  let studentToken = '';
  let outsiderToken = '';
  let classId = '';
  let joinCode = '';
  let labId = '';
  let assignmentId = '';
  let submissionId = '';

  beforeAll(async () => {
    const backendRoot = process.cwd();
    for (const file of ['prisma/test.db', 'prisma/test.db-journal']) {
      rmSync(path.join(backendRoot, file), { force: true });
    }
    rmSync(path.resolve(backendRoot, 'uploads-test'), { recursive: true, force: true });

    execSync('npx prisma db push --skip-generate --force-reset', {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: 'file:./test.db' },
      stdio: 'pipe',
    });

    const appModule = await import('../app.js');
    const prismaModule = await import('../prisma.js');
    prisma = prismaModule.prisma;
    app = appModule.createApp();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(path.resolve(process.cwd(), 'uploads-test'), { recursive: true, force: true });
  });

  it('creates a teacher account and keeps it on the same credentials', async () => {
    const created = await request(app).post('/api/auth/register').send({ ...teacher, role: 'teacher' });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe('teacher');
    teacherToken = created.body.token;

    const duplicate = await request(app)
      .post('/api/auth/register')
      .send({ ...teacher, role: 'teacher' });
    expect(duplicate.status).toBe(409);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: teacher.email.toUpperCase(), password: teacher.password });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(created.body.user.id);
    expect(login.body.user.role).toBe('teacher');
    teacherToken = login.body.token;
  });

  it('creates a section/batch and joins with the generated code', async () => {
    const created = await request(app)
      .post('/api/classes')
      .set('authorization', `Bearer ${teacherToken}`)
      .send({
        courseShort: 'CBAD',
        section: 'CC1',
        batch: 'A',
        schedule: 'Monday · 10:00–12:00',
        room: 'Lab 204',
      });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe('CBAD · CC1 · Batch A');
    expect(created.body.joinCode).toHaveLength(6);
    classId = created.body.id;
    joinCode = created.body.joinCode;

    const registered = await request(app)
      .post('/api/auth/register')
      .send({ ...student, role: 'student' });
    expect(registered.status).toBe(201);
    studentToken = registered.body.token;

    const join = await request(app)
      .post('/api/classes/join')
      .set('authorization', `Bearer ${studentToken}`)
      .send({ code: joinCode.toLowerCase() });
    expect(join.status).toBe(200);
    expect(join.body.name).toBe('CBAD · CC1 · Batch A');
  });

  it('assigns a lab to that class and shows it only to its students', async () => {
    const lab = await request(app)
      .post('/api/labs')
      .set('authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Integration Docker lab',
        template: 'docker-dind',
        code: 'Lab T',
        objective: 'Prove the assignment path',
        co: 'CO1',
        estimatedMinutes: 30,
      });
    expect(lab.status).toBe(201);
    labId = lab.body.id;

    const task = await request(app)
      .post(`/api/labs/${labId}/tasks`)
      .set('authorization', `Bearer ${teacherToken}`)
      .send({
        title: 'Run a container',
        description: 'docker run -d --name web nginx:alpine',
        checkCommand: "docker ps --format '{{.Names}}' | grep -qx web",
      });
    expect(task.status).toBe(201);

    const assignment = await request(app)
      .post('/api/assignments')
      .set('authorization', `Bearer ${teacherToken}`)
      .send({
        labId,
        classId,
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        instructions: 'Upload one PDF with a screenshot of every step.',
        requiresSubmission: true,
      });
    expect(assignment.status).toBe(201);
    assignmentId = assignment.body.id;

    const mine = await request(app)
      .get('/api/assignments/mine')
      .set('authorization', `Bearer ${studentToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].lab.code).toBe('Lab T');
    expect(mine.body[0].instructions).toContain('one PDF');

    const outsiderResponse = await request(app)
      .post('/api/auth/register')
      .send({ ...outsider, role: 'student' });
    outsiderToken = outsiderResponse.body.token;

    const outsidersMine = await request(app)
      .get('/api/assignments/mine')
      .set('authorization', `Bearer ${outsiderToken}`);
    expect(outsidersMine.body).toHaveLength(0);
  });

  it('accepts evidence from an enrolled student only', async () => {
    const base64 = Buffer.from('fake png evidence').toString('base64');
    const submission = await request(app)
      .put(`/api/assignments/${assignmentId}/submission`)
      .set('authorization', `Bearer ${studentToken}`)
      .send({
        note: 'Screenshot of every step',
        fileName: 'lab.png',
        fileType: 'image/png',
        dataBase64: `data:image/png;base64,${base64}`,
      });

    expect(submission.status).toBe(201);
    expect(submission.body.status).toBe('submitted');
    expect(submission.body.fileUrl).toContain('/api/assignments/submissions/');
    submissionId = submission.body.id;

    const rejected = await request(app)
      .put(`/api/assignments/${assignmentId}/submission`)
      .set('authorization', `Bearer ${outsiderToken}`)
      .send({ note: 'I am not in this class' });
    expect(rejected.status).toBe(403);

    const file = await request(app)
      .get(`/api/assignments/submissions/${submissionId}/file`)
      .set('authorization', `Bearer ${studentToken}`);
    expect(file.status).toBe(200);
  });

  it('lets the owning teacher review the evidence and the student sees it', async () => {
    const roster = await request(app)
      .get(`/api/assignments/${assignmentId}/submissions`)
      .set('authorization', `Bearer ${teacherToken}`);
    expect(roster.status).toBe(200);
    expect(roster.body.students[0].submission.status).toBe('submitted');

    const review = await request(app)
      .post(`/api/assignments/${assignmentId}/submission/review`)
      .set('authorization', `Bearer ${teacherToken}`)
      .send({ studentId: roster.body.students[0].id, feedback: 'Clear evidence.', grade: 92 });
    expect(review.status).toBe(200);
    expect(review.body.status).toBe('reviewed');
    expect(review.body.grade).toBe(92);

    const mine = await request(app)
      .get('/api/assignments/mine')
      .set('authorization', `Bearer ${studentToken}`);
    expect(mine.body[0].submission.status).toBe('reviewed');
    expect(mine.body[0].submission.feedback).toBe('Clear evidence.');
    expect(mine.body[0].submission.grade).toBe(92);
  });

  it('rejects an evidence file type that is not on the allow list', async () => {
    const rejected = await request(app)
      .put(`/api/assignments/${assignmentId}/submission`)
      .set('authorization', `Bearer ${studentToken}`)
      .send({
        note: 'bad file',
        fileName: 'payload.exe',
        fileType: 'application/x-msdownload',
        dataBase64: Buffer.from('nope').toString('base64'),
      });
    expect(rejected.status).toBe(400);
  });

  it('lets the teacher change class details without changing the join code', async () => {
    const updated = await request(app)
      .patch(`/api/classes/${classId}`)
      .set('authorization', `Bearer ${teacherToken}`)
      .send({ schedule: 'Friday · 14:00–16:00', room: 'Lab 301' });

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('CBAD · CC1 · Batch A');
    expect(updated.body.schedule).toBe('Friday · 14:00–16:00');
    expect(updated.body.room).toBe('Lab 301');
    expect(updated.body.joinCode).toBe(joinCode);
  });

  it('protects session workspace routes and rejects unsafe file input', async () => {
    const missing = await request(app)
      .get('/api/sessions/not-a-session/files')
      .set('authorization', `Bearer ${studentToken}`);
    expect(missing.status).toBe(404);

    const noToken = await request(app).get('/api/sessions/not-a-session/files');
    expect(noToken.status).toBe(401);

    const studentUser = await prisma.user.findUniqueOrThrow({ where: { email: student.email } });
    const session = await prisma.session.create({
      data: {
        assignmentId,
        studentId: studentUser.id,
        status: 'ready',
        containerId: 'fake-container',
        containerName: 'fake-container',
      },
    });

    const teacherWrite = await request(app)
      .put(`/api/sessions/${session.id}/files/content`)
      .set('authorization', `Bearer ${teacherToken}`)
      .send({ path: '/root/a.txt', content: 'x' });
    expect(teacherWrite.status).toBe(403);

    const outsiderRead = await request(app)
      .get(`/api/sessions/${session.id}/files`)
      .set('authorization', `Bearer ${outsiderToken}`);
    expect(outsiderRead.status).toBe(403);

    const traversal = await request(app)
      .put(`/api/sessions/${session.id}/files/content`)
      .set('authorization', `Bearer ${studentToken}`)
      .send({ path: '/root/../etc/passwd', content: 'nope' });
    expect(traversal.status).toBe(400);

    const outsideRead = await request(app)
      .get(`/api/sessions/${session.id}/files?path=/etc/passwd`)
      .set('authorization', `Bearer ${studentToken}`);
    expect(outsideRead.status).toBe(400);

    const rootWrite = await request(app)
      .put(`/api/sessions/${session.id}/files/content`)
      .set('authorization', `Bearer ${studentToken}`)
      .send({ path: '/root', content: 'nope' });
    expect(rootWrite.status).toBe(400);

    const nulContent = await request(app)
      .put(`/api/sessions/${session.id}/files/content`)
      .set('authorization', `Bearer ${studentToken}`)
      .send({ path: '/root/a.txt', content: 'a\u0000b' });
    expect(nulContent.status).toBe(400);

    const oversized = await request(app)
      .put(`/api/sessions/${session.id}/files/content`)
      .set('authorization', `Bearer ${studentToken}`)
      .send({ path: '/root/a.txt', content: 'x'.repeat(262_145) });
    expect(oversized.status).toBe(413);
  });
});
