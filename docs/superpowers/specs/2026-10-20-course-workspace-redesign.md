# Course workspace redesign — design

Date: 2026-10-20
Status: accepted for implementation (user asked for the work directly)

## Intent

Turn VLab from a single-class demo into a credible teaching workspace for the real
Container Based Application Development Lab (23CSE3118, MIT ADT University).

The user reviewed the student and teacher perspectives and reported:

1. The login footer showed an informal review label and felt unprofessional.
2. The dark neon/glow visual language did not look like a college product.
3. Teacher self-registration was missing; it was unclear where accounts live and
   whether the same credentials reopen the same account.
4. The seeded class name "CBADL — Batch A" hid the real structure: a teacher
   teaches several sections (CC1, CC3), each with batches A and B, on different
   days.
5. The teacher was forced into one class and could not switch class, batch, or
   subject.
6. "Docker Basics" was too shallow; the real handout has seven experiments.
7. A teacher needs to assign different labs to different batches of the same
   section.
8. The real assessment flow is evidence-based: students take screenshots, build a
   Word file, and submit it to the class. The app should support that.

## Goals

- A clean, light, academic UI with a restrained navy accent. No glow, neon,
  animated blobs, or informal review language.
- Teacher accounts can be created from the sign-in screen. Accounts live in the
  lab database; email is unique, so the same credentials always reopen the same
  account.
- A teacher lands on a class overview, not one hard-coded class. They can switch
  between classes and create a new section/batch.
- Classes carry course, section, batch, schedule, room, and a join code.
- A lab library seeded with the seven real CBAD experiments plus the existing
  practice labs.
- Assignments are per class/batch, so Lab 3 can go to CC1 Batch A while Lab 2
  goes to CC1 Batch B.
- Students can attach screenshot/PDF/Word evidence and a note to each
  assignment; teachers can review it, leave feedback, and record a mark.
- Unit tests cover the new pure logic; an API integration test covers the new
  auth/class/assignment/submission path; the Docker smoke test keeps covering
  the real lab lifecycle.

## Non-goals

- No Google Classroom integration or OAuth.
- No file storage in S3; uploads go to `backend/uploads/` (or the mounted data
  volume in Compose).
- No gradebook export, attendance, or timetable engine.
- No real Prometheus/Grafana deployment in the monitoring lab; the lab teaches
  the monitoring workflow with `docker stats`, `docker top`, and `docker inspect`.
- No change to the container isolation model: only the backend holds the host
  Docker socket.

## Data model changes

`Class` gains `courseCode`, `courseTitle`, `section`, `batch`, `schedule`, `room`.
`name` remains the display label (for example `CBAD · CC1 · Batch A`).

`Lab` gains `code`, `objective`, `co`, `estimatedMinutes` so the library reads
like the handout.

`Assignment` gains `instructions` and `requiresSubmission`.

New `Submission`:

- one row per `(assignment, student)`
- `status`: `draft | submitted | reviewed`
- `note`, file metadata (`fileName`, `fileType`, `fileSize`, `filePath`)
- `submittedAt`, `reviewedAt`, `feedback`, `grade`

## API additions

- `POST /api/auth/register` accepts `role` (`student` or `teacher`).
- `POST /api/classes` accepts course/section/batch/schedule/room.
- `PATCH /api/classes/:id` edits those fields.
- `POST /api/assignments` accepts instructions/requiresSubmission.
- `GET /api/assignments/mine` returns submission state.
- `PUT /api/assignments/:id/submission` uploads evidence (base64 JSON).
- `POST /api/assignments/:id/submission/review` records feedback/grade.
- `GET /api/assignments/submissions/:id/file` serves the evidence to an
  authorised student or the owning teacher.

## UX shape

- `/login` — navy/white split. Sign in / create account, role selector on
  registration, demo accounts, one clear line about persistence.
- `/teacher` — class overview: stats, class cards with section/batch/schedule,
  join code, roster and assignment counts, create-class form.
- `/teacher/classes/:id` — class workspace: class switcher, assignment selector,
  assignment manager (assign a lab to this class/batch), student × task grid,
  submission status column, evidence review panel, activity feed, live student
  drawer.
- `/teacher/labs` — lab library/editor with the handout metadata.
- `/student` — assignments grouped by class, each with progress, due date,
  submission state, open-lab action, and evidence dialog.
- `/student/session/:id` — light chrome around the existing dark terminal.

## Seed

Teacher `teacher@vlab.dev / teacher123`.

Four classes for the demo teacher:

| Class | Section | Batch | Join code | Schedule |
| --- | --- | --- | --- | --- |
| CBAD · CC1 · Batch A | CC1 | A | CBADL1 | Monday, 10:00 |
| CBAD · CC1 · Batch B | CC1 | B | CBADL2 | Wednesday, 10:00 |
| CBAD · CC3 · Batch A | CC3 | A | CBADL3 | Tuesday, 10:00 |
| CBAD · CC3 · Batch B | CC3 | B | CBADL4 | Thursday, 10:00 |

Seven labs from the handout, with tasks whose checks inspect real container
state. Existing Docker/Linux practice labs stay available.

## Verification

- `backend: npm test` — pure logic plus API integration tests.
- `backend: npm run typecheck`.
- `frontend: npm run build`.
- `backend: npm run smoke` against a running stack for the full Docker path.
- Manual browser pass over login, teacher overview, class workspace, student
  assignments, and evidence upload.
