import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {loadSummerCatalog} from '../lib/camp-catalog.mjs';
import {openStore} from '../lib/store.mjs';
import {buildBaseline} from '../lib/planning.mjs';
import {buildParentReport} from '../public/report.js';
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));

test('七份暑期原图与逐日转录一致，模拟、复习、半天及休息安排分别保留',()=>{
 const catalog=loadSummerCatalog();assert.deepEqual(catalog.codes,['XP01','XP02','XP03A','XP03B','XP04','XP05','NOIP']);
 for(const camp of catalog.camps){
  const bytes=readFileSync(new URL('../../'+camp.sourceDetails.archived_path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),camp.sourceDetails.sha256);
  assert.equal(camp.schedule.length,camp.days);
  if(camp.code!=='NOIP')assert.deepEqual(camp.schedule.at(-1).sessions,[{period:'上午',format:'讲解课'}]);
 }
 const find=code=>catalog.camps.find(c=>c.code===code),period=(code,day,p)=>find(code).schedule[day-1].sessions.find(s=>s.period===p)?.format;
 assert.match(find('XP01').requirements,/语法学习中/);assert.doesNotMatch(find('XP01').requirements,/零基础/);
 assert.equal(find('XP03A').sourceCode,'XP03-A');assert.equal(find('XP03B').sourceCode,'XP03-B');
 assert.equal(period('XP03A',7,'上午'),'模拟赛');assert.equal(period('XP03B',7,'上午'),'讲解课');
 assert.equal(period('XP04',3,'晚上'),'模拟赛');assert.equal(period('XP04',8,'晚上'),'复习课');
 assert.equal(period('XP05',6,'下午'),'模拟赛');assert.equal(period('XP05',8,'下午'),'复习课');assert.equal(period('XP05',8,'晚上'),'复习课');
 assert.equal(find('NOIP').days,20);assert.equal(find('NOIP').teachingDays,18);assert.deepEqual(find('NOIP').restDays,[7,14]);
 assert.equal(period('NOIP',2,'下午'),'试题与拓展题目讲解');assert.equal(period('NOIP',20,'上午'),'模拟赛9');
 for(const day of [7,14])assert.ok(find('NOIP').schedule[day-1].sessions.every(s=>s.format==='休息'));
});

test('升级已有资料库时备份旧资料，保留教师修改、学生、设置及历史定稿，并且可重复启动',()=>{
 const parent=resolve('.test-work');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'summer-'));let store=openStore(dir);
 const catalog=loadSummerCatalog(),old=structuredClone(library);delete old.summerCatalogVersion;
 old.camps=old.camps.filter(c=>c.season!=='summer'||['XP01','XP03B'].includes(c.code));
 for(const c of old.camps.filter(c=>c.season==='summer')){delete c.sourceVersion;Object.assign(c,catalog.prior_library_defaults[c.code]);}
 old.units[0].lessons[0].knowledge='老师维护的数理内容';
 const edited=old.camps.find(c=>c.code==='XP01');edited.topic='老师补充的练习范围';edited.requirements='老师确认的入营基础';edited.reviewed=true;
 try{
  store.put('library','main',old);store.put('students','sample',{name:'合成测试学员'});store.put('settings','sample',{value:'合成设置'});store.put('versions','sample',{snapshot:{librarySnapshot:old}});store.close();store=openStore(dir);
  const next=store.get('library','main');assert.equal(next.camps.filter(c=>c.season==='summer').length,7);
  const preserved=next.camps.find(c=>c.code==='XP01');assert.equal(preserved.topic,edited.topic);assert.equal(preserved.requirements,edited.requirements);assert.equal(preserved.reviewed,true);
  assert.deepEqual(next.units,old.units);assert.deepEqual(store.get('versions','sample').snapshot.librarySnapshot,old);
  assert.deepEqual(store.get('students','sample'),{name:'合成测试学员'});assert.deepEqual(store.get('settings','sample'),{value:'合成设置'});
  assert.deepEqual(JSON.parse(readFileSync(join(dir,'backups/library-before-summer-2026-10-22.json'),'utf8')),old);
  next.camps.find(c=>c.code==='XP02').topic='升级后教师修改';store.put('library','main',next);store.close();store=openStore(dir);assert.equal(store.get('library','main').camps.find(c=>c.code==='XP02').topic,'升级后教师修改');
 }finally{store.close();if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');rmSync(dir,{recursive:true,force:true});}
});

test('NOIP按20个日历日排期，检查可参加天数与周期，家长版保留完整日程',()=>{
 const student={unit:8,lesson:5,personalProgress:true,passed:'GESP 5级',attended:[]},cls={weekday:6,recommendationVersion:'4.5'};
 const c={start:'2027-07-01',end:'2027-08-31',goal:'GESP 6级',winter:'none',summer:'NOIP',summerDays:20,summerDate:'2027-07-12'};
 const p=buildBaseline(student,cls,c,library),row=p.rows.find(r=>r.id==='summer');
 assert.equal(row.start,'2027-07-12');assert.equal(row.end,'2027-07-31');assert.ok(p.calendar.some(l=>l.date>row.start&&l.date<row.end));
 assert.ok(!p.warnings.some(w=>w.includes('其余')));
 assert.throws(()=>buildBaseline(student,cls,{...c,summerDays:10},library),/20天/);
 assert.throws(()=>buildBaseline(student,cls,{...c,end:'2027-07-30'},library),/20天日期/);
 const longer=buildBaseline(student,cls,{...c,summerDays:30},library);assert.ok(longer.warnings.some(w=>w.includes('其余10天')));
 const phase=buildParentReport({...p,librarySnapshot:library}).phases.find(p=>p.id==='summer');
 assert.equal(phase.days.length,20);assert.equal(phase.days[6].topic,'休息');assert.equal(phase.days.at(-1).topic,'模拟赛9');assert.match(phase.days[1].content,/下午：试题与拓展题目讲解/);assert.ok(phase.notes.some(n=>n.includes('18天')));
});
