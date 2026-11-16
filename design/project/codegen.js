/* Strip sample-code generator (design mock only, NOT the real encoder).
   StripCode.make(n, seed, quiet) -> { d, size }
   d    : one SVG path of the dark modules (viewBox 0 0 size size)
   size : n + 2*quiet
   Three square finders + one registration square mark orientation.
   Pure data; no DOM, no inline styles. */
(function () {
  function rng(seed) {
    var s = Math.imul(seed + 1, 2654435761) | 0;
    if (s === 0) s = 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }
  function make(n, seed, quiet) {
    quiet = quiet == null ? 4 : quiet;
    var r = rng(seed || 1), g = [], x, y;
    for (y = 0; y < n; y++) { g.push([]); for (x = 0; x < n; x++) g[y].push(r() < 0.5 ? 1 : 0); }
    function box(x0, y0, w, h, v) { for (var j = y0; j < y0 + h; j++) for (var i = x0; i < x0 + w; i++) if (g[j] && g[j][i] !== undefined) g[j][i] = v; }
    function finder(x0, y0) {
      box(x0 - 1, y0 - 1, 9, 9, 0);          // separator
      box(x0, y0, 7, 7, 1);
      box(x0 + 1, y0 + 1, 5, 5, 0);
      box(x0 + 2, y0 + 2, 3, 3, 1);
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    // timing rails between finders
    for (x = 8; x < n - 8; x++) g[6][x] = x % 2 === 0 ? 1 : 0;
    for (y = 8; y < n - 8; y++) g[y][6] = y % 2 === 0 ? 1 : 0;
    // registration square, bottom-right
    var a = n - 9;
    box(a - 1, a - 1, 7, 7, 0); box(a, a, 5, 5, 1); box(a + 1, a + 1, 3, 3, 0); box(a + 2, a + 2, 1, 1, 1);
    var d = '';
    for (y = 0; y < n; y++) {
      x = 0;
      while (x < n) {
        if (g[y][x]) { var s = x; while (x < n && g[y][x]) x++; d += 'M' + (s + quiet) + ' ' + (y + quiet) + 'h' + (x - s) + 'v1h-' + (x - s) + 'z'; }
        else x++;
      }
    }
    return { d: d, size: n + 2 * quiet };
  }
  window.StripCode = { make: make };
})();
