# Compare Audiveris pitches with ground truth from the vector PDF (per staff, in reading order).
import sys, zipfile, difflib, collections, subprocess, xml.etree.ElementTree as ET
mxl, pdf = sys.argv[1], sys.argv[2]
if mxl.endswith('.mxl'):
    z = zipfile.ZipFile(mxl)
    name = next(n for n in z.namelist() if n.endswith('.xml') and not n.startswith('META'))
    xml = z.read(name); open(mxl.replace('.mxl', '.musicxml'), 'wb').write(xml)
else:
    xml = open(mxl, 'rb').read()
root = ET.fromstring(xml)
staves = collections.defaultdict(list); stats = collections.Counter()
for part in root.iter('part'):
    for note in part.iter('note'):
        stats['notes'] += 1
        if note.find('rest') is not None: stats['rests'] += 1; continue
        if note.find('chord') is not None: stats['chord'] += 1
        p = note.find('pitch'); st = note.findtext('staff', '1')
        name = p.findtext('step') + p.findtext('octave'); seq = staves[(part.get('id'), st)]
        if note.find('chord') is not None and seq: seq[-1].append(name)
        else: seq.append([name])
print('omr:', dict(stats), 'parts:', len(root.findall('part')), 'measures:', len(root.find('part').findall('measure')))
# ground truth: rerun pitch probe and collect all staves, stripping dots
gt = subprocess.run([sys.executable, '-I', '-W', 'ignore', __file__.replace('compare_omr.py', 'vector_pitches.py'), pdf] + sys.argv[4:5], capture_output=True, text=True).stdout.split('\n')
truth = collections.defaultdict(list)
for i, line in enumerate(l for l in gt if l.strip()):
    truth[i % int(sys.argv[3])].extend(n.rstrip('.') for n in line.split()[1:])
ORDER='CDEFGAB'
key_of=lambda n: ORDER.index(n[0]) + 7*int(n[1:])
for i, (key, groups) in enumerate(sorted(staves.items())):
    seq = [n for g in groups for n in sorted(g, key=key_of)]
    ref = truth[i]; m = difflib.SequenceMatcher(None, ref, seq, autojunk=False)
    print(f'staff {key}: truth {len(ref)} notes, omr {len(seq)}, matching {sum(b.size for b in m.get_matching_blocks())} ({m.ratio():.0%} similarity)')
    a, b = collections.Counter(ref), collections.Counter(seq); hit = sum((a & b).values())
    print(f'   order-free: recall {hit/len(ref):.0%}, precision {hit/len(seq):.0%}')
