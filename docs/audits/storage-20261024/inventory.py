"""Read-only storage audit; writes metadata reports only, never follows reparse points."""
import os, json, ctypes, time, gzip
from pathlib import Path
from collections import defaultdict
ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).parent
EXT = ROOT.parent / 'AI-OS-Preview-Staging'
k = ctypes.WinDLL('kernel32', use_last_error=True)
k.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p]
k.CreateFileW.restype=ctypes.c_void_p
k.GetFileInformationByHandleEx.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_uint32]
k.CloseHandle.argtypes=[ctypes.c_void_p]
class Standard(ctypes.Structure):
    _fields_=[('allocation',ctypes.c_longlong),('eof',ctypes.c_longlong),('links',ctypes.c_uint32),('delete_pending',ctypes.c_byte),('directory',ctypes.c_byte)]
dirs=defaultdict(lambda:dict(logical=0,allocated=0,files=0,allocation_errors=0,hardlinks=0))
links=[]; errors=[]; hard=[]; runtimes=[]; archives=[]; data=[]; allfiles=[]
started=time.time()
def walk(base):
    stack=[base]
    while stack:
        d=stack.pop()
        try: entries=list(os.scandir(d))
        except OSError as e: errors.append([str(d),str(e)]);continue
        for x in entries:
            p=Path(x.path)
            try:
                s=x.stat(follow_symlinks=False)
                if s.st_file_attributes & 0x400:
                    try: target=os.readlink(p)
                    except OSError: target='unresolved'
                    links.append(dict(path=str(p),target=target));continue
                if x.is_dir(follow_symlinks=False):
                    stack.append(p)
                    if p.name=='app' and p.parent.name=='resources' and (p/'package.json').exists(): runtimes.append(str(p.parent.parent))
                    if p.name.lower() in ('data','output','uploads','.desktop','.git'): data.append(str(p))
                    continue
                h=k.CreateFileW(str(p),0,7,None,3,0,None)
                std=Standard(); ok=h not in (None,ctypes.c_void_p(-1).value) and k.GetFileInformationByHandleEx(h,1,ctypes.byref(std),ctypes.sizeof(std))
                if h not in (None,ctypes.c_void_p(-1).value): k.CloseHandle(h)
                allocated=std.allocation if ok else 0
                # Windows DirEntry.stat caches st_nlink=0. Use the opened handle.
                nlink=std.links if ok else os.stat(p).st_nlink
                if nlink>1:
                    identity=os.stat(p)
                    hard.append(dict(path=str(p),device=identity.st_dev,inode=identity.st_ino,nlink=nlink,logical=s.st_size,allocated=allocated))
                if p.suffix.lower() in ('.zip','.7z','.asar') and s.st_size>100_000_000: archives.append(dict(path=str(p),logical=s.st_size,allocated=allocated))
                allfiles.append((str(p),s.st_size,allocated,nlink))
                parent=p.parent
                while parent==base or base in parent.parents:
                    a=dirs[str(parent)];a['logical']+=s.st_size;a['allocated']+=allocated;a['files']+=1;a['allocation_errors']+=int(not ok);a['hardlinks']+=int(nlink>1)
                    if parent==base:break
                    parent=parent.parent
            except OSError as e: errors.append([str(p),str(e)])
for b in (ROOT,EXT):
    if b.exists():walk(b)
result=dict(root=str(ROOT),external=str(EXT),elapsed=time.time()-started,dirs=dict(dirs),reparse=links,errors=errors,hardlinks=hard,runtimes=runtimes,archives=archives,data_dirs=data)
with gzip.open(OUT/'inventory.json.gz','wt',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,separators=(',',':'))
# Only metadata, no file contents or credentials.
with gzip.open(OUT/'files.json.gz','wt',encoding='utf-8') as f:json.dump(allfiles,f,ensure_ascii=False,separators=(',',':'))
print(json.dumps(dict(elapsed=result['elapsed'],roots={str(b):dirs[str(b)] for b in (ROOT,EXT)},reparse=len(links),errors=len(errors),hardlinks=len(hard),runtime_roots=len(runtimes),archives=len(archives)),ensure_ascii=False))
