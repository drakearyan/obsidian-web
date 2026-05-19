/*
 * Dev-time splicer: rewrites the globe SVG block inside
 * WorldScrollSection.astro to use the orthographic-projected land
 * path produced by generate-globe-paths.mjs. Idempotent — re-running
 * rewrites the same block each time. Designed to be chained:
 *
 *   npm run globe:regenerate        # install + generate + splice
 *
 * Reads from scripts/cache/land-path.txt (written by the generator).
 * Resolves paths relative to the script location so it works from
 * any cwd.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const COMPONENT = join(REPO_ROOT, 'src/components/WorldScrollSection.astro');
const LAND_PATH_FILE = join(__dirname, 'cache', 'land-path.txt');

const land_d = (await readFile(LAND_PATH_FILE, 'utf8')).trim();
const file = await readFile(COMPONENT, 'utf8');

// Locate the continents block by the open marker (matches either the
// original hand-drawn comment or our regenerated comment) and the
// FAIRFAX PIN block as the end anchor. Idempotent — re-running just
// rewrites the same span each time.
const start = file.search(/^        <!-- CONTINENTS:/m);
const end = file.indexOf('        <!-- FAIRFAX PIN:');
if (start < 0 || end < 0) {
  throw new Error('Could not locate splice anchors. Did the markup change?');
}

const before = file.slice(0, start);
const after = file.slice(end);

const replacement = `        <!-- CONTINENTS: real orthographic-projected land paths
             from world-atlas/land-110m (Natural Earth, CC0). Generated
             via scripts/generate-globe-paths.mjs — re-run that script
             to regenerate after changing projection. -->
        <g class="globe-land" stroke-width="1.2" fill="none" clip-path="url(#globeClip)">
          <path d="${land_d}" />
        </g>

`;

const next = before + replacement + after;

// Pin sits at SVG (500, 500) under the Fairfax-centered projection,
// so transform-origin returns to dead center (50% 50%). Update both.
const final = next
  .replace(/cx="364\.3" cy="395\.1"/g, 'cx="500" cy="500"')
  .replace(/cx="456" cy="397"/g, 'cx="500" cy="500"')
  .replace(/Fairfax \(≈ [^)]*\)/, 'Fairfax (≈ 50%, 50% — projection-centered)')
  .replace(/transform-origin: 36\.4% 39\.5%;/, 'transform-origin: 50% 50%;')
  .replace(/transform-origin: 45\.6% 39\.7%;/, 'transform-origin: 50% 50%;');

await writeFile(COMPONENT, final, 'utf8');
console.log('Spliced.');
console.log(`  land_d length: ${land_d.length} chars`);
console.log(`  file size before: ${file.length}, after: ${final.length}`);
