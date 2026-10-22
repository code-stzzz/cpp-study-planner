// Shared by the conditions editor and server. Legacy single-camp plans stay readable.
export const campStatus=value=>value==='已确定参加'?'已确定参加':'推荐方案';
export function summerPeriods(conditions){
 if(Array.isArray(conditions.summerCamps))return conditions.summerCamps.map(p=>({...p}));
 return conditions.summer&&conditions.summer!=='none'?[{id:'summer',code:conditions.summer,start:conditions.summerDate||'',status:campStatus(conditions.summerStatus),dateMode:'manual'}]:[];
}
export function datePlus(date,days){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
 const d=new Date(date+'T12:00:00Z');if(isNaN(d)||d.toISOString().slice(0,10)!==date)return '';
 d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function scheduleSummer(conditions,camps){
 let previousEnd='';return summerPeriods(conditions).map((p,index)=>{
  const duration=camps.find(c=>c.code===p.code&&c.season==='summer')?.days||0;
  const start=index&&p.dateMode==='auto'?datePlus(previousEnd,1):p.start||'';
  const end=duration?datePlus(start,duration-1):'';previousEnd=end;
  return {...p,start,end,duration};
 });
}
export function syncSummer(conditions,camps){
 conditions.summerCamps=scheduleSummer(conditions,camps).map(({end,duration,...p})=>p);
 const first=conditions.summerCamps[0];conditions.summer=first?.code||'none';
 if(first){conditions.summerDate=first.start;conditions.summerStatus=first.status;}
 return conditions;
}
