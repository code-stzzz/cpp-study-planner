import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createApp} from '../server.mjs';
import {openStore} from '../lib/store.mjs';
import {buildBaseline,recommendWinter,makeCalendar} from '../lib/planning.mjs';
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));
const student={name:'测试学员',grade:'六年级',schoolYear:'2026—2027',personalProgress:true,unit:1,lesson:0,mastery:'待评估',passed:'未参加',notes:'',attended:[]};
const cls={name:'测试班',unit:1,lesson:0,weekday:6,recommendationVersion:'4.5',curriculum:library.name};
const conditions={start:'2026-10-24',end:'2029-01-01',goal:'GESP 4级',targetMonth:'2028-09',winter:'none',summer:'none',winterDays:10,summerDays:10};
test('104课日历包含数理、原有复习测评，寒暑假不跳周',()=>{
 const calendar=makeCalendar(student,cls,conditions,library);assert.equal(calendar.length,104);assert.equal(calendar[0].title,'平面几何基础');assert.equal(calendar[8].title,'初识C++');assert.equal(calendar[18].type,'review');assert.equal(calendar[19].type,'assessment');
 for(let i=1;i<calendar.length;i++)assert.equal(Date.parse(calendar[i].date)-Date.parse(calendar[i-1].date),604800000);
 const inherited=makeCalendar({...student,personalProgress:false},{...cls,unit:5,lesson:6},conditions,library);assert.equal(inherited[0].id,'U5-L7');
});
test('寒假首营门槛、历史与未确认映射',()=>{
 assert.equal(recommendWinter('4.5',{unit:1,lesson:16},['XP05']).code,'');
 assert.equal(recommendWinter('4.5',{unit:1,lesson:17}).code,'D01');
 assert.equal(recommendWinter('4.5',{unit:5,lesson:1}).code,'D02');
 assert.equal(recommendWinter('4.5',{unit:7,lesson:6}).code,'D03');
 assert.equal(recommendWinter('4.5',{unit:5,lesson:1},['D03']).code,'D04');
 assert.equal(recommendWinter('4.5',{unit:1,lesson:17},['XP03B']).code,'D01');
 assert.equal(recommendWinter('4.5',{unit:8,lesson:12},['D05']).code,'');
 assert.equal(recommendWinter('unmapped',{unit:8,lesson:12}).code,'');
 const b=buildBaseline({...student,unit:5,lesson:6},cls,{...conditions,end:'2027-09-30',targetMonth:'2027-09',winter:'auto',winterDate:'2027-01-25',winterDays:30},library);
 assert.equal(b.recommendation.code,'D02');assert.equal(b.rows.find(r=>r.id==='winter').end,'2027-02-03');assert.ok(b.warnings.some(w=>w.includes('20天')));
});
test('完整HTTP流程：权限、加密设置、真实请求协议、版本、PDF、错误恢复',async t=>{
 const workspace=resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
 // Use a known task-owned directory and verify the cleanup target before recursion.
 const parent=resolve(process.cwd(),'.test-work');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'run-'));
 let mockMode='success',requests=[];
 const mock=http.createServer(async(req,res)=>{let raw='';for await(const ch of req)raw+=ch;const payload=JSON.parse(raw);requests.push({auth:req.headers.authorization,payload});res.setHeader('Content-Type','application/json');
  if(mockMode==='unauthorized'){res.writeHead(401);res.end('{"error":"bad key"}');return}
  let content='OK';if(payload.messages.length>1){const input=JSON.parse(payload.messages.at(-1).content);const rows=input.rows.map(r=>({...r,task:r.task+' / AI阶段任务',milestone:'完成对应课堂任务，依据单元测评记录薄弱项'}));if(mockMode==='invalid')rows[0].start='2020-01-01';content=JSON.stringify({rows,advice:'每周整理错题，结合单元测评更新学习记录。'})}
  res.end(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}));
 });await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockUrl='http://127.0.0.1:'+mock.address().port;
 const app=createApp({dataDir:dir,port:0});const port=await app.listen(),base='http://127.0.0.1:'+port;let cookie='';
 const call=async(path,method='GET',payload,auth=cookie,origin=base)=>{const r=await fetch(base+'/api'+path,{method,headers:{Origin:origin,Cookie:auth,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 try{
  await t.test('初始化、同源保护与登录',async()=>{assert.equal((await call('/session')).data.setupRequired,true);assert.equal((await call('/setup','POST',{username:'qaadmin',name:'测试管理员',password:'OnlyForLocalTests!42'},'','https://elsewhere.example')).status,403);const setup=await call('/setup','POST',{username:'qaadmin',name:'测试管理员',password:'OnlyForLocalTests!42'});assert.equal(setup.status,200);cookie=setup.cookie;assert.equal((await call('/setup','POST',{})).status,409);});
  const admin=(await call('/data')).data.user;
  const teacher=await call('/users','POST',{username:'teacher01',name:'测试老师',password:'OnlyForTeacherTests!42'});assert.equal(teacher.status,201);
  const c1=(await call('/classes','POST',{name:'AC进阶测试班',weekday:6,unit:5,lesson:6,teacherIds:[admin.id],recommendationVersion:'4.5'})).data;
  const c2=(await call('/classes','POST',{name:'另一位老师的班级',weekday:0,unit:1,lesson:0,teacherIds:[teacher.data.id],recommendationVersion:'unmapped'})).data;
  const s1=(await call('/students','POST',{...student,name:'示例学员',classId:c1.id,personalProgress:false,unit:5,lesson:6})).data;
  const teacherCookie=(await call('/login','POST',{username:'teacher01',password:'OnlyForTeacherTests!42'})).cookie;
  await t.test('教师不能读取或修改未授权班级、学生和API配置',async()=>{const d=(await call('/data','GET',undefined,teacherCookie)).data;assert.equal(d.classes.length,1);assert.equal(d.students.length,0);assert.equal(d.users[0].name,'测试老师');assert.equal((await call('/students/'+s1.id,'PUT',{...s1},teacherCookie)).status,404);assert.equal((await call('/settings/ai','PUT',{},teacherCookie)).status,403)});
  const c={...conditions,end:'2027-09-30',targetMonth:'2027-09',winter:'auto',winterDate:'2027-01-25',summer:'XP03B',summerDate:'2027-07-12'};
  let plan=(await call('/plans/build','POST',{studentId:s1.id,conditions:c,mode:'baseline'})).data;assert.ok(plan.id);assert.equal(plan.calendar[0].id,'U5-L7');
  await t.test('未绑定API时给出错误，不伪装AI生成',async()=>{assert.equal((await call('/plans/build','POST',{studentId:s1.id,conditions:c,mode:'ai'})).status,409);assert.equal(plan.source,'规则排课草稿')});
  await t.test('密钥加密且不回传，换地址不能沿用旧密钥',async()=>{const saved=await call('/settings/ai','PUT',{baseUrl:mockUrl+'/v1',model:'qa-model',apiKey:'TEST_SECRET_NOT_REAL'});assert.equal(saved.status,200);assert.equal(saved.data.configured,true);assert.ok(!JSON.stringify(saved.data).includes('TEST_SECRET'));assert.ok(!app.store.get('settings','ai').encryptedKey.includes('TEST_SECRET'));assert.equal((await call('/settings/ai','PUT',{baseUrl:mockUrl+'/other',model:'qa-model'})).status,400);assert.equal((await call('/settings/ai/test','POST',{})).data.ok,true);assert.equal(requests.at(-1).auth,'Bearer TEST_SECRET_NOT_REAL')});
  await t.test('AI生成通过服务端请求和约束校验',async()=>{const generated=await call('/plans/build','POST',{studentId:s1.id,conditions:c,mode:'ai',planId:plan.id,revision:plan.revision});assert.equal(generated.status,200);plan=generated.data;assert.equal(plan.source,'AI规划');assert.equal(plan.rows[0].task,'U5单元：递推、贪心与二分');const input=JSON.parse(requests.at(-1).payload.messages.at(-1).content);assert.equal(input.student.name,undefined);assert.equal(input.student.grade,'六年级')});
  await t.test('三项建议和阶段编辑保存、校验及课程资料更新',async()=>{const guidance={focus:'巩固二分与高精度。',homework:'在ACGO完成老师布置的练习。',family:'关注完成情况。'};const phaseEdits={'unit-5':{objective:'能够解释二分边界',practice:'完成ACGO二分专题',outcome:'整理典型错题'}};const saved=await call('/plans/'+plan.id,'PUT',{revision:plan.revision,rows:plan.rows,advice:plan.advice,guidance,phaseEdits,refreshLibrary:true});assert.equal(saved.status,200);plan=saved.data;assert.deepEqual(plan.guidance,guidance);assert.deepEqual(plan.phaseEdits,phaseEdits);assert.equal(plan.librarySnapshot.camps.find(c=>c.code==='D02').schedule.length,10);const invalid=await call('/plans/'+plan.id,'PUT',{revision:plan.revision,rows:plan.rows,advice:plan.advice,guidance:{...guidance,focus:'a'.repeat(81)}});assert.equal(invalid.status,400);assert.equal(app.store.get('plans',plan.id).revision,plan.revision)});
  await t.test('手工修改、乐观并发和不可变定稿',async()=>{plan.rows[0].task='老师确认的阶段任务';plan.rows[0].edited=true;const saved=await call('/plans/'+plan.id,'PUT',{revision:plan.revision,rows:plan.rows,advice:plan.advice});assert.equal(saved.status,200);const staleRevision=plan.revision;plan=saved.data;assert.equal((await call('/plans/'+plan.id,'PUT',{revision:staleRevision,rows:plan.rows,advice:'过期'})).status,409);const v=await call('/plans/'+plan.id+'/versions','POST',{revision:plan.revision});assert.equal(v.status,201);const oldTask=app.store.get('versions',v.data.id).snapshot.rows[0].task;const regenerated=await call('/plans/build','POST',{studentId:s1.id,conditions:c,mode:'ai',planId:plan.id,revision:plan.revision});assert.equal(regenerated.status,200);plan=regenerated.data;assert.equal(plan.rows[0].task,oldTask);assert.equal(app.store.get('versions',v.data.id).snapshot.rows[0].task,oldTask)});
  await t.test('AI错误和约束违规不会覆盖已有规划',async()=>{const before=app.store.get('plans',plan.id);for(const mode of ['invalid','unauthorized']){mockMode=mode;const r=await call('/plans/build','POST',{studentId:s1.id,conditions:c,mode:'ai',planId:plan.id,revision:plan.revision});assert.equal(r.status,502);assert.deepEqual(app.store.get('plans',plan.id),before)}mockMode='success';});
  await t.test('多场次保存不信任客户端认证元数据，移除后重算顺延，按实际通过等级更新',async()=>{
   const exam=plan.rows.find(r=>r.exam);assert.ok(exam);const truth=structuredClone(exam.exam);
   exam.exam={level:8,dateStatus:'official'};let saved=await call('/plans/'+plan.id,'PUT',{revision:plan.revision,rows:plan.rows,advice:plan.advice});assert.equal(saved.status,200);plan=saved.data;assert.deepEqual(plan.rows.find(r=>r.id===exam.id).exam,truth);
   const key=truth.key;plan.rows=plan.rows.filter(r=>r.id!==exam.id);saved=await call('/plans/'+plan.id,'PUT',{revision:plan.revision,rows:plan.rows,advice:plan.advice});plan=saved.data;assert.ok(plan.excludedExams.includes(key));
   const regenerated=await call('/plans/build','POST',{studentId:s1.id,conditions:{...c,targetMonth:''},mode:'baseline',planId:plan.id,revision:plan.revision});assert.equal(regenerated.status,200);plan=regenerated.data;assert.ok(!plan.rows.some(r=>r.exam?.key===key));
   const updated=await call('/students/'+s1.id,'PUT',{...s1,passed:'GESP 2级'});assert.equal(updated.status,200);
   const current=await call('/plans/build','POST',{studentId:s1.id,conditions:{...c,targetMonth:''},mode:'baseline',planId:plan.id,revision:plan.revision});assert.equal(current.status,200);plan=current.data;assert.equal(plan.rows.find(r=>r.exam).exam.level,3);
  });
  await t.test('老师调整考级保存、重新匹配、冲突恢复及定稿导出一致性',async()=>{
   const third=plan.rows.find(r=>r.exam?.level===3),before=structuredClone(plan),oldFourth=plan.rows.find(r=>r.exam?.level===4);assert.ok(third);
   const saved=await call('/plans/'+plan.id,'PUT',{revision:plan.revision,rows:plan.rows,advice:plan.advice,phaseEdits:{...plan.phaseEdits,[oldFourth.id]:{note:'文件读写和异常处理需继续练习。'}},examAdjustments:{[third.id]:{month:'2027-03',reason:'独立解题能力需巩固，完成专题后再参加。'}}});assert.equal(saved.status,200);plan=saved.data;assert.equal(plan.needsRematch,true);
   assert.equal((await call('/plans/'+plan.id+'/versions','POST',{revision:plan.revision})).status,409);assert.equal((await fetch(base+'/api/plans/'+plan.id+'/pdf',{headers:{Cookie:cookie}})).status,409);
   const rebuilt=await call('/plans/build','POST',{studentId:s1.id,conditions:plan.conditions,mode:'baseline',planId:plan.id,revision:plan.revision});assert.equal(rebuilt.status,200);plan=rebuilt.data;assert.equal(plan.needsRematch,false);assert.equal(plan.rows.find(r=>r.exam?.level===3).start,'2027-03-01');assert.equal(plan.rows.find(r=>r.exam?.level===4).start,'2027-06-01');assert.match(plan.rows.find(r=>r.exam?.level===3).exam.teacherReason,/独立解题/);assert.deepEqual(plan.calendar,before.calendar);
   const fourth=plan.rows.find(r=>r.exam?.level===4),revision=plan.revision;assert.equal(plan.phaseEdits[fourth.id].note,'文件读写和异常处理需继续练习。');const conflict=await call('/plans/'+plan.id,'PUT',{revision,rows:plan.rows,advice:plan.advice,examAdjustments:{[fourth.id]:{month:'2027-03',reason:''}}});assert.equal(conflict.status,400);assert.equal(app.store.get('plans',plan.id).revision,revision);
   const release=await call('/plans/'+plan.id,'PUT',{revision:plan.revision,rows:plan.rows,advice:plan.advice,examAdjustments:{[third.id]:{month:'',reason:''}}});assert.equal(release.status,200);plan=release.data;
   const automatic=await call('/plans/build','POST',{studentId:s1.id,conditions:plan.conditions,mode:'baseline',planId:plan.id,revision:plan.revision});assert.equal(automatic.status,200);plan=automatic.data;assert.equal(plan.rows.find(r=>r.exam?.level===3).start,'2026-12-26');assert.equal(plan.needsRematch,false);
  });
  await t.test('中文PDF成功导出',async()=>{const r=await fetch(base+'/api/plans/'+plan.id+'/pdf',{headers:{Cookie:cookie}});if(!r.ok)assert.fail(await r.text());const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');assert.ok(bytes.length>10000);const folder=resolve(process.cwd(),'../tmp/pdfs');mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'mvp-test-plan.pdf'),bytes)});
  await t.test('数据库持久化、规划访问权限和退出登录',async()=>{assert.equal((await call('/plans/'+plan.id,'GET',undefined,teacherCookie)).status,404);const reopened=openStore(dir);try{assert.equal(reopened.get('plans',plan.id).id,plan.id)}finally{reopened.close()}assert.equal((await call('/logout','POST',{})).status,200);assert.equal((await call('/data')).status,401)});
 }finally{await app.close();await new Promise(r=>mock.close(r));const resolved=resolve(dir);if(!resolved.startsWith(parent+sep))throw Error('Unsafe test cleanup path');rmSync(resolved,{recursive:true,force:true});}
});
