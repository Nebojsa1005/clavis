# Clavis

Minimalistički notni editor u browseru — inspirisan tradicionalnim desktop notnim softverom
(MuseScore i slično), ali sopstveno ime, brend i UI. Nema preuzetog izvornog koda, logoa ni
asset-a tog softvera — ovo je "inspired by", ne klon.

MVP fokus: dokazati da je moguće napraviti WYSIWYG notni editor u browseru sa čistim frontend
stack-om (Angular + VexFlow + Tone.js), bez gotove notacione editing biblioteke.

## Pokretanje

```bash
npm install
npm start        # ng serve, http://localhost:4200
npm test         # Karma/Jasmine u ChromeHeadless-u
npm run build    # produkcioni build u dist/clavis
```

Napomena: Angular CLI 22 (latest tag na npm-u) traži Node 22+. Ovaj projekat je zakucan na
`@angular/cli@20` jer razvojna mašina ima Node 20 — projekat sâm radi normalno na Node 20.19+.

## Tech stack

- **Angular 20**, standalone komponente, strict TypeScript, signals za state (bez NgRx)
- **VexFlow** — renderovanje notnog teksta (SVG)
- **Tone.js** — audio plejbek (Web Audio API scheduling + synth)
- **midi-writer-js** — MIDI export
- Sopstveni MusicXML serializer (nema gotove biblioteke za to u ovom obimu)
- Persistencija: IndexedDB (autosave/load) + JSON export/import fajla
- Samo frontend — nema backend-a. Arhitektura (vidi ispod) odvaja state/persistenciju tako da
  REST sync može kasnije da se dogradi iza istog `PersistenceService` interfejsa.

## Arhitektura

```
src/app/
├── core/
│   ├── models/
│   │   ├── score.model.ts       # Note/Rest/Measure/Score tipovi + factory funkcije + isScore() guard
│   │   └── notation.util.ts     # čiste funkcije: pitch-aritmetika, trajanje→otkucaji,
│   │                             # y-koordinata→pitch (unos klikom), playback schedule builder
│   ├── services/
│   │   ├── notation-renderer.service.ts  # VexFlow wrapper — model → SVG
│   │   ├── playback.service.ts           # Tone.js wrapper — model → zakazani zvuk
│   │   ├── export.service.ts             # MusicXML / MIDI / PNG / SVG export
│   │   └── persistence.service.ts        # IndexedDB + JSON fajl import/export
│   ├── state/
│   │   ├── score-model.service.ts   # izvor istine za partituru: signal + mutacije + undo/redo
│   │   ├── note-input.service.ts    # UI-stanje moda unosa (aktivan? koje trajanje?)
│   │   └── selection.service.ts     # id trenutno selektovanog elementa
│   └── utils/download.util.ts       # Blob → browser download (deli ga export/persistence)
├── features/
│   └── staff-view/                  # komponenta koja wrap-uje <svg> + klik/mod-unosa logiku
└── app.ts / app.html / app.scss     # toolbar (fajl/unos/izmene/plejbek/export) + layout shell
```

Tok podataka: `ScoreModelService` drži `Score` kao signal. `StaffView` ima `effect()` koji na
svaku promenu `score()` ili `selection.selectedId()` poziva `NotationRendererService.render(...)`
i ponovo iscrta SVG od nule (nema inkrementalnog diff-a — za ovaj obim partitura to je brzo i
jednostavnije od pracenja VexFlow internog stanja).

Klik na notu je implementiran preko `data-score-element-id` atributa koji renderer upiše na
VexFlow-ov SVG element nakon crtanja (`StaveNote.getSVGElement()`) — klik hvata najbliži DOM
element sa tim atributom (`Element.closest(...)`), bez geometrijskog hit-testinga.

## Poznata MVP ograničenja (svesne odluke, ne propusti)

- **Tastatura 1-5 za trajanje, ne 1-8** — model ima 5 trajanja (cela/polovina/četvrtina/
  osminka/šesnaestinka). 6-8 nisu dodeljena, lako proširiti (32nd/64th) ako zatreba.
- **Strelice gore/dole pomeraju "poslednju unetu notu"**, ne proizvoljnu selekciju — nema punog
  cursor/caret modela unosa. Selekcija klikom (T4) je nezavisna funkcija (briše/highlight-uje),
  ne utiče na to šta strelice pomeraju.
- **Klik u modu unosa uvek dodaje notu na kraj partiture** — ne na kliknuti takt. Horizontalna
  pozicija klika se ignoriše; samo y-koordinata (visina tona) se koristi. Umetanje u sredinu bi
  tražilo cursor/caret model koji nije građen u ovom MVP-u.
- **Ključ/takt/predznaci su fiksirani** (G ključ, 4/4, C) — nema UI za promenu, samo model to
  podržava (`Score.clef/timeSignature/keySignature`).
- **Selekcija je samo po pojedinačnoj noti/pauzi**, ne po celom taktu.
- **MIDI export gubi trailing rest** na samom kraju partiture — MIDI event model (wait+note)
  nema način da predstavi tišinu bez sledećeg eventa.
- **Stvarno pokretanje audio-a (Tone.js/AudioContext) nije automatizovano testirano** — rizik od
  flaky testova usled autoplay-policy u headless Chrome-u. Testirana je čista schedule-logika
  (`buildPlaybackSchedule`) i servis bez audio pozivа; stvarni zvuk treba provariti uživo.

## Sledeći korak (van ovog MVP-a, arhitektura ostavlja mesto)

- REST backend za čuvanje/deljenje (iza `PersistenceService` interfejsa)
- PWA/offline, Electron desktop
- OpenSheetMusicDisplay/Verovio za prikaz uvezenih MusicXML fajlova, alphaTab za tabulaturu,
  webmscore za `.mscz` import

## Testovi

Unit testovi (Jasmine/Karma, pokreću se u realnom Chrome-u, ne jsdom mock) pokrivaju:

- `ScoreModelService` — dodavanje/brisanje/izmena nota, popunjavanje/prelivanje takta, undo/redo
  (uključujući 20-korak limit i reset istorije na `replaceScore`)
- `notation.util.ts` — pitch aritmetika, y→pitch mapiranje (sa stvarnim VexFlow geometrijskim
  vrednostima), playback schedule builder
- `NotationRendererService` — stvarno VexFlow SVG renderovanje (provera da `<svg>` i
  `.vf-stavenote` postoje u DOM-u, ne mock)
- `ExportService` — MusicXML string sadržaj, MIDI binarni header (`MThd`), stvarna PNG blob
  produkcija
- `PersistenceService` — IndexedDB save/load round-trip (stvarna baza u browseru), JSON
  import validacija
- `NoteInputService`, `SelectionService`, `StaffView`, `App` — UI orkestracija
