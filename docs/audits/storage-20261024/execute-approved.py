"""Execute only the 111 human-approved CSV targets. Preflight is the default.
No content writes, chmod, linked-file overwrites, runtime switches or process stops.
"""
import os, sys, json, csv, gzip, ctypes, hashlib, subprocess, time, re, shutil
from pathlib import Path
from collections import defaultdict

O=Path(__file__).resolve().parent; R=O.parents[2]
P=R/'AI-OS-Portable-1.0.5-win-x64'; H=P/'.ai-runtime'
ACTIVE='dev-preview-3.0.2-1792755198807-1eb1a04e'
STABLE='dev-preview-3.0.2-1792495559912-e4286100'
M=json.loads((O/'deletion-manifest.json').read_text('utf-8'))
C=list(csv.DictReader((O/'deletion-manifest.csv').open(encoding='utf-8-sig',newline='')))
assert len(C)==len(M['items'])==111
assert [x['path'] for x in C]==[x['path'] for x in M['items']]
for c,m in zip(C,M['items']):
    for key in ('category','files','logical_bytes','allocated_bytes','batch_reclaim_bytes'):
        assert str(c[key])==str(m[key]),(c['path'],key)
TARGETS=[Path(c['path']) for c in C]
assert len(set(TARGETS))==111
assert R==Path(M['root'])
def inside(p,q):return p==q or q in p.parents
assert not any(p!=q and inside(p,q) for p in TARGETS for q in TARGETS)
TARGET_STRINGS=[str(p) for p in TARGETS]
def selected(p):
    s=str(p)
    return any(s==q or s.startswith(q+'\\') for q in TARGET_STRINGS)
def loadgz(n):
    with gzip.open(O/n,'rt',encoding='utf-8') as f:return json.load(f)
A=loadgz('inventory.json.gz'); F=loadgz('files.json.gz')
OLD={s:(size,alloc,links) for s,size,alloc,links in F}
HARD={x['path']:x for x in A['hardlinks']}
cutoff=(O/'verify-retained.py').stat().st_mtime_ns
MANIFEST_HASH=hashlib.sha256((O/'deletion-manifest.csv').read_bytes()).hexdigest()
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p]
k.CreateFileW.restype=ctypes.c_void_p
k.GetFileInformationByHandleEx.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_uint32]
k.CloseHandle.argtypes=[ctypes.c_void_p]
k.SetFileInformationByHandle.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_uint32]
class Standard(ctypes.Structure):
    _fields_=[('allocation',ctypes.c_longlong),('eof',ctypes.c_longlong),('links',ctypes.c_uint32),('delete_pending',ctypes.c_byte),('directory',ctypes.c_byte)]
def info(p):
    s=os.stat(p,follow_symlinks=False)
    if s.st_file_attributes&0x400:raise RuntimeError('reparse point: '+str(p))
    h=k.CreateFileW(str(p),0,7,None,3,0,None)
    if h in (None,ctypes.c_void_p(-1).value):raise ctypes.WinError(ctypes.get_last_error())
    try:
        v=Standard()
        if not k.GetFileInformationByHandleEx(h,1,ctypes.byref(v),ctypes.sizeof(v)):raise ctypes.WinError(ctypes.get_last_error())
        return dict(size=s.st_size,allocation=v.allocation,links=v.links,device=s.st_dev,inode=s.st_ino,mtime=s.st_mtime_ns)
    finally:k.CloseHandle(h)
def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
def unlink_name(p):
    try:os.unlink(p);return
    except PermissionError:
        # Read-only Git objects in the duplicate Golden rehearsal must be unlinked
        # without chmod (which would change attributes on all hardlink names).
        if not os.lstat(p).st_file_attributes&1:raise
    h=k.CreateFileW(str(p),0x10000,7,None,3,0x00200000,None)
    if h in (None,ctypes.c_void_p(-1).value):raise ctypes.WinError(ctypes.get_last_error())
    try:
        # FileDispositionInfoEx: DELETE | POSIX | FORCE_IMAGE_CHECK | IGNORE_READONLY.
        # Microsoft STL uses this disposition instead of changing shared attributes.
        flags=ctypes.c_uint32(0x17)
        if not k.SetFileInformationByHandle(h,21,ctypes.byref(flags),ctypes.sizeof(flags)):raise ctypes.WinError(ctypes.get_last_error())
    finally:k.CloseHandle(h)
