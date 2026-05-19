/*
 * Dev-time generator: produces orthographic-projection SVG path data
 * for the WorldScrollSection globe and writes it to a cache file the
 * splicer can read. Re-run whenever the projection center / scale /
 * source dataset changes:
 *
 *   npm run globe:regenerate        # runs install + generate + splice
 *
 * Or step-by-step:
 *
 *   npm install --no-save d3-geo topojson-client world-atlas
 *   node scripts/generate-globe-paths.mjs
 *   node scripts/splice-globe-paths.mjs
 *
 * The d3 + world-atlas dependencies are intentionally NOT in
 * package.json — they're tooling-only, used to bake a static SVG
 * path that ships inlined in WorldScrollSection.astro. The npm
 * script above installs them on demand without modifying the
 * project's runtime dependency surface.
 *
 * Output: scripts/cache/land-path.txt (the single big `d=` blob).
 * stdout: a one-line summary (path char count + Fairfax pin coords)
 * for sanity-checking after regeneration.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, 'cache');
const OUTPUT_FILE = join(CACHE_DIR, 'land-path.txt');

// 110-million-resolution Natural Earth dataset (small, low-detail —
// perfect for a hero illustration that scales 14× without dragging
// in megabytes of coastline noise).
const land_path = require.resolve('world-atlas/land-110m.json');
const land_topo = JSON.parse(await readFile(land_path, 'utf8'));
const land_geo = feature(land_topo, land_topo.objects.land);

// Orthographic projection — view-from-space, centered on Fairfax
// (-77.30°W, 38.85°N) so the pin projects to SVG (500, 500) and the
// CSS scale transform (transform-origin: 50% 50%) zooms straight
// into the pin from viewport center. North America dominates the
// visible hemisphere; western edges of Europe/Africa rim the right
// side of the globe at p=0, giving a credible "from space" read
// without needing the Atlantic centering that pushed the pin
// off-screen.
//   rotate = [-longitude_center, -latitude_center, roll]
const projection = geoOrthographic()
  .scale(380)
  .translate([500, 500])
  .rotate([77.30, -38.85, 0])
  .clipAngle(90); // only render the visible hemisphere

const path = geoPath(projection);
const land_d = path(land_geo) || '';
const fairfax = projection([-77.30, 38.85]);

await mkdir(CACHE_DIR, { recursive: true });
await writeFile(OUTPUT_FILE, land_d, 'utf8');

console.log(`wrote ${land_d.length} chars to ${OUTPUT_FILE}`);
console.log(`fairfax pin projects to: (${fairfax ? fairfax.map((n) => n.toFixed(1)).join(', ') : 'OUTSIDE HEMISPHERE'})`);
