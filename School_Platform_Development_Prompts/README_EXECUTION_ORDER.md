# HOW TO USE THE PROMPTS

Use these files in numerical order.

1. Read `00_MASTER_PROJECT_RULES.md`.
2. Run Phase 00.
3. Only after Phase 00 is stable, run Phase 01.
4. After the core is stable, prioritize Phase 02: SPMB landing page.
5. Continue sequentially unless the project owner explicitly changes the roadmap.

## Agent Workflow for Every Phase
1. Read master rules.
2. Read previous phase documentation.
3. Inspect actual repository state.
4. Compare the requested phase with what already exists.
5. Create a concise implementation plan.
6. Implement incrementally.
7. Run tests/typecheck/lint/build.
8. Update documentation.
9. Mark completed/deferred items.
10. State known issues.
11. State the next recommended phase.

## Important
Do not generate maximum code just because the prompt is long.

The project is intentionally phased.

The goal is a maintainable production system that can be developed by a professional developer over time.

Never invent real school data, external credentials, undocumented APIs or production integrations.
