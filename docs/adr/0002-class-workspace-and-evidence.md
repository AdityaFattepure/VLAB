# ADR 0002 — Class workspace, batch-specific assignments, and evidence submissions

Date: 2026-10-20
Status: Accepted

## Context

The first demo modelled one hard-coded class and two shallow practice labs. The
real subject is taught as CBAD to several sections, each split into batches that
meet on different days. The seven experiments come from the `23CSE3118` handout,
and students submit screenshots or documents as lab evidence.

A teacher must be able to move between classes without signing in again, and
different batches of the same section must be able to receive different labs.

## Decisions

### 1. A class is a course + section + batch

`Class` stores `courseCode`, `courseTitle`, `courseShort`, `section`, `batch`,
`schedule`, and `room`, and keeps its own join code and roster. The display name
is derived (`CBAD · CC1 · Batch A`), so renaming a section stays consistent.

**Why:** a teacher's teaching load is naturally a set of section/batch meetings.
Modelling the batch as a first-class class keeps join codes, assignments,
rosters, and dashboards unambiguous. The teacher overview switches by class id;
no second tenancy model is needed.

**Cost:** one course taught to four batches creates four class rows. That is the
intended grain, not duplication to normalize away.

### 2. Assignments belong to a class, not to a course

`Assignment` is unique on `(labId, classId)`. CC1 Batch A can receive Lab 3
while CC1 Batch B receives Lab 2, and both remain part of the same course.

### 3. Evidence is a `Submission` per assignment and student

A submission stores a note, optional file metadata, a path inside the uploads
volume, submitted/reviewed timestamps, feedback, and a grade. The unique key is
`(assignmentId, studentId)`, so resubmitting updates the same row.

Files are written under `UPLOADS_DIR/submissions/<submissionId>/`; downloads go
through an authenticated API route rather than exposing the upload directory.
Compose mounts `/app/data/uploads` on the `vlab-data` volume.

**Why:** this mirrors the classroom workflow (submit → review → feedback) while
keeping the storage local and easy to run for a demo. The allowed types are
images, PDF, Word, and ZIP; size is bounded by the 12 MB JSON body limit and the
submission validator.

### 4. The seven handout experiments replace the shallow practice content

`prisma/labs.ts` contains the seven experiments with objective, course outcome,
estimated time, and state-based checks. The two practice labs remain in the
library but are not part of the first section's teaching plan. The seed is
idempotent, cleans up legacy demo labs, and keeps the plan stable.

## Consequences

- Teacher and student pages are role-aware and class-aware; the same credentials
  always reopen the same account.
- A demo can show two batches receiving different labs and a reviewed submission
  without external services.
- Evidence storage is not object storage and has no virus scanning or export;
  those remain future work.
- The class grain means dashboards and analytics aggregate per section/batch,
  which is exactly how the teacher plans the week.
