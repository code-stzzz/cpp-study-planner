import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {buildBaseline} from '../lib/planning.mjs';
import {generateAI,prepareConfig,publicConfig} from '../lib/ai.mjs';
const library=JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8'));
const student={name:'不应发送的合成姓名',grade:'六年级',unit:1,lesson:0,personalProgress:true,passed:'未参加',mastery:'待评估',attended:[]};
const cls={weekday:6,recommendationVersion:'4.5'};
const conditions={start:'2026-10-22',end:'2029-09-30',goal:'GESP 1级',winter:'none',summerDays:30,summerCamps:[
 {id:'summer',code:'XP02',start:'2027-07-12',status:'已确定参加'},
 {id:'summer-two',code:'XP03A',dateMode:'auto',status:'推荐方案'},
 {id:'summer-three',code:'XP03B',dateMode:'auto',status:'推荐方案'}
]};
const baseline=()=>buildBaseline(student,cls,conditions,library);
const box={open:x=>x,seal:x=>'encrypted-'+x};
const compact=input=>({rows:input.rows.map(r=>({id:r.id,knowledge:r.knowledge,milestone:r.milestone})),...(input.includeGuidance?{guidance:{focus:'结合当前课程巩固知识。',homework:'在ACGO完成老师布置的练习并订正。',family:'协助安排练习时间。'}}:{})});
async function mock(run,reply){
 const requests=[],server=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const payload=JSON.parse(raw),input=JSON.parse(payload.messages.at(-1).content);requests.push({payload,input});
  const result=reply?reply(input,requests.length):{content:JSON.stringify(compact(input)),finish_reason:'stop'};
  res.writeHead(result.status||200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(result.status?{error:'synthetic provider error'}:{choices:[{message:{content:result.content},finish_reason:result.finish_reason}]}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{return await run({baseUrl:'http://127.0.0.1:'+server.address().port,model:'synthetic-model',encryptedKey:'TEST_ONLY',tokenParameter:'max_tokens'},requests);}
 finally{await new Promise(r=>server.close(r));}
}
test('长周期三期营分段输出，不重复日期课次，不发送姓名且所有考级原样保留',()=>mock(async(config,requests)=>{
 const base=baseline(),before=structuredClone(base),result=await generateAI(config,box,base,student);
 assert.deepEqual(base,before);assert.deepEqual(result.rows,base.rows);assert.equal(result.rows.filter(r=>r.kind==='camp').length,3);
 assert.deepEqual(result.rows.filter(r=>r.kind==='goal'),base.rows.filter(r=>r.kind==='goal'));
 assert.equal(requests.length,Math.ceil(base.rows.filter(r=>r.kind!=='goal').length/4));
 assert.equal(requests.filter(r=>r.input.includeGuidance).length,1);assert.ok(requests.every(r=>r.input.rows.length<=4));
 assert.ok(requests.every(r=>r.input.rows.every(row=>row.kind!=='goal')));
 assert.ok(requests.every(r=>r.payload.max_tokens===6000));assert.ok(requests.every(r=>!JSON.stringify(r.input).includes(student.name)));
 assert.equal(result.generation.recoveredTruncations,0);assert.match(result.guidance.homework,/ACGO/);
}));
test('length且没有可见文本时仍能识别截断，拆小重试后完整拼回原周期',()=>mock(async(config,requests)=>{
 const base=baseline(),result=await generateAI(config,box,base,student);
 assert.deepEqual(result.rows,base.rows);assert.ok(result.generation.recoveredTruncations>0);
 assert.ok(requests.some(r=>r.input.rows.length===2&&r.payload.max_tokens===8192));
 assert.equal(result.rows.at(-1).end,base.rows.at(-1).end);assert.match(result.guidance.homework,/ACGO/);
},(input)=>input.rows.length>2?{content:null,finish_reason:'length'}:{content:JSON.stringify(compact(input)),finish_reason:'stop'}));
test('单阶段截断提高额度重试，严格使用老师选择的参数名和上限',()=>mock(async(config,requests)=>{
 const base=baseline();base.rows=base.rows.filter(r=>r.kind!=='goal').slice(0,1);
 const result=await generateAI({...config,tokenParameter:'max_completion_tokens',maxOutputTokens:12000},box,base,student);
 assert.deepEqual(result.rows,base.rows);assert.equal(requests.length,2);
 assert.deepEqual(requests.map(r=>r.payload.max_completion_tokens),[6000,12000]);assert.ok(requests.every(r=>r.payload.max_tokens===undefined));
},(input,n)=>n===1?{content:'{"rows":[',finish_reason:'length'}:{content:JSON.stringify(compact(input)),finish_reason:'stop'}));
test('持续截断有明确上限，不要求缩短周期，失败不修改原输入',()=>mock(async(config,requests)=>{
 const base=baseline(),before=structuredClone(base);
 await assert.rejects(generateAI({...config,maxOutputTokens:4096},box,base,student),e=>e.code==='AI_OUTPUT_TRUNCATED'&&!e.message.includes('缩短')&&e.message.includes('单次生成额度'));
 assert.deepEqual(base,before);assert.equal(requests.length,3);assert.ok(requests.every(r=>r.payload.max_tokens<=4096));
},()=>({content:'',finish_reason:'length'})));
test('提供商报错、非法JSON和修改排期不走截断重试',async()=>{
 for(const response of [{status:429},{content:'not JSON',finish_reason:'stop'},{content:JSON.stringify({rows:[]}),finish_reason:'stop'}])await mock(async(config,requests)=>{
  await assert.rejects(generateAI(config,box,baseline(),student));assert.equal(requests.length,1);
 },()=>response);
 await mock(async(config,requests)=>{await assert.rejects(generateAI(config,box,baseline(),student),/课程或日期/);assert.equal(requests.length,1);},input=>{
  const result=compact(input);result.rows[0].start='2020-01-01';return {content:JSON.stringify(result),finish_reason:'stop'};
 });
});
test('只有考级节点时只生成建议，考试内容不请求模型改写',()=>mock(async(config,requests)=>{
 const base=baseline();base.rows=base.rows.filter(r=>r.kind==='goal');assert.ok(base.rows.length);
 const result=await generateAI(config,box,base,student);assert.deepEqual(result.rows,base.rows);assert.equal(requests.length,1);assert.deepEqual(requests[0].input.rows,[]);assert.match(result.guidance.homework,/ACGO/);
}));
test('生成额度的默认值、保存兼容与校验，不在公开配置回传密钥',()=>{
 const raw={baseUrl:'https://example.com/v1',model:'test',apiKey:'TEST_NOT_REAL'};
 const saved=prepareConfig(raw,null,box);assert.equal(saved.maxOutputTokens,8192);
 assert.equal(prepareConfig({...raw,maxOutputTokens:'16384'},saved,box).maxOutputTokens,16384);
 assert.equal(prepareConfig(raw,{...saved,maxOutputTokens:12000},box).maxOutputTokens,12000);
 for(const value of [0,1000,32769,3.5,'NaN'])assert.throws(()=>prepareConfig({...raw,maxOutputTokens:value},saved,box),/单次生成额度/);
 assert.equal(publicConfig(null).maxOutputTokens,8192);assert.ok(!JSON.stringify(publicConfig(saved)).includes('TEST_NOT_REAL'));
});
