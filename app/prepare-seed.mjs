import {readFileSync,writeFileSync} from 'node:fs';
import {loadSummerCatalog} from './lib/camp-catalog.mjs';
const units=JSON.parse(readFileSync('seed/library.json','utf8')).units;
const winter=['D01','D02','D03','D04','D05'].map(code=>{
 const x=JSON.parse(readFileSync(`../data/camps/winter/${code}.json`,'utf8'));
 return {code,name:x.name,topic:x.subtitle_verbatim,season:'winter',days:x.duration_days,requirements:'入营前基础与课包版本由老师核对',source:'用户提供D01-D05完整大纲截图，2026-10-22逐项转录',schedule:x.schedule,subtitle_verbatim:x.subtitle_verbatim,syllabus_status:'transcribed_from_user_screenshot',syllabus_version:'screenshot-2026-10-22',syllabus_source:x.source,reviewed:false};
});
const summer=loadSummerCatalog();
const result={version:'AC-104-v1',name:'AC班 U1—U8（U1含8次数理课）',units,camps:[...winter,...summer.camps],summerCatalogVersion:summer.version,goals:[...Array.from({length:8},(_,i)=>`GESP ${i+1}级`),'CSP-J 晋级','CSP-S 晋级'].map(name=>({name,requirements:'',source:'',version:'',reviewed:false}))};
const gespCatalog=JSON.parse(readFileSync('../data/standards/gesp/cpp-levels.json','utf8'));
for(const goal of result.goals){const item=gespCatalog.levels.find(l=>l.name===goal.name);if(item)Object.assign(goal,{requirements:item.requirements,objective:item.objective,knowledgeBlocks:item.knowledgeBlocks,coreTopics:item.coreTopics,source_pages:item.source_pages,source:'用户提供《'+gespCatalog.title+'》第'+item.source_pages[0]+'-'+item.source_pages.at(-1)+'页',version:gespCatalog.version_label,reviewed:true,sourceHash:gespCatalog.source.sha256,reviewScope:'已与用户提供文件核对，未据此判定课程覆盖或个人掌握'});}
result.gesp=JSON.parse(readFileSync('../data/standards/gesp/course-mapping.json','utf8'));
writeFileSync('seed/library.json',JSON.stringify(result,null,2));
console.log('Prepared 104 lessons, 12 camps and 10 target entries.');
