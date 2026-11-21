import { Injectable, InjectionToken, inject } from '@angular/core';

/** Base URL of the OMR service (omr-service/server.py); development only, see omr-service/README.md. */
export const OMR_SERVICE_URL = new InjectionToken<string>('OMR_SERVICE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:8765',
});

/** How often the job status is asked for; a page takes about a minute. */
export const OMR_POLL_MS = new InjectionToken<number>('OMR_POLL_MS', { providedIn: 'root', factory: () => 1000 });

export interface OmrProgress {
  /** Pages finished so far, of `pages`. */
  page: number;
  pages: number;
}

interface JobStatus extends OmrProgress {
  state: 'queued' | 'running' | 'done' | 'error';
  musicxml?: string;
  error?: string;
}

/**
 * Optical music recognition of a PDF: uploads it to the OMR service, follows the job until it is
 * done and returns the recognised MusicXML. The service is a separate process, since recognition
 * needs Python and ~1-1.5 min of CPU per page.
 */
@Injectable({ providedIn: 'root' })
export class OmrService {
  private readonly baseUrl = inject(OMR_SERVICE_URL);
  private readonly pollMs = inject(OMR_POLL_MS);

  async recognize(pdf: Blob, onProgress: (progress: OmrProgress) => void, signal?: AbortSignal): Promise<string> {
    const created = await this.call<{ id: string }>('/jobs', { method: 'POST', body: pdf, headers: { 'Content-Type': 'application/pdf' }, signal });
    for (;;) {
      const status = await this.call<JobStatus>(`/jobs/${created.id}`, { signal });
      onProgress({ page: status.page, pages: status.pages });
      if (status.state === 'done') {
        return status.musicxml ?? '';
      }
      if (status.state === 'error') {
        throw new Error(status.error ?? 'Prepoznavanje nije uspelo.');
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      signal?.throwIfAborted();
    }
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.baseUrl + path, init);
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new Error(`OMR servis nije dostupan na ${this.baseUrl}. Pokreni ga: python omr-service/server.py`);
    }
    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? `OMR servis je vratio grešku ${response.status}.`);
    }
    return body;
  }
}
