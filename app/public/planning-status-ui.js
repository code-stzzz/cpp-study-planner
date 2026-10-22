const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const statusFilters=[['all','全部规划状态'],['unplanned','未制定'],['draft','草稿'],['finalized','已定稿'],['needs_update','待重新定稿']];
export function studentPlanningStatus(data,id){return (data.planningStatuses||[]).find(s=>s.studentId===id)||{studentId:id,status:'unplanned',label:'未制定',completed:false,planId:null};}
export function planningCounts(data,students){
 const result={total:students.length,unplanned:0,draft:0,finalized:0,needs_update:0};
 for(const s of students)result[studentPlanningStatus(data,s.id).status]++;
 return result;
}
export function classPlanningSummary(data,students){
 const n=planningCounts(data,students);
 return `<div class="class-planning"><strong>${n.finalized} / ${n.total} 人已定稿</strong><span>${n.unplanned}人未制定 · ${n.draft+n.needs_update}人待定稿</span></div>`;
}
export function studentStatusCell(s){
 const kind=s.status==='finalized'?'good':s.status==='needs_update'?'warn':s.status==='draft'?'in-progress':'muted';
 return `<div class="student-plan-status"><span class="badge ${kind}">${esc(s.label)}</span>${s.planId?`<span class="table-sub">${esc(s.goal)}${s.finalNumber?' · 定稿 v'+esc(s.finalNumber):''}</span><span class="table-sub">周期：${esc(s.start)} 至 ${esc(s.end)}</span><span class="table-sub">更新：${esc(s.updatedAt.slice(0,10))}${s.updatedBy?' · '+esc(s.updatedBy):''}</span>${s.needsRematch?'<span class="status-attention">请先重新匹配路线</span>':''}`:'<span class="table-sub">尚无已保存的规划书</span>'}</div>`;
}
export function planningOverview(data,students,active){
 const n=planningCounts(data,students);
 const cards=[['all','班级学生',n.total,'查看全部学生'],['unplanned','未制定',n.unplanned,'开始制定规划'],['draft','草稿',n.draft,'继续完善内容'],['finalized','已定稿',n.finalized,'规划书已确认'],['needs_update','待重新定稿',n.needs_update,'草稿有新的修改']];
 return `<section class="planning-overview" aria-label="规划制定情况">${cards.map(([key,label,value,detail])=>`<button class="planning-stat ${active===key?'active':''}" data-action="filter-planning" data-id="${key}" aria-pressed="${active===key}"><span>${label}</span><strong>${value}<small>人</small></strong><small>${detail}</small></button>`).join('')}</section><p class="planning-status-note">按每位学生最近更新的一份规划统计；生成草稿后，点击“保存为定稿版本”才计为已完成。定稿后再次修改需重新定稿。</p>`;
}
