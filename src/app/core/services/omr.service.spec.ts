import { TestBed } from '@angular/core/testing';
import { OMR_POLL_MS, OMR_SERVICE_URL, OmrProgress, OmrService } from './omr.service';

describe('OmrService', () => {
  let service: OmrService;
  let fetchSpy: jasmine.Spy;
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: OMR_SERVICE_URL, useValue: 'http://omr.test' },
        { provide: OMR_POLL_MS, useValue: 0 },
      ],
    });
    service = TestBed.inject(OmrService);
    fetchSpy = spyOn(window, 'fetch');
  });

  it('uploads the PDF, follows the job and returns the MusicXML', async () => {
    fetchSpy.and.returnValues(
      json({ id: 'a1' }, 202),
      json({ state: 'running', page: 0, pages: 2 }),
      json({ state: 'running', page: 1, pages: 2 }),
      json({ state: 'done', page: 2, pages: 2, musicxml: '<score-partwise/>' }),
    );
    const progress: OmrProgress[] = [];

    const xml = await service.recognize(new Blob(['%PDF-1.4']), (p) => progress.push(p));

    expect(xml).toBe('<score-partwise/>');
    expect(progress).toEqual([{ page: 0, pages: 2 }, { page: 1, pages: 2 }, { page: 2, pages: 2 }]);
    const [url, init] = fetchSpy.calls.first().args as [string, RequestInit];
    expect(url).toBe('http://omr.test/jobs');
    expect(init.method).toBe('POST');
    expect(fetchSpy.calls.argsFor(1)[0]).toBe('http://omr.test/jobs/a1');
  });

  it("passes on the service's own error message", async () => {
    fetchSpy.and.returnValues(json({ error: 'Fajl nije PDF.' }, 400));
    await expectAsync(service.recognize(new Blob(['x']), () => {})).toBeRejectedWithError('Fajl nije PDF.');

    fetchSpy.and.returnValues(json({ id: 'b2' }, 202), json({ state: 'error', page: 0, pages: 1, error: 'Prepoznavanje nije uspelo' }));
    await expectAsync(service.recognize(new Blob(['%PDF']), () => {})).toBeRejectedWithError('Prepoznavanje nije uspelo');
  });

  it('says how to start the service when it is not running', async () => {
    fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));
    await expectAsync(service.recognize(new Blob(['%PDF']), () => {})).toBeRejectedWithError(/nije dostupan.*server\.py/);
  });
});
