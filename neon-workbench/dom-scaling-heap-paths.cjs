const fs=require('node:fs');const dump=JSON.parse(fs.readFileSync(process.argv[2]));
const meta=dump.snapshot.meta,nf=meta.node_fields,ef=meta.edge_fields,ns=nf.length,es=ef.length,nn=dump.nodes.length/ns,en=dump.edges.length/es;
const ni=Object.fromEntries(nf.map((n,i)=>[n,i])),ei=Object.fromEntries(ef.map((n,i)=>[n,i]));
const nodeTypes=meta.node_types[ni.type],edgeTypes=meta.edge_types[ei.type],names=dump.strings;
const head=new Int32Array(nn).fill(-1),next=new Int32Array(en),from=new Int32Array(en);
let edge=0;for(let id=0;id<nn;id++)for(let j=0;j<dump.nodes[id*ns+ni.edge_count];j++,edge++){
 if(edgeTypes[dump.edges[edge*es+ei.type]]==='weak')continue;
 if(edgeTypes[dump.edges[edge*es+ei.type]]==='internal'&&String(names[dump.edges[edge*es+ei.name_or_index]]).includes('part of key'))continue;
 const to=dump.edges[edge*es+ei.to_node]/ns;from[edge]=id;next[edge]=head[to];head[to]=edge;
}
const describe=id=>`${id}:${nodeTypes[dump.nodes[id*ns+ni.type]]}:${names[dump.nodes[id*ns+ni.name]].slice(0,190)}`;
const targets=[];for(let id=0;id<nn;id++){const name=names[dump.nodes[id*ns+ni.name]];if(nodeTypes[dump.nodes[id*ns+ni.type]]==='native'&&dump.nodes[id*ns+ni.detachedness]===2&&(/^<article|^<div class="flora-node-shell/.test(name)))targets.push(id);}
const paths=[];
for(const target of targets.slice(0,30)){
 const visited=new Int32Array(nn).fill(-1),queue=[target];visited[target]=-2;let found=false;
 for(let k=0;k<queue.length&&k<nn;k++){const id=queue[k];if(id===0){found=true;break;}for(let e=head[id];e>=0;e=next[e]){const parent=from[e];if(visited[parent]!==-1)continue;visited[parent]=e;queue.push(parent);}}
 const steps=[];if(found){let id=0;for(let k=0;k<40&&id!==target;k++){const e=visited[id],type=edgeTypes[dump.edges[e*es+ei.type]],raw=dump.edges[e*es+ei.name_or_index],name=['element','hidden'].includes(type)?raw:names[raw];steps.push({from:describe(id),edge:`${type}:${name}`});id=dump.edges[e*es+ei.to_node]/ns;}steps.push({target:describe(target)});}
 paths.push({node:describe(target),reachable:found,steps});
}
console.log(JSON.stringify({targets:targets.length,paths},null,2));
