import {summerPeriods,scheduleSummer,syncSummer,datePlus} from './summer-camps.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function addSummer(conditions,camps,id){
 const list=summerPeriods(conditions);if(list.length>=3)return;
 const previous=scheduleSummer(conditions,camps).at(-1);
 list.push({id:list.length===0?'summer':id,code:'',start:datePlus(previous?.end,1)||conditions.summerDate||'',status:'推荐方案',dateMode:list.length?'auto':'manual'});
 conditions.summerCamps=list;syncSummer(conditions,camps);
}
export function changeSummer(conditions,camps,id,key,value){
 const list=summerPeriods(conditions),p=list.find(p=>p.id===id);if(!p)return;
 p[key]=value;if(key==='start')p.dateMode='manual';conditions.summerCamps=list;syncSummer(conditions,camps);
 if(key==='code'){
  const total=scheduleSummer(conditions,camps).reduce((n,p)=>n+p.duration,0);
  if(total<=30&&total>conditions.summerDays)conditions.summerDays=[10,20,30].find(n=>n>=total);
 }
}
export function removeSummer(conditions,camps,id){
 conditions.summerCamps=summerPeriods(conditions).filter(p=>p.id!==id);syncSummer(conditions,camps);
}
export function summerEditor(c,camps){
 const periods=scheduleSummer(c,camps),total=periods.reduce((n,p)=>n+p.duration,0),cap=Number(c.summerDays)||10;
 const choices=[['','请选择集训课程'],...camps.filter(x=>x.season==='summer').map(x=>[x.code,`${x.code} · ${x.name} · ${x.days}天`])];
 const select=(label,p,key,choices)=>`<label>${label}<select data-summer-period="${esc(p.id)}" data-summer-field="${key}" aria-label="第${periods.indexOf(p)+1}期${label}">${choices.map(([value,title])=>`<option value="${esc(value)}" ${p[key]===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;
 const errors=[];if(total>cap)errors.push(`已选${total}天，超过可参加的${cap}天，请调整课程或天数。`);
 const dated=periods.filter(p=>p.start&&p.end).sort((a,b)=>a.start.localeCompare(b.start));
 if(dated.some((p,i)=>i&&p.start<=dated[i-1].end))errors.push('营期日期重叠，请调整开始日期。');
 if(dated.some(p=>p.start<c.start||p.end>c.end))errors.push('营期起止日期须完整位于规划周期内。');
 return `<section class="card summer-editor"><div class="card-head"><h2>暑假集训 · XP / NOIP</h2><span class="badge">常规课照常</span></div><div class="summer-summary"><label>暑假可参加总天数<select data-condition="summerDays">${[10,20,30].map(n=>`<option value="${n}" ${n===cap?'selected':''}>${n}天</option>`).join('')}</select></label><div class="summer-total"><strong>已安排 ${periods.length} 期 · ${total} 天</strong><span>${total>cap?'超出 '+(total-cap)+' 天':'还可安排 '+(cap-total)+' 天'} · 最多3期</span></div></div>
 ${!periods.length?'<div class="summer-empty">暂未安排暑假集训，点击下方按钮添加课程。</div>':periods.map((p,index)=>{
  const camp=camps.find(x=>x.code===p.code),rest=camp?.restDays;
  return `<section class="summer-period" aria-label="暑假集训第${index+1}期"><div class="summer-period-head"><h3><span>${String(index+1).padStart(2,'0')}</span>第${index+1}期暑假集训</h3><button class="btn ghost" data-action="remove-summer" data-id="${esc(p.id)}">移除此期</button></div><div class="form-grid">${select('集训课程',p,'code',choices)}${select('参加状态',p,'status',[['推荐方案','推荐方案'],['已确定参加','已确定参加']])}<label>拟定开始日期<input type="date" value="${esc(p.start)}" data-summer-period="${esc(p.id)}" data-summer-field="start" aria-label="第${index+1}期拟定开始日期"></label><div class="summer-end"><span>结束日期 · 按大纲自动计算</span><strong>${esc(p.end)||'选择课程及开始日期后计算'}</strong><small>${p.duration?'本期'+p.duration+'天日程':'待选择课程'}${rest?.length?' · 含第'+rest.join('、')+'天休息':''}</small></div></div>${index?`<div class="summer-date-mode">${p.dateMode==='auto'?'开始日期默认接在上一期结束后一天；可手动修改。':'开始日期已手动设置。<button class="link-button" data-action="auto-summer-date" data-id="'+esc(p.id)+'">恢复连续衔接</button>'}</div>`:''}</section>`;
 }).join('')}
 <div class="summer-add"><button class="btn" data-action="add-summer" ${periods.length>=3?'disabled':''}>＋ 添加暑假集训课程</button><span class="subtle">${periods.length>=3?'已安排3期课程':'支持多期衔接，每期可单独修改日期'}</span></div>${errors.map(e=>`<div class="notice warn" role="alert">${esc(e)}</div>`).join('')}</section>`;
}
