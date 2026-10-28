# PHASE 07 — CBT APPLICATION & EXAM ENGINE

## Objective
Build CBT as a separate application while reusing core identity/backend capabilities.

Domain:
`cbt.smpmuh3bdg.sch.id`

## Roles
- student
- teacher
- exam administrator

## Question Types
Plan for:
- multiple choice
- multiple select if required
- true/false
- essay
- image
- rich text
- mathematical notation

## Math
Use KaTeX or MathJax for fractions, exponents, equations, matrices, symbols and formulas.

## Question Bank
- categories
- subjects
- difficulty
- tags
- media
- answer keys
- explanations
- versioning if needed

## Exam
- creation
- schedule
- duration
- participant assignment
- randomization
- answer randomization
- attempts
- timer
- autosave
- submission
- automatic scoring
- manual grading
- results

## Performance
Plan around Redis, efficient DB writes, autosave, idempotency and concurrent students. Do not make every UI interaction a heavy DB transaction.

## Security
- session authorization
- attempt isolation
- server-side timing
- duplicate submission prevention
- audit events

## Done When
Students can reliably take exams and teachers can manage questions and results.
