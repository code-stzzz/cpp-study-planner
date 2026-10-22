import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {normalizeConditions,buildBaseline} from '../lib/planning.mjs';
import {buildParentReport} from '../public/report.js';
import {summerPeriods,scheduleSummer} from '../public/summer-camps.js';
import {addSummer,changeSummer,removeSummer} from '../public/summer-ui.js';
import {createApp} from '../server.mjs';
import {coverageAt} from '../public/gesp.js';
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));
const student={unit:5,lesson:6,personalProgress:true,passed:'GESP 2级',attended:[]},cls={weekday:6,recommendationVersion:'4.5'};
const conditions={start:'2027-07-01',end:'2027-09-30',goal:'GESP 3级',winter:'none',summerDays:30,summerCamps:[
 {id:'summer',code:'XP02',start:'2027-07-12',status:'已确定参加',dateMode:'manual'},
 {id:'summer-second',code:'XP03A',start:'',status:'推荐方案',dateMode:'auto'},
 {id:'summer-third',code:'XP03B',start:'',status:'已确定参加',dateMode:'auto'}
]};
test('三期暑假营默认衔接、独立状态及完整家长版阶段，常规课继续',()=>{
 const plan=buildBaseline(student,cls,conditions,library),rows=plan.rows.filter(r=>r.kind==='camp');
 assert.deepEqual(rows.map(r=>[r.id,r.start,r.end]),[['summer','2027-07-12','2027-07-21'],['summer-second','2027-07-22','2027-07-31'],['summer-third','2027-08-01','2027-08-10']]);
 assert.equal(plan.conditions.summer,'XP02');assert.equal(plan.conditions.summerDate,'2027-07-12');
 assert.ok(rows.every(r=>plan.calendar.some(l=>l.date>=r.start&&l.date<=r.end)));
 const phases=buildParentReport({...plan,librarySnapshot:library}).phases.filter(p=>p.kind==='camp');
 assert.equal(phases.length,3);assert.ok(phases.every(p=>p.days.length===10));
 assert.ok(phases[1].notes.some(n=>n.includes('当前为拟安排')));assert.ok(!phases[2].notes.some(n=>n.includes('当前为拟安排')));
 assert.equal(plan.warnings.some(w=>w.includes('其余')),false);
});
test('暑期20天可选两个10天或一个NOIP；日期可留间隔，NOIP休息不压缩营期',()=>{
 const c={...conditions,summerDays:20,summerCamps:conditions.summerCamps.slice(0,2)};
 const plan=buildBaseline(student,cls,c,library);assert.equal(plan.rows.filter(r=>r.kind==='camp').length,2);
 const noip={...conditions,summerCamps:[{...conditions.summerCamps[0],code:'NOIP'},conditions.summerCamps[1]]};
 assert.deepEqual(scheduleSummer(noip,library.camps).map(p=>[p.start,p.end]),[['2027-07-12','2027-07-31'],['2027-08-01','2027-08-10']]);
 const gap=normalizeConditions({...c,summerCamps:[c.summerCamps[0],{...c.summerCamps[1],start:'2027-08-02',dateMode:'manual'}]},library);
 assert.equal(gap.summerCamps[1].start,'2027-08-02');
});
test('限制重叠、超天数、周期外、非法课程、重复编号与超过三期',()=>{
 const c=structuredClone(conditions);
 assert.throws(()=>normalizeConditions({...c,summerDays:20},library),/合计30天/);
 assert.throws(()=>normalizeConditions({...c,summerCamps:[c.summerCamps[0],{...c.summerCamps[1],start:'2027-07-21',dateMode:'manual'}]},library),/重叠/);
 assert.throws(()=>normalizeConditions({...c,end:'2027-08-09'},library),/完整位于/);
 assert.throws(()=>normalizeConditions({...c,summerCamps:[{...c.summerCamps[0],code:'D01'}]},library),/有效的暑假/);
 assert.throws(()=>normalizeConditions({...c,summerCamps:[c.summerCamps[0],c.summerCamps[0]]},library),/编号/);
 assert.throws(()=>normalizeConditions({...c,summerCamps:[...c.summerCamps,{...c.summerCamps[0],id:'summer-fourth'}]},library),/最多安排3期/);
 assert.throws(()=>normalizeConditions({...c,summerCamps:{}},library),/格式/);
});
test('考级覆盖逐期按实际日期计入，未确认的第二期保留参加前提',()=>{
 // Synthetic mapping isolates scheduling behavior without adding curriculum claims to the real catalog.
 const l=structuredClone(library),rule=l.gesp.levels.find(r=>r.level===3);
 rule.blocks=['XP02','XP03A'].map(code=>({label:code,timing:true,groups:[['camp:'+code+':1']]}));
 for(const code of ['XP02','XP03A'])l.gesp.evidence['camp:'+code+':1']=l.camps.find(c=>c.code===code).schedule[0].topic_verbatim;
 const p=buildBaseline(student,cls,conditions,l),camps=p.rows.filter(r=>r.kind==='camp');
 assert.equal(coverageAt(3,'2027-07-22',student,p.progress,p.calendar,camps,l).ready,false);
 const after=coverageAt(3,'2027-07-23',student,p.progress,p.calendar,camps,l);assert.equal(after.ready,true);assert.deepEqual(after.conditionalCamps,['XP03A']);
 camps.find(r=>r.id==='summer-second').campStatus='已确定参加';assert.deepEqual(coverageAt(3,'2027-07-23',student,p.progress,p.calendar,camps,l).conditionalCamps,[]);
});
test('旧单营自然迁移，编辑器添加移除、自动日期与手动日期互不覆盖',()=>{
 const legacy={...conditions,summerCamps:undefined,summer:'XP01',summerDate:'2027-07-12',summerDays:10};
 assert.equal(normalizeConditions(legacy,library).summerCamps[0].id,'summer');
 addSummer(legacy,library.camps,'summer-two');changeSummer(legacy,library.camps,'summer-two','code','XP02');
 assert.equal(legacy.summerDays,20);assert.equal(legacy.summerCamps[1].start,'2027-07-22');
 changeSummer(legacy,library.camps,'summer-two','start','2027-08-01');changeSummer(legacy,library.camps,'summer','start','2027-07-11');
 assert.equal(legacy.summerCamps[1].start,'2027-08-01');
 changeSummer(legacy,library.camps,'summer-two','dateMode','auto');assert.equal(legacy.summerCamps[1].start,'2027-07-21');
 removeSummer(legacy,library.camps,'summer');assert.equal(summerPeriods(legacy).length,1);
 removeSummer(legacy,library.camps,'summer-two');assert.equal(legacy.summer,'none');assert.deepEqual(normalizeConditions(legacy,library).summerCamps,[]);
});
test('多营保存重开与再匹配，移除或更换营地不会恢复旧编辑，历史定稿保持原样',async()=>{
 const parent=resolve('.test-work');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'multi-summer-')),app=createApp({dataDir:dir,port:0});
 const base='http://127.0.0.1:'+await app.listen();let cookie='';
 const call=async(path,payload,method='POST')=>{const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});const data=await r.json();assert.equal(r.status<300,true,JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 try{
  cookie=(await call('/setup',{username:'summer-admin',name:'合成老师',password:'LocalSummerTests!2026'})).cookie;
  const user=app.store.users()[0];app.store.put('classes','c',{...cls,id:'c',name:'合成测试班',curriculum:library.name,teacherIds:[user.id]});app.store.put('students','s',{...student,id:'s',name:'合成学员',classId:'c',grade:'六年级'});
  let p=(await call('/plans/build',{studentId:'s',conditions,mode:'baseline'})).data;
  const version=(await call('/plans/'+p.id+'/versions',{revision:p.revision})).data,snapshot=structuredClone(app.store.get('versions',version.id).snapshot);
  const reopened=(await call('/plans/'+p.id,undefined,'GET')).data;assert.deepEqual(reopened.conditions.summerCamps,p.conditions.summerCamps);
  p.rows.find(r=>r.id==='summer-second').task='老师安排的搜索训练';p.rows.find(r=>r.id==='summer-third').task='老师安排的冲刺训练';
  p=(await call('/plans/'+p.id,{revision:p.revision,rows:p.rows,advice:p.advice,phaseEdits:{'summer-second':{note:'保留搜索练习'},'summer-third':{note:'旧冲刺练习'}}},'PUT')).data;
  const changed=structuredClone(p.conditions);changed.summerCamps=changed.summerCamps.slice(0,2);changed.summerCamps[1].dateMode='manual';changed.summerCamps[1].start='2027-08-05';changed.summerCamps[1].status='已确定参加';
  p=(await call('/plans/build',{studentId:'s',conditions:changed,mode:'baseline',planId:p.id,revision:p.revision})).data;
  assert.equal(p.rows.filter(r=>r.kind==='camp').length,2);assert.equal(p.rows.some(r=>r.id==='summer-third'),false);
  const second=p.rows.find(r=>r.id==='summer-second');assert.equal(second.start,'2027-08-05');assert.equal(second.task,'老师安排的搜索训练');assert.equal(second.campStatus,'已确定参加');assert.equal(p.phaseEdits['summer-third'],undefined);
  const replacement=structuredClone(p.conditions);replacement.summerCamps[1].code='XP04';
  p=(await call('/plans/build',{studentId:'s',conditions:replacement,mode:'baseline',planId:p.id,revision:p.revision})).data;
  assert.deepEqual(p.rows.find(r=>r.id==='summer-second').sourceIds,['camp:XP04']);assert.equal(p.phaseEdits['summer-second'],undefined);assert.ok(!p.rows.find(r=>r.id==='summer-second').task.includes('搜索训练'));
  assert.deepEqual(app.store.get('versions',version.id).snapshot,snapshot);
  for(const file of ['/summer-camps.js','/summer-ui.js'])assert.equal((await fetch(base+file)).status,200);
 }finally{await app.close();if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');rmSync(dir,{recursive:true,force:true});}
});
