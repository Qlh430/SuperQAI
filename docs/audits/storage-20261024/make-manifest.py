"""Generate review manifests only. Contains no deletion operation."""
import json,csv,re,gzip
from pathlib import Path
from collections import defaultdict
O=Path(__file__).parent
def metadata(name):
    with gzip.open(O/(name+'.gz'),'rt',encoding='utf-8') as f:return json.load(f)
A=metadata('inventory.json'); R=Path(A['root']); E=Path(A['external'])
F=metadata('files.json'); D=A['dirs']; rows=[]
P=R/'AI-OS-Portable-1.0.5-win-x64/.ai-runtime';plans={}
for f in (P/'dev-preview').glob('*.json'):
    try:
        d=json.loads(f.read_text('utf-8').removesuffix('\\n'))
        if d.get('id') and d.get('candidate'):plans[d['candidate']]=d
    except ValueError:pass
keep={'dev-preview-3.0.2-1792755198807-1eb1a04e','dev-preview-3.0.2-1792495559912-e4286100','dev-preview-3.0.1-1792425106358-2f5d80a5','dev-preview-3.0.2-1792578763499-1e6a0822'}
while True:
    prev=set(keep)
    for c in prev:
        if c in plans:keep.add(plans[c]['previous'])
    if prev==keep:break
protected=[
 '.planning/v3.0.1-final-go-no-go-20261018/full-candidate-20261018-r2',
 '.planning/v3.0.1-today-20261019/candidate-3.0.1-last3',
 '.planning/v3.0.1-today-20261019/release-3.0.1-last3',
 '.planning/v3.0.1-release-execution-20261020/portable',
 '.planning/v3.0.1-release-execution-20261020/css',
 '.planning/v3.0.2-release-execution-20261021/portable',
 '.planning/v3.0.2-interaction-final-20261020/preview-runtime-outpaint',
 '.planning/image-info-single-material-20261021/candidate-source',
 '.planning/20261019-interaction-polish/staging-runtime',
 '.planning/agent-native-p0-20261018', '.planning/agent-native-p0-final-20261018',
 '.planning/baseline-asset-inventory-20261016/golden-restore-check',
]
protected=[R/x for x in protected]
def inside(p,q):return p==q or q in p.parents
def add(p,category,why,refs,impact,proof=''):
    p=Path(p)
    if p.is_dir():v=D[str(p)]
    else:
        t=next(x for x in F if x[0]==str(p));v={'logical':t[1],'allocated':t[2],'files':1}
    rows.append(dict(path=str(p),category=category,logical_bytes=v['logical'],allocated_bytes=v['allocated'],files=v['files'],reason=why,references=refs,impact=impact,proof=proof,status='待用户确认；执行前复核'))
for s in A['runtimes']:
    p=Path(s)
    if not inside(p,R/'.planning') or any(inside(p,q) for q in protected) or D.get(s,{}).get('logical',0)<100_000_000:continue
    add(p,'planning-runtime','过往验收/修复的组装运行时；只移除运行时叶目录，保留父目录源码、数据、脚本和证据','非当前启动目标、非保留稳定版；旧测试脚本/报告可能按路径引用，需重新生成旧夹具','当前启动、构建必需输入及保留回退版不变；该历史测试安装不能直接再启动')
for p in (P/'versions').iterdir():
    if p.name not in keep:
        incoming=[c for c,d in plans.items() if d.get('previous')==p.name]
        assert not any(c in keep for c in incoming)
        add(p,'obsolete-preview','未验收候选或已离开当前/稳定回退链的历史分支','历史 previous 引用仅来自本批同时退役的候选：'+(', '.join(incoming) or '无')+'；保留版本 previous 引用为零；receipt 保留作证据','失去本条历史候选及所属退役分支的启动/回退能力；当前、稳定及其既有 previous 链完整保留')
for s in A['runtimes']:
    p=Path(s)
    if inside(p,E) and p.name!='video-hover-icon-centered-20261023-stage-r1':add(p,'external-stage','独立临时组装源；现有候选拥有独立完整副本','receipt.source/历史组装脚本的来源记录；activate/rollback 不读取 source','既有候选启动/切换不受影响；重做旧 prepare 需重新组装来源')
