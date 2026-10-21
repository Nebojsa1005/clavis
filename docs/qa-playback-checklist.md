# Ručna provera plejbeka

Zvuk ne može da se testira automatski (browser ne dozvoljava audio bez klika korisnika, pa ni
headless Chrome ne pokreće `AudioContext`), zato se ovo prolazi **ručno, u pravom browseru, sa
slušalicama ili zvučnicima**. Logika iza plejbeka (raspored nota, tikovi, tempo, zaštite) pokrivena
je automatskim testovima (`playback.service.spec.ts`, `notation.util.spec.ts`); ovde se proverava
ono što samo uho može: da li se čuje ono što piše na notama.

Pokretanje: `npm start`, otvori http://localhost:4200. Pritisni **Novo** za praznu partituru (ili
koristi početnu probnu). ▶ pokreće plejbek, ■ ga zaustavlja.

Za svaku stavku: uradi korake, uporedi sa **Očekivano**, upiši ✔ ili opis problema.

## 1. Osnove

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 1.1 | Unesi C D E F (četvrtine, taster `N`, klik na štap), pritisni ▶ | Četiri tona uzlazno, ravnomerno, ~120 otkucaja u minuti; dugme se vrati na ▶ kad se završi | |
| 1.2 | Pritisni ▶ pa odmah ■ | Zvuk staje; nijedan ton ne ostaje da visi | |
| 1.3 | Dvaput brzo klikni ▶ | Svira se jednom, ne dupli zvuk | |
| 1.4 | Pritisni ▶ na praznoj partituri | Ništa se ne dešava, dugme ostaje ▶ | |
| 1.5 | Samo pauza (cela) pa ▶ | Tišina oko 2 s, pa se vrati na ▶ | |

## 2. Tempo

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 2.1 | Postavi 60 BPM, ▶ | Dvaput sporije nego na 120 | |
| 2.2 | Postavi 240 BPM, ▶ | Dvaput brže nego na 120 | |
| 2.3 | Pokreni dužu partituru (≥ 3 takta) na 80 BPM, usred plejbeka unesi 200 u polje BPM | Ostatak ide brže **bez prekida i bez pomeranja redosleda**; nema dvostrukih tonova | |
| 2.4 | Isto, ali spusti sa 200 na 60 usred plejbeka | Ostatak ide sporije; poslednji ton se čuje cio | |
| 2.5 | Unesi 20 i 300 | Granice se poštuju (20 je jako sporo, 300 jako brzo), bez grešaka u konzoli | |

## 3. Trajanja (tasteri 1–7)

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 3.1 | Isti ton (C) u trajanjima: cela, polovina, četvrtina, osminka, šesnaestinka | Svaki sledeći ton traje upola kraće od prethodnog | |
| 3.2 | Šesnaestinka, 1/32 (`6`) i 1/64 (`7`) u nizu, na 60 BPM | Sve se čuju kao zasebni, sve kraći tonovi, bez preskakanja | |
| 3.3 | Četvrtina pa pauza pa četvrtina | Tišina između tonova jednaka četvrtini | |
| 3.4 | Dve osminke i četvrtina, uporedi sa dve četvrtine | Dve osminke traju koliko jedna četvrtina | |

## 4. Tačka

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 4.1 | Taster `.`, unesi četvrtinu pa osminku | Prva nota traje 1,5 otkucaj, osminka 0,5 (zajedno dva otkucaja) | |
| 4.2 | Tačkasta polovina + četvrtina u 4/4 | Zajedno tačno jedan takt, sledeća nota počinje na početku sledećeg takta | |
| 4.3 | Tačkasta pauza | Tišina 1,5 puta duža od obične pauze iste vrednosti | |

## 5. Luk trajanja (taster `T`)

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 5.1 | Dve četvrtine C, selektuj obe, `T`, ▶ | **Jedan** ton dužine polovine, bez drugog udarca | |
| 5.2 | Tri iste note spojene u lanac | Jedan ton dužine zbira sve tri | |
| 5.3 | Luk preko crte takta (poslednja nota prvog i prva nota drugog takta) | Jedan neprekinut ton preko crte takta | |
| 5.4 | Dve iste note **bez** luka | Dva odvojena udarca | |
| 5.5 | Luk pa umetni notu između spojenih nota | Luk nestaje, čuju se tri odvojena tona | |
| 5.6 | Mod unosa, unesi C, `T`, unesi C | Drugo C je spojeno sa prvim (jedan ton) | |