def write(n,v):
    (O/n).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def walk(p):
    s=os.lstat(p)
    if s.st_file_attributes&0x400:raise RuntimeError('reparse: '+str(p))
    if not p.is_dir():return [p],[]
    files=[];dirs=[p];stack=[p]
    while stack:
        d=stack.pop()
        for e in os.scandir(d):
            q=Path(e.path);s=e.stat(follow_symlinks=False)
            if s.st_file_attributes&0x400:raise RuntimeError('reparse: '+str(q))
            if e.is_dir(follow_symlinks=False):dirs.append(q);stack.append(q)
            elif e.is_file(follow_symlinks=False):files.append(q)
            else:raise RuntimeError('unsupported entry: '+str(q))
    return files,dirs
def safe_path(p):
    allowed=[R/'.planning',R/'.publish',R/'.design',H/'versions',Path(A['external'])]
    assert any(inside(p,q) and p!=q for q in allowed),p
    assert str(p)==os.path.abspath(p),p
    for q in [p,*p.parents]:
        if os.lstat(q).st_file_attributes&0x400:raise RuntimeError('linked ancestor: '+str(q))
    assert p.resolve()==p,p
    protected=[H/'versions'/v for v in M['retained_runtime_closure']]
    protected += [P/'data',P/'AI OS.exe',R/'.git',R/'CURRENT_GOLDEN_SNAPSHOT_2026-10-16',Path(M['retained_development_source'])]
    protected += [Path(x) for x in M['protected_build_inputs'] if Path(x)!=R/'.planning/baseline-asset-inventory-20261016/golden-restore-check']
    assert not any(inside(p,q) or inside(q,p) for q in protected),(p,'protected overlap')
def receipts():
    plans={}
    for p in (H/'dev-preview').glob('*.json'):
        try:d=json.loads(p.read_text('utf-8').removesuffix('\\n'))
        except ValueError:continue
        if d.get('candidate') and d.get('id'):plans[d['candidate']]=d
    return plans
def controls():
    assert (H/'.active-runtime').read_text('utf-8').strip()==ACTIVE,'active pointer changed'
    assert not (H/'updates/install.json').exists(),'update transaction present'
    plans=receipts();keep={ACTIVE,STABLE,'dev-preview-3.0.1-1792425106358-2f5d80a5','dev-preview-3.0.2-1792578763499-1e6a0822'}
    while True:
        prev=set(keep)
        for v in prev:
            if v in plans:keep.add(plans[v]['previous'])
        if prev==keep:break
    assert keep==set(M['retained_runtime_closure']),'retained chain changed'
    for v in keep:assert (H/'versions'/v).is_dir(),v
    for v,d in plans.items():
        if (H/'versions'/v).exists() and not selected(H/'versions'/v):
            assert not selected(H/'versions'/d['previous']),(v,'new incoming rollback reference')
    paths=[H/'.active-runtime',P/'AI OS.exe',P/'ai-os-portable.json']
    paths+=list((H/'dev-preview').glob('*.json'))
    return {str(p):sha(p) for p in paths}
def check_runtime(v):
    d=receipts()[v];base=H/'versions'/v;actual,_=walk(base)
    exp={x['path']:x for x in d['files']};bad=[]
    for f in actual:
        rel=f.relative_to(base).as_posix();x=exp.get(rel)
        if x and (f.stat().st_size!=x['size'] or sha(f)!=x['sha256']):bad.append(rel)
    aset={p.relative_to(base).as_posix() for p in actual}
    result=dict(candidate=v,files=len(aset),bad=bad,missing=sorted(set(exp)-aset),extra=sorted(aset-set(exp)),treeHash=d['treeHash'])
    old=next(x for x in json.loads((O/'retained-verification.json').read_text('utf-8')) if x['candidate']==v)
    assert not bad and not result['missing'] and result['extra']==old['extra'],result
    return result
def data_snapshot():
    roots=[]
    for s in A['data_dirs']:
        p=Path(s)
        if selected(p) or any(t in p.parts for t in ('.git','node_modules','CURRENT_GOLDEN_SNAPSHOT_2026-10-16')):continue
        if p.exists():roots.append(p)
    roots=sorted(set(roots),key=lambda p:len(p.parts));top=[]
    for p in roots:
        if not any(inside(p,q) for q in top):top.append(p)
    result={}
    for p in top:
        files,_=walk(p)
        for f in files:
            s=f.stat();result[str(f)]=[s.st_size,s.st_mtime_ns,sha(f)]
    return result
