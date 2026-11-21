"""
Local OMR service for Clavis: PDF in, MusicXML out, recognised by homr (https://github.com/liebharc/homr).

    POST /jobs        body = the PDF (Content-Type: application/pdf)  ->  202 {"id": "..."}
    GET  /jobs/<id>   ->  {"state": "queued|running|done|error", "page": 1, "pages": 3,
                           "musicxml": "..." (when done), "error": "..." (when failed)}

Development only: listens on 127.0.0.1, one recognition at a time (it is CPU heavy, ~1-1.5 min per
page), uploaded files are deleted as soon as the job ends. See README.md for setup.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from glob import glob
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("OMR_PORT", "8765"))
ALLOWED_ORIGINS = os.environ.get("OMR_ALLOWED_ORIGINS", "http://localhost:4200").split(",")
MAX_PDF_BYTES = 30 * 1024 * 1024
MAX_PAGES = 30
JOB_TIMEOUT_SECONDS = 60 * 30

# homr downloads its models on first use; truststore makes Python trust the OS certificate store
# (needed behind antivirus / proxies that re-sign TLS), instead of switching verification off.
HOMR = [
    sys.executable,
    "-c",
    "import sys, truststore; truststore.inject_into_ssl(); from homr.main import main; "
    "sys.argv = ['homr', *sys.argv[1:]]; main()",
]

jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()
one_at_a_time = threading.Semaphore(1)


def apply_progress(job: dict, line: str) -> None:
    """Reads homr's log: 'Merging N files: ...' gives the page count, 'Finished <image>' one page done."""
    merging = re.match(r"Merging (\d+) files", line)
    if merging:
        job["pages"] = int(merging.group(1))
    elif line.startswith("Finished ") and not line.startswith("Finished parsing"):
        job["page"] = min(job["page"] + 1, job["pages"] or job["page"] + 1)


def run_job(job_id: str, workdir: str) -> None:
    job = jobs[job_id]
    with one_at_a_time:
        job["state"] = "running"
        try:
            process = subprocess.Popen(
                [*HOMR, os.path.join(workdir, "score.pdf"), "--no-title"],
                cwd=workdir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
            timer = threading.Timer(JOB_TIMEOUT_SECONDS, process.kill)
            timer.start()
            tail: list[str] = []
            for raw in process.stdout:
                line = raw.strip()
                apply_progress(job, line)
                tail = (tail + [line])[-5:]
            process.wait()
            timer.cancel()
            outputs = glob(os.path.join(workdir, "*.musicxml"))
            if process.returncode != 0 or not outputs:
                raise RuntimeError("Prepoznavanje nije uspelo: " + " | ".join(t for t in tail if t))
            with open(outputs[0], encoding="utf-8") as file:
                job["musicxml"] = file.read()
            job["page"] = job["pages"]
            job["state"] = "done"
        except Exception as error:  # noqa: BLE001 - reported to the client as the job's error
            job["state"] = "error"
            job["error"] = str(error)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)


def page_count(pdf: bytes) -> int:
    # Rough, dependency-free count; homr renders with pdfium either way.
    return max(1, len(re.findall(rb"/Type\s*/Page[^s]", pdf)))


class Handler(BaseHTTPRequestHandler):
    def cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def reply(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802 - http.server naming
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/jobs":
            return self.reply(404, {"error": "Nepoznata adresa."})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_PDF_BYTES:
            return self.reply(413, {"error": f"PDF mora imati između 1 bajta i {MAX_PDF_BYTES // 1024 // 1024} MB."})
        pdf = self.rfile.read(length)
        if not pdf.startswith(b"%PDF-"):
            return self.reply(400, {"error": "Fajl nije PDF."})
        pages = page_count(pdf)
        if pages > MAX_PAGES:
            return self.reply(413, {"error": f"Najviše {MAX_PAGES} strana po fajlu."})

        workdir = tempfile.mkdtemp(prefix="clavis-omr-")
        with open(os.path.join(workdir, "score.pdf"), "wb") as file:
            file.write(pdf)
        job_id = uuid.uuid4().hex
        with jobs_lock:
            jobs[job_id] = {"state": "queued", "page": 0, "pages": pages}
        threading.Thread(target=run_job, args=(job_id, workdir), daemon=True).start()
        self.reply(202, {"id": job_id})

    def do_GET(self) -> None:  # noqa: N802
        match = re.fullmatch(r"/jobs/([0-9a-f]{32})", self.path)
        job = jobs.get(match.group(1)) if match else None
        if not job:
            return self.reply(404, {"error": "Posao ne postoji."})
        self.reply(200, job)
        if job["state"] in ("done", "error"):
            with jobs_lock:
                jobs.pop(match.group(1), None)  # the result is delivered once, then forgotten

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - keep polling out of the console
        if not self.path.startswith("/jobs/"):
            super().log_message(format, *args)


if __name__ == "__main__":
    print(f"Clavis OMR servis na http://127.0.0.1:{PORT} (dozvoljeno za {', '.join(ALLOWED_ORIGINS)})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
