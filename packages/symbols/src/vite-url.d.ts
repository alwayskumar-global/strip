// Vite asset-URL imports. Only wasm-url.ts may use this (enforced by ESLint and a static test).
declare module "*?url" {
  const url: string;
  export default url;
}
