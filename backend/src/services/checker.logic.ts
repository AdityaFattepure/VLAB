/**
 * Pure task-check evaluation, kept free of Prisma and Docker imports so it can
 * be unit tested. `checker.service.ts` does the I/O and persistence; this file
 * only decides "did the command satisfy the task?" from one exec result.
 */

export interface ExecOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CheckExpectation {
  expectedExitCode: number;
  expectedOutputContains: string | null;
}

export interface CheckVerdict {
  passed: boolean;
  output: string;
}

// A check that prints something enormous should not bloat the database or the
// teacher dashboard; keep the tail of the stream out of the record.
const MAX_OUTPUT = 4000;

export function evaluateCheck(
  outcome: ExecOutcome,
  expectation: CheckExpectation,
  timeoutSeconds: number,
): CheckVerdict {
  const combined = `${outcome.stdout}${outcome.stderr ? `\n${outcome.stderr}` : ''}`
    .trim()
    .slice(0, MAX_OUTPUT);
  const output = outcome.timedOut ? `Timed out after ${timeoutSeconds}s\n${combined}` : combined;

  const passed =
    !outcome.timedOut &&
    outcome.exitCode === expectation.expectedExitCode &&
    // The reference text is matched against stdout only: stderr usually carries
    // warnings, and matching it would make checks pass on failure noise.
    (!expectation.expectedOutputContains || outcome.stdout.includes(expectation.expectedOutputContains));

  return { passed, output };
}
