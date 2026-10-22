import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {openStore} from '../lib/store.mjs';
import {buildBaseline,normalizeConditions,mergeLockedRows,validateRows,applyExamAdjustments,remapPhaseEdits} from '../lib/planning.mjs';
import {coverageAt,examSessions,examTime,validateSessions} from '../public/gesp.js';
import {buildParentReport} from '../public/report.js';
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));
const student={name:'示例',unit:5,lesson:6,personalProgress:true,passed:'GESP 2级',mastery:'待评估',attended:['XP01']};
const cls={weekday:6,recommendationVersion:'4.5'};
const conditions={start:'2026-10-24',end:'2027-12-31',goal:'GESP 3级',targetMonth:'',winter:'none',summer:'none'};
const build=(s=student,c=conditions,l=library)=>buildBaseline(s,cls,c,l);
test('旧资料库升级只补对应表，保留老师内容、学生及历史定稿并建立备份',()=>{
 const parent=resolve('.test-work');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'migration-'));let store=openStore(dir);
 try{const old=structuredClone(library);delete old.gesp;old.units[0].lessons[0].knowledge='老师补充的内容';store.put('library','main',old);store.put('students','sample',{passed:'GESP 2级'});store.put('versions','sample',{snapshot:{librarySnapshot:old}});store.close();store=openStore(dir);
  assert.ok(store.get('library','main').gesp);const {gesp,...preserved}=store.get('library','main');assert.deepEqual(preserved,old);assert.deepEqual(store.get('versions','sample').snapshot.librarySnapshot,old);assert.equal(store.get('students','sample').passed,'GESP 2级');assert.deepEqual(JSON.parse(readFileSync(join(dir,'backups','library-before-multi-exam.json'),'utf8')),old);
 }finally{store.close();if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');rmSync(dir,{recursive:true,force:true});}
});
test('近期目标后继续逐场计算，GESP场次逐级且不自动登记通过',()=>{
 const before=structuredClone(student),p=build(),exams=p.rows.filter(r=>r.exam);
 assert.deepEqual(exams.map(r=>[r.exam.month,r.exam.level]),[['2026-12',3],['2027-03',4],['2027-06',5],['2027-09',6]]);
 assert.equal(exams[0].start,'2026-12-26');assert.equal(exams[0].exam.role,'recent');
 assert.equal(p.conditions.goal,'GESP 3级');assert.equal(p.conditions.targetMonth,'');assert.equal(p.examPlan.recentMonth,'2026-12');
 assert.ok(exams.at(-1).exam.notes.some(n=>n.includes('前提')));assert.deepEqual(student,before);
 assert.equal(p.examPlan.sessions.at(-1).status,'deferred');assert.match(p.examPlan.sessions.at(-1).coverage.pending.join(''),/图论基本算法/);
});
test('按具体课次截止日匹配，未公布日期不计入当月未来课程',()=>{
 const c={...conditions,start:'2027-03-06',end:'2027-06-30',goal:'GESP 1级'};
 const s={...student,unit:1,lesson:15,passed:'未参加',attended:[]};
 const p=build(s,c);assert.equal(p.rows.find(r=>r.exam).exam.month,'2027-06');
 const known=structuredClone(library);known.gesp.sessions.push({month:'2027-03',date:'2027-03-20',source:'https://gesp.ccf.org.cn/test'});
 assert.equal(build(s,c,known).rows.find(r=>r.exam).exam.month,'2027-03');
 assert.equal(examSessions('2027-03-21','2027-03-31',known.gesp).length,0);
 assert.equal(build(student,{...conditions,start:'2027-03-01',end:'2027-03-10'}).rows.filter(r=>r.exam).length,0);
 assert.throws(()=>normalizeConditions({...conditions,targetMonth:'2027-05'},library),/3、6、9、12/);
 assert.equal(build(student,{...conditions,start:'2027-04-01',end:'2027-05-31'}).rows.filter(r=>r.exam).length,0);
});
test('近期期望月份用于提醒，不能阻止更早推荐，课程不足则顺延',()=>{
 const early=build({...student,unit:1,lesson:0,passed:'未参加',attended:[]},{...conditions,goal:'GESP 1级',targetMonth:'2026-12'});
 assert.equal(early.rows.find(r=>r.exam).exam.month,'2027-03');assert.ok(early.warnings.some(w=>w.includes('顺延')));
 const late=build(student,{...conditions,targetMonth:'2027-06'});assert.equal(late.rows.find(r=>r.exam).exam.month,'2026-12');
 const regression=build({...student,unit:1,lesson:12,passed:'未参加',attended:[]},{...conditions,goal:'GESP 1级',targetMonth:'2027-09'});assert.equal(regression.rows.find(r=>r.exam).exam.month,'2026-12');
 const short=build({...student,unit:1,lesson:0,passed:'未参加',attended:[]},{...conditions,end:'2026-12-31'});
 assert.equal(short.rows.filter(r=>r.exam).length,0);assert.ok(short.warnings.some(w=>w.includes('未能在周期内安排')));
});
test('老师指定场次后重算后续考级，恢复自动时保留文案但释放时间限制',()=>{
 const base=build(),third=base.rows.find(r=>r.exam?.level===3);
 const adjusted=applyExamAdjustments(base.rows,{[third.id]:{month:'2027-03',reason:'加强独立解题，完成专题练习后再考。'}},conditions,library);
 const fixed=adjusted.find(r=>r.id===third.id);assert.equal(fixed.exam.locked,true);assert.equal(fixed.start,'2027-03-01');
 const rebuilt=buildBaseline(student,cls,conditions,library,[],adjusted.filter(r=>r.edited));
 assert.deepEqual(rebuilt.rows.filter(r=>r.exam).map(r=>[r.exam.level,r.start.slice(0,7)]),[[3,'2027-03'],[4,'2027-06'],[5,'2027-09'],[6,'2027-12']]);
 assert.ok(rebuilt.rows.find(r=>r.exam?.level===3).exam.notes.some(n=>n.includes('加强独立解题')));assert.deepEqual(rebuilt.calendar,base.calendar);
 const restored=applyExamAdjustments(adjusted,{[third.id]:{month:'',reason:''}},conditions,library);restored.find(r=>r.id===third.id).task='老师保留的三级训练安排';
 const automatic=buildBaseline(student,cls,conditions,library,[],restored.filter(r=>r.edited));const merged=mergeLockedRows(automatic.rows,restored.filter(r=>r.edited));
 assert.equal(merged.find(r=>r.exam?.level===3).start,'2026-12-26');assert.equal(merged.find(r=>r.exam?.level===3).task,'老师保留的三级训练安排');
 const oldFourth=base.rows.find(r=>r.exam?.level===4),newFourth=rebuilt.rows.find(r=>r.exam?.level===4);assert.notEqual(oldFourth.id,newFourth.id);
 assert.deepEqual(remapPhaseEdits({[oldFourth.id]:{note:'继续巩固文件操作。'}},base.rows,rebuilt.rows),{[newFourth.id]:{note:'继续巩固文件操作。'}});
});
test('只修改考级文案不锁定场次，冲突场次和不可衔接的指定安排不会生成错误路线',()=>{
 const base=build(),third=base.rows.find(r=>r.exam?.level===3),fourth=base.rows.find(r=>r.exam?.level===4),fifth=base.rows.find(r=>r.exam?.level===5);
 const edited={...third,task:'三级专项能力检验',edited:true};const nextConditions={...conditions,start:'2027-01-01'};
 const replanned=buildBaseline(student,cls,nextConditions,library,[],[edited]);const merged=mergeLockedRows(replanned.rows,[edited]);assert.equal(merged.find(r=>r.exam?.level===3).start,'2027-03-01');
 assert.throws(()=>applyExamAdjustments(base.rows,{[third.id]:{month:'2027-06'},[fourth.id]:{month:'2027-03'}},conditions,library),/冲突/);
 assert.throws(()=>applyExamAdjustments(base.rows,{[third.id]:{month:'2027-06'},[fifth.id]:{month:'2027-09'}},conditions,library),/逐级/);
 assert.throws(()=>applyExamAdjustments(base.rows,{[third.id]:{month:'2027-05'}},conditions,library),/场次/);
 const impossible=applyExamAdjustments(base.rows,{[fourth.id]:{month:'2026-12'}},conditions,library);assert.throws(()=>buildBaseline(student,cls,conditions,library,[],impossible.filter(r=>r.edited)),/衔接/);
});
test('教学对应保留缺口，考纲与课程变更使旧映射失效',()=>{
 const p=build(),coverage=p.rows.find(r=>r.exam?.level===4)?.exam.coverage;
 assert.ok(coverage.gaps.some(g=>g.includes('文件操作')));assert.ok(coverage.gaps.some(g=>g.includes('异常处理')));
 const changed=structuredClone(library);changed.goals.find(g=>g.name==='GESP 3级').requirements+='新要求';assert.equal(build(student,conditions,changed).rows.filter(r=>r.exam).length,0);
 const renamed=structuredClone(library);renamed.units[3].lessons[7].title='课程已替换';assert.equal(build(student,conditions,renamed).rows.filter(r=>r.exam).length,0);
});
test('官方场次维护校验月份、日期和来源，拒绝重复场次及伪造日期',()=>{
 assert.equal(validateSessions([{date:'2027-03-20',source:'https://gesp.ccf.org.cn/test'}])[0].month,'2027-03');
 for(const values of [[{date:'2027-02-30',source:'https://gesp.ccf.org.cn/test'}],[{date:'2027-05-01',source:'https://gesp.ccf.org.cn/test'}],[{date:'2027-03-20',source:'https://example.com/fake'}],[{date:'2027-03-20',source:'https://gesp.ccf.org.cn/test'},{date:'2027-03-27',source:'https://gesp.ccf.org.cn/test'}]])assert.throws(()=>validateSessions(values));
});
test('八级对应关系完整保留考纲模块，课次引用实际存在且不使用复习测评代替教学',()=>{
 for(const rule of library.gesp.levels){const g=library.goals.find(g=>g.name===`GESP ${rule.level}级`);assert.deepEqual(rule.blocks.map(b=>b.label),g.knowledgeBlocks.map(b=>b.label));
  for(const b of rule.blocks)for(const group of b.groups)for(const id of group){assert.ok(library.gesp.evidence[id]);if(!id.startsWith('camp:'))assert.equal(library.units.flatMap(u=>u.lessons).find(l=>l.id===id)?.type,'lesson');}
 }
});
test('集训只按考试前已排日期计入，拟参加营必须保留条件',()=>{
 const l=structuredClone(library),rule=l.gesp.levels.find(r=>r.level===3);rule.blocks[3].groups=[['camp:D03:3']];
 const c={...conditions,winter:'D03',winterDate:'2027-03-05',winterStatus:'推荐方案'};
 const p=build(student,c,l),ex=p.rows.find(r=>r.exam);
 assert.equal(ex.exam.month,'2027-06');assert.deepEqual(ex.exam.coverage.conditionalCamps,['D03']);assert.ok(ex.exam.notes.some(n=>n.includes('依赖拟安排集训')));
 const confirmed=build(student,{...c,winterStatus:'已确定参加'},l).rows.find(r=>r.exam);assert.equal(confirmed.exam.coverage.conditionalCamps.length,0);
});
test('重新匹配保留老师的考试修改，移除场次后不在原月份复活',()=>{
 const base=build(),r=structuredClone(base.rows.find(r=>r.exam));r.start=r.end='2027-03-12';r.edited=true;r.task='老师确定的三级考试安排';
 const saved=validateRows([r],conditions,base.rows)[0];assert.equal(saved.exam.dateStatus,'teacher');assert.match(examTime(saved),/老师调整/);
 const merged=mergeLockedRows(base.rows,[saved]);assert.equal(merged.filter(x=>x.kind==='goal'&&x.sourceIds[0]==='goal:GESP 3级').length,1);assert.equal(merged.find(x=>x.id===r.id).task,r.task);
 const excluded=buildBaseline(student,cls,conditions,library,[base.rows.find(r=>r.exam).exam.key]);assert.equal(excluded.rows.find(r=>r.exam).exam.month,'2027-03');
 const later={...saved,start:'2027-06-15',end:'2027-06-15'};const recalculated=buildBaseline(student,cls,conditions,library,[],[later]);
 assert.equal(recalculated.rows.find(r=>r.exam?.level===4).start,'2027-09-01');assert.equal(recalculated.rows.filter(r=>r.exam?.level===3).length,1);
 const raw=base.rows.find(r=>r.exam),tampered={...raw,exam:{level:8,dateStatus:'official'}};assert.deepEqual(validateRows([tampered],conditions,base.rows)[0].exam,raw.exam);
});
test('家长版和阶段详解显示多个条件考级，保留历史快照',()=>{
 const p={...build(),studentSnapshot:{...student,grade:'六年级',className:'示例班',curriculum:library.name},librarySnapshot:library};const before=structuredClone(p),report=buildParentReport(p);
 assert.equal(report.rows.filter(r=>r.kind==='goal').length,4);assert.equal(report.conditions.recentMonth,'2026-12');assert.match(report.rows.find(r=>r.kind==='goal').task,/拟参加GESP三级/);
 assert.ok(report.phases.filter(r=>r.kind==='goal').every(r=>r.notes.some(n=>/补齐|补充项/.test(n))));assert.deepEqual(p,before);
 assert.doesNotMatch(JSON.stringify(report),/AI|API|sourceHash|TEST_SECRET/);
});
