// Downloads the instrument samples listed in src/app/core/models/instrument-sounds.json into
// public/samples/<instrument>/<note>.mp3. Run once after changing that list: node scripts/fetch-samples.mjs
// Source: FluidR3_GM rendered by gleitz/midi-js-soundfonts, CC BY 3.0 (see public/samples/LICENSE.md).
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const sounds = JSON.parse(await readFile(new URL('../src/app/core/models/instrument-sounds.json', import.meta.url), 'utf8'));

for (const [id, { soundfont, notes }] of Object.entries(sounds)) {
  const dir = new URL(`../public/samples/${id}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const note of notes) {
    const response = await fetch(`${BASE}/${soundfont}-mp3/${note}.mp3`);
    if (!response.ok) {
      throw new Error(`${soundfont}/${note}: HTTP ${response.status}`);
    }
    await writeFile(new URL(`${note}.mp3`, dir), Buffer.from(await response.arrayBuffer()));
  }
  console.log(`${id}: ${notes.length} samples`);
}
