// Minimal ambient declarations for the Node APIs used by tests and perf scripts.
// @types/node is intentionally not installed. Both tsconfig.test.json roots (test, perf) share this file,
// because two ambient declarations of `process` would conflict.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}
declare module "node:os" {
  export function cpus(): Array<{ model: string }>;
}
declare const process: {
  cwd(): string;
  version: string;
  env: Record<string, string | undefined>;
  hrtime: { bigint(): bigint };
  stdout: { write(text: string): boolean };
};
declare function setTimeout(callback: () => void, ms: number): unknown;
