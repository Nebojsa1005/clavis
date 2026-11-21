# Spike B: pitch of every notehead on a vector (LilyPond) PDF page, from glyph names + staff lines.
import sys, io, fitz
from fontTools.cffLib import CFFFontSet
doc = fitz.open(sys.argv[1])
out = []
for page in list(doc)[:int(sys.argv[2]) if len(sys.argv) > 2 else None]:
  charsets = {}
  for xref, ext, typ, base, *_ in page.get_fonts():
      _, ext, _, data = doc.extract_font(xref)
      if ext == 'cff':
          cff = CFFFontSet(); cff.decompile(io.BytesIO(data), None); charsets[base.split('+')[-1]] = cff[cff.fontNames[0]].charset
  glyphs = []  # (name, x, y)
  for span in page.get_texttrace():
      cs = charsets.get(span['font'].split('+')[-1])
      if not cs or not span['font'].startswith('Emmentaler'): continue
      for ch in span['chars']:
          glyphs.append((cs[ch[1]], ch[2][0], ch[2][1]))
  ys = sorted({round(d['rect'].y0, 2) for d in page.get_drawings() if d['rect'].width > 300 and d['rect'].height < 0.5})
  staves = [ys[i:i + 5] for i in range(0, len(ys) - 4, 5)]
  STEPS = 'CDEFGAB'
  BOTTOM = {'clefs.G': ('E', 4), 'clefs.F': ('G', 2), 'clefs.C': ('F', 3)}
  for lines in staves:
      space = (lines[-1] - lines[0]) / 4
      top, bottom = lines[0] - 4 * space, lines[-1] + 4 * space
      center = (lines[0] + lines[-1]) / 2
      nearest = lambda y: min(staves, key=lambda l: abs((l[0] + l[-1]) / 2 - y))
      inside = [g for g in glyphs if top <= g[2] <= bottom and nearest(g[2]) is lines]
      clef = next((g[0] for g in sorted(inside, key=lambda g: g[1]) if g[0].startswith('clefs.')), 'clefs.G')
      step, octave = BOTTOM.get(clef.replace('_change', ''), ('E', 4))
      base = STEPS.index(step) + 7 * octave
      notes = []
      for name, x, y in sorted(inside, key=lambda g: (round(g[1]), -g[2])):
          if name.startswith('noteheads.'):
              d = base + round((lines[-1] - y) / (space / 2))
              notes.append(f"{STEPS[d % 7]}{d // 7}{'.' if name.endswith('s1') else ''}")
      out.append((clef, notes))

for clef, notes in out: print(clef, " ".join(notes))