## 6. Tonalitet i takt

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 6.1 | Sol-dur, unesi F | Čuje se **F♯**, iako uz notu nema predznaka | |
| 6.2 | Fa-dur, unesi B | Čuje se **B♭** | |
| 6.3 | Promena tonaliteta na istoj partituri | Visine se menjaju u skladu sa novim tonalitetom | |
| 6.4 | Takt 3/4 sa tri četvrtine | Tri jednaka otkucaja po taktu | |
| 6.5 | Takt 6/8 sa šest osminki, BPM 120 | Osminke jednake, brze (120 u minuti) | |

## 7. Metronom

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 7.1 | Uključi Metronom, ▶ u 4/4 | Klik na svaku četvrtinu, usklađen sa notama | |
| 7.2 | Isključi Metronom **usred plejbeka** | Klikovi staju odmah, note nastavljaju | |
| 7.3 | Uključi Metronom usred plejbeka | Klikovi počinju na sledećem otkucaju | |
| 7.4 | Metronom u 6/8 | Klik na svaku osminku (otkucaj = osminka) | |
| 7.5 | Menjaj tempo uz uključen metronom | Klik prati novi tempo | |

## 8. Više štapova i instrumenata

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 8.1 | Dodaj klavir, u gornji štap unesi C5 D5, u donji C3 (polovina) | Oba štapa sviraju **istovremeno**, donji C3 traje koliko C5+D5 | |
| 8.2 | Dodaj violinu i unesi melodiju | Svi instrumenti sviraju zajedno, ravnomerno | |
| 8.3 | Ukloni instrument pa ▶ | Ukloni se i njegov zvuk | |
| 8.4 | Štapovi različite dužine | Plejbek traje koliko najduži štap | |

## 9. Čuvanje i izvoz

| # | Koraci | Očekivano | Rezultat |
|---|--------|-----------|----------|
| 9.1 | Sačuvaj, osveži stranicu, ▶ | Isto što je svirano pre čuvanja | |
| 9.2 | Izvezi MIDI, otvori u plejeru/DAW-u | Iste note i trajanja, spojene note kao jedan ton, po jedna traka za svaki štap | |
| 9.3 | Izvezi MusicXML, otvori u MuseScore-u | Isti sadržaj, klavir kao dva štapa, lukovi i tačke prisutni | |

## Šta je automatski proveravano, a šta ne

Automatski (svaki build): raspored nota u tikovima za sve gore navedene slučajeve (trajanja,
tačka, luk, tonalitet, takt, više štapova), redosled poziva prema audio engine-u, tempo uživo,
zaštita od dvostrukog starta, zaustavljanje na kraju, metronom koji prati prekidač uživo.

Ne može automatski: da li se zaista **čuje** ono što je zakazano, kvalitet tona, sinhronizacija
sa uhom. Za to služi ova lista.

Pri razvoju je u pravom browseru proveren i tok sa pravim Tone.js engine-om: ▶ pokreće plejbek
(`AudioContext` se startuje), tempo se menja usred plejbeka bez greške, plejbek se sam zaustavi na
kraju (dugme se vrati na ▶), u konzoli nema grešaka. Zvuk sam nije mogao da se čuje.

## Pronađene i ispravljene greške (pregled koda plejbeka)

- **Tempo se nije menjao tokom plejbeka** — raspored je bio zakazan u sekundama pri tempu sa
  početka. Sada je u tikovima, pa promena BPM-a važi odmah.
- **Prekidač metronoma važio je samo pri pokretanju** — sada radi i usred plejbeka.
- **Dupli klik na ▶ mogao je da zakaže plejbek dvaput** dok se čeka na `AudioContext`.
- **Zaustavljanje je ostavljalo tonove koji još zvuče** — sada se svi glasovi odmah utišaju.
