import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {planningStatuses} from '../lib/planning-status.mjs';
import {studentStatusCell,planningCounts,classPlanningSummary,planningOverview} from '../public/planning-status-ui.js';
import {createApp} from '../server.mjs';
const plan=(id,studentId,revision=1,updatedAt='2026-10-22T01:00:00.000Z')=>({id,studentId,revision,updatedAt,updatedBy:'合成老师',conditions:{start:'2026-10-22',end:'2027-09-30',goal:'GESP 3级'},rows:[{id:'test'}],calendar:[]});
const version=p=>({id:'v-'+p.id,planId:p.id,number:1,createdAt:p.updatedAt,snapshot:structuredClone(p)});
test('未制定、草稿、已定稿与待重新定稿准确区分，定稿不改变原草稿',()=>{
 const students=['none','draft','final','update'].map(id=>({id})),plans=[plan('p1','draft'),plan('p2','final'),plan('p3','update',2)];
 const versions=[version(plans[1]),version({...plans[2],revision:1})],before=structuredClone({plans,versions});
 const statuses=planningStatuses(students,plans,versions);assert.deepEqual(statuses.map(s=>s.status),['unplanned','draft','finalized','needs_update']);
 assert.deepEqual(statuses.map(s=>s.completed),[false,false,true,false]);assert.deepEqual({plans,versions},before);
 assert.equal(statuses[3].finalNumber,1);assert.ok(!JSON.stringify(statuses).includes('"snapshot"'));
});
test('多份规划按最近更新统计，历史定稿不能使新草稿变成已完成',()=>{
 const old=plan('old','s',3,'2026-10-20T01:00:00Z'),latest=plan('new','s',1,'2026-10-22T01:00:00Z'),v=version(old);
 const status=planningStatuses([{id:'s'}],[latest,old],[v])[0];assert.equal(status.status,'draft');assert.equal(status.planId,'new');
 const v1=version(latest),v2={...v1,id:'v2',number:2,snapshot:{...latest,revision:2}};
 assert.equal(planningStatuses([{id:'s'}],[{...latest,revision:2}],[v2,v1])[0].status,'finalized');
 assert.equal(planningStatuses([{id:'s'}],[{...latest,needsRematch:true}],[v1])[0].completed,false);
 assert.equal(planningStatuses([{id:'s'}],[{...latest,revision:undefined}],[{...v1,snapshot:{}}])[0].completed,false);
});
test('班级人数按学生统计，支持空班，状态内容转义且不泄露版本快照',()=>{
 const students=[{id:'s1'},{id:'s2'}],p=plan('p','s1'),statuses=planningStatuses(students,[p],[version(p)]),data={planningStatuses:statuses};
 assert.deepEqual(planningCounts(data,students),{total:2,unplanned:1,draft:0,finalized:1,needs_update:0});assert.match(classPlanningSummary(data,students),/1 \/ 2 人已定稿/);
 assert.equal(planningCounts(data,[]).total,0);assert.match(planningOverview(data,students,'finalized'),/aria-pressed="true"/);
 const rendered=studentStatusCell({...statuses[0],goal:'<script>alert(1)</script>',updatedBy:'<img>'});assert.ok(!rendered.includes('<script>'));assert.match(rendered,/&lt;script&gt;/);
});
test('数据接口实时反映制定、定稿与修改，教师只能看到授权班级的状态',async()=>{
 const parent=resolve('.test-work');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'planning-status-')),app=createApp({dataDir:dir,port:0});
 const base='http://127.0.0.1:'+await app.listen();let cookie='';
 const call=async(path,method='GET',payload,auth=cookie)=>{const r=await fetch(base+'/api'+path,{method,headers:{Cookie:auth,Origin:base,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  cookie=(await call('/setup','POST',{username:'qa-admin',name:'合成管理员',password:'LocalStatusTests!2026'})).cookie;
  const teacher=app.store.createUser({username:'qa-teacher',name:'合成老师',password:'LocalStatusTests!2026',role:'teacher'}),admin=app.store.users().find(u=>u.username==='qa-admin');
  for(const [id,owner] of [['c1',teacher.id],['c2',admin.id]])app.store.put('classes',id,{id,name:id,teacherIds:[owner],weekday:6,unit:5,lesson:6,recommendationVersion:'4.5'});
  for(const [id,classId] of [['s1','c1'],['s2','c2']])app.store.put('students',id,{id,classId,name:'合成学员'+id,grade:'六年级',passed:'GESP 2级',personalProgress:false,attended:[]});
  const teacherCookie=(await call('/login','POST',{username:'qa-teacher',password:'LocalStatusTests!2026'})).cookie;
  const own=async()=> (await call('/data','GET',undefined,teacherCookie)).data;
  assert.deepEqual((await own()).planningStatuses.map(s=>s.status),['unplanned']);
  const conditions={start:'2026-10-22',end:'2027-09-30',goal:'GESP 3级',winter:'none',summer:'none'};
  let p=(await call('/plans/build','POST',{studentId:'s1',conditions,mode:'baseline'},teacherCookie)).data;
  assert.equal((await own()).planningStatuses[0].status,'draft');
  const finalized=(await call('/plans/'+p.id+'/versions','POST',{revision:p.revision},teacherCookie)).data;
  assert.equal((await own()).planningStatuses[0].status,'finalized');
  const snapshot=structuredClone(app.store.get('versions',finalized.id).snapshot);
  p.rows[0].milestone='老师更新后的掌握重点';p=(await call('/plans/'+p.id,'PUT',{revision:p.revision,rows:p.rows,advice:p.advice},teacherCookie)).data;
  assert.equal((await own()).planningStatuses[0].status,'needs_update');assert.deepEqual(app.store.get('versions',finalized.id).snapshot,snapshot);
  await call('/plans/'+p.id+'/versions','POST',{revision:p.revision},teacherCookie);assert.equal((await own()).planningStatuses[0].status,'finalized');
  const secret=plan('secret-plan','s2');secret.studentSnapshot={name:'PRIVATE_SYNTHETIC'};app.store.put('plans',secret.id,secret);app.store.put('versions','private-version',{...version(secret),createdBy:'PRIVATE_SYNTHETIC'});
  const restricted=await own();assert.equal(restricted.planningStatuses.length,1);assert.ok(!JSON.stringify(restricted).includes('PRIVATE_SYNTHETIC'));assert.equal(restricted.planningStatuses[0].studentId,'s1');
  const all=(await call('/data')).data;assert.equal(all.planningStatuses.length,2);assert.equal(all.planningStatuses.find(s=>s.studentId==='s2').completed,true);
  assert.equal((await fetch(base+'/planning-status-ui.js')).status,200);
 }finally{await app.close();if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');rmSync(dir,{recursive:true,force:true});}
});
