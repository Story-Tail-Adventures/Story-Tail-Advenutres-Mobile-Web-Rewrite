import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * MUI imports that would take the color scheme away from components/ThemeScript.tsx.
 * InitColorSchemeScript writes the <html> class from MUI's own storage keys, and
 * useColorScheme is MUI's mode state; both fight `sta-theme` and cause a flash of the
 * wrong scheme. See components/mui/MuiRegistry.tsx. Icons and date pickers are separate
 * packages that would need a security review before they come in (CLAUDE.md).
 */
const MUI_RESTRICTED = {
  paths: [
    {
      name: "@mui/material",
      importNames: ["InitColorSchemeScript", "useColorScheme"],
      message: "ThemeScript owns the scheme. See components/mui/MuiRegistry.tsx.",
    },
    {
      name: "@mui/material/styles",
      importNames: ["useColorScheme"],
      message: "ThemeScript owns the scheme. See components/mui/MuiRegistry.tsx.",
    },
    {
      name: "@mui/material/InitColorSchemeScript",
      message: "ThemeScript owns the scheme. See components/mui/MuiRegistry.tsx.",
    },
  ],
  patterns: [
    {
      group: ["@mui/icons-material", "@mui/icons-material/*", "@mui/x-*", "@mui/x-*/*"],
      message: "Not installed. Icons come from components/ui/Icon; a new MUI package needs a security review first.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // A server action's signature is fixed by `useActionState` — it is handed
    // `(previousState, formData)` whether or not it wants both. Naming the ones it does not
    // use with a leading underscore is the convention for saying so; without this the rule
    // reports them, because its default only forgives unused arguments that come *before* a
    // used one.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    rules: {
      "no-restricted-imports": ["error", MUI_RESTRICTED],
      // theme.palette.* is the LIGHT palette baked in at build time; it does not change
      // under .scheme-dark. Use a palette path in sx ("surface.2") or theme.vars.palette.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='theme'][property.name='palette']",
          message: "theme.palette is light-only. Use an sx palette path or theme.vars.palette.",
        },
      ],
    },
  },
  {
    files: ["lib/mui/theme.ts", "**/*.test.ts", "**/*.test.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Pure data, imported from Node (scripts/*.mts generate Kotlin and brand assets from
    // these) and from Server Components without a client boundary. React, MUI, emotion or
    // a stylesheet in here would break the generators or drag a module into the client.
    files: [
      "components/ui/icon-paths.ts",
      "content/**/*.ts",
      "lib/mui/tokens.ts",
      "lib/mui/sx.ts",
      "lib/theme.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: MUI_RESTRICTED.paths,
          patterns: [
            ...MUI_RESTRICTED.patterns,
            {
              group: ["react", "react-dom", "react/*", "@mui/*", "@emotion/*", "next/*", "*.css"],
              message: "Keep this module pure data: no React, MUI, emotion, Next or CSS.",
            },
            {
              group: ["@/components/ui/Icon"],
              message: "Import IconName / ICON_NAMES from @/components/ui/icon-paths, which has no React.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
