import { describe, expect, it } from 'vitest';
import { evaluateCheck, type ExecOutcome } from './checker.logic.js';

function outcome(partial: Partial<ExecOutcome> = {}): ExecOutcome {
  return { exitCode: 0, stdout: '', stderr: '', timedOut: false, ...partial };
}

const expectNothing = { expectedExitCode: 0, expectedOutputContains: null };

describe('evaluateCheck', () => {
  it('passes when the command exits with the expected code', () => {
    expect(evaluateCheck(outcome({ exitCode: 0 }), expectNothing, 15).passed).toBe(true);
  });

  it('passes a non-zero expected exit code when it matches', () => {
    const expectation = { expectedExitCode: 2, expectedOutputContains: null };
    expect(evaluateCheck(outcome({ exitCode: 2 }), expectation, 15).passed).toBe(true);
  });

  it('fails when the exit code differs', () => {
    expect(evaluateCheck(outcome({ exitCode: 1 }), expectNothing, 15).passed).toBe(false);
  });

  it('fails when the command never produced an exit code', () => {
    expect(evaluateCheck(outcome({ exitCode: null }), expectNothing, 15).passed).toBe(false);
  });

  it('passes when stdout contains the expected text', () => {
    const expectation = { expectedExitCode: 0, expectedOutputContains: 'web' };
    expect(evaluateCheck(outcome({ stdout: 'web\n' }), expectation, 15).passed).toBe(true);
  });

  it('fails when the expected text is missing from stdout', () => {
    const expectation = { expectedExitCode: 0, expectedOutputContains: 'web' };
    expect(evaluateCheck(outcome({ stdout: 'db\n' }), expectation, 15).passed).toBe(false);
  });

  it('does not match the expected text against stderr', () => {
    const expectation = { expectedExitCode: 0, expectedOutputContains: 'web' };
    expect(evaluateCheck(outcome({ stdout: '', stderr: 'web\n' }), expectation, 15).passed).toBe(false);
  });

  it('matches the expected text case-sensitively', () => {
    const expectation = { expectedExitCode: 0, expectedOutputContains: 'myapp:v1' };
    expect(evaluateCheck(outcome({ stdout: 'MyApp:V1\n' }), expectation, 15).passed).toBe(false);
  });

  it('treats an empty expected-output string as no requirement', () => {
    const expectation = { expectedExitCode: 0, expectedOutputContains: '' };
    expect(evaluateCheck(outcome({ stdout: 'anything' }), expectation, 15).passed).toBe(true);
  });

  it('fails a check that timed out even when the exit code looks clean', () => {
    const verdict = evaluateCheck(outcome({ exitCode: 0, timedOut: true }), expectNothing, 15);
    expect(verdict.passed).toBe(false);
    expect(verdict.output.startsWith('Timed out after 15s')).toBe(true);
  });

  it('combines stdout and stderr for the recorded output', () => {
    const verdict = evaluateCheck(outcome({ stdout: 'out', stderr: 'err' }), expectNothing, 15);
    expect(verdict.output).toBe('out\nerr');
  });

  it('trims whitespace around the recorded output', () => {
    const verdict = evaluateCheck(outcome({ stdout: '  out\n\n' }), expectNothing, 15);
    expect(verdict.output).toBe('out');
  });

  it('truncates a noisy command to 4000 characters', () => {
    const verdict = evaluateCheck(outcome({ stdout: 'x'.repeat(5000) }), expectNothing, 15);
    expect(verdict.output).toHaveLength(4000);
  });

  it('keeps the timed-out marker even when the command printed a lot', () => {
    const verdict = evaluateCheck(outcome({ stdout: 'x'.repeat(5000), timedOut: true }), expectNothing, 30);
    expect(verdict.output.startsWith('Timed out after 30s\n')).toBe(true);
    expect(verdict.output).toContain('x'.repeat(4000));
  });
});
