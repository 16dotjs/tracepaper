import { checkRequiredEnv } from "./lib/envCheck";

export async function register() {
  // instrumentation.ts can run in both the Node.js and Edge runtimes — this check
  // is Node-only (process.env access is fine everywhere, but we only want the
  // console output once, not duplicated across runtimes).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { missingRequired, missingOptionalWarnings } = checkRequiredEnv(
    process.env,
  );

  if (missingRequired.length > 0) {
    console.error("\n" + "=".repeat(60));
    console.error("⚠ MISSING REQUIRED ENVIRONMENT VARIABLE(S)");
    console.error("=".repeat(60));
    missingRequired.forEach((name) => console.error(` - ${name}`));
    console.error("\nAdd it to .env.local (see .env.example) before making");
    console.error("any real Claude API calls. Set USE_MOCK_CLAUDE=true in");
    console.error(".env.local to develop without a key.");
    console.error("=".repeat(60) + "\n");
  }

  missingOptionalWarnings.forEach((msg) => console.warn(`\nℹ ${msg}\n`));
}
