// Shared, deterministic examination matching. Teaching coverage is not personal mastery.
export const gespLevel=name=>Number(/^GESP\s*([1-8])\s*级$/i.exec(name||'')?.[1]||0);
export const goalName=row=>(row.sourceIds||[]).find(s=>s.startsWith('goal:'))?.slice(5)||'';
export const examPinned=row=>!!gespLevel(goalName(row))&&(row.exam?.locked===true||(row.exam?.locked===undefined&&row.exam?.dateStatus==='teacher'));
const isoDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function validateSessions(values){
 if(!Array.isArray(values)||values.length>40)throw Error('认证日历最多保存40个场次');const seen=new Set(),result=[];
 for(const raw of values){if(!raw.date&&!raw.source)continue;let url;try{url=new URL(raw.source)}catch{throw Error('认证场次需填写日期和官方公告网址')}
  const month=String(raw.date||'').slice(0,7);
  if(!isoDay(raw.date)||!['03','06','09','12'].includes(month.slice(5))||seen.has(month))throw Error('认证日期须为3、6、9、12月的有效日期，同月只保留一个场次');
  if(url.protocol!=='https:'||url.username||url.password||!['gesp.ccf.org.cn','www.ccf.org.cn'].includes(url.hostname))throw Error('请填写GESP或CCF官网的HTTPS公告链接');
  seen.add(month);result.push({month,date:raw.date,source:url.href,checkedAt:new Date().toISOString().slice(0,10)});
 }return result.sort((a,b)=>a.month.localeCompare(b.month));
}
export function examSessions(start,end,catalog={}){
 const list=[];
 for(let year=Number(start.slice(0,4));year<=Number(end.slice(0,4));year++)for(const month of ['03','06','09','12']){
  const key=`${year}-${month}`,known=(catalog.sessions||[]).find(s=>s.month===key&&isoDay(s.date)&&s.date.startsWith(key)&&s.source);
  if(key<start.slice(0,7)||key>end.slice(0,7))continue;
  if(known&&(known.date<start||known.date>end))continue;
  const cutoff=known?.date||key+'-01';
  // Without an official day, only count teaching completed before the month starts.
  const monthEnd=new Date(Date.UTC(year,Number(month),0)).toISOString().slice(0,10);
  list.push({month:key,date:known?.date||'',anchor:known?.date||(key+'-01'<start?start:key+'-01'),cutoff,source:known?.source||'',dateStatus:known?'official':'month',uncertainWindow:!known&&(start>key+'-01'||end<monthEnd)});
 }return list;
}
export function examTime(row){
 if(row.kind!=='goal')return row.start+(row.end!==row.start?'\n至 '+row.end:'');
 if(row.exam?.dateStatus==='teacher')return row.start+'\n老师调整 · 待复核';
 if(row.exam?.dateStatus==='official'&&row.start===row.exam.date)return row.start+'\n'+(examPinned(row)?'老师指定场次':'认证日期已公布');
 return row.start.slice(0,7)+'\n'+(examPinned(row)?'老师指定 · 日期待公布':row.exam?'预计场次 · 日期待公布':'目标月份 · 日期待公布');
}
export function coverageAt(level,cutoff,student,progress,calendar,campRows,library){
 const catalog=library.gesp,rule=catalog?.levels?.find(l=>l.level===level),target=library.goals.find(g=>gespLevel(g.name)===level);
 if(!rule||!target?.reviewed||rule.sourceHash!==target.sourceHash||rule.requirements!==target.requirements)return {ready:false,reason:'考纲或课程对应资料待核对',blocks:[],gaps:['考纲或课程对应资料待核对'],pending:[],conditionalCamps:[]};
 const evidence=new Map(),all=(library.units||[]).flatMap(u=>u.lessons.map(l=>({...l,unit:u.unit})));
 const put=(id,conditional=false)=>{if(!evidence.has(id)||evidence.get(id).conditional)evidence.set(id,{conditional});};
 for(const l of all)if(l.unit<progress.unit||(l.unit===progress.unit&&l.number<=progress.lesson))put(l.id);
 for(const l of calendar)if(l.date<cutoff)put(l.id);
 for(const camp of library.camps||[]){
  if((student.attended||[]).includes(camp.code))for(const d of camp.schedule||[])put(`camp:${camp.code}:${d.day}`);
  for(const row of campRows.filter(r=>(r.sourceIds||[]).includes('camp:'+camp.code)))for(const d of camp.schedule||[]){
   const date=new Date(row.start+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+d.day-1);
   if(date.toISOString().slice(0,10)<cutoff)put(`camp:${camp.code}:${d.day}`,row.campStatus!=='已确定参加');
  }
 }
 const valid=id=>{
  const expected=catalog.evidence?.[id];if(!expected)return false;
  if(id.startsWith('camp:')){const [,code,day]=id.split(':');const actual=library.camps.find(c=>c.code===code)?.schedule?.find(d=>d.day===Number(day));return actual?.topic_verbatim===expected;}
  const actual=all.find(l=>l.id===id);return actual?.type==='lesson'&&actual.title===expected;
 };
 const conditionalCamps=new Set(),blocks=rule.blocks.map(b=>{
  const matches=(b.groups||[]).map(group=>group.filter(id=>valid(id)&&evidence.has(id)).sort((a,b)=>Number(evidence.get(a).conditional)-Number(evidence.get(b).conditional))[0]);
  const covered=matches.length>0&&matches.every(Boolean);
  if(covered)for(const id of matches)if(evidence.get(id).conditional)conditionalCamps.add(id.split(':')[1]);
  return {...b,status:covered?(b.gap?'partial':'covered'):'missing',evidence:matches.filter(Boolean)};
 });
 const pending=blocks.filter(b=>b.timing&&b.status==='missing').map(b=>b.label);
 const gaps=blocks.filter(b=>b.status!=='covered').map(b=>b.status==='partial'?b.label+'：'+b.gap:b.label);
 return {ready:pending.length===0&&blocks.some(b=>b.timing),reason:pending.length?'核心课程尚未学到':'核心课程预计覆盖，补充项与掌握情况需核对',blocks,gaps,pending,conditionalCamps:[...conditionalCamps]};
}
export function matchGesp(student,progress,conditions,calendar,campRows,library,excluded=[],locked=[]){
 const sessions=examSessions(conditions.start,conditions.end,library.gesp),passed=gespLevel(student.passed),recent=gespLevel(conditions.goal);
 let next=passed+1;const rows=[],checks=[],warnings=[],excludedSet=new Set(excluded);
 for(const session of sessions){
  if(next>8)break;
  const lockedExam=locked.find(r=>examPinned(r)&&gespLevel(goalName(r))===next);
  const coverage=coverageAt(next,lockedExam?.start||session.cutoff,student,progress,calendar,campRows,library);
  if(lockedExam&&lockedExam.start.slice(0,7)<session.month){warnings.push(`GESP ${next}级指定场次早于前级可完成时间，请调整指定场次或前级安排。`);break;}
  if(lockedExam&&lockedExam.start.slice(0,7)===session.month){
   const reason=lockedExam.exam?.teacherReason||'';
   rows.push({...lockedExam,exam:{...lockedExam.exam,locked:true,level:next,month:lockedExam.start.slice(0,7),dateStatus:lockedExam.exam?.dateStatus||'teacher',role:next===recent?'recent':'progression',conditional:true,key:next+'|'+lockedExam.start.slice(0,7),gaps:coverage.gaps,coverage,notes:[...(reason?['老师安排说明：'+reason]:[]),'老师指定的场次；须结合补充项和测评确认掌握情况，后续等级仍以前级完成为前提。',...(coverage.pending.length?['本场核心课程仍待完成：'+coverage.pending.join('、')]:[]),...(coverage.gaps.length?['需补齐或核对：'+coverage.gaps.join('；')]:[])]}});
   if(!coverage.ready)warnings.push(`GESP ${next}级老师指定场次的核心课程尚未覆盖，请核对能力与教学安排。`);
   checks.push({...session,level:next,status:'locked',reason:reason||'保留老师指定场次，后级从其后继续匹配',coverage});next++;continue;
  }
  if(session.uncertainWindow){checks.push({...session,level:next,status:'deferred',reason:'日期未公布，无法确认场次位于规划周期内',coverage});continue;}
  const held=!!lockedExam;
  const key=next+'|'+session.month,removed=excludedSet.has(key);
  if(!coverage.ready||held||removed){checks.push({...session,level:next,status:'deferred',reason:lockedExam?'等待老师指定的前级场次':removed?'老师已移除此场次':coverage.reason,coverage});continue;}
  const name=`GESP ${next}级`,prior=rows.at(-1)?.exam.level;
  const notes=[coverage.gaps.length?'需补齐或核对：'+coverage.gaps.join('；'):'课程内容预计覆盖，仍需通过测评确认掌握情况。'];
  if(prior)notes.push(`后续安排以GESP ${prior}级按计划完成并满足报考条件为前提；成绩变化后需重新规划。`);
  else notes.push('报考资格与个人掌握情况由老师结合实际成绩和测评确认。');
  if(coverage.conditionalCamps.length)notes.push('本场次依赖拟安排集训'+coverage.conditionalCamps.join('、')+'，参加情况变化后需重新规划。');
  rows.push({id:`gesp-${next}-${session.month}`,kind:'goal',start:session.anchor,end:session.anchor,task:`拟参加${name}考试`,knowledge:library.goals.find(g=>g.name===name).coreTopics?.join('；')||name+'认证要求',milestone:'',sourceIds:['goal:'+name],edited:false,exam:{...session,level:next,role:next===recent?'recent':'progression',conditional:true,notes,gaps:coverage.gaps,coverage,key}});
  checks.push({...session,level:next,status:'recommended',coverage});next++;
 }
 if(recent&&recent<=passed)warnings.push('近期目标已在通过记录中，后续考级从下一等级逐级匹配。');
 if(recent>passed&&!rows.some(r=>r.exam.level===recent)){
  const endSession=sessions.at(-1),coverage=endSession?coverageAt(recent,endSession.cutoff,student,progress,calendar,campRows,library):null;
  warnings.push(`${conditions.goal}近期目标未能在周期内安排：${coverage?.pending.length?'尚缺核心课程 '+coverage.pending.join('、'):'可用场次或逐级衔接条件不足'}。可延长周期、调整课程或补充合适集训。`);
 }
 const actualRecent=rows.find(r=>r.exam.level===recent);
 if(actualRecent&&conditions.targetMonth&&actualRecent.exam.month>conditions.targetMonth)warnings.push(`近期目标意向为${conditions.targetMonth}，根据课次与逐级衔接顺延至${actualRecent.exam.month}。`);
 if(!sessions.length)warnings.push('本周期没有可用的GESP 3、6、9、12月认证场次。');
 return {rows,sessions:checks,warnings,recentMonth:actualRecent?.exam.month||'',version:library.gesp?.version||'待配置'};
}
