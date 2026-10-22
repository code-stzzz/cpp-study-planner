// Read-only teacher overview. Saved drafts and immutable versions remain unchanged.
const labels={unplanned:'未制定',draft:'草稿',finalized:'已定稿',needs_update:'待重新定稿'};
export function planningStatuses(students,plans,versions){
 const allowed=new Set(students.map(s=>s.id)),latest=new Map(),finals=new Map();
 const order=p=>[p.updatedAt||'',p.createdAt||'',p.id||''].join('|');
 for(const p of plans)if(allowed.has(p.studentId)&&(!latest.has(p.studentId)||order(p)>order(latest.get(p.studentId))))latest.set(p.studentId,p);
 const planIds=new Set([...latest.values()].map(p=>p.id));
 for(const v of versions){
  if(!planIds.has(v.planId))continue;
  const previous=finals.get(v.planId);
  if(!previous||Number(v.number)>Number(previous.number)||(Number(v.number)===Number(previous.number)&&(v.createdAt||'')>(previous.createdAt||'')))finals.set(v.planId,v);
 }
 return students.map(s=>{
  const p=latest.get(s.id);if(!p)return {studentId:s.id,status:'unplanned',label:labels.unplanned,completed:false,planId:null};
  const version=finals.get(p.id),revision=version?.snapshot?.revision;
  const current=!!version&&Number.isInteger(p.revision)&&Number.isInteger(revision)&&p.revision===revision&&!p.needsRematch;
  const status=current?'finalized':version?'needs_update':'draft';
  return {studentId:s.id,status,label:labels[status],completed:current,planId:p.id,goal:p.conditions?.goal||'',start:p.conditions?.start||'',end:p.conditions?.end||'',updatedAt:p.updatedAt||'',updatedBy:p.updatedBy||'',needsRematch:!!p.needsRematch,finalNumber:version?.number||0,finalizedAt:version?.createdAt||''};
 });
}
