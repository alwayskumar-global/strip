// Minimal ambient declarations for the Node APIs used by tests.
// @types/node is intentionally not installed.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}
declare const process: { cwd(): string };
declare function setTimeout(callback: () => void, ms: number): unknown;