def git_snapshot():
    status=subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=normal'],cwd=R).decode('utf-8')
    names=subprocess.check_output(['git','ls-files','-z'],cwd=R).decode('utf-8').split('\0')
    tracked={s:sha(R/s) if (R/s).is_file() else None for s in names if s}
    return dict(head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=R).decode().strip(),status=status,tracked=tracked)
def verify_duplicate(row):
    p=Path(row['path']);cat=row['category']
    if cat=='golden-restore-copy':
        gold=R/'CURRENT_GOLDEN_SNAPSHOT_2026-10-16'
        records=json.loads((gold/'metadata/recovery-manifest.json').read_text('utf-8-sig'))
        for x in records:
            rel=x['path'].replace('\\','/')
            for f in (p/rel,gold/'payload'/rel):
                assert f.stat().st_size==x['bytes'] and sha(f)==x['sha256'],'Golden duplicate differs: '+str(f)
    elif cat=='publish-unpacked':
        import zipfile
        zpath=Path(row['proof']);assert zpath.exists()
        with zipfile.ZipFile(zpath) as z:
            prefix=p.name+'/'
            entries={i.filename[len(prefix):]:i for i in z.infolist() if not i.is_dir() and i.filename.startswith(prefix)}
            files,_=walk(p);assert len(files)==len(entries)
            for f in files:
                rel=f.relative_to(p).as_posix();x=entries[rel]
                assert f.stat().st_size==x.file_size
                with z.open(x) as stream:
                    h=hashlib.sha256()
                    for b in iter(lambda:stream.read(4*1024*1024),b''):h.update(b)
                assert sha(f)==h.hexdigest(),'ZIP duplicate differs: '+str(f)
    elif cat=='design-identical-backup':
        q=Path(row['proof']);files,_=walk(p);other,_=walk(q)
        assert {f.relative_to(p).as_posix():sha(f) for f in files}=={f.relative_to(q).as_posix():sha(f) for f in other}
def changed_references():
    # Only control/source files changed since the initial audit, not a second whole-project audit.
    names=[]
    prune={'node_modules','.git','dist','build','release','.cache','data','.ai-runtime','CURRENT_GOLDEN_SNAPSHOT_2026-10-16'}
    for root in [R/'neon-workbench',R/'release-tools',R/'scripts',R/'.publish/SuperQAI']:
        if not root.exists():continue
        for d,dirs,files in os.walk(root,followlinks=False):
            dirs[:]=[n for n in dirs if n not in prune and not os.lstat(Path(d)/n).st_file_attributes&0x400]
            for n in files:
                p=Path(d)/n
                if p.suffix.lower() not in {'.js','.mjs','.cjs','.json','.ps1','.cmd','.bat','.ts','.tsx','.yml','.yaml'}:continue
                s=p.stat()
                if s.st_mtime_ns>cutoff and s.st_size<4*1024*1024:names.append(p)
    for p in R.iterdir():
        if p.is_file() and p.suffix.lower() in {'.json','.js','.mjs','.cjs','.ps1','.cmd','.bat'} and p.stat().st_mtime_ns>cutoff:names.append(p)
    hits=defaultdict(list)
    for p in names:
        text=p.read_text('utf-8',errors='replace').replace('\\\\','/').replace('\\','/')
        for row in M['items']:
            t=Path(row['path']);rel=t.relative_to(R).as_posix() if inside(t,R) else t.as_posix()
            if rel in text or str(t).replace('\\','/') in text or (t.name.startswith('dev-preview-') and t.name in text):hits[str(t)].append(str(p))
    return dict(hits)
