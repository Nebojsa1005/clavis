# Spike: uvoz notnog zapisa iz PDF-a

**Pitanje:** da li korisnik može da uploaduje PDF sa notama i da se taj zapis pojavi u editoru, i na koje načine?
**Grana:** `spike/pdf-import` · **Datum:** 2026-11-21

## Ukratko

- **Da, moguće je.** Za skenove i za digitalne PDF-ove to radi OMR (optical music recognition). Open-source alati na čistim stranama prepoznaju visine nota skoro savršeno.
- **Prepreka nije čitanje PDF-a, nego naš model.** Clavis podržava jedan glas po štapu, bez akorda i triola. Za gitaru i klavir uvoz gubi veliki deo zapisa (npr. 248 akorda i 371 nota drugog glasa na 3 strane gitare). Bez proširenja modela uvoz radi samo za jednoglasne deonice (flauta, violina, glas).
- **Preporuka:**
  1. Prvo omogućiti upload MusicXML fajla. Uvoz je već napisan u ovom spike-u.
  2. Zatim proširiti model akordima i drugim glasom.
  3. Na kraju dodati OMR servis sa **homr**-om na backendu (kontejner).
  
  OMR u browseru i sopstveno parsiranje vektorskog PDF-a trenutno se ne isplate.

## Kako bi radilo

```
PDF / slika ──► OMR servis (homr, kontejner) ──► MusicXML ──┐
MusicXML / .mxl iz MuseScore-a, Sibeliusa…  ────────────────┼──► fromMusicXml() ──► pregled upozorenja ──► editor
                                                            ┘
```

Za sve puteve postoji jedan zajednički korak: **MusicXML → `ScoreDocument`**. Napravljen je u
[`musicxml-import.ts`](../../../src/app/core/models/musicxml-import.ts) i uz rezultat vraća listu onoga što je izgubljeno. Ta lista ide korisniku pre otvaranja partiture.

## Opcije

| | Pristup | Radi za | Tačnost (izmereno) | Gde se izvršava | Licenca | Napor | Odluka |
|---|---|---|---|---|---|---|---|
| A | **Upload MusicXML/.mxl** | fajlove iz notnih programa | tačno, uz gubitke našeg modela | browser | — | S | ✅ odmah |
| B | **homr** (Python, ONNX, transformer) | skenove, fotografije, PDF renderovan u sliku | 100% (čisto i loš sken) | server, CPU, ~75–90 s po strani | AGPL-3.0 | M | ✅ preporuka za OMR |
| C | **Audiveris 5.11** (Java) | skenove od 300 dpi naviše, višestrani PDF | 97–100% čisto, ~90% loš sken | server, ~80–285 s po strani | AGPL-3.0 | M | rezerva |
| D | oemer (Python, ONNX) | slike | nije proradio (4 pokušaja) | server | MIT | — | ❌ |
| E | OMR u browseru (homr na onnxruntime-web) | slike | nije mereno | browser, preuzimanje modela od ~157 MB | AGPL-3.0 | L–XL | ❌ za sada |
| F | Čitanje vektorskog PDF-a (pdf.js + imena glyph-ova) | samo digitalne PDF-ove (potvrđeno za LilyPond) | visine 100%, ritam i glasovi ne | browser | — | L | ❌ za sada |

### A. Upload MusicXML-a
Većina notnih programa izvozi MusicXML, i to je najjeftiniji put do „uvezi moju partituru“. Uvoz čita i ono što Clavis sam izveze: kružni test daje identičan dokument. Za `.mxl` (zapakovan MusicXML) treba još raspakivanje zip-a. To može nativni `DecompressionStream('deflate-raw')` u browseru, bez nove zavisnosti.

### B. homr (preporuka za OMR)
- **Tačnost:** na obe test strane nije bilo greške u visini, čak ni na veštački pokvarenom skenu (150 dpi, nakrivljen 1,5°, šum, JPEG kvalitet 55).
- **Brzina:** brži od Audiverisa.
- **Mane:**
  - Ulaz je slika, pa PDF prvo treba renderovati u PNG (npr. PyMuPDF, ~300 dpi).
  - Modeli zauzimaju ~157 MB.
  - Projekat je mlad, ali aktivan.
  - Ugradnja je imala problem sa sertifikatima. Modele sam skinuo ručno, jer Python ovde ne prolazi SSL proveru. Na serveru to rešava Docker image sa unapred spakovanim modelima.

### C. Audiveris
- **Prednosti:** zreo i aktivan projekat, direktno čita višestrani PDF, ima CLI za batch rad (`-batch -export`).
- **Mane:**
  - Traži bar 300 dpi. Na 150 dpi odbija stranu (`interline 8 px`, „Sheet ignored“).
  - Na lošem skenu je propustio ~10% nota.
  - Na čistom Pleyel-u **nije prepoznao meru** (u izlazu nema `<time>`). Uvoz to sada nadoknađuje: računa meru iz dužine taktova i prijavljuje upozorenje.
  - Izmislio je predznak u oba komada: F-dur u Pleyel-u, G i F u Matiegki. U PDF-u predznaka nema, a homr je oba puta pročitao C-dur ispravno. Merenje u tabeli to ne vidi, jer poredi samo ime note i oktavu, ne i predznak.

