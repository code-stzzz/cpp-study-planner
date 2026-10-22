import {readFileSync} from 'node:fs';

export function loadSummerCatalog(){
 const root=new URL('../../data/camps/summer/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('catalog.json',root),'utf8'));
 const camps=manifest.codes.map(code=>{
  const source=JSON.parse(readFileSync(new URL(code+'.json',root),'utf8'));
  if(source.code!==code||source.season!=='summer'||source.schedule.length!==source.duration_days||source.schedule.some((d,i)=>d.day!==i+1||!d.sessions?.length))throw Error('暑假训练营大纲结构不完整：'+code);
  return {code,sourceCode:source.source_code,name:source.name,season:'summer',days:source.duration_days,teachingDays:source.teaching_days,restDays:source.rest_days,
   topic:[...new Set(source.schedule.filter(d=>d.day_type!=='rest').map(d=>d.topic_verbatim))].join('、'),
   requirements:source.audience_verbatim,objectives:source.objectives_verbatim,
   source:'用户提供暑假训练营大纲原图，2026-10-22逐项转录',sourceVersion:manifest.version,sourceDetails:source.source,sourceNotes:[...source.schedule_notes,...source.notes],
   schedule:source.schedule,reviewed:false};
 });
 return {...manifest,camps};
}

// Only the shared library changes; plans and immutable versions retain their snapshots.
export function mergeSummerCatalog(library,catalog=loadSummerCatalog()){
 if(library.summerCatalogVersion===catalog.version)return {library,changed:false};
 const updated=structuredClone(library),codes=new Set(catalog.codes);
 const imported=catalog.camps.map(source=>{
  const existing=library.camps.find(c=>c.code===source.code);
  if(!existing)return structuredClone(source);
  const previous=catalog.prior_library_defaults[source.code]||{};
  const merged={...existing,...structuredClone(source)};
  for(const field of ['topic','requirements'])if(existing[field]&&existing[field]!==previous[field])merged[field]=existing[field];
  const contentChanged=JSON.stringify(existing.schedule)!==JSON.stringify(source.schedule)||merged.requirements!==existing.requirements;
  merged.reviewed=!!existing.reviewed&&!contentChanged;
  return merged;
 });
 updated.camps=[...updated.camps.filter(c=>!codes.has(c.code)),...imported];
 updated.summerCatalogVersion=catalog.version;
 return {library:updated,changed:true};
}
