# Clavis OMR servis (lokalno)

Prepoznaje note iz PDF-a ([homr](https://github.com/liebharc/homr)) i vraća MusicXML. Editor ga
koristi kada u **Uvezi** izabereš `.pdf`. Servis je samo za razvoj: sluša na `127.0.0.1:8765` i
obrađuje jedan posao u isto vreme. Svaka strana traje oko 1 minut na CPU-u.

## Pokretanje

Potreban je Python 3.12.

```powershell
cd omr-service
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python server.py
```

Pri prvom prepoznavanju homr preuzima modele (~160 MB) u `.venv`. Ako preuzimanje padne na SSL
sertifikatu, servis ga već radi preko `truststore`-a, pa Python veruje sertifikatima iz Windowsa.
Proveru sertifikata ne treba isključivati.

Editor očekuje servis na `http://localhost:8765` (`OMR_SERVICE_URL` u
`src/app/core/services/omr.service.ts`). Servis prihvata zahteve samo sa `http://localhost:4200`.
To se menja promenljivom `OMR_ALLOWED_ORIGINS` (više adresa odvojenih zarezom), a port promenljivom
`OMR_PORT`.

## API

| | |
|---|---|
| `POST /jobs` | telo zahteva je PDF (`Content-Type: application/pdf`, najviše 30 MB i 30 strana); odgovor `202 {"id"}` |
| `GET /jobs/<id>` | odgovor `{"state": "queued\|running\|done\|error", "page", "pages", "musicxml"?, "error"?}`; gotov rezultat se šalje samo jednom |

Fajlovi se brišu čim posao završi.

## Ograničenja

- Prepoznavanje može da pogreši. Na testu iz [spike izveštaja](../docs/spikes/pdf-import/README.md)
  visine su bile tačne, ritam nije meren.
- Clavis ima jedan glas po štapu: akordi i drugi glas se gube pri uvozu, a dijalog to prijavi.
- homr je AGPL-3.0. Pre javnog deploy-a treba pravna provera i Docker image sa unapred spakovanim
  modelima.

Testovi: `python -m unittest test_server.py`
