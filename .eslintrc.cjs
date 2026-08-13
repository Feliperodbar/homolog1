/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
    project: [
      './tsconfig.base.json',
      './web/tsconfig.json',
      './shared/tsconfig.json',
      './extension/tsconfig.json',
    ],
    extraFileExtensions: ['.md'],
  },
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: [
          './tsconfig.base.json',
          './web/tsconfig.json',
          './shared/tsconfig.json',
          './extension/tsconfig.json',
        ],
      },
      node: true,
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-empty-interface': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    'import/no-unresolved': 'off',
    'import/namespace': 'off',
    'import/default': 'off',
    'import/export': 'off',
    'import/no-named-as-default': 'off',
    'import/no-named-as-default-member': 'off',
    'import/order': [
      'warn',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
          'object',
        ],
        'newlines-between': 'always',
      },
    ],
    'no-console': 'off',
    'no-control-regex': 'off',
  },
  overrides: [
    {
      files: ['web/src/**/*.{ts,tsx,js}'],
      rules: {
        'no-empty': 'off',
        'no-control-regex': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'import/order': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'dist-types',
    'node_modules',
    '*.min.js',
    'legacy',
  ],
};
