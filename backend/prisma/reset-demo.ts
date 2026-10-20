// Clears demo activity while keeping the seeded accounts, classes, labs, tasks,
// and assignments. Run it between rehearsals so every demo starts at 0%.
//
//   docker compose exec backend npx tsx prisma/reset-demo.ts
//
// Remove the lab containers first; see scripts/reset-demo.ps1.

import { PrismaClient } from '@prisma/client';
import { removeSubmissionFile } from '../src/services/submission.service.js';

const prisma = new PrismaClient();

async function main() {
  const submissions = await prisma.submission.findMany({ select: { filePath: true } });

  const [commands, results, sessions, removedSubmissions] = await prisma.$transaction([
    prisma.commandLog.deleteMany(),
    prisma.taskResult.deleteMany(),
    prisma.session.deleteMany(),
    prisma.submission.deleteMany(),
  ]);

  for (const submission of submissions) {
    await removeSubmissionFile(submission.filePath);
  }

  console.log(
    `Demo state cleared: ${sessions.count} sessions, ${results.count} task results, ${commands.count} commands, ${removedSubmissions.count} submissions.`,
  );
  console.log('Kept: users, classes, memberships, labs, tasks, and assignments.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
