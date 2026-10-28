/**
 * Shared flat ESLint config for the workspace.
 * Consumed by the root eslint.config.mjs; packages can extend it later.
 */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/next-env.d.ts',
];

export const rules = {
  '@typescript-eslint/no-explicit-any': 'error',
  // NB: `consistent-type-imports` intentionally omitted — NestJS DI relies on
  // constructor param types as injection tokens via emitDecoratorMetadata.
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
};
