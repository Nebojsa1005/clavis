import {
  HeroStaffScene,
  noteX,
  OPENING_MELODY,
  openingNoteCount,
  PITCH_MAX,
  PITCH_MIN,
  pitchAt,
  pitchY,
  staffGeometry,
} from './hero-staff-scene';

describe('hero staff geometry', () => {
  it('lines the clef up with the content column', () => {
    expect(staffGeometry(375).left).toBe(16);
    expect(staffGeometry(800).left).toBe(24);
    expect(staffGeometry(1440).left).toBe((1440 - 1200) / 2 + 32);
  });

  it('maps y back to the nearest line or space and clamps the range', () => {
    const g = staffGeometry(1280);
    for (const pitch of [-2, 0, 3, 8]) {
      expect(pitchAt(g, pitchY(g, pitch) + 1)).toBe(pitch);
    }
    expect(pitchAt(g, -1000)).toBe(PITCH_MAX);
    expect(pitchAt(g, 10000)).toBe(PITCH_MIN);
  });

  it('only opens with whole bars that leave room for the caret', () => {
    for (const width of [320, 390, 768, 1280, 1920]) {
      const g = staffGeometry(width);
      const count = openingNoteCount(g);
      expect(count % 4).toBe(0);
      expect(count).toBeLessThanOrEqual(OPENING_MELODY.length);
      if (count > 4) {
        expect(noteX(g, count) + g.slot).toBeLessThanOrEqual(g.right);
      }
    }
  });
});

describe('HeroStaffScene', () => {
  let host: HTMLElement;
  let scene: HeroStaffScene;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '1280px';
    document.body.appendChild(host);
    scene = new HeroStaffScene(host, { reducedMotion: true });
    scene.start();
  });

  afterEach(() => {
    scene.destroy();
    host.remove();
  });

  it('writes the opening melody with a barline after every bar', () => {
    const count = openingNoteCount(scene.geometry);
    expect(host.querySelectorAll('.hs-note').length).toBe(count);
    expect(host.querySelectorAll('.hs-barline').length).toBe(count / 4);
  });

  it('places a note at the pointer pitch and removes it again', () => {
    const before = scene.noteCount;
    const top = host.querySelector('svg')!.getBoundingClientRect().top;

    scene.place(top + pitchY(scene.geometry, 6));
    expect(scene.noteCount).toBe(before + 1);

    scene.removeLast();
    expect(scene.noteCount).toBe(before);
  });

  it('adds ledger lines below the staff', () => {
    const ledgersBefore = host.querySelectorAll('.hs-note .hs-ledger').length;
    scene.nudge(-20); // clamps to the lowest pitch
    scene.place();
    expect(host.querySelectorAll('.hs-note .hs-ledger').length).toBeGreaterThan(ledgersBefore);
  });

  it('keeps the DOM bounded by dropping notes that scrolled under the clef', () => {
    for (let i = 0; i < 80; i++) {
      scene.place();
    }
    expect(scene.noteCount).toBeLessThan(40);
  });

  it('removes its svg on destroy', () => {
    scene.destroy();
    expect(host.querySelector('svg')).toBeNull();
  });
});
