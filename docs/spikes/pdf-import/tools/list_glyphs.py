import sys, io, collections, fitz
from fontTools.ttLib import TTFont
from fontTools.cffLib import CFFFontSet
doc = fitz.open(sys.argv[1]); page = doc[0]
names = {}
for xref, ext, typ, base, *_ in page.get_fonts():
    name, ext, _, data = doc.extract_font(xref)
    gl = None
    try:
        if ext in ('cff',):
            cff = CFFFontSet(); cff.decompile(io.BytesIO(data), None); gl = cff[cff.fontNames[0]].charset
        else:
            gl = TTFont(io.BytesIO(data)).getGlyphOrder()
    except Exception as e: gl = f'ERR {e}'
    names[base] = gl
    print(base, typ, ext, (gl[:15] if isinstance(gl, list) else gl))
cnt = collections.Counter()
for span in page.get_texttrace():
    gl = next((v for k, v in names.items() if k.split('+')[-1] == span['font'].split('+')[-1]), None)
    for ch in span['chars']:
        gid = ch[1]
        if isinstance(gl, list) and 0 <= gid < len(gl): cnt[(span['font'][-20:], gl[gid])] += 1
for k, v in cnt.most_common(25): print(v, k)
