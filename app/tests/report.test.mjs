import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildParentReport,taskTitle,goalTitle,parentText,buildGuidance,buildPhases,validateGuidance,validatePhaseEdits} from '../public/report.js';
import {buildBaseline} from '../lib/planning.mjs';
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));

test('旧规划任务压缩为单元、集训和考试主题，保留老师的简短自定义标题',()=>{
 const plan={librarySnapshot:library,conditions:{goal:'GESP 1级'}};
 assert.equal(taskTitle({kind:'regular',sourceIds:['U5-L7'],task:'原有很长的任务（第7—12课）'},plan),'U5单元：递推、贪心与二分');
 assert.equal(taskTitle({kind:'camp',sourceIds:['camp:XP01'],task:'XP01 · 10天 · 推荐方案'},plan),'参加XP01 语法筑基班');
 assert.equal(taskTitle({kind:'goal',sourceIds:['goal:GESP 1级'],task:'目标核验'},plan),'参加GESP一级考试');
 assert.equal(goalTitle('CSP-J 晋级'),'参加CSP-J晋级考试');
 assert.equal(taskTitle({kind:'regular',sourceIds:['U5-L7'],task:'U5单元总结',edited:true},plan),'U5单元总结');
});

test('家长版移除生成来源与技术说明，保留知识、评估和缺口，不修改原始定稿',()=>{
 const plan={studentSnapshot:{name:'示例学员',grade:'六年级',className:'AC班',curriculum:library.name,unit:5,lesson:6,passed:'GESP 2级'},conditions:{goal:'GESP 4级',targetMonth:'2027-06',start:'2026-10-21',end:'2027-09-30'},librarySnapshot:library,source:'AI规划',ai:{model:'secret-model'},libraryVersion:'内部版本',exportVersion:'AI规划',calendar:[{}],rows:[{id:'unit-5',kind:'regular',sourceIds:['U5-L7'],start:'2026-10-24',end:'2026-11-28',task:'U5知识点讲解，完成课次，参加测评 / AI阶段任务',knowledge:'二分；排序。API调用成功。',milestone:'AI建议：完成单元测评。'}],advice:'每周整理错题。\nAI模型输出需审核。\n通过AI生成的建议：结合测评调整练习。',warnings:['目标考纲尚未核对','个人掌握情况待测评','已保留老师修改的阶段，请核对','API没有配置']};
 const before=structuredClone(plan),report=buildParentReport(plan),serialized=JSON.stringify(report);
 assert.doesNotMatch(serialized,/AI|API|secret-model|内部版本|老师修改/);
 assert.equal(report.rows[0].knowledge,'二分；排序。');
 assert.match(report.rows[0].milestone,/掌握：/);assert.match(report.rows[0].milestone,/思维：/);
 assert.deepEqual(report.warnings,['目标考纲尚未核对','个人掌握情况待测评']);
 assert.equal(report.advice,undefined);assert.match(report.guidance.homework,/ACGO/);
 assert.equal(report.source,undefined);assert.equal(report.ai,undefined);assert.deepEqual(plan,before);
 assert.equal(parentText('二分；排序。'),'二分；排序。');
});

const student={unit:5,lesson:6,personalProgress:true,mastery:'待评估',attended:['XP01']};
const cls={unit:5,lesson:6,weekday:6,recommendationVersion:'4.5'};
function example(){return {...buildBaseline(student,cls,{start:'2026-10-24',end:'2027-09-30',goal:'GESP 4级',targetMonth:'2027-09',winter:'auto',winterDate:'2027-01-25',winterDays:10,summer:'XP03B',summerDate:'2027-07-12',summerDays:10},library),librarySnapshot:structuredClone(library)};}

