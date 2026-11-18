// The only definitions of the app's limits and timings (R9.1, R9.2, R9.3). Everything else imports from here.
export const FILE_CAP_BYTES = 262_144; // 256 KB
export const PAPER_WARN_BYTES = 65_536; // 64 KB: the paper path warns above this
export const PER_PAGE = 9; // symbols per printed sheet, 3 x 3
export const FPS_MIN = 2;
export const FPS_MAX = 15;
export const FPS_DEFAULT = 8;
export const STEP_HISTORY = 256; // packets kept for Previous
export const STALL_TIMEOUT_MS = 20_000; // no new block after the first accepted packet
export const NOTHING_TIMEOUT_MS = 30_000; // camera on, no symbol read at all
export const REPEAT_HOLD_MS = 1500; // how long the 'repeat' phase may stay on screen
export const VERIFY_SLOW_MS = 100; // the verify phase shows only if a push takes longer
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB per image
export const IMAGE_MAX_PHOTOS = 24; // per session
export const IMAGE_LONG_SIDE = 4096; // longer images are resized to this long side
/** Coded stream cap handed to the codec: payload cap plus the largest record (name and MIME limits) the codec allows. */
export const MAX_PAYLOAD = FILE_CAP_BYTES + 422;
export const REPO_URL = "https://github.com/alwayskumar-global/strip";
