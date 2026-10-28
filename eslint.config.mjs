import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { ignores, rules } from './packages/config/eslint/base.js';

export default tseslint.config(
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules,
  },
);
