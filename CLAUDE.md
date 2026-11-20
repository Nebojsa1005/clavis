# Clavis — uputstva za Claude

## UI komponente → uvek Spartan MCP

Za **bilo šta** vezano za UI komponente (dodavanje nove, menjanje postojeće, API, primeri,
pristupačnost, zavisnosti) koristi **Spartan MCP server `spartan-ui`** pre nego što pišeš kod.
Ne oslanjaj se na sećanje o Spartan API-ju.

1. Prebaci MCP keš na verziju iz projekta: `spartan_cache_switch_version` → `0.0.1-alpha.707`.
2. Primeri i API: `spartan_components_get` (`extract: "code"` / `"api"`), zavisnosti:
   `spartan_components_dependencies`, pristupačnost: `spartan_accessibility_check`.
3. MCP dokumentacija dolazi sa živog sajta (Spartan 1.x). **Projekat je na `@spartan-ng/brain@0.0.1-alpha.707`**
   (poslednja verzija za Angular 20) — svaki API iz MCP primera proveri u
   `node_modules/@spartan-ng/brain/<komponenta>/index.d.ts` pre upotrebe.
   Primer: `provideBrnTooltipGroup` postoji u 1.x, a u alpha.707 ne.
4. Helm kod generiši CLI-jem iste verzije (on odgovara instaliranom brain-u), ne kopiraj sa sajta:
   `npx ng g @spartan-ng/cli:ui <ime> --interactive=false` → `src/app/ui/<ime>/`, import kao
   `@spartan-ng/helm/<ime>`.

Ako MCP alati nisu učitani u sesiji: `/mcp` → reconnect `spartan-ui`.

## Vizuelni sistem (ukratko)

- Tokeni su u `src/tailwind.css`: neutral skala `--color-neutral-50…950` → semantički alias-i
  (`--background`, `--foreground`, `--border`, `--muted-foreground`, `--active-mark`…). U komponentama
  koristi alias-e, nikad sirove hex vrednosti.
- `dark:` varijanta je vezana za `.dark` klasu, ne za OS podešavanje (dark tokeni još ne postoje).
- Monohrom: "aktivno" u UI-ju = ink (`--active-mark`). **Plava (`--color-accent`) je rezervisana za
  selekciju/kursor nota u partituri** i mora pratiti `SELECTED_NOTE_COLOR` u
  `notation-renderer.service.ts`. Crvena (`--destructive`) samo za nepovratne akcije.
- Ikone su SVG (stroke 1.5, `currentColor`), nikad emoji/unicode simboli. Notni simboli dolaze iz
  `src/app/shared/smufl-glyphs.ts` (Bravura, OFL) — bez učitavanja VexFlow-a van editora.
- Nativni `title` ne koristi za pomoć na kontrolama — koristi `hlmTooltip` (+ `position`).
  Dugmad samo sa ikonom moraju imati `aria-label`.
- Tailwind preflight je u `@layer base`; nevezani component SCSS ga uvek pobeđuje — ne piši
  SCSS pravila koja gaze helm utility klase (npr. `.toolbar button { … }`).

## Provera

- `npm test` (Karma, ChromeHeadless) i `npm run build` (budžet 4 kB po component stilu je upozorenje).
- Logika editora (`src/app/core/**`) se ne menja u UI zadacima.
