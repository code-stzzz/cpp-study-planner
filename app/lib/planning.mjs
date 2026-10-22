import {goalTitle} from '../public/report.js';
import {stageTargets} from '../public/outcomes.js';
import {matchGesp,gespLevel,goalName,examSessions,examPinned} from '../public/gesp.js';
import {summerPeriods,scheduleSummer,syncSummer,campStatus} from '../public/summer-camps.js';
export const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export const text=(v,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s}
export const addDays=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const range=(a,b)=>a===b?a:`${a} 至 ${b}`;
export function progress(student,cls){return student.personalProgress?{unit:student.unit,lesson:student.lesson}:{unit:cls.unit,lesson:cls.lesson}}
export function checkProgress(unit,lesson,library){const u=library.units.find(u=>u.unit===unit);if(!u||!Number.isInteger(lesson)||lesson<0||lesson>u.lessons.length)fail('单元或已完成课次不正确');}
export function normalizeConditions(raw,library){
 const c={start:text(raw.start,10),end:text(raw.end,10),goal:text(raw.goal,80),targetMonth:text(raw.targetMonth,7),winter:text(raw.winter,20)||'auto',summer:text(raw.summer,20)||'none',winterDate:text(raw.winterDate,10),summerDate:text(raw.summerDate,10),winterDays:Number(raw.winterDays)||10,summerDays:Number(raw.summerDays)||10,winterStatus:raw.winterStatus==='已确定参加'?'已确定参加':'推荐方案',summerStatus:raw.summerStatus==='已确定参加'?'已确定参加':'推荐方案'};
 if(!validDate(c.start)||!validDate(c.end)||c.start>c.end||Date.parse(c.end)-Date.parse(c.start)>1096*86400000)fail('请设置三年以内的有效规划周期');
 if(!library.goals.some(g=>g.name===c.goal))fail('请选择有效目标');
 if(c.targetMonth&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.targetMonth)||c.targetMonth<c.start.slice(0,7)||c.targetMonth>c.end.slice(0,7)))fail('意向月份应在规划周期内，留空可自动推荐');
 if(gespLevel(c.goal)&&c.targetMonth&&!['03','06','09','12'].includes(c.targetMonth.slice(5)))fail('GESP意向月份只能选择3、6、9、12月，或留空自动匹配');
 for(const s of ['winter','summer'])if(![10,20,30].includes(c[s+'Days']))fail('集训天数应为10、20或30天');
 if(raw.summerCamps!==undefined&&!Array.isArray(raw.summerCamps))fail('暑假集训课程格式不正确');
 const periods=summerPeriods(raw);if(periods.length>3)fail('暑假最多安排3期训练营');
 const ids=new Set();c.summerCamps=periods.map((p,index)=>{
  if(!p||typeof p!=='object'||!/^summer(?:-[a-zA-Z0-9-]{1,60})?$/.test(p.id)||ids.has(p.id))fail('暑假营期编号重复或无效');ids.add(p.id);
  return {id:p.id,code:text(p.code,20),start:text(p.start,10),status:campStatus(p.status),dateMode:index&&p.dateMode==='auto'?'auto':'manual'};
 });
 const scheduled=scheduleSummer(c,library.camps);let total=0;
 for(const p of scheduled){
  const camp=library.camps.find(x=>x.code===p.code&&x.season==='summer');if(!camp)fail('请选择有效的暑假集训课程');
  if(!validDate(p.start)||p.start<c.start||!p.end||p.end>c.end)fail(`拟定集训的${p.duration}天日期应完整位于规划周期内（${p.code}）`);
  total+=p.duration;
 }
 if(total>c.summerDays)fail(`暑假集训合计${total}天，可参加天数为${c.summerDays}天，请调整课程或可参加天数`);
 const byDate=[...scheduled].sort((a,b)=>a.start.localeCompare(b.start));
 if(byDate.some((p,i)=>i&&p.start<=byDate[i-1].end))fail('暑假训练营日期重叠，请调整每期开始日期');
 syncSummer(c,library.camps);
 for(const s of ['winter']){
  if(c[s]!=='none'){
   const camp=library.camps.find(x=>x.code===c[s]&&x.season===s),duration=camp?.days||10;
   if(!(s==='winter'&&c[s]==='auto')&&!camp)fail('集训课程与季节不匹配');
   if(c[s+'Days']<duration)fail(`${camp.code}为${duration}天大纲，可参加天数不能少于${duration}天`);
   if(!validDate(c[s+'Date'])||c[s+'Date']<c.start||addDays(c[s+'Date'],duration-1)>c.end)fail(`拟定集训的${duration}天日期应完整位于规划周期内`);
  }
 }
 return c;
}
export function makeCalendar(student,cls,c,library){
 const p=progress(student,cls);checkProgress(p.unit,p.lesson,library);
 const all=library.units.flatMap(u=>u.lessons.map(l=>({...l,unit:u.unit,unitName:u.name})));
 const offset=library.units.filter(u=>u.unit<p.unit).reduce((n,u)=>n+u.lessons.length,0)+p.lesson;
 let day=addDays(c.start,(cls.weekday-new Date(c.start+'T12:00:00Z').getUTCDay()+7)%7);
 const result=[];for(const l of all.slice(offset)){if(day>c.end)break;result.push({...l,lesson:l.number,date:day});day=addDays(day,7)}return result;
}
export function recommendWinter(pkg,p,attended=[]){
 const at=(u,l)=>p.unit>u||(p.unit===u&&p.lesson>=l);
 if(attended.includes('D05'))return {code:'',reason:'已参加D05，需老师评估进阶路线'};
 if(!pkg||pkg==='unmapped')return {code:'',reason:'课包与推荐网站的版本映射待确认，请老师选择首营'};
 let level=1;
 if(pkg==='4.1CC')level=at(3,7)?5:at(2,1)?4:3;
 else if(pkg==='4.0')level=at(10,1)?4:3;
 else if(pkg==='4.5'){if(at(7,6))level=3;else if(at(5,1))level=2;else if(at(1,17))level=1;else return {code:'',reason:'预计完成进度未达到U1第17课门槛'};}
 else if(pkg==='star'){if(at(7,6))level=3;else if(at(5,1))level=2;else if(at(2,2))level=1;else return {code:'',reason:'预计完成进度未达到U2第2课门槛'};}
 else return {code:'',reason:'推荐规则尚未配置'};
 const history={D01:2,D02:3,D03:4,D04:5,XP01:2,XM02:2,XP02:3,XP03:3,XP04:5,XP05:5};
 for(const code of attended)if(history[code])level=Math.max(level,history[code]);
 return {code:`D0${level}`,reason:`按入营前已完成U${p.unit}第${p.lesson}课及集训经历匹配`};
}
export function buildBaseline(student,cls,conditions,library,excludedExams=[],lockedRows=[]){
 const c=normalizeConditions(conditions,library),calendar=makeCalendar(student,cls,c,library),p=progress(student,cls);
 lockedRows=reconcileSummerLocks(lockedRows,c,c,library).filter(r=>!gespLevel(goalName(r))||gespLevel(goalName(r))>gespLevel(student.passed));
 validateExamPins(lockedRows,c,library);
 const before=calendar.filter(l=>l.date<c.winterDate).at(-1)||p,rec=recommendWinter(cls.recommendationVersion,before,student.attended||[]),warnings=[],rows=[];
 for(const u of library.units){const lessons=calendar.filter(l=>l.unit===u.unit);if(!lessons.length)continue;
  rows.push({id:`unit-${u.unit}`,start:lessons[0].date,end:lessons.at(-1).date,task:`U${u.unit}单元：${u.name}`,knowledge:[...new Set(lessons.filter(l=>l.type==='lesson').map(l=>l.knowledge.replace(/[（(][一二三四五六七八九十]+[）)]/g,'')))].join('；')||'单元复习与测评',milestone:lessons.some(l=>l.type==='assessment')?'完成单元测评，记录掌握与薄弱知识点':'完成本阶段课次，记录学习表现',kind:'regular',sourceIds:lessons.map(l=>l.id),edited:false});
 }
 const camps=[...(c.winter==='none'?[]:[{id:'winter',code:c.winter==='auto'?rec.code:c.winter,start:c.winterDate,status:c.winterStatus}]),...scheduleSummer(c,library.camps)];
 for(const period of camps){
  const {id,code,start,status}=period;
  if(!code){warnings.push(rec.reason);continue}const camp=library.camps.find(x=>x.code===code);if(!camp){warnings.push(`${code}资料未录入`);continue}
  const duration=camp.days||10,end=addDays(start,duration-1),overlap=calendar.filter(l=>l.date>=start&&l.date<=end);
  rows.push({id,start,end,task:`参加${code} ${camp.name}`,knowledge:camp.topic,milestone:`${status==='已确定参加'?'已确定参加':'拟安排，参加情况待确认'}；完成集训阶段任务并记录表现；入营条件须老师核对`,kind:'camp',sourceIds:[`camp:${code}`],campStatus:status,edited:false});
  if(id==='winter'&&c.winterDays>duration)warnings.push(`${code}已排首营${duration}天，其余${c.winterDays-duration}天的同季组合尚未配置`);
  if(overlap.length)warnings.push(`${code}与${overlap.length}次常规课同日，需协调具体时段，常规课保留`);
  if(!camp.reviewed)warnings.push(`${code}大纲与入营条件待老师核对`);
 }
 const summerTotal=scheduledSummerDays(c,library);if(summerTotal&&summerTotal<c.summerDays)warnings.push(`暑假已安排${summerTotal}天，其余${c.summerDays-summerTotal}天暂未安排课程`);
 const target=library.goals.find(g=>g.name===c.goal),examPlan=matchGesp(student,p,c,calendar,mergeLockedRows(rows.filter(r=>r.kind==='camp'),lockedRows.filter(r=>r.kind==='camp')),library,excludedExams,lockedRows);
 rows.push(...examPlan.rows);warnings.push(...examPlan.warnings);
 const missingPins=lockedRows.filter(examPinned).filter(r=>!examPlan.rows.some(x=>goalName(x)===goalName(r)));
 if(missingPins.length)fail(`${missingPins.map(goalName).join('、')}指定场次无法与前级进度衔接，请推迟该场次或恢复系统推荐`,409);
 if(!gespLevel(c.goal)){
  const month=c.targetMonth||Array.from({length:Number(c.end.slice(0,4))-Number(c.start.slice(0,4))+1},(_,i)=>`${Number(c.start.slice(0,4))+i}-09`).find(m=>m>=c.start.slice(0,7)&&m<=c.end.slice(0,7));
  if(month){const day=month+'-01'<c.start?c.start:month+'-01';rows.push({id:`csp-${c.goal.startsWith('CSP-S')?'s':'j'}-${month}`,start:day,end:day,task:goalTitle(c.goal),knowledge:target.reviewed?target.requirements:'目标大纲尚未核对，知识对应关系待补',milestone:'',kind:'goal',sourceIds:[`goal:${c.goal}`],edited:false});examPlan.recentMonth=month;}
  else warnings.push('周期内没有近期CSP目标意向月份，请设置意向月份或延长周期。');
 }
 if(!target.reviewed||!target.requirements)warnings.push(`${c.goal}大纲未核对，无法作出等级覆盖或准备充分的结论`);
 if(!calendar.length)warnings.push('当前周期没有待安排的常规课');
 if(!student.mastery||student.mastery==='待评估')warnings.push('个人掌握情况待测评，已学课次不等于已经掌握');
 for(const row of rows)if(!row.edited)row.milestone=stageTargets(row,library).milestone;
 const goalRow=rows.find(r=>goalName(r)===c.goal);if(goalRow&&!goalRow.edited&&target.coreTopics?.length)goalRow.knowledge=target.coreTopics.join('；');
 rows.sort((a,b)=>a.start.localeCompare(b.start));
 return {conditions:c,rows,calendar,warnings,recommendation:rec,progress:p,goal:target,examPlan,excludedExams,libraryVersion:library.version,advice:'按每周课程完成对应练习，利用单元内复习与测评检查掌握情况。集训期间常规课照常，重复知识用于强化。'};
}
const scheduledSummerDays=(c,library)=>scheduleSummer(c,library.camps).reduce((n,p)=>n+p.duration,0);
export function reconcileSummerLocks(locked,conditions,previous,library){
 const next=scheduleSummer(conditions,library.camps),old=scheduleSummer(previous,library.camps);
 return locked.flatMap(row=>{
  if(row.kind!=='camp'||!/^summer(?:-|$)/.test(row.id))return [row];
  const p=next.find(p=>p.id===row.id);if(!p||!row.sourceIds?.includes('camp:'+p.code))return [];
  const before=old.find(p=>p.id===row.id);
  return [{...row,...(!before||before.start!==p.start||before.end!==p.end?{start:p.start,end:p.end}:{}),campStatus:p.status}];
 });
}
export function mergeLockedRows(rows,locked){
 const result=rows.map(r=>{const l=locked.find(l=>(l.id===r.id&&(r.kind!=='goal'||goalName(r)===goalName(l)))||(r.kind==='goal'&&l.kind==='goal'&&goalName(r)===goalName(l)));return l?{...l,...(gespLevel(goalName(r))?{start:examPinned(l)?l.start:r.start,end:examPinned(l)?l.end:r.end,exam:examPinned(l)&&l.start!==r.start?l.exam:r.exam}:r.kind==='goal'&&r.id===l.id&&r.exam?{exam:r.exam}:{})}:r;});
 for(const row of locked)if(!result.some(r=>r.id===row.id)&&!gespLevel(goalName(row)))result.push(row);
 return result.sort((a,b)=>a.start.localeCompare(b.start));
}
export function remapPhaseEdits(edits,oldRows,newRows){
 const result={};for(const [id,value] of Object.entries(edits||{})){
  const old=oldRows.find(r=>r.id===id),row=newRows.find(r=>r.id===id)||(old?.kind==='goal'?newRows.find(r=>r.kind==='goal'&&goalName(r)===goalName(old)):null);
  if(row&&(old?.kind!=='camp'||JSON.stringify(old.sourceIds)===JSON.stringify(row.sourceIds)))result[row.id]=value;
 }return result;
}
export function validateExamPins(rows,conditions,library){
 const sessions=examSessions(conditions.start,conditions.end,library.gesp),pins=rows.filter(examPinned).sort((a,b)=>gespLevel(goalName(a))-gespLevel(goalName(b))),seen=new Set();
 const index=month=>Number(month.slice(0,4))*4+['03','06','09','12'].indexOf(month.slice(5));
 for(let i=0;i<pins.length;i++){
  const row=pins[i],level=gespLevel(goalName(row)),month=row.start.slice(0,7),session=sessions.find(s=>s.month===month);
  if(!session||session.uncertainWindow)fail('老师指定的考级场次须在规划周期内，且为3、6、9、12月的可用场次');
  if(seen.has(level))fail('同一GESP等级只能指定一个场次');seen.add(level);
  if(i){const prior=pins[i-1],difference=level-gespLevel(goalName(prior));if(index(month)-index(prior.start.slice(0,7))<difference)fail('指定场次冲突：后级须晚于前级，并为中间等级留出逐级考试场次');}
 }
}
export function applyExamAdjustments(rows,changes,conditions,library){
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).length>8)fail('考级调整格式不正确');
 const result=structuredClone(rows),sessions=examSessions(conditions.start,conditions.end,library.gesp);
 for(const [id,change] of Object.entries(changes)){
  const row=result.find(r=>r.id===id),level=gespLevel(goalName(row||{}));if(!row||row.kind!=='goal'||!level)fail('只能调整当前路线中的GESP考级节点');
  if(!change||typeof change.month!=='string'||typeof(change.reason??'')!=='string'||(change.reason||'').length>200)fail('请选择有效场次，安排说明不超过200字');
  row.exam={...row.exam,level,locked:!!change.month,teacherReason:text(change.reason,200)};row.edited=true;
  if(!change.month){row.exam.teacherReason='';continue;}
  const session=sessions.find(s=>s.month===change.month&&!s.uncertainWindow);if(!session)fail('指定场次不在规划周期内，或正式日期尚不足以确认该场次可用');
  row.start=row.end=session.anchor;row.exam={...row.exam,...session,key:level+'|'+session.month,notes:[...(row.exam.notes||[]),'老师指定场次，需重新匹配路线确认前后级衔接。']};
 }
 validateExamPins(result,conditions,library);return result;
}
export function validateRows(rows,conditions,trustedRows=rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>40)fail('路线需要1—40个阶段');const ids=new Set();
 return rows.map(r=>{
  if(!r||!text(r.id,100)||ids.has(r.id))fail('阶段编号重复或缺失');ids.add(r.id);
  if(!validDate(r.start)||!validDate(r.end)||r.start>r.end||r.start<conditions.start||r.end>conditions.end)fail('阶段起止日期应完整位于规划周期内');
  for(const key of ['task','knowledge','milestone'])if(!text(r[key],1200)||String(r[key]).length>1200)fail('任务、知识点和里程碑均须填写，且每格不超过1200字');
  const original=trustedRows.find(t=>t.id===r.id),same=original&&original.kind===r.kind&&JSON.stringify(original.sourceIds)===JSON.stringify(r.sourceIds),metadata={};
  if(same&&original.campStatus)metadata.campStatus=original.campStatus;
  if(same&&original.exam){metadata.exam=structuredClone(original.exam);if(original.start!==r.start||original.end!==r.end){metadata.exam.locked=true;metadata.exam.dateStatus='teacher';metadata.exam.date='';metadata.exam.notes=[...new Set([...metadata.exam.notes,'老师已调整日期，原推荐的课程覆盖依据需重新核对。'])];}}
  return {id:r.id,start:r.start,end:r.end,task:text(r.task,1200),knowledge:text(r.knowledge,1200),milestone:text(r.milestone,1200),kind:text(r.kind,20)||'manual',sourceIds:Array.isArray(r.sourceIds)?r.sourceIds.filter(x=>typeof x==='string').slice(0,30):[],edited:!!r.edited,...metadata};
 });
}
