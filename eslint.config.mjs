import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * One flat config for all three workspaces.
 *
 * There was no eslint config anywhere in this repo, and there never had been -
 * `make lint` and both packages' `lint` scripts have been documented and
 * broken since the first commit. So this is a config written against code that
 * has never been linted, and it is calibrated accordingly: the job is to catch
 * mistakes, not to declare 400 of them and demand that working code be
 * rewritten to satisfy a preference.
 *
 * ESLINT 9, EVERYWHERE. The packages were split - client on 8 (which wants
 * `.eslintrc`), server on 9 (which wants flat config) - so there was no single
 * config format that could cover both. Aligning on 9 is what makes ONE config
 * possible, and one config is the point: these three workspaces share types,
 * share a rules engine, and are edited together. The toolchain is declared in
 * the root `package.json` for the same reason.
 *
 * WHAT IS TURNED OFF, AND WHY. Every `off` below is a deliberate answer to code
 * that already exists and is not wrong:
 *
 *  - `no-explicit-any` — the server is `strict: false`/`noImplicitAny: false`
 *    ON PURPOSE (see its tsconfig), and Prisma's JSON columns are cast through
 *    `any` by design. Turning this on flags ~50 sites the type checker has
 *    already been told not to care about.
 *  - `no-non-null-assertion` — the tests use `callbacks.onMoveRejected!(...)`
 *    to say "this must have been registered", which is the assertion.
 *  - `react-refresh/only-export-components` — the plugin was in the client's
 *    devDependencies but, like everything else here, had never run. Its only
 *    complaint is `GameCard.tsx` exporting two helpers beside its components,
 *    and those helpers are re-exported through `styles/index.ts`. Satisfying it
 *    means splitting a working file and rewriting its importers to improve
 *    Fast Refresh in the dev server. That is a refactor a rule asked for, not a
 *    bug, so the rule is gone rather than blanket-disabled in place.
 *
 * Everything else stays on. The rules that survive are the ones that only fire
 * on real mistakes: an unused import, a floating `case` declaration, a
 * `useEffect` missing a dependency.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "client/playwright-report/**",
      "client/test-results/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // See the note above - both are answers to deliberate choices in this
      // codebase, not to sloppiness.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",

      // `interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}`
      // is not an empty type by accident - it is how a component names its
      // props, and five components here do it. `with-single-extends` keeps the
      // half of the rule that catches a genuinely empty `interface Foo {}`
      // (which really does mean "any non-nullish value") and drops the half
      // that flags the naming idiom.
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],

      // `_`-prefixed names are the codebase's existing convention for
      // "required by the signature, deliberately unused" -
      // `initializeSocket(_userId, token)`.
      //
      // `ignoreRestSiblings` covers the React idiom of destructuring a prop you
      // do not render PRECISELY so that `{...props}` cannot spread it onto a
      // DOM node. Note it only applies to variable declarations, not to
      // destructured PARAMETERS - which is exactly where components do this -
      // so `ui/game/PlayerArea.tsx` renames its two stripped props to `_`-
      // prefixed locals instead. It is set anyway for the declaration case.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // Server: Node, and decorators everywhere.
  // ---------------------------------------------------------------------
  {
    files: ["server/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },

  // ---------------------------------------------------------------------
  // Shared: the rules engine. Isomorphic - no Node, no DOM.
  // ---------------------------------------------------------------------
  {
    files: ["shared/**/*.ts"],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },

  // ---------------------------------------------------------------------
  // Client: React in the browser.
  // ---------------------------------------------------------------------
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // `rules-of-hooks` and `exhaustive-deps`. The latter is the reason this
      // plugin is worth having: a `useEffect` reading a value it did not
      // declare is a stale closure waiting to happen, and this codebase drives
      // a live socket out of effects.
      ...reactHooks.configs.recommended.rules,
    },
  },

  // ---------------------------------------------------------------------
  // Client tests and e2e: Node globals (playwright fixtures, vitest) on top of
  // the browser ones.
  // ---------------------------------------------------------------------
  {
    files: ["client/e2e/**/*.ts", "client/src/**/*.{test,spec}.{ts,tsx}", "client/src/test/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // ---------------------------------------------------------------------
  // Config files: Node, and they run outside the app.
  // ---------------------------------------------------------------------
  {
    files: ["**/*.config.{ts,mts,mjs,js}", "**/jest.config.js", "eslint.config.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  }
);
