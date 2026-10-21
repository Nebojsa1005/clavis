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
- Persistencija: biblioteka partitura u IndexedDB-u (više partitura, sa nazivom i datumom) + JSON export/import fajla
- Samo frontend — nema backend-a. Arhitektura (vidi ispod) odvaja state/persistenciju tako da
  REST sync može kasnije da se dogradi iza istog `PersistenceService` interfejsa.

## Arhitektura

```
src/app/
├── core/
│   ├── models/
│   │   ├── score.model.ts          # Note/Rest/Measure/Score (jedan štap) + factory funkcije + isScore()
│   │   ├── score-document.ts       # ScoreDocument → Part (instrument) → Staff; normalizacija dokumenta
│   │   ├── instruments.ts          # preseti instrumenata (naziv + ključevi štapova)
│   │   ├── caret.util.ts           # pozicija kursora (takt, glas, tik), stopovi, navigacija
│   │   ├── insert.util.ts          # umetanje sa prelivanjem u sledeće takte, promena takta
│   │   ├── tie.util.ts             # lukovi trajanja (validnost, čišćenje, lanci)
│   │   ├── key-signature.util.ts   # tonaliteti dur/mol, predznaci po tonu
│   │   ├── time-signature.util.ts  # validacija i preseti taktova
│   │   └── notation.util.ts        # pitch aritmetika, y→pitch, trajanje→otkucaji, plejbek raspored
│   ├── services/
│   │   ├── notation-renderer.service.ts  # VexFlow — dokument → SVG (više štapova, zagrada, lukovi)
│   │   ├── playback.service.ts           # plejbek logika (zakazivanje u tikovima)
│   │   ├── playback-engine.ts            # PlaybackEngine interfejs + Tone.js implementacija
│   │   ├── export.service.ts             # MusicXML / MIDI / PNG / SVG export
│   │   ├── score-library.service.ts      # IndexedDB biblioteka partitura (+ migracija stare baze)
│   │   └── persistence.service.ts        # JSON fajl import/export
│   ├── state/
│   │   ├── score-model.service.ts   # izvor istine: dokument, aktivni štap, mutacije, undo/redo
│   │   ├── score-session.service.ts # koja je partitura otvorena, Novo/Otvori/Sačuvaj, "nesačuvano"
│   │   ├── caret.service.ts         # kursor za unos nota
│   │   ├── note-input.service.ts    # mod unosa (trajanje, tačka, naoružan luk)
│   │   ├── selection.service.ts     # selekcija (jedna, opseg, više, takt)
│   │   ├── editing.service.ts       # brisanje/kopiranje/lepljenje selekcije, lukovi (T)
│   │   └── clipboard.service.ts     # interni clipboard
│   └── utils/download.util.ts       # Blob → browser download
├── features/
│   ├── staff-view/                  # <svg> + klik, selekcija prevlačenjem, unos klikom
│   ├── tracks-panel/                # instrumenti: izbor štapa, dodaj/ukloni/preimenuj/pomeri
│   ├── library-dialog/              # Otvori / Sačuvaj kao
│   ├── time-signature-control/      # takt: preseti + proizvoljan X/Y
│   └── key-signature-control/       # tonalitet
└── app.ts / app.html / app.scss     # toolbar + layout + prečice na tastaturi
```

### Model

`ScoreDocument` = lista instrumenata (`Part`), svaki sa jednim ili više štapova (`Staff`); klavir
je instrument sa dva štapa (grand staff). Svaki štap nosi običan `Score` (ključ, takt, tonalitet,
takti) — zato sav kod za uređivanje (kursor, umetanje, lukovi, selekcija) radi nad jednim štapom,
nezavisno od broja instrumenata. `ScoreModelService.score` je **aktivan štap**; klik na štap ili
izbor u panelu ga menja. Takt i tonalitet dele svi štapovi, a svi štapovi imaju isti broj taktova
(`normalizeDocument` to održava posle svake izmene).

