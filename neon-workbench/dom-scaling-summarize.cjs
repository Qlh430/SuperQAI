const fs=require('node:fs'),path=require('node:path');
const folder=path.resolve(__dirname,'../.planning/dom-scaling-20261015',process.env.LABEL||'matrix-p3-complete');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'results.json')));
const q=(values,p=.5)=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.ceil(a.length*p)-1]:null;};
const exactDetached=point=>{
  const file=point?.detachedDOM?.rawFile;if(!file||!fs.existsSync(file))return null;
  const data=JSON.parse(fs.readFileSync(file));let full=0,light=0;
  const visit=n=>{const a=n.attributes||[],i=a.indexOf('class'),tokens=i<0?[]:a[i+1].split(/\s+/);if(tokens.includes('canvas-node'))full++;if(tokens.includes('canvas-light-node'))light++;for(const c of n.children||[])visit(c);for(const c of n.shadowRoots||[])visit(c);};
  for(const row of data.detachedNodes||[])visit(row.treeNode);
  return {full,light};
};
const rows=[];
for(const baseline of [true,false])for(const scenario of ['A','B'])for(const count of [36,100,200,500]){
  const cases=manifest.results.filter(r=>r.baseline===baseline&&r.scenario===scenario&&r.count===count);
  const median=fn=>q(cases.map(fn));const peak=(r,k)=>Math.max(r.idle?.[k]||0,r.nativePan?.peak?.[k]||0,r.nativeZoom?.peak?.[k]||0);
  const row={mode:baseline?'旧路径':'P0–P3',scenario,count,rounds:cases.length,
    documentDOM:median(r=>peak(r,'documentDOM')),canvasDOM:median(r=>peak(r,'canvasDOM')),
    full:median(r=>r.idle.full),light:median(r=>r.idle.light),canvas:median(r=>r.idle.canvas),visible:median(r=>r.idle.visible),
    fullPeak:Math.max(0,...cases.map(r=>peak(r,'full'))),fullNodeDOM:median(r=>r.idle.fullDOMAverage||r.final?.fullDOMAverage),
    hydrateCount:median(r=>r.final?.representation?.hydrateCount),dehydrateCount:median(r=>r.final?.representation?.dehydrateCount),
    hydrateP50:median(r=>r.final?.representation?.hydrateP50),hydrateP95:median(r=>r.final?.representation?.hydrateP95),
    dehydrateP50:median(r=>r.final?.representation?.dehydrateP50),dehydrateP95:median(r=>r.final?.representation?.dehydrateP95),
    failures:cases.flatMap(r=>r.failures.map(error=>({id:r.id,error}))),
    memory:cases.map(r=>({id:r.id,points:r.memoryWaypoints.map(p=>({phase:p.phase,heap:p.heap.usedSize,nodes:p.dom.nodes,listeners:p.dom.jsEventListeners,detachedTrees:p.detachedDOM.treeCount,detachedRetained:p.detachedDOM.retainedNodeCount,detachedExact:exactDetached(p)}))}))};
  for(const [name,key]of [['pan','nativePan'],['zoom','nativeZoom']]){
    row[name]={p50:median(r=>r[key]?.activeFrames.p50),p95:median(r=>r[key]?.activeFrames.p95),
      allP95:median(r=>r[key]?.wholeFrames.p95),transitionP95:median(r=>r[key]?.transitionFrames.p95),max:Math.max(0,...cases.map(r=>r[key]?.wholeFrames.max||0)),
      style:median(r=>r[key]?.trace.traceTotals.UpdateLayoutTree.ms),styleRecalculation:median(r=>r[key]?.trace.cdpMetricsDelta.RecalcStyleDuration*1000),layout:median(r=>r[key]?.trace.traceTotals.Layout.ms),paint:median(r=>r[key]?.trace.traceTotals.Paint.ms),driverMs:median(r=>r[key]?.driverMs),
      longTasks:median(r=>r[key]?.longTasks.length),longTaskMs:median(r=>r[key]?.longTasks.reduce((n,t)=>n+t.duration,0)),
      runs:cases.map(r=>({round:r.round,p95:r[key]?.activeFrames.p95,allP95:r[key]?.wholeFrames.p95,transitionP95:r[key]?.transitionFrames.p95,max:r[key]?.wholeFrames.max,counts:r[key]?.transitionCounts}))};
  }
  rows.push(row);
}
const summary={generatedAt:new Date().toISOString(),verdict:manifest.verdict,comparisons:manifest.comparisons,rows};
fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(summary,null,2));
const flat=rows.map(r=>({mode:r.mode,scenario:r.scenario,count:r.count,rounds:r.rounds,documentDOM:r.documentDOM,canvasDOM:r.canvasDOM,full:r.full,light:r.light,canvas:r.canvas,panP50:r.pan.p50,panP95:r.pan.p95,zoomP50:r.zoom.p50,zoomP95:r.zoom.p95,panStyle:r.pan.style,panLayout:r.pan.layout,panPaint:r.pan.paint,zoomStyle:r.zoom.style,zoomLayout:r.zoom.layout,zoomPaint:r.zoom.paint,panLongTasks:r.pan.longTasks,zoomLongTasks:r.zoom.longTasks,hydrateP50:r.hydrateP50,hydrateP95:r.hydrateP95,dehydrateP50:r.dehydrateP50,dehydrateP95:r.dehydrateP95}));
const columns=Object.keys(flat[0]);fs.writeFileSync(path.join(folder,'summary.csv'),'\uFEFF'+columns.join(',')+'\n'+flat.map(r=>columns.map(k=>r[k]??'').join(',')).join('\n'));
console.log(JSON.stringify({cases:manifest.results.length,verdict:manifest.verdict,comparisons:manifest.comparisons,failed:rows.flatMap(r=>r.failures).map(r=>r.id)}));
const runs=manifest.results.map(r=>({id:r.id,scenario:r.scenario,count:r.count,round:r.round,baseline:r.baseline,documentDOM:Math.max(r.idle.documentDOM,r.nativePan.peak.documentDOM,r.nativeZoom.peak.documentDOM),canvasDOM:Math.max(r.idle.canvasDOM,r.nativePan.peak.canvasDOM,r.nativeZoom.peak.canvasDOM),panP50:r.nativePan.activeFrames.p50,panP95:r.nativePan.activeFrames.p95,zoomP50:r.nativeZoom.activeFrames.p50,zoomP95:r.nativeZoom.activeFrames.p95,failures:r.failures.length}));
const runColumns=Object.keys(runs[0]);fs.writeFileSync(path.join(folder,'runs.csv'),'\uFEFF'+runColumns.join(',')+'\n'+runs.map(r=>runColumns.map(k=>r[k]??'').join(',')).join('\n'));
