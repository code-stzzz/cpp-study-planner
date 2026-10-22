// Learning targets are selected from the exact lesson or camp scope, not a unit-to-grade shortcut.
const rules=[
 [/二分答案/,'二分答案','能编写可行性判定并确定答案边界','把最优值问题转化为可行性判断','单调性、左右边界与不可行样例','解释判定函数，手动追踪二分区间并验证临界答案'],
 [/二分查找/,'二分查找','能在有序数据中定位目标及边界','利用有序性缩小查找范围','重复值、不存在的值及首尾元素','独立实现查找并说明循环退出时区间的含义'],
 [/埃氏|线性筛|筛法/,'质数筛法','能实现筛法并正确处理质数标记','利用数的性质减少重复计算','1、质数、合数与筛选上界','说明标记过程，并核对小范围质数表'],
 [/高精度/,'高精度运算','能用数组表示大整数并处理进借位','把整体运算拆成逐位操作','连续进借位、前导零与结果长度','手算与程序结果相互校验，解释每一位的变化'],
 [/递推/,'递推','能由初始条件计算后续状态','从已有状态推导下一状态','初始项、递推顺序与取值范围','独立写出递推关系并逐项验证小规模结果'],
 [/贪心/,'贪心','能实现适用的贪心策略并检查反例','分析局部选择对整体结果的影响','排序依据、策略反例与特殊顺序','解释选择策略，并用反例检查其适用条件'],
 [/前缀和/,'前缀和','能建立累计量并计算区间结果','用预处理替代重复区间计算','下标偏移、空区间与首尾区间','解释区间公式并比较优化前后的运算量'],
 [/双指针|尺取/,'双指针','能维护指针移动条件与有效区间','通过指针协作减少重复遍历','同向移动、相遇条件与窗口边界','手动追踪指针变化并说明何时移动每个指针'],
 [/链表|指针/,'指针与链表','能解释引用关系并实现对应操作','区分数据值与存储连接关系','空指针、头尾结点与连接变化','画出操作前后的连接关系并验证边界操作'],
 [/栈/,'栈','能实现入栈出栈并用于对应问题','用后进先出管理处理顺序','空栈、栈顶变化与操作次序','独立实现基本操作并手动追踪栈内数据'],
 [/队列/,'队列','能实现入队出队并保持数据顺序','用先进先出组织待处理任务','空队列、队首队尾与空间边界','解释队列变化并验证连续入队出队的结果'],
 [/vector/,'动态数组','能使用动态数组存储与遍历数据','根据数据规模选择存储方式','下标、容量变化与遍历范围','独立完成增删访问并说明合法的下标范围'],
 [/二叉树.*遍历|树的遍历|树的重构|二叉树.*重构/,'树的遍历','能实现所学遍历并理解子树关系','按树的层次分解访问任务','空树、单结点与不同树形','手绘遍历顺序并与程序输出逐项对照'],
 [/二叉树|哈夫曼|图和树/,'树结构','能说明所学树的结构与基本性质','用层次关系表示和组织数据','结点关系、特殊树形与性质验证','画出树结构并解释对应性质或操作结果'],
 [/深度优先|DFS|深搜/,'深度优先搜索','能描述搜索状态并实现搜索过程','沿路径展开状态并回溯','终止条件、重复状态与回溯恢复','手动追踪搜索分支，解释标记和回溯时机'],
 [/广度优先|BFS|广搜/,'广度优先搜索','能用队列按层次扩展状态','按距离或层次组织搜索顺序','入队标记、层次变化与不可达情况','画出扩展层次并核对程序中的访问次序'],
 [/图的遍历|图的存储|连通块|无向图|拓扑/,'图的表示与遍历','能表示结点关系并完成对应遍历','把关系问题转化为图上的访问','重边、自环、重复访问与不连通情况','画出结点和边，说明表示方式及访问标记'],
 [/背包/,'背包动态规划','能定义容量状态并实现对应背包转移','分析选择限制与状态依赖','初始化、容量边界及循环方向','解释状态含义和循环顺序，用小数据验证转移'],
 [/动态规划|DP/,'动态规划','能定义状态并推导相应转移关系','把问题拆成有依赖的子问题','初始化、转移顺序与状态范围','独立写出状态和转移，逐步核对小规模结果'],
 [/递归/,'递归','能设置递归边界并理解调用过程','通过同类子问题分解原问题','终止条件、参数变化与返回值','画出调用过程并解释递归为何会结束'],
 [/排序|sort/,'排序','能按给定规则完成排序与结果检查','比较排序策略和关键字顺序','相等关键字、比较条件与特殊数据','独立实现对应方法并说明排序规则或复杂度'],
 [/结构体/,'结构体','能组织多个属性并完成对应操作','用数据模型描述问题对象','成员含义、属性关联与比较依据','说明成员设计并用实例验证对象的处理结果'],
 [/数学函数/,'数学函数','能选择适用函数并检查输入结果','把数学关系转化为计算步骤','取值范围、精度与特殊数值','说明函数含义并用手算结果核对程序'],
 [/函数/,'函数与模块','能定义调用函数并解释参数和作用域','把完整任务拆分为明确的功能','实参与形参、局部变量及返回值','独立编写函数并追踪参数和结果的传递'],
 [/位运算|进制/,'进制与位运算','能完成对应表示转换或位操作','从数的表示方式分析运算过程','符号、位数与转换边界','写出中间表示并核对每一步转换或运算'],
 [/字符串|字符数组/,'字符串','能遍历和处理对应字符串数据','把文本操作转化为字符位置处理','空串、首尾位置与字符判断','逐字符追踪处理过程并验证特殊输入'],
 [/二维数组/,'二维数组','能用行列下标组织并处理数据','用二维关系描述数据位置','行列范围、边界位置与遍历顺序','画出下标位置并核对嵌套遍历结果'],
 [/数组/,'数组','能用下标存储并处理一组数据','把多个数据组织为可遍历的集合','数组长度、首尾下标与初始化','独立完成遍历统计并解释每个下标的含义'],
 [/循环|枚举/,'循环与枚举','能设计循环范围并处理重复任务','把重复过程转化为有界迭代','循环次数、嵌套次序与退出条件','手动追踪变量变化并检查循环边界'],
 [/分支/,'分支判断','能正确组织判断条件与执行分支','按条件划分情况并覆盖所有情形','条件重叠、遗漏及等号边界','列举不同输入并解释各自进入的分支'],
 [/最短路|Dijkstra|SPFA/,'最短路径','能实现所学路径算法并解释更新','通过路径关系迭代改善当前结果','不可达结点、边权与更新条件','手动演示关键更新并核对简单图的结果'],
];
const clip=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
function scopedSkills(row,library){
 let items=[];
 if(row.kind==='regular'){const ids=new Set(row.sourceIds||[]);items=(library.units||[]).flatMap(u=>u.lessons).filter(l=>ids.has(l.id)&&l.type==='lesson').map(l=>l.title);}
 if(row.kind==='camp'){const code=(row.sourceIds||[]).find(x=>x.startsWith('camp:'))?.slice(5);items=((library.camps||[]).find(c=>c.code===code)?.schedule||[]).map(d=>d.topic_verbatim);}
 const seen=new Set(),skills=[];
 for(const item of items){const rule=rules.find(r=>r[0].test(item));if(rule&&!seen.has(rule[1])){seen.add(rule[1]);skills.push(rule)}}
 return {items,skills};
}
export function stageTargets(row,library={}){
 if(row.kind==='goal'){
   const name=(row.sourceIds||[]).find(x=>x.startsWith('goal:'))?.slice(5),goal=(library.goals||[]).find(g=>g.name===name);
   const knowledge=goal?.reviewed&&goal.requirements?`重点掌握${(goal.coreTopics||[]).slice(0,4).join('、')||'对应考纲知识'}，结合测评检查应用能力`:'先核对目标考纲，再确认知识范围与训练重点';
   const thinking=goal?.reviewed?(['','按执行顺序追踪变量，完整划分条件与循环边界','分解多层条件与循环，检查类型与计算结果','由数据表示分析问题，用枚举与模拟验证结果','分解函数职责，用递推和排序组织求解','比较算法适用条件，结合复杂度选择解法','建立搜索状态与转移关系，选择合适的数据结构','从状态依赖和图上关系分析问题并优化存储','综合数学与图论模型，比较时间空间效率'][row.exam?.level]||'根据题目条件选择方法，解释思路并检查边界与效率'):'对照已学内容识别薄弱环节，明确需要补充的知识';
   const mastery=['','独立编写顺序、分支与循环程序','处理多层分支和循环，正确使用数学函数','运用枚举与模拟处理数组和字符串','用函数组织程序，运用排序与递推解题','分析复杂度并选择二分、递归与贪心方法','结合树、搜索与简单动态规划解决问题','运用图遍历与复杂动态规划，优化状态存储','综合数学与图论方法，比较并优化算法效率'][row.exam?.level]||knowledge;
   return {knowledge,thinking,practice:`在ACGO完成老师依据${name||'目标'}考纲选择的专题练习，分析具体错因。`,standard:'独立解释解题思路并完成对应题目，再依据测评结果调整薄弱专题。',milestone:`掌握：${clip(mastery,45)}\n思维：${clip(thinking,38)}`};
 }
 const {items,skills}=scopedSkills(row,library);
 const focus=skills.length>3?[skills[0],skills[Math.floor(skills.length/2)],skills.at(-1)]:skills;
 const knowledge=focus.length?focus.map(s=>s[2].replace(/^能/,'')).join('；'):items.length?'能应用'+items.slice(0,3).join('、'):'能解释并应用本阶段所学知识';
 const thinking=focus.length?[...new Set(focus.map(s=>s[3]))].slice(0,2).join('；'):'将问题拆成可执行步骤，并检查思路与实现的一致性';
 const practice=focus.length?`在ACGO练习${focus.map(s=>s[1]).join('、')}，重点检查${focus.map(s=>s[4]).slice(0,2).join('；')}。`:'在ACGO完成老师按本阶段内容指定的练习，并记录具体疑问。';
 const standard=focus.length?focus.map(s=>s[5]).join('；'):'独立说明解题过程，完成对应实现，并用样例检查结果。';
 const shortMastery=focus.length?'独立实现'+focus.map(s=>s[1]).join('、'):knowledge;
 return {knowledge:clip(knowledge,88),thinking:clip(thinking,88),practice:clip(practice,220),standard:clip(standard,220),milestone:`掌握：${clip(shortMastery,45)}\n思维：${clip(thinking,38)}`};
}
export function isLegacyMilestone(value){return /^(完成单元测评|完成本阶段课次|完成集训阶段任务|根据正式安排|拟安排，|已确定参加；)/.test(String(value||''));}
export function displayMilestone(row,library={}){
 const raw=String(row.milestone||'').trim();
 if(row.edited&&raw&&!isLegacyMilestone(raw))return raw;
 if(/掌握[：:]/.test(raw)&&/思维[：:]/.test(raw))return raw;
 return ['regular','camp','goal'].includes(row.kind)?stageTargets(row,library).milestone:raw;
}
export function displayKnowledge(row,library={}){
 if(row.kind==='goal'){
   const name=(row.sourceIds||[]).find(x=>x.startsWith('goal:'))?.slice(5),goal=(library.goals||[]).find(g=>g.name===name);
   if(goal?.reviewed&&goal.coreTopics?.length&&(!row.edited||/目标大纲尚未核对|知识对应关系待补/.test(row.knowledge||'')))return goal.coreTopics.join('；');
 }
 return row.knowledge||'';
}
