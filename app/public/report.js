// Shared parent-facing content for the on-screen preview and PDF renderer.
// Keep the teacher's stored draft and historical snapshots unchanged.
import {stageTargets,displayMilestone,displayKnowledge} from './outcomes.js';
import {examTime,goalName} from './gesp.js';
const meta = /(?<![a-z])AI(?![a-z])|人工智能|大模型|ChatGPT|OpenAI|API|提示词|令牌|模型(?:生成|输出|调用)|规则排课草稿|系统生成|自动生成/i;
export function parentText(value, fallback='') {
  const cleaned=String(value??'')
    .replace(/(?:根据|通过|由)?\s*(?:AI|人工智能)(?:辅助)?(?:规划|生成|建议|认为|分析|推荐)(?:的)?\s*[：:,，]?\s*/gi,'')
    .split(/\n+/).map(line=>line.split(/(?<=[。！？；;])/).filter(part=>!meta.test(part)).join(''))
    .filter(Boolean).join('\n').replace(/^[\s/·：:]+|[\s/·：:]+$/g,'').trim();
  return cleaned||fallback;
}
export function goalTitle(goal) {
  const label=String(goal||'').replace(/GESP\s*([1-8])\s*级/i,(_,n)=>'GESP'+['','一','二','三','四','五','六','七','八'][Number(n)]+'级');
  return /^GESP/i.test(label)?`参加${label}考试`:`参加${label.replace(/\s*晋级$/, '')}晋级考试`;
}
export function taskTitle(row, plan={}) {
  const original=parentText(row.task).replace(/（第[^）]*课）|\(第[^)]*课\)/g,'').replace(/\s*·\s*(?:\d+天|推荐方案|已确定参加|目标核验).*$/,'').trim();
  // Concise teacher-authored titles remain editable and are not replaced by a template.
  if(row.edited && original && original.length<=36)return original;
  if(row.kind==='regular') {
    const source=(row.sourceIds||[]).map(id=>/^U(\d+)-L/.exec(id)).find(Boolean);
    const unit=source?.[1]||/^unit-(\d+)$/.exec(row.id)?.[1]||/U(\d+)/i.exec(original)?.[1];
    const name=plan.librarySnapshot?.units?.find(u=>u.unit===Number(unit))?.name;
    if(unit)return `U${unit}单元${name?'：'+name:'的内容'}`;
  }
  if(row.kind==='goal') {
    const goal=(row.sourceIds||[]).find(id=>id.startsWith('goal:'))?.slice(5)||plan.conditions?.goal;
    if(goal)return (row.exam?'拟':'')+goalTitle(goal);
  }
  if(row.kind==='camp') {
    const code=(row.sourceIds||[]).find(id=>id.startsWith('camp:'))?.slice(5);
    const camp=plan.librarySnapshot?.camps?.find(c=>c.code===code);
    if(camp)return `参加${camp.code} ${camp.name}`;
  }
  const first=(original.split(/[。！？；;\n]/)[0]||'阶段学习').trim();
  return first.length>36?first.slice(0,35)+'…':first;
}
const concise=(value,max=80)=>{const clean=parentText(value).replace(/\s*\n\s*/g,' ');return clean.length>max?clean.slice(0,max-1)+'…':clean};
export function buildGuidance(plan) {
  const raw=plan.guidance||{},first=(plan.rows||[]).find(r=>r.kind==='regular');
  const ids=new Set(first?.sourceIds||[]),lessons=(plan.librarySnapshot?.units?.flatMap(u=>u.lessons)||plan.calendar||[]).filter(l=>ids.has(l.id)&&l.type==='lesson');
  const topics=[...new Set(lessons.map(l=>parentText(l.title).replace(/[（(][一二三四五六七八九十\d]+[）)]/g,'')))].slice(0,2);
  return {
    focus:concise(raw.focus)||concise(topics.length?`巩固${topics.join('与')}，结合单元复习和测评查漏补缺。`:'围绕本阶段课程与薄弱项练习，结合测评检查掌握情况。'),
    homework:concise(raw.homework)||'在ACGO平台完成老师布置的刷题练习，及时订正错题。',
    family:concise(raw.family)||'协助安排练习时间，关注任务完成情况与学习困难。',
  };
}
export function validateGuidance(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('学习建议格式不正确');
  const result={};for(const key of ['focus','homework','family']){
    if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>80)throw Error('三项学习建议均须填写，每项不超过80字');
    result[key]=value[key].trim();
  }return result;
}
export function validatePhaseEdits(value, rows) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('阶段详解格式不正确');
  const result={},ids=new Set(rows.map(r=>r.id));
  for(const [id,fields] of Object.entries(value)){
    if(!ids.has(id))continue;
    if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('阶段详解格式不正确');
    const kept={};for(const key of ['objective','practice','thinking','outcome','note']){
      if(fields[key]===undefined)continue;
      if(typeof fields[key]!=='string'||fields[key].length>300)throw Error('阶段详解每项不超过300字');
      if(fields[key].trim())kept[key]=fields[key].trim();
    }if(Object.keys(kept).length)result[id]=kept;
  }return result;
}
function lessonGroup(lesson,unit){
  if(lesson.type==='review')return '单元复习';
  if(lesson.type==='assessment')return '单元测评';
  const t=lesson.title;
  if(unit===1)return lesson.number<=8?'数理基础':'C++基础';
  if(unit===2)return /字符串|字符数组|进制/.test(t)?'字符串与进制':'循环与数组';
  if(unit===3)return /位运算|进制/.test(t)?'位运算与进制':/排序|sort/.test(t)?'排序算法':'函数与作用域';
  if(unit===4)return /结构体|排序/.test(t)?'结构体与排序':/递归/.test(t)?'递归算法':'算法基础';
  if(unit===5)return /二分/.test(t)?'二分算法':/递推|贪心/.test(t)?'递推与贪心':'数论与高精度';
  if(unit===6)return /图|树/.test(t)?'图与树':'线性数据结构';
  if(unit===7)return /图的遍历/.test(t)?'图的遍历':'搜索算法';
  if(unit===8)return /背包/.test(t)?'背包问题':'动态规划';
  return '课程内容';
}
export function buildPhases(plan) {
  const library=plan.librarySnapshot||{},warnings=(plan.warnings||[]).map(w=>parentText(w)).filter(Boolean);
  const arrangedCodes=(plan.rows||[]).filter(r=>r.kind==='camp').flatMap(r=>(r.sourceIds||[]).filter(id=>id.startsWith('camp:')).map(id=>id.slice(5)));
  return (plan.rows||[]).map((row,index)=>{
    const edits=plan.phaseEdits?.[row.id]||{},title=taskTitle(row,plan),targets=stageTargets(row,library);
    const phase={id:row.id,kind:row.kind,title,start:row.start,end:row.end,timeLabel:examTime(row),sourceLabel:'',objective:parentText(edits.objective)||targets.knowledge,modules:[],checks:[],training:[],days:[],notes:[]};
    const practice=parentText(edits.practice)||targets.practice;
    const thinking=parentText(edits.thinking)||targets.thinking;
    const outcome=parentText(edits.outcome)||targets.standard;
    if(row.kind==='regular'){
      const ids=new Set(row.sourceIds||[]),groups=new Map(),selected=[];
      for(const u of library.units||[])for(const l of u.lessons||[])if(ids.has(l.id)){
        selected.push({...l,unit:u.unit});const group=lessonGroup(l,u.unit);
        if(!groups.has(group))groups.set(group,[]);
        const content=l.type==='review'?'复习本单元已学内容，整理错题与疑问':l.type==='assessment'?'完成本单元测评，记录掌握情况与薄弱项':parentText(l.knowledge||l.title);
        if(!groups.get(group).includes(content))groups.get(group).push(content);
      }
      phase.modules=[...groups].map(([label,items])=>({label,content:items.join('；')}));
      phase.sourceLabel=selected.length?`${[...new Set(selected.map(l=>'U'+l.unit))].join('、')} · 第${selected[0].number}—${selected.at(-1).number}课 · ${selected.length}课`:'课次范围待确认';
      if(!selected.length){phase.modules=[{label:'学习内容',content:parentText(row.knowledge,'待老师确认本阶段课程范围')}];phase.notes.push('本版本未记录可核对的课次范围，请老师确认学习内容。');}
      phase.checks=[{label:'训练任务',content:practice},{label:'编程思维',content:thinking},{label:'掌握标准',content:outcome}];
    }else if(row.kind==='camp'){
      const code=(row.sourceIds||[]).find(x=>x.startsWith('camp:'))?.slice(5),camp=(library.camps||[]).find(c=>c.code===code);
      phase.sourceLabel=camp?`${code} · ${camp.days}天大纲`:'集训大纲待确认';
      phase.days=(camp?.schedule||[]).map(d=>({day:d.day,topic:parentText(d.topic_verbatim),content:parentText(d.content_verbatim)|| (d.sessions||[]).map(s=>parentText(s.period+'：'+s.format)).join('；')||'具体教学安排待补充'}));
      phase.checks=[{label:'训练任务',content:practice},{label:'编程思维',content:thinking},{label:'掌握标准',content:outcome}];
      if(!phase.days.length)phase.notes.push('本版本尚未收录逐日大纲，请老师确认后补充；不据此推定每日内容。');
      if(!camp?.reviewed)phase.notes.push('入营基础与参加安排需结合学生情况由老师确认。');
      if(camp?.restDays?.length)phase.notes.push(`本营${camp.days}天日程含第${camp.restDays.join('、')}天休息，共${camp.teachingDays}天有课程安排；休息日保留，不额外推进常规课。`);
      if(plan.conditions?.[row.id+'Status']==='推荐方案')phase.notes.push('当前为拟安排方案，参加情况待确认。');
      phase.notes.push(...warnings.filter(w=>code&&w.includes(code)&&!/大纲与入营条件/.test(w)));
    }else if(row.kind==='goal'){
      const goalName=(row.sourceIds||[]).find(x=>x.startsWith('goal:'))?.slice(5)||plan.conditions?.goal;
      const target=(library.goals||[]).find(g=>g.name===goalName),reviewed=!!target?.reviewed&&!!target.requirements;
      phase.sourceLabel=row.exam?(row.exam.role==='recent'?'近期目标 · ':'后续考级 · ')+(row.exam.dateStatus==='official'?'具体日期已公布':'日期以正式通知为准'):`${row.start.slice(0,7)} · 目标月份，日期待公布`;
      phase.modules=[{label:'考核范围',content:reviewed?parentText(target.requirements):'目标考纲尚未核对，需先确认知识范围及考核要求。'}];
      if(reviewed)phase.notes.push('考核范围依据已归档的用户提供版大纲，课程覆盖与个人掌握仍需结合测评核对。');
      phase.training=[
        {round:'考纲梳理',time:'随常规课进行',resources:reviewed?'已核对考纲与课堂错题':'考纲核对后，由老师确认专题范围',action:'对照已学内容整理薄弱点，形成阶段检查清单。'},
        {round:'专题训练',time:'结合周课安排',resources:'ACGO平台中老师布置的对应题单',action:practice},
        {round:'模拟与复盘',time:'考前由老师确认',resources:'老师选定的真题或模拟题，题单与时长待确认',action:outcome},
      ];
      if(row.exam){
       phase.notes.push(...row.exam.notes.map(n=>parentText(n)));
       if(row.exam.gaps?.length)phase.training[0].action='核对并补齐：'+row.exam.gaps.join('；')+'。';
       phase.training[2].action='补充项完成后，以对应等级测评确认掌握与报考条件；'+outcome;
      }
      phase.notes.push('备考训练结合常规课安排，具体题单、训练时长及考试日期由老师确认。');
      phase.notes.push(...warnings.filter(w=>w.includes(goalName)));
    }else{
      phase.modules=[{label:'学习内容',content:parentText(row.knowledge)}];
      phase.checks=[{label:'练习安排',content:practice},{label:'阶段成果',content:outcome}];
    }
    if(index===0)phase.notes.push(...warnings.filter(w=>!arrangedCodes.some(code=>w.includes(code))&&!/考纲|等级覆盖|已保留老师修改|存在老师调整的日期或新增阶段/.test(w)));
    if(edits.note)phase.notes.push(parentText(edits.note));
    phase.notes=[...new Set(phase.notes.filter(Boolean))];
    return phase;
  });
}
export function buildParentReport(plan) {
  const s=plan.studentSnapshot||{},c=plan.conditions||{};
  const warnings=(plan.warnings||[]).filter(w=>!/已保留老师修改|存在老师调整的日期或新增阶段/.test(w)).map(w=>parentText(w)).filter(Boolean);
  return {
    studentSnapshot:Object.fromEntries(['name','grade','className','curriculum','passed','unit','lesson'].map(k=>[k,['unit','lesson'].includes(k)?s[k]:parentText(s[k])])),
    conditions:{start:c.start,end:c.end,goal:parentText(c.goal),targetMonth:c.targetMonth,recentMonth:(plan.rows||[]).find(r=>r.kind==='goal'&&goalName(r)===c.goal)?.start.slice(0,7)||'',multiExam:!!plan.examPlan},
    rows:(plan.rows||[]).map(r=>({id:r.id,kind:r.kind,start:r.start,end:r.end,timeLabel:examTime(r),task:taskTitle(r,plan),knowledge:parentText(displayKnowledge(r,plan.librarySnapshot),'结合课程内容持续跟进'),milestone:parentText(displayMilestone(r,plan.librarySnapshot),'结合课堂表现与测评记录检查阶段目标')})),
    guidance:buildGuidance(plan),
    phases:buildPhases(plan),
    warnings,updatedBy:parentText(plan.updatedBy),updatedAt:plan.updatedAt,
    exportVersion:/^定稿 v\d+$/.test(plan.exportVersion||'')?plan.exportVersion:'学习规划',
    lessonCount:(plan.calendar||[]).length,
  };
}