test('学习建议仅一组三项，课后任务使用ACGO，旧长段建议不进入家长版',()=>{
 const plan=example();plan.advice='旧的长段建议'.repeat(100);
 const report=buildParentReport(plan);assert.deepEqual(Object.keys(report.guidance),['focus','homework','family']);
 assert.match(report.guidance.homework,/ACGO/);assert.ok(Object.values(report.guidance).join('').length<=120);
 assert.doesNotMatch(JSON.stringify(report),/旧的长段建议/);
 assert.throws(()=>validateGuidance({focus:'a'.repeat(81),homework:'任务',family:'配合'}),/80/);
});

test('常规课详解只使用剩余课次，不重新引入已学的U5前6课',()=>{
 const phase=buildPhases(example()).find(p=>p.id==='unit-5');
 const content=phase.modules.map(m=>m.content).join('；');
 assert.match(content,/二分答案/);assert.match(content,/高精度/);assert.match(content,/单元测评/);
 assert.doesNotMatch(content,/贪心|递推|二分查找/);assert.match(phase.sourceLabel,/第7—12课/);
});

test('集训详解引用完整10天大纲，D02采用本次截图，夏令营保留时段依据',()=>{
 const phases=buildPhases(example()),winter=phases.find(p=>p.id==='winter'),summer=phases.find(p=>p.id==='summer');
 assert.equal(winter.days.length,10);assert.equal(winter.days[0].topic,'贪心算法');assert.equal(winter.days[2].topic,'前缀和1');
 assert.match(winter.days[7].content,/理解二分答案/);assert.doesNotMatch(JSON.stringify(winter.days),/递归|位运算/);
 assert.equal(summer.days.length,10);assert.match(summer.days[0].content,/上午/);
});

test('路线修改与详解联动，老师编辑覆盖可保存的字段，未知条目被过滤',()=>{
 const p=example(),r=p.rows.find(r=>r.id==='unit-5');r.start='2026-10-25';r.task='U5巩固';r.edited=true;
 p.phaseEdits=validatePhaseEdits({[r.id]:{objective:'巩固二分答案',practice:'完成老师指定的ACGO专题',outcome:'整理三类典型错误',note:'下次课反馈。'},unknown:{objective:'不应出现'}},p.rows);
 const phase=buildPhases(p).find(x=>x.id===r.id);
 assert.equal(phase.title,'U5巩固');assert.equal(phase.start,r.start);assert.equal(phase.objective,'巩固二分答案');
 assert.match(phase.checks[0].content,/ACGO专题/);assert.ok(phase.notes.includes('下次课反馈。'));assert.equal(p.phaseEdits.unknown,undefined);
 assert.throws(()=>validatePhaseEdits({[r.id]:{note:'a'.repeat(301)}},p.rows),/300/);
});

test('考试详解保留考纲缺口，训练不推定官方题源、时长或通过成绩',()=>{
 const p=example();const row=p.rows.find(r=>r.kind==='goal'),name=row.sourceIds[0].slice(5);p.librarySnapshot.goals.find(g=>g.name===name).reviewed=false;const goal=buildPhases(p).find(p=>p.id===row.id);
 assert.match(goal.modules[0].content,/尚未核对/);assert.equal(goal.training.length,3);
 assert.match(goal.training[1].resources,/ACGO/);assert.match(goal.training[2].resources,/待确认/);
 assert.doesNotMatch(JSON.stringify(goal),/90分|120分钟|保证通过/);
});

test('旧定稿只使用保存的大纲，缺少逐日资料时给出说明，不从当前库静默替换',()=>{
 const p=example();p.librarySnapshot.camps.find(c=>c.code==='D02').schedule=[];
 const before=JSON.stringify(p),phase=buildPhases(p).find(x=>x.id==='winter');
 assert.equal(phase.days.length,0);assert.ok(phase.notes.some(n=>n.includes('本版本尚未收录')));assert.equal(JSON.stringify(p),before);
});

test('未能安排的集训仍在阶段说明保留原因',()=>{
 const p=example();p.rows=p.rows.filter(r=>r.id!=='winter');p.warnings.push('课包与推荐网站的版本映射待确认，请老师选择首营');
 assert.ok(buildPhases(p)[0].notes.some(n=>n.includes('版本映射待确认')));
});
