// Minimal ambient declarations for Node APIs used by unit tests. @types/node is intentionally not installed.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
}
declare const process: { cwd(): string };