### E i F (odloženo)
- **E, OMR u browseru:** homr deo posla radi u Pythonu, pre i posle modela. Sve to bi trebalo prepisati u JS, pa u browseru pokretati modele od ~157 MB na WASM CPU-u. Ima smisla samo ako privatnost postane uslov.
- **F, čitanje vektorskog PDF-a:** LilyPond PDF-ovi čuvaju imena simbola (`noteheads.s2`, `clefs.G`, `accidentals.sharp`), a linije štapa su vektori. Iz toga je visina tona dobijena tačno, i pdf.js u browseru vidi ista imena. Ritam (vratovi, grede, zastavice su vektorske putanje), glasovi i ostali notni programi bi tražili da se napiše poseban OMR. Pošto homr daje 100% na renderovanom vektorskom PDF-u, isplativije je PDF renderovati i poslati na OMR.

## Merenja

Test fajlovi su sa [Mutopia Project](https://www.mutopiaproject.org) (public domain, LilyPond):
- **Pleyel, Menuett:** klavir, 1 strana, 269 nota.
- **Matiegka, Menuetto br. 4:** gitara, 3 strane, više glasova.

Tačan odgovor dobijen je iz samog PDF-a: pozicije glyph-ova glava nota u odnosu na linije štapa ([`tools/vector_pitches.py`](tools/vector_pitches.py)). Poređenje je bez obzira na redosled ([`tools/compare_omr.py`](tools/compare_omr.py)).

| Ulaz | Audiveris pronađeno / tačno | homr pronađeno / tačno |
|---|---|---|
| Pleyel, čist (300 dpi; Audiveris direktno iz PDF-a) | 100% / 100% (81 s) | 100% / 100% (92 s) |
| Matiegka, čist | 97% / 100% (3 strane, 256 s) | 99% / 100% (strana 1, 75 s) |
| Pleyel, loš sken 150 dpi | odbio stranu | 100% / 100% (77 s) |
| Pleyel, loš sken 300 dpi | 91% i 88% / 100% (285 s) | — |

**Ograničenja merenja:**
- Mereno je samo **visina** nota, ritam ne.
- Samo dva komada, oba iz LilyPonda. „Sken“ je veštački napravljen.
- Bez pravih fotografija telefonom i bez rukopisa.
- Vremena su merena na laptopu, delom dok su drugi alati radili paralelno.

**Kroz naš uvoz** (izlaz Audiverisa):

| | Pleyel | Matiegka |
|---|---|---|
| Akord sveden na jednu notu | 43 | 248 |
| Drugi glas izostavljen | da | 371 nota |
| Triole uvezene kao obične note | — | 22 |
| Ukrasne note izostavljene | — | 15 |

## Rizici

- **AGPL (homr, Audiveris):** ako ih pokrećemo nepromenjene kao zaseban servis (proces, ne biblioteka), obaveze bi trebalo da se svode na navođenje izvora i licence. Ako ih menjamo, moramo objaviti izmene. **Pre produkcije treba pravna provera.**
- **Privatnost:** fajl korisnika ide na naš server. Sada su partiture samo u browseru. Treba jasno obavestiti korisnika i brisati fajl odmah posle obrade.
- **Infrastruktura:** Vercel funkcije nisu dovoljne (vreme izvršavanja i veličina modela). Potreban je kontejner (Cloud Run, Fly.io…) sa asinhronim poslom: upload → status → rezultat. Na CPU-u to je ~1–1,5 min po strani.
- **Održavanje:** Python OMR alati su osetljivi na verzije (oemer: `onnxruntime` ↔ `numpy`). Image treba zaključati na tačne verzije.

## Predlog tiketa

1. **Upload MusicXML/.mxl u editoru** (S): dugme za uvoz, `.mxl` preko `DecompressionStream`, dijalog sa upozorenjima, nova partitura u biblioteci.
2. **Model: akordi i drugi glas** (L, epik): preduslov da uvoz bude koristan za klavir i gitaru. Dotiče render, unos, plejbek i izvoz.
3. **OMR servis (homr) – prototip** (M): Docker image sa modelima, endpoint `POST /omr` (PDF ili slika) → MusicXML, asinhrono. Uz pravnu proveru AGPL-a.
4. **Merenje tačnosti ritma** (M): Clavis zna tačan MusicXML za ono što izveze, pa lanac izvoz → PDF → OMR → uvoz → poređenje daje automatsko merenje i visine i ritma.

## Šta je u grani

- [`src/app/core/models/musicxml-import.ts`](../../../src/app/core/models/musicxml-import.ts): `fromMusicXml(xml) → { document, warnings }` (6 testova u `.spec.ts`).
- [`tools/`](tools/): skripte za merenje: imena glyph-ova, tačan odgovor iz vektorskog PDF-a, poređenje sa OMR-om.
- **PoC u aplikaciji:** dugme **Uvezi** u editoru otvara dijalog biblioteke u režimu `import`.
  - **MusicXML:** prima `.musicxml`, `.xml` i `.mxl` (raspakivanje preko `DecompressionStream`, bez zavisnosti). Dijalog prikaže šta je prepoznato (instrumenti, broj taktova i nota) i šta se gubi, pa **Otvori u editoru** otvara partituru kao nesačuvanu (`adoptUnsaved`).
  - **PDF:** šalje se lokalnom OMR servisu ([`omr-service/`](../../../omr-service/README.md), homr). Dijalog prikazuje napredak po stranama, pa isti pregled kao za MusicXML. Matiegka od 3 strane: 158 s, ~100% visina.
  - Uvoz zadržava glas sa najviše nota na štapu. homr svaki takt počinje pauzom drugog glasa, pa je pravilo „prvi glas koji se pojavi“ odbacivalo melodiju (od 1127 nota ostajalo je 235, sada ostaje 586).
