import hashlib,json
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=Path(__file__).parent
home=R/'AI-OS-Portable-1.0.5-win-x64/.ai-runtime'
ids=['1792755198807-1eb1a04e','1792753884005-a67fed82','1792495559912-e4286100','1792425106358-2f5d80a5','1792578763499-1e6a0822']
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
results=[]
for id in ids:
 p=home/'dev-preview'/f'{id}.json';j=json.loads(p.read_text(encoding='utf-8'));base=home/'versions'/j['candidate'];bad=[]
 for x in j['files']:
  q=base/x['path']
  if not q.is_file() or q.stat().st_size!=x['size'] or sha(q)!=x['sha256']:bad.append(x['path'])
 actual={str(q.relative_to(base)).replace('\\','/') for q in base.rglob('*') if q.is_file()}
 expected={x['path'] for x in j['files']}
 results.append(dict(candidate=j['candidate'],receipt=str(p),phase=j['phase'],treeHash=j['treeHash'],files=len(expected),bad=bad,extra=sorted(actual-expected),missing=sorted(expected-actual),previous=j['previous']))
 print(j['candidate'],len(expected),'bad',len(bad),'extra',len(actual-expected),flush=True)
(O/'retained-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
