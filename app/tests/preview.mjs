// Isolated UI verification fixture. This does not modify the user's .data database.
import {createApp} from '../server.mjs';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const app=createApp({dataDir:resolve('.qa-data'),port:4318});
let user=app.store.users().find(u=>u.username==='qa-admin');
if(!user)user=app.store.createUser({username:'qa-admin',name:'演示老师',role:'admin',password:'Local-UI-Check-2026!'});
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));
app.store.put('library','main',library);
app.store.put('classes','qa-class',{id:'qa-class',name:'周六 AC 进阶班',teacherIds:[user.id],weekday:6,unit:5,lesson:6,recommendationVersion:'4.5',curriculum:library.name});
app.store.put('students','qa-student',{id:'qa-student',name:'示例学员 A',classId:'qa-class',grade:'六年级',schoolYear:'2026—2027',unit:5,lesson:6,personalProgress:false,passed:'GESP 2级',mastery:'待评估',notes:'待结合单元测评更新。',attended:['XP01']});
app.store.put('students','qa-student-b',{id:'qa-student-b',name:'示例学员 B',classId:'qa-class',grade:'五年级',schoolYear:'2026—2027',unit:4,lesson:8,personalProgress:true,passed:'GESP 1级',mastery:'存在薄弱项',notes:'递归理解需要巩固。',attended:[]});
console.log('QA: http://127.0.0.1:'+await app.listen());
process.on('SIGINT',async()=>{await app.close();process.exit(0)});
