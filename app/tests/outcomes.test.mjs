import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stageTargets,displayMilestone} from '../public/outcomes.js';
import {buildPhases,buildParentReport,validatePhaseEdits} from '../public/report.js';
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));
const row=(u,ids)=>({id:'unit-'+u,kind:'regular',start:'2026-10-24',end:'2027-01-01',sourceIds:ids||library.units.find(x=>x.unit===u).lessons.map(l=>l.id),task:'U'+u,knowledge:'对应课程',milestone:'完成单元测评，记录掌握与薄弱知识点'});
test('八个单元分别生成掌握与思维目标，不重复统一验收文案',()=>{
 const values=library.units.map(u=>stageTargets(row(u.unit),library));
 assert.equal(new Set(values.map(v=>v.milestone)).size,8);
 assert.equal(new Set(values.map(v=>v.practice)).size,8);
 for(const v of values){assert.match(v.milestone,/掌握：.*\n思维：/);assert.doesNotMatch(v.milestone,/完成单元测评/);assert.match(v.practice,/ACGO/);}
});
test('剩余课次约束作用于掌握目标和训练标准',()=>{
 const late=stageTargets(row(5,['U5-L7','U5-L8','U5-L9','U5-L10','U5-L11','U5-L12']),library);
 assert.match(late.milestone,/二分|判定/);assert.match(late.milestone,/高精度/);assert.match(late.knowledge,/进借位/);assert.doesNotMatch(late.milestone,/贪心|递推/);
 const stack=stageTargets(row(6,['U6-L2']),library);assert.match(stack.thinking,/后进先出/);assert.doesNotMatch(JSON.stringify(stack),/二叉树|先进先出/);
});
test('旧的重复里程碑得到新呈现，老师自定义的目标与思维编辑保持有效',()=>{
 const r=row(7),p={rows:[r],librarySnapshot:library,conditions:{}};
 const before=JSON.stringify(p),report=buildParentReport(p);assert.match(report.rows[0].milestone,/思维：/);assert.equal(JSON.stringify(p),before);
 assert.equal(displayMilestone({...r,edited:true,milestone:'老师确认的目标'},library),'老师确认的目标');
 p.phaseEdits=validatePhaseEdits({[r.id]:{thinking:'解释队列扩展与访问标记',outcome:'独立完成迷宫搜索'}},p.rows);
 const phase=buildPhases(p)[0];assert.deepEqual(phase.checks.map(c=>c.label),['训练任务','编程思维','掌握标准']);assert.equal(phase.checks[1].content,'解释队列扩展与访问标记');assert.equal(phase.checks[2].content,'独立完成迷宫搜索');
});
test('GESP仅导入该文件中的C++与共用范围，保持页码与版本边界',()=>{
 const goals=library.goals.filter(g=>g.name.startsWith('GESP'));
 assert.equal(goals.length,8);for(const g of goals){assert.ok(g.reviewed);assert.ok(g.sourceHash);assert.ok(g.source_pages.length);assert.match(g.version,/发布日期未注明/);}
 const four=goals.find(g=>g.name==='GESP 4级');assert.match(four.requirements,/异常处理/);assert.match(four.requirements,/文件/);
 assert.doesNotMatch(JSON.stringify(goals),/Turtle|turtle|列表解析|Python复合|Python 复合/);
 const p={librarySnapshot:library,rows:[{id:'goal',kind:'goal',start:'2027-09-01',end:'2027-09-01',sourceIds:['goal:GESP 4级'],milestone:'根据正式安排'}],conditions:{goal:'GESP 4级'}};
 const phase=buildPhases(p)[0];assert.match(phase.modules[0].content,/异常处理/);assert.ok(phase.notes.some(n=>n.includes('个人掌握仍需')));
});
