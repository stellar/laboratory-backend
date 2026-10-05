import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Compose only forwards the variables it enumerates under `environment:`, so
// anything documented in .env.example but missing there is silently dropped
// in a Compose deployment. Keep the two files in lockstep.
const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

const documentedEnvVars = (): string[] =>
  [...read(".env.example").matchAll(/^([A-Z0-9_]+)=/gm)].map(m => m[1]);

const forwardedEnvVars = (): string[] => {
  const compose = read("docker-compose.yml");
  const block = compose.match(/^\s+environment:\n((?:^\s{6}.*\n|^\n)+)/m);
  if (!block) {
    throw new Error("docker-compose.yml has no api environment block");
  }
  // Only `NAME: ${NAME:-default}` entries pass the host value through.
  return [...block[1].matchAll(/^\s{6}([A-Z0-9_]+):\s*\$\{\1:-.*\}$/gm)].map(
    m => m[1],
  );
};

describe("docker-compose.yml", () => {
  test("🟢forwards_every_variable_documented_in_env_example", () => {
    const documented = documentedEnvVars();
    const forwarded = forwardedEnvVars();

    expect(documented.length).toBeGreaterThan(0);
    expect([...forwarded].sort()).toEqual([...documented].sort());
  });
});