def preflight():
    started=time.time();result=dict(started=started,csv_sha256=MANIFEST_HASH,executed=False,items=[],controls=controls())
    print('Checking protected runtimes and user data',flush=True)
    result['runtimes']=[]
    for v in (ACTIVE,STABLE,'dev-preview-3.0.1-1792425106358-2f5d80a5','dev-preview-3.0.2-1792578763499-1e6a0822'):
        result['runtimes'].append(check_runtime(v));print('Protected hash OK '+v,flush=True)
    # Full dependency chain file membership and sizes must still match the audited inventory.
    for v in M['retained_runtime_closure']:
        base=H/'versions'/v;files,_=walk(base)
        prefix=str(base)+'\\'
        expected={s:size for s,(size,_,_) in OLD.items() if s.startswith(prefix)}
        assert {str(p):p.stat().st_size for p in files}==expected,('retained chain changed',v)
    data=data_snapshot();write('cleanup-data-before.json',data)
    result['data_files']=len(data);result['data_bytes']=sum(x[0] for x in data.values())
    result['data_vs_audit_missing']=[s for s in OLD if inside(Path(s),P/'data') and s not in data]
    result['data_vs_audit_size_changes']=[s for s in data if s in OLD and data[s][0]!=OLD[s][0]]
    assert not result['data_vs_audit_missing'],'previously recorded Portable data missing'
    write('cleanup-git-before.json',git_snapshot())
    changes=changed_references();result['new_reference_hits']=changes
    cached={};touched_groups=set()
    for i,row in enumerate(M['items']):
        p=Path(row['path']);rec=dict(path=str(p),category=row['category'],eligible=False)
        try:
            safe_path(p);files,dirs=walk(p);now={};reasons=[]
            for d in dirs:assert d.stat().st_mtime_ns<=cutoff,'directory changed after audit: '+str(d)
            prefix=str(p)+'\\'
            exp={s:meta for s,meta in OLD.items() if s==str(p) or s.startswith(prefix)}
            assert len(files)==int(row['files']),f'file count changed {len(files)} != {row["files"]}'
            assert {str(f) for f in files}==set(exp),'file membership changed'
            for f in files:
                s=str(f);v=info(f);old=exp[s]
                assert (v['size'],v['allocation'],v['links'])==old,'size/allocation/link count changed: '+s
                assert v['mtime']<=cutoff,'file modified after audit: '+s
                if v['links']>1:
                    h=HARD[s];assert (v['device'],v['inode'])==(h['device'],h['inode']),'hardlink identity changed: '+s
                    touched_groups.add((v['device'],v['inode']))
                now[s]=v
            assert not changes.get(str(p)),'new/changed source reference: '+str(changes.get(str(p)))
            verify_duplicate(row)
            rec.update(eligible=True,files=len(files),logical_bytes=sum(v['size'] for v in now.values()),directories=len(dirs))
            cached[str(p)]={'files':now,'directories':[str(d) for d in dirs]}
        except Exception as e:rec['reason']=str(e)
        result['items'].append(rec)
        print(f'{i+1}/111 '+('OK ' if rec['eligible'] else 'SKIP ')+str(p)+((': '+rec['reason']) if 'reason' in rec else ''),flush=True)
    # Revalidate every retained name of every group touched by this deletion batch.
    kept={}
    for s,h in HARD.items():
        if (h['device'],h['inode']) not in touched_groups or selected(s):continue
        v=info(Path(s))
        assert (v['device'],v['inode'],v['size'],v['links'])==(h['device'],h['inode'],h['logical'],h['nlink']),('retained shared file changed',s)
        kept[s]=dict(device=v['device'],inode=v['inode'],size=v['size'],sha256=sha(Path(s)))
    write('cleanup-shared-retained.json',kept)
    with gzip.open(O/'cleanup-live-targets.json.gz','wt',encoding='utf-8') as f:json.dump(cached,f,ensure_ascii=False)
    assert controls()==result['controls'],'controls changed during preflight'
    result.update(eligible=sum(x['eligible'] for x in result['items']),elapsed_seconds=time.time()-started)
    write('cleanup-preflight.json',result)
    print(json.dumps({k:result[k] for k in ('eligible','data_files','data_bytes','elapsed_seconds')},ensure_ascii=False),flush=True)