for x in A['archives']:
    p=Path(x['path']);rel=p.relative_to(R).as_posix() if inside(p,R) else ''
    if rel.startswith('.planning/v3.0.1-today-20261019/release-') and '/release-3.0.1-last3/' not in rel:
        add(p,'obsolete-release-zip','已被正式 3.0.1/3.0.2 发布包替代的历史轮次压缩产物；保留同目录小型元数据/脚本','旧轮次发布/验收记录有路径和 Hash 引用；当前发布构建默认 last3 输入及正式包均保留','不能直接重新分发该轮旧候选压缩包；当前运行/正式发布包/回退不受影响')
    elif rel=='.planning/v3.0.1-release-execution-20261020/update-test-objects/workbench-core-3.0.3.zip':
        add(p,'obsolete-release-zip','历史模拟更新测试压缩产物','旧验收夹具；非正式 3.0.3 发布包','重跑历史更新测试需重新生成；不影响现有正式发布资料')
V=json.loads((O/'duplicate-verification.json').read_text('utf-8'))
if all(not x['mismatches'] and not x['extras'] for x in V['golden'].values()):
    add(R/'.planning/baseline-asset-inventory-20261016/golden-restore-check','golden-restore-copy','Golden 恢复演练副本；两棵树逐文件 SHA256 与同一恢复清单完全相同','仅历史恢复演练路径；完整 Golden/payload 和恢复元数据保留','删除已验证可重建的演练副本；其中输出素材也在 Golden 原样保留','duplicate-verification.json:golden')
for v in V['publish']:
    if not v['mismatches'] and not v['zip_only'] and v['files']==v['zip_files']:
        add(Path(v['directory']),'publish-unpacked','解压式安装构建与保留 Portable ZIP 每个文件 SHA256 完全一致','历史打包输出；ZIP 及源码、配置、发布元数据保留；再次打包/验收需重建该输出目录','可由下列 ZIP 精确恢复全部文件；当前原始程序及用户数据不受影响',v['retained_zip'])
for group in json.loads((O/'design-duplicate-verification.json').read_text('utf-8')):
    for s in group[:-1]:add(Path(s),'design-identical-backup','整个备份目录的相对路径及 SHA256 完全相同；保留较新同内容副本','仅历史备份定位；恢复时使用保留同内容副本','保留所有不同内容的部署备份',group[-1])
paths=[Path(x['path']) for x in rows]
assert len(set(paths))==len(paths)
assert not any(p!=q and inside(p,q) for p in paths for q in paths)
prefixes=[(str(q)+'\\',str(q),x['category']) for q,x in zip(paths,rows)]
hard_by_path={x['path']:(x['device'],x['inode']) for x in A['hardlinks']}
selected_hard=defaultdict(list)
for x in rows:
    x.update(batch_reclaim_bytes=0,standalone_reclaim_bytes=0,hardlink_names=0,shared_with_retained_names=0)
for s,_,_,links in F:
    hits=[(prefix,base,cat) for prefix,base,cat in prefixes if s==base or s.startswith(prefix)]
    if not hits:continue
    owner=next(i for i,(prefix,base,cat) in enumerate(prefixes) if s==base or s.startswith(prefix))
    if links>1:
        selected_hard[hard_by_path[s]].append((owner,s))
        rows[owner]['hardlink_names']+=1
    else:
        # tuple allocation is read below by the separate accounting pass.
        pass
    # Golden recovery copy is wholly backed by retained Golden. No other data may be removed.
    if hits[0][2]=='golden-restore-copy':continue
    rels=[s[len(base):].lstrip('\\').replace('\\','/') for _,base,_ in hits]
    assert not any(re.search(r'(^|/)(data|output|uploads|\.desktop|\.git)(/|$)|(^|/)\.env$|\.(sqlite(?:-wal|-shm)?|db|pem|key)$',s,re.I) for s in rels),s
