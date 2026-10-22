import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openStore,uid,checkPassword,hashToken} from './lib/store.mjs';
import {secretBox,publicConfig,prepareConfig,testConnection,generateAI} from './lib/ai.mjs';
import {fail,text,buildBaseline,checkProgress,validateRows,progress,mergeLockedRows,applyExamAdjustments,validateExamPins,remapPhaseEdits,normalizeConditions,reconcileSummerLocks} from './lib/planning.mjs';
import {gespLevel,goalName} from './public/gesp.js';
import {buildParentReport,buildGuidance,validateGuidance,validatePhaseEdits} from './public/report.js';
import {validateSessions} from './public/gesp.js';
import {planningStatuses} from './lib/planning-status.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1_000_000)fail('请求内容过大',413);chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{fail('请求格式错误')}}
function requireAdmin(user){if(user.role!=='admin')fail('只有管理员可以执行此操作',403)}
const canClass=(u,c)=>!!c&&(u.role==='admin'||c.teacherIds.includes(u.id));
function credentials(b){const username=text(b.username,40),name=text(b.name,50);if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||!name)fail('账号须为3—40位字母、数字或 ._-，姓名必填');if(typeof b.password!=='string'||b.password.length<10||b.password.length>200)fail('密码需要10—200个字符');return {username,name,password:b.password}}
function pdf(snapshot){return new Promise((accept,reject)=>{
 const bundled=join(process.env.USERPROFILE||'','.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
 const python=process.env.PLANNER_PYTHON||(existsSync(bundled)?bundled:'python');
 const child=spawn(python,[join(root,'lib','export_pdf.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output=[],length=0,errors='';
 const timer=setTimeout(()=>{child.kill();reject(Object.assign(new Error('PDF生成超时'),{status:500}))},60000);
 child.stdout.on('data',chunk=>{length+=chunk.length;if(length>20_000_000){child.kill();return}output.push(chunk)});child.stderr.on('data',x=>{errors+=x.toString().slice(0,2000)});
 child.on('error',()=>{clearTimeout(timer);reject(Object.assign(new Error('无法启动PDF生成器，请检查Python环境'),{status:500}))});child.on('close',code=>{clearTimeout(timer);if(code===0)accept(Buffer.concat(output));else {if(process.env.PLANNER_DEBUG_PDF==='1')console.error(errors);reject(Object.assign(new Error('PDF生成失败，请检查ReportLab和中文字体是否可用'),{status:500}))}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(buildParentReport(snapshot)));
})}
export function createApp({dataDir=resolve(root,'.data'),port=4317}={}){
 const store=openStore(dataDir),box=secretBox(dataDir),loginAttempts=new Map(),pending=new Set();
 const getLibrary=()=>store.get('library','main');
 const studentFor=(user,id)=>{const s=store.get('students',id);if(!s||!canClass(user,store.get('classes',s.classId)))fail('学生不存在或无访问权限',404);return s};
 const planFor=(user,id)=>{const p=store.get('plans',id);if(!p)fail('规划不存在',404);studentFor(user,p.studentId);return p};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try{
   const actualPort=server.address()?.port||port,allowedHosts=[`127.0.0.1:${actualPort}`,`localhost:${actualPort}`];
   if(!allowedHosts.includes(req.headers.host))fail('仅允许本机访问',403);
   const url=new URL(req.url,'http://'+req.headers.host),path=url.pathname;
   if(!path.startsWith('/api/')){
    if(req.method!=='GET')fail('方法不支持',405);
    const assets={'/':'index.html','/app.js':'app.js','/planning-status-ui.js':'planning-status-ui.js','/summer-camps.js':'summer-camps.js','/summer-ui.js':'summer-ui.js','/report.js':'report.js','/phase-ui.js':'phase-ui.js','/outcomes.js':'outcomes.js','/gesp.js':'gesp.js','/exam-ui.js':'exam-ui.js','/app.css':'app.css','/favicon.svg':'favicon.svg'};const name=assets[path];if(!name)fail('页面不存在',404);
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-cache');res.end(readFileSync(join(root,'public',name)));return;
   }
   if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!=='http://'+req.headers.host)fail('请求来源校验失败，请从本机网页操作',403);
   const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(x=>x.startsWith('planner_session='))?.slice(16),user=store.resolve(cookie);
   if(path==='/api/session'&&req.method==='GET'){json(res,200,{user,setupRequired:store.users().length===0});return}
   if((path==='/api/setup'||path==='/api/login')&&req.method==='POST'){
    const b=await body(req),attempts=(loginAttempts.get(req.socket.remoteAddress)||[]).filter(t=>Date.now()-t<600000);if(attempts.length>=20)fail('尝试次数过多，请10分钟后重试',429);attempts.push(Date.now());loginAttempts.set(req.socket.remoteAddress,attempts);
    let who;if(path==='/api/setup'){
     if(store.users().length)fail('管理员已创建，请登录',409);who=store.createUser({...credentials(b),role:'admin'});
     if(b.demo){const cls={id:uid(),name:'示例 · 周六AC班',teacherIds:[who.id],weekday:6,unit:5,lesson:6,recommendationVersion:'unmapped',curriculum:getLibrary().name};store.put('classes',cls.id,cls);const s={id:uid(),name:'示例学员',classId:cls.id,grade:'六年级',schoolYear:'2026—2027',personalProgress:false,unit:5,lesson:6,passed:'GESP 2级',mastery:'待评估',notes:'示例资料，可编辑或另建真实学生。',attended:['XP01']};store.put('students',s.id,s)}
    }else{const r=store.db.prepare('SELECT * FROM users WHERE username=?').get(text(b.username,40));if(!r||typeof b.password!=='string'||b.password.length>200||!checkPassword(b.password,r.password))fail('账号或密码不正确',401);who=store.user(r.id)}
    const token=store.session(who.id);res.setHeader('Set-Cookie',`planner_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);json(res,200,{user:who});return;
   }
   if(!user)fail('请先登录',401);
   if(path==='/api/logout'&&req.method==='POST'){store.db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(cookie));res.setHeader('Set-Cookie','planner_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(res,200,{ok:true});return}
   if(path==='/api/data'&&req.method==='GET'){
    const classes=store.list('classes').filter(c=>canClass(user,c)),students=store.list('students').filter(s=>classes.some(c=>c.id===s.classId)),plans=store.list('plans').filter(p=>students.some(s=>s.id===p.studentId)).map(({rows,calendar,advice,librarySnapshot,...p})=>({...p,rowCount:rows.length}));
    json(res,200,{user,classes,students,plans,planningStatuses:planningStatuses(students,plans,store.list('versions')),users:user.role==='admin'?store.users():[user],library:getLibrary(),ai:publicConfig(store.get('settings','ai'))});return;
   }
   if(path==='/api/users'&&req.method==='POST'){requireAdmin(user);const b=await body(req);if(store.users().some(u=>u.username===text(b.username,40)))fail('账号已存在',409);const u=store.createUser({...credentials(b),role:'teacher'});json(res,201,u);return}
   if(path==='/api/settings/ai'&&req.method==='PUT'){requireAdmin(user);const cfg=prepareConfig(await body(req),store.get('settings','ai'),box);store.put('settings','ai',cfg);json(res,200,publicConfig(cfg));return}
   if(path==='/api/settings/ai'&&req.method==='DELETE'){requireAdmin(user);store.remove('settings','ai');json(res,200,{configured:false});return}
   if(path==='/api/settings/ai/test'&&req.method==='POST'){
    requireAdmin(user);if(pending.has('test'))fail('连接测试进行中',409);pending.add('test');const cfg=store.get('settings','ai');
    try{const result=await testConnection(cfg,box);const latest=store.get('settings','ai');if(latest&&JSON.stringify(latest)===JSON.stringify(cfg))store.put('settings','ai',{...cfg,lastTest:result});json(res,200,result)}catch(e){if(cfg&&JSON.stringify(store.get('settings','ai'))===JSON.stringify(cfg))store.put('settings','ai',{...cfg,lastTest:{ok:false,at:new Date().toISOString(),message:e.message}});throw e}finally{pending.delete('test')}return;
   }
   if((path==='/api/classes'||/^\/api\/classes\/[\w-]+$/.test(path))&&['POST','PUT'].includes(req.method)){
    const id=path.split('/')[3]||uid(),old=store.get('classes',id);if(old&&!canClass(user,old))fail('无班级权限',403);if(req.method==='PUT'&&!old)fail('班级不存在',404);
    const b=await body(req),name=text(b.name,80),weekday=Number(b.weekday),unit=Number(b.unit),lesson=Number(b.lesson);if(!name||!Number.isInteger(weekday)||weekday<0||weekday>6)fail('请填写班级名称和上课日');checkProgress(unit,lesson,getLibrary());
    const teacherIds=user.role==='admin'?(Array.isArray(b.teacherIds)?b.teacherIds:[]):old?.teacherIds||[user.id];if(!teacherIds.length||teacherIds.some(id=>!store.user(id)))fail('请至少分配一位有效老师');
    const recommendationVersion=['unmapped','4.5','star','4.1CC','4.0'].includes(b.recommendationVersion)?b.recommendationVersion:'unmapped';
    const c={id,name,weekday,unit,lesson,teacherIds,curriculum:getLibrary().name,recommendationVersion};store.put('classes',id,c);json(res,200,c);return;
   }
   if((path==='/api/students'||/^\/api\/students\/[\w-]+$/.test(path))&&['POST','PUT'].includes(req.method)){
    const id=path.split('/')[3]||uid();if(req.method==='PUT')studentFor(user,id);const b=await body(req),cls=store.get('classes',b.classId);if(!canClass(user,cls))fail('请选择有权限的班级',403);
    const s={id,name:text(b.name,80),classId:cls.id,grade:text(b.grade,40),schoolYear:text(b.schoolYear,30),personalProgress:!!b.personalProgress,unit:Number(b.unit||cls.unit),lesson:Number(b.lesson??cls.lesson),passed:text(b.passed,60),mastery:text(b.mastery,60)||'待评估',notes:text(b.notes,1500),attended:Array.isArray(b.attended)?[...new Set(b.attended.map(x=>text(x,20)).filter(Boolean))].slice(0,30):[]};
    if(!s.name||!s.grade)fail('学生姓名和年级必填');checkProgress(s.unit,s.lesson,getLibrary());store.put('students',id,s);json(res,200,s);return;
   }
   if(path==='/api/library'&&req.method==='PUT'){
    requireAdmin(user);const b=await body(req),old=getLibrary();if(!Array.isArray(b.units)||b.units.length!==8)fail('课程结构须保留8个单元');
    const library=structuredClone(old);for(const u of library.units){const incoming=b.units.find(x=>x.unit===u.unit);if(!incoming||incoming.lessons?.length!==u.lessons.length)fail('不能改变已确认的课次数量');for(const l of u.lessons){const x=incoming.lessons.find(x=>x.id===l.id);if(!x||!text(x.title,100)||!text(x.knowledge,800))fail('每课名称与知识点不能为空');l.title=text(x.title,100);l.knowledge=text(x.knowledge,800)}}
    for(const camp of library.camps){const x=b.camps?.find(x=>x.code===camp.code);if(!x)fail('缺少集训资料');camp.topic=text(x.topic,1500);camp.requirements=text(x.requirements,1500);camp.reviewed=!!x.reviewed;if(!camp.topic||!camp.requirements)fail('集训知识点与入营条件不能为空')}
    for(const g of library.goals){const x=b.goals?.find(x=>x.name===g.name);if(!x)fail('缺少目标条目');g.requirements=text(x.requirements,8000);g.source=text(x.source,500);g.version=text(x.version,100);g.reviewed=!!x.reviewed;if(g.reviewed&&(!g.requirements||!g.source||!g.version))fail('标记考纲已核对前，请填写要求、来源和版本')}
    if(b.gesp?.sessions!==undefined){try{library.gesp.sessions=validateSessions(b.gesp.sessions)}catch(e){fail(e.message)}}
    library.version='AC-104-'+new Date().toISOString();store.put('library','main',library);json(res,200,library);return;
   }
   if(path==='/api/plans/build'&&req.method==='POST'){
    const b=await body(req),student=studentFor(user,b.studentId),cls=store.get('classes',student.classId),library=getLibrary(),old=b.planId?planFor(user,b.planId):null;
    if(old&&old.studentId!==student.id)fail('不能将已有规划用于其他学生');
    const conditions=normalizeConditions(b.conditions||{},library),locked=reconcileSummerLocks((old?.rows||[]).filter(r=>r.edited),conditions,old?.conditions||conditions,library);
    const base=buildBaseline(student,cls,conditions,library,old?.excludedExams||[],locked);
    if(old&&b.revision!==old.revision)fail('规划已被其他老师修改，请重新打开',409);
    if(locked.some(r=>r.start<base.conditions.start||r.end>base.conditions.end))fail('已修改阶段超出新周期，请先调整这些阶段或新建规划',409);
    let generated=null;if(b.mode==='ai'){if(pending.has(user.id))fail('当前已有AI规划正在生成',409);pending.add(user.id);try{generated=await generateAI(store.get('settings','ai'),box,base,student)}finally{pending.delete(user.id)}}
    if(old&&store.get('plans',old.id)?.revision!==old.revision)fail('生成期间规划已被修改，未覆盖当前内容，请重新生成',409);
    const incoming=generated?.rows||base.rows;const rows=mergeLockedRows(incoming,locked.filter(r=>!gespLevel(goalName(r))||gespLevel(goalName(r))>gespLevel(student.passed)));
    const id=old?.id||uid(),now=new Date().toISOString();const p={id,studentId:student.id,studentSnapshot:{...student,...base.progress,className:cls.name,curriculum:cls.curriculum},...base,rows:validateRows(rows,base.conditions),advice:old?.adviceEdited?old.advice:generated?.advice||base.advice,adviceEdited:!!old?.adviceEdited,guidance:old?.guidanceEdited?old.guidance:generated?.guidance||buildGuidance({...base,librarySnapshot:library}),guidanceEdited:!!old?.guidanceEdited,phaseEdits:validatePhaseEdits(remapPhaseEdits(old?.phaseEdits,old?.rows||[],rows),rows),source:generated?'AI规划':'规则排课草稿',ai:generated?{model:generated.model,generatedAt:generated.generatedAt}:null,revision:(old?.revision||0)+1,createdAt:old?.createdAt||now,updatedAt:now,updatedBy:user.name,librarySnapshot:library};
    if(generated)p.ai.generation=generated.generation;
    p.needsRematch=false;if(locked.length)p.warnings.push('已保留老师修改的阶段，请核对其与本次目标和条件的一致性');store.put('plans',id,p);json(res,200,p);return;
   }
   const match=path.match(/^\/api\/plans\/([\w-]+)(?:\/(versions|pdf))?$/);
   if(match){const p=planFor(user,match[1]);
    if(req.method==='GET'&&!match[2]){json(res,200,{...p,versions:store.list('versions').filter(v=>v.planId===p.id).map(({snapshot,...v})=>v)});return}
    if(req.method==='PUT'&&!match[2]){const b=await body(req);if(b.revision!==p.revision)fail('规划已被其他老师修改，请重新打开',409);let rows=validateRows(b.rows,p.conditions,p.rows);
     const dateChanged=rows.some(r=>gespLevel(goalName(r))&&p.rows.some(prev=>prev.id===r.id&&(prev.start!==r.start||prev.end!==r.end)));
     if(b.examAdjustments!==undefined)rows=applyExamAdjustments(rows,b.examAdjustments,p.conditions,p.librarySnapshot||getLibrary());
     validateExamPins(rows,p.conditions,p.librarySnapshot||getLibrary());
     const excludedExams=[...new Set([...(p.excludedExams||[]),...p.rows.filter(r=>r.exam&&!rows.some(x=>x.id===r.id)).map(r=>r.exam.key)])];const updated={...p,rows,excludedExams,needsRematch:!!p.needsRematch||dateChanged||!!Object.keys(b.examAdjustments||{}).length,advice:text(b.advice,3000),adviceEdited:b.advice!==p.advice||p.adviceEdited,revision:p.revision+1,updatedAt:new Date().toISOString(),updatedBy:user.name};
     try{
      if(b.guidance!==undefined){updated.guidance=validateGuidance(b.guidance);updated.guidanceEdited=!!p.guidanceEdited||JSON.stringify(updated.guidance)!==JSON.stringify(buildGuidance(p));}
      updated.phaseEdits=validatePhaseEdits(b.phaseEdits??p.phaseEdits??{},rows);
     }catch(e){fail(e.message)}
     if(b.refreshLibrary===true){updated.librarySnapshot=getLibrary();updated.libraryVersion=updated.librarySnapshot.version;updated.goal=updated.librarySnapshot.goals.find(g=>g.name===p.conditions.goal);if(updated.goal?.reviewed&&updated.goal.requirements)updated.warnings=updated.warnings.filter(w=>!w.startsWith(p.conditions.goal+'大纲未核对'));}
     const expected=new Map(p.rows.map(r=>[r.id,r]));updated.rows=rows.map(r=>({...r,edited:r.edited||JSON.stringify(r)!==JSON.stringify(expected.get(r.id))}));
     if(rows.some(r=>{const prev=expected.get(r.id);return !prev||prev.start!==r.start||prev.end!==r.end})&&!updated.warnings.includes('存在老师调整的日期或新增阶段，需复核周课衔接和同日安排'))updated.warnings.push('存在老师调整的日期或新增阶段，需复核周课衔接和同日安排');store.put('plans',p.id,updated);json(res,200,updated);return;
    }
    if(match[2]==='versions'&&req.method==='POST'){const b=await body(req);if(b.revision!==p.revision)fail('规划已变化，请保存后再定稿',409);if(p.needsRematch)fail('考级场次已调整，请先重新匹配路线再定稿',409);const v={id:uid(),planId:p.id,number:store.list('versions').filter(v=>v.planId===p.id).length+1,createdAt:new Date().toISOString(),createdBy:user.name,snapshot:structuredClone(p)};store.put('versions',v.id,v);json(res,201,{id:v.id,number:v.number});return}
    if(match[2]==='pdf'&&req.method==='GET'){let snapshot=p,version='草稿';const versionId=url.searchParams.get('version');if(versionId){const v=store.get('versions',versionId);if(!v||v.planId!==p.id)fail('版本不存在',404);snapshot=v.snapshot;version='定稿 v'+v.number}if(snapshot.needsRematch)fail('考级场次已调整，请先重新匹配路线再导出',409);const bytes=await pdf({...snapshot,exportVersion:version});res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="study-plan.pdf"; filename*=UTF-8''${encodeURIComponent(snapshot.studentSnapshot.name+'-学习规划书.pdf')}`,'Cache-Control':'no-store'});res.end(bytes);return}
   }
   fail('接口不存在',404);
  }catch(e){if(res.headersSent){res.end();return}json(res,e.status||500,{error:e.status?e.message:'操作失败，请检查输入或稍后重试'});}
 });
 return {server,store,listen:()=>new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server.address().port))),close:()=>new Promise(resolve=>{server.close(()=>{store.close();resolve()});server.closeAllConnections()})};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const app=createApp({dataDir:process.env.PLANNER_DATA_DIR?resolve(process.env.PLANNER_DATA_DIR):undefined,port:Number(process.env.PLANNER_PORT)||4317});const port=await app.listen();console.log(`Local: http://127.0.0.1:${port}`);console.log('数据保存在本机，按 Ctrl+C 停止服务。');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0)})}
