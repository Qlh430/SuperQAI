"""Read files and ZIP streams; write audit metadata only. Never extract or delete."""
import json, hashlib, zipfile, time
from pathlib import Path
OUT=Path(__file__).parent
ROOT=OUT.resolve().parents[2]
def digest(stream):
    h=hashlib.sha256()
    while b:=stream.read(4*1024*1024): h.update(b)
    return h.hexdigest()
def filehash(p):
    with p.open('rb') as f:return digest(f)
result={'golden':{},'publish':[]}
gold=ROOT/'CURRENT_GOLDEN_SNAPSHOT_2026-10-16'
restore=ROOT/'.planning/baseline-asset-inventory-20261016/golden-restore-check'
manifest=json.loads((gold/'metadata/recovery-manifest.json').read_text('utf-8-sig'))
expected={x['path'].replace('\\','/'):x for x in manifest}
for label,base in [('golden',gold/'payload'),('restore',restore)]:
    actual={p.relative_to(base).as_posix():p for p in base.rglob('*') if p.is_file()}
    bad=[]
    for rel,rec in expected.items():
        p=actual.get(rel)
        if p is None or p.stat().st_size!=rec['bytes'] or filehash(p)!=rec['sha256']:bad.append(rel)
    result['golden'][label]={'files':len(actual),'manifest_files':len(expected),'mismatches':bad,'extras':sorted(set(actual)-set(expected))}
    print(label,result['golden'][label],flush=True)
dist=ROOT/'.publish/SuperQAI/dist'
for d in sorted(dist.glob('AI-OS-Portable-*')):
    version=d.name.removeprefix('AI-OS-Portable-').removesuffix('-win-x64')
    zpath=dist/'release'/version/(d.name+'.zip')
    actual={p.relative_to(d).as_posix():p for p in d.rglob('*') if p.is_file()}
    with zipfile.ZipFile(zpath) as z:
        prefix=d.name+'/'
        entries={i.filename[len(prefix):]:i for i in z.infolist() if not i.is_dir() and i.filename.startswith(prefix)}
        bad=[]
        for rel,p in actual.items():
            i=entries.get(rel)
            if i is None or i.file_size!=p.stat().st_size:bad.append(rel);continue
            with z.open(i) as stream:zh=digest(stream)
            if filehash(p)!=zh:bad.append(rel)
        rec={'directory':str(d),'retained_zip':str(zpath),'files':len(actual),'zip_files':len(entries),'mismatches':bad,'zip_only':sorted(set(entries)-set(actual))}
        result['publish'].append(rec)
        print(version,rec,flush=True)
(OUT/'duplicate-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