Visina kursora je u tikovima (256 po celoj noti), kursor stoji samo na početku elemenata.
Umetanje (ne prepisivanje) pomera ostale note i preliva višak u sledeći takt.

### Tok podataka

`ScoreModelService` drži `ScoreDocument` kao signal. `StaffView` ima `effect()` koji na svaku
promenu dokumenta, selekcije, aktivnog štapa ili kursora poziva `NotationRendererService.render(...)`
i iscrta SVG od nule (nema inkrementalnog diff-a — za ovaj obim je to brzo i jednostavnije od
praćenja VexFlow internog stanja). Klik na notu radi preko `data-score-element-id` i
`data-score-staff-id` atributa koje renderer upiše na SVG elemente.

### Plejbek

`buildDocumentSchedule` pravi raspored svih štapova u **otkucajima** (tempo nezavisno). Otkucaj je
nota koja odgovara imeniocu takta (četvrtina u 4/4, osmina u 6/8). `PlaybackService` šalje raspored
audio engine-u u tikovima, pa se tempo menja i usred plejbeka. Audio je iza `PlaybackEngine`
interfejsa, tako da se logika testira bez zvuka. Ručna provera zvuka: vidi
[docs/qa-playback-checklist.md](docs/qa-playback-checklist.md).

### Čuvanje

Partiture se čuvaju u IndexedDB bazi `clavis` (store `library`, zapis: id, naziv, datum izmene,
format, podaci). Zapisi formata 1 (jedan štap) i stari JSON fajlovi učitavaju se kao dokument sa
jednim instrumentom. Baza verzije 1 (jedan slot) se pri prvom otvaranju prekopira u biblioteku.

## Poznata ograničenja

- **Jedan glas po štapu** — nema više glasova na istom štapu (polje `voice` u kursoru je rezervisano).
- **Nota koja ne staje u takt se ne deli automatski** preko crte takta (nema automatskog
  luka); višak se prebacuje u sledeći takt ceo.
- **Luk spaja samo note iste visine** (luk trajanja), ne legato lukovi.
- **Predznaci važe samo kroz tonalitet** — nema uzimanja predznaka do kraja takta niti unosa
  predznaka kroz UI (model ga podržava na notama).
- **Plejbek svira sve instrumente istim sintisajzerom** i bez dinamike.
- **MIDI export gubi trailing rest** na kraju štapa — MIDI event model (wait+note) nema način da
  predstavi tišinu bez sledećeg eventa.
- **Stvarni zvuk nije automatizovano testiran** (autoplay-policy u headless Chrome-u).

## Sledeći korak (van trenutnog obima, arhitektura ostavlja mesto)

- REST backend za čuvanje/deljenje (iza `ScoreLibraryService` interfejsa)
- PWA/offline, Electron desktop
- OpenSheetMusicDisplay/Verovio za prikaz uvezenih MusicXML fajlova, alphaTab za tabulaturu,
  webmscore za `.mscz` import

## Testovi

Unit i integracioni testovi (Jasmine/Karma, pokreću se u realnom Chrome-u, ne jsdom mock):

- modeli i čiste funkcije — kursor, umetanje/prelivanje, lukovi, tonaliteti, taktovi, dokument,
  plejbek raspored
- servisi stanja — `ScoreModelService` (uključujući više štapova/instrumenata i undo/redo),
  selekcija, uređivanje, clipboard, sesija i biblioteka (prava IndexedDB baza, jedinstveno ime po
  testu)
- `NotationRendererService` — stvarno VexFlow renderovanje (štapovi, kursor, lukovi, brace)
- `ExportService` — MusicXML sadržaj, MIDI zaglavlje i broj traka, PNG
- `PlaybackService` — sa lažnim audio engine-om (zakazivanje u tikovima, tempo uživo, zaštite)
- komponente — toolbar, panel instrumenata, dijalog biblioteke, kontrole takta/tonaliteta
- `editor-caret.integration.spec.ts` — ceo tok u pravom browseru: unos, kursor, selekcija,
  kopiranje, lukovi, grand staff
