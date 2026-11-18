import { describe, expect, it } from "vitest";
import { APP_CSP, SECURITY_HEADERS, STRIP_CSP } from "./csp.js";
import * as L from "./limits.js";
describe("limits (R9.1, R9.2, R9.3)", () => {
  it("equal the Requirements values", () => {
    expect([L.FILE_CAP_BYTES, L.PAPER_WARN_BYTES, L.PER_PAGE]).toEqual([262144, 65536, 9]);
    expect([L.FPS_MIN, L.FPS_MAX, L.FPS_DEFAULT, L.STEP_HISTORY]).toEqual([2, 15, 8, 256]);
    expect([L.STALL_TIMEOUT_MS, L.NOTHING_TIMEOUT_MS, L.REPEAT_HOLD_MS, L.VERIFY_SLOW_MS]).toEqual([20000, 30000, 1500, 100]);
    expect([L.IMAGE_MAX_BYTES, L.IMAGE_MAX_PHOTOS, L.IMAGE_LONG_SIDE]).toEqual([20 * 1024 * 1024, 24, 4096]);
    expect(L.MAX_PAYLOAD).toBe(L.FILE_CAP_BYTES + 422);
    expect(L.REPO_URL).toBe("https://github.com/alwayskumar-global/strip");
  });
});
describe("APP_CSP and headers (R15.1, R15.3)", () => {
  it("APP_CSP equals STRIP_CSP and includes worker-src 'self'", () => {
    expect(APP_CSP).toBe(STRIP_CSP);
    expect(APP_CSP).toContain("worker-src 'self'");
    expect(APP_CSP).not.toMatch(/'unsafe-eval'|'unsafe-inline'/);
  });
  it("SECURITY_HEADERS carries the four headers", () => {
    expect(Object.keys(SECURITY_HEADERS).sort()).toEqual(["Content-Security-Policy", "Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options"]);
    expect(SECURITY_HEADERS["Permissions-Policy"]).toBe("camera=(self)");
  });
});