def execute():
    pre=json.loads((O/'cleanup-preflight.json').read_text('utf-8'))
    assert pre['csv_sha256']==MANIFEST_HASH,'manifest changed'
    assert time.time()-pre['started']<3600,'preflight expired'
    assert controls()==pre['controls'],'controls changed'
    assert not (O/'cleanup-execution.json').exists(),'execution already recorded'
    cache=loadgz('cleanup-live-targets.json.gz');live_refs=changed_references()
    result=dict(started=time.time(),csv_sha256=MANIFEST_HASH,executed=True,free_before=shutil.disk_usage('Q:\\').free,items=[])
    write('cleanup-execution.json',result)
    for row,checked in zip(M['items'],pre['items']):
        p=Path(row['path']);rec=dict(path=str(p),status='skipped')
        if not checked['eligible']:rec['reason']=checked['reason']
        else:
            try:
                assert controls()==pre['controls'],'runtime/control changed'
                assert not live_refs.get(str(p)),'new reference'
                safe_path(p);files,dirs=walk(p);old=cache[str(p)]['files']
                assert {str(f) for f in files}==set(old),'membership changed since preflight'
                for f in files:
                    v=info(f);was=old[str(f)]
                    # Link count can decrease as earlier approved names are unlinked.
                    assert all(v[k]==was[k] for k in ('size','allocation','device','inode','mtime')),'file changed since preflight: '+str(f)
                    assert 1<=v['links']<=was['links'],'new hardlink: '+str(f)
                rec['status']='deleting';result['items'].append(rec);write('cleanup-execution.json',result)
                # Safe unlink only. Never clear/truncate/chmod a file; never follow links.
                for f in files:unlink_name(f)
                for d in sorted(dirs,key=lambda p:len(p.parts),reverse=True):os.rmdir(d)
                assert not p.exists()
                rec['status']='deleted';rec['files']=len(files)
            except Exception as e:
                rec['reason']=str(e)
                if rec['status']=='deleting':rec['status']='partial-error'
        if rec not in result['items']:result['items'].append(rec)
        result['free_after_latest']=shutil.disk_usage('Q:\\').free;write('cleanup-execution.json',result)
        print(rec['status']+' '+str(p)+((': '+rec['reason']) if 'reason' in rec else ''),flush=True)
    result['free_after']=shutil.disk_usage('Q:\\').free
    result['free_delta_bytes']=result['free_after']-result['free_before']
    result['finished']=time.time();write('cleanup-execution.json',result)
    print('DONE '+json.dumps({s:sum(x['status']==s for x in result['items']) for s in ('deleted','skipped','partial-error')})+' GiB='+str(result['free_delta_bytes']/2**30),flush=True)

def postcheck():
    ex=json.loads((O/'cleanup-execution.json').read_text('utf-8'));pre=json.loads((O/'cleanup-preflight.json').read_text('utf-8'))
    out=dict(controls_unchanged=controls()==pre['controls'])
    out['runtimes']=[check_runtime(v) for v in (ACTIVE,STABLE,'dev-preview-3.0.1-1792425106358-2f5d80a5','dev-preview-3.0.2-1792578763499-1e6a0822')]
    before=json.loads((O/'cleanup-data-before.json').read_text('utf-8'));after=data_snapshot()
    out['data_files_before']=len(before);out['data_files_after']=len(after)
    out['data_missing']=sorted(set(before)-set(after));out['data_added']=sorted(set(after)-set(before))
    out['data_changed']=[s for s in before.keys()&after.keys() if before[s]!=after[s]]
    shared=json.loads((O/'cleanup-shared-retained.json').read_text('utf-8'));out['shared_retained_bad']=[]
    for s,old in shared.items():
        v=info(Path(s))
        if not (v['device']==old['device'] and v['inode']==old['inode'] and v['size']==old['size'] and sha(Path(s))==old['sha256']):out['shared_retained_bad'].append(s)
    out['shared_retained_checked']=len(shared)
    beforegit=json.loads((O/'cleanup-git-before.json').read_text('utf-8'));aftergit=git_snapshot()
    out['git_head_unchanged']=beforegit['head']==aftergit['head']
    out['tracked_source_changes']=[s for s in beforegit['tracked'] if beforegit['tracked'][s]!=aftergit['tracked'].get(s)]
    out['git_status_unchanged']=beforegit['status']==aftergit['status']
    out['deleted_targets_still_present']=[x['path'] for x in ex['items'] if x['status']=='deleted' and Path(x['path']).exists()]
    out['free_now']=shutil.disk_usage('Q:\\').free
    write('cleanup-postcheck.json',out)
    print(json.dumps(out,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':
    mode=sys.argv[1] if len(sys.argv)>1 else 'preflight'
    {'preflight':preflight,'execute':execute,'postcheck':postcheck}[mode]()
