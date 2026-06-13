import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only our app/lib tests — never the Foundry dir or vendored OZ/forge-std test suites.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "app/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "contracts/**", ".next/**", ".audit-*/**"],
    environment: "node",
  },
});