for l in A['reparse']:assert not any(inside(Path(l['path']),q) for q in paths),l
for s,logical,allocated,links in F:
    if links>1:continue
    owner=next((i for i,(prefix,base,cat) in enumerate(prefixes) if s==base or s.startswith(prefix)),None)
    if owner is not None:
        rows[owner]['batch_reclaim_bytes']+=allocated
        rows[owner]['standalone_reclaim_bytes']+=allocated
hardgroups=defaultdict(list)
for x in A['hardlinks']:hardgroups[(x['device'],x['inode'])].append(x)
shared=[]
for identity,selected in selected_hard.items():
    group=hardgroups[identity];allocated=group[0]['allocated'];nlink=group[0]['nlink']
    owners={i for i,s in selected};complete=len(selected)==nlink
    if complete:
        # Credit once to the smallest manifest row index. Full-batch credit is not an independent estimate.
        rows[min(owners)]['batch_reclaim_bytes']+=allocated
        if len(owners)==1:rows[min(owners)]['standalone_reclaim_bytes']+=allocated
    else:
        for i,s in selected:rows[i]['shared_with_retained_names']+=1
    shared.append({'device':identity[0],'inode':identity[1],'nlink':nlink,'allocated_bytes':allocated,'selected_paths':[s for i,s in selected],'retained_paths':[x['path'] for x in group if x['path'] not in {s for i,s in selected}],'reclaim_bytes':allocated if complete else 0})
with gzip.open(O/'hardlink-impact.json.gz','wt',encoding='utf-8') as f:json.dump(shared,f,ensure_ascii=False,separators=(',',':'))
totals=defaultdict(lambda:{'logical_bytes':0,'allocated_bytes':0,'items':0})
for x in rows:
    t=totals[x['category']];t['logical_bytes']+=x['logical_bytes'];t['allocated_bytes']+=x['allocated_bytes'];t['items']+=1
    t['batch_reclaim_bytes']=t.get('batch_reclaim_bytes',0)+x['batch_reclaim_bytes']
out={'format':1,'date':'2026-10-24','executed':False,'root':str(R),'retained_development_source':str(E/'video-hover-icon-centered-20261023-stage-r1'),'retained_runtime_closure':sorted(keep),'protected_build_inputs':[str(x) for x in protected],'totals':dict(totals),'items':rows}
(O/'deletion-manifest.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
with (O/'deletion-manifest.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
md=['# 待确认的逐项清理清单','', '所有条目均未执行。GiB = 2^30 字节；精确字节及逐项引用、影响见 CSV/JSON。目标互不嵌套。','', '硬链接按卷及文件身份分组，仍有保留链接的文件计释放 0；全部链接在本批时只算一次，并归入清单最前目标的“整批释放归账”。它是整批预算分摊，不能作为单删该项目的收益。“单删释放”是只删除该项目的保守收益，不能代替整批核算。原始分配列含共享文件，不能当作真实释放相加。','']
for category,total in totals.items():
    md += [f'## {category} — {total["items"]} 项，整批释放归账 {total["batch_reclaim_bytes"]/2**30:.3f} GiB','', '| 路径 | 逻辑 GiB | 原始分配 GiB | 单删释放 GiB | 整批释放归账 GiB |','|---|---:|---:|---:|---:|']
    for x in rows:
        if x['category']==category:md.append(f'| `{x["path"]}` | {x["logical_bytes"]/2**30:.6f} | {x["allocated_bytes"]/2**30:.6f} | {x["standalone_reclaim_bytes"]/2**30:.6f} | {x["batch_reclaim_bytes"]/2**30:.6f} |')
    first=next(x for x in rows if x['category']==category)
    md += ['',first['reason'],'', '**引用及影响：** '+first['references']+'。'+first['impact']+'。每项具体证据、退役分支引用或可恢复 ZIP 路径见 CSV/JSON。','']
(O/'删除清单.md').write_text('\n'.join(md),encoding='utf-8')
print(json.dumps({'totals':dict(totals),'items':len(rows),'retained_versions':len(keep)},ensure_ascii=False,indent=2))
