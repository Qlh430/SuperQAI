const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/design-sources/script-before-save-bridge.js','utf8');
const region=source.slice(source.indexOf('function stageCanvasOperation('),source.indexOf('function undoCanvasCommand('));
const pending=new Map();let seq=0;
const c={canvasState:{activeBoardId:'test'},canvasPagedStore:{getPendingOperations:()=>[...pending.values()],stageOperation:op=>pending.set(op.operationId,op)},createId:()=>`op-${++seq}`,setTimeout:()=>1,clearTimeout(){},saveCanvasBoardNow(){},applyCanvasOperationLocally(){}};
vm.createContext(c);vm.runInContext(region,c);
for(const type of ['node','connection']){
  pending.clear();
  c.stageCanvasOperation({type:type+'.upsert',entityId:'crop-group',after:{id:'crop-group',kind:'group'}});
  c.stageCanvasOperation({type:type+'.delete',entityId:'crop-group',before:{id:'crop-group'}});
  c.stageCanvasOperation({type:type+'.upsert',entityId:'crop-group',after:{id:'crop-group',kind:'group',groupMembers:['a','b']}});
  const rows=new Map();for(const op of pending.values()){if(op.type.endsWith('delete'))rows.delete(op.entityId);else rows.set(op.entityId,op.after);}
  assert.equal(rows.has('crop-group'),true,'Undo of unsaved delete must be last in persistence order');
  assert.deepEqual(Array.from(rows.get('crop-group').groupMembers),['a','b']);
}
console.log('PASS unsaved create/delete/undo persists final entity and member IDs');
