// Repeated normal/ideal entry into the specified corner, within one round.
// Mirrors engine.ts applyCornerChoice wear ordering, not future dice or a race predictor.
export function calculateTireCorners(input){
  const {wear,tire,cornerCost,suspension='balanced',firstSoftAvailable=true,mechanicalUses=0,reserve=0}=input||{};
  const valid=Number.isInteger(wear)&&wear>=0&&wear<=12&&['soft','medium','hard','intermediate','wet'].includes(tire)&&Number.isInteger(cornerCost)&&cornerCost>=0&&cornerCost<=100&&['soft','balanced','stiff'].includes(suspension)&&typeof firstSoftAvailable==='boolean'&&Number.isInteger(mechanicalUses)&&mechanicalUses>=0&&mechanicalUses<=30&&Number.isInteger(reserve)&&reserve>=0&&reserve<=12;
  if(!valid)return {status:'insufficient',text:'缺少胎耗或过弯配置。'};
  if(wear>=12)return {status:'failed',safeCorners:0,text:'胎耗已经到12，不能继续。'};
  if(wear+reserve>=12)return {status:'no_margin',safeCorners:0,text:'预留回合磨损后没余量了，先考虑进站。'};
  if(cornerCost<2)return {status:'no_corner_wear',safeCorners:null,text:'这种弯不增加过弯胎耗。回合磨损另算。'};
  let simulated=wear+reserve,first=firstSoftAvailable,uses=mechanicalUses,safe=0;
  const costs=[];
  for(let i=0;i<64;i++){
    let cost=tire==='soft'?2:1;
    if(suspension==='soft'&&first){cost=Math.max(0,cost-1);first=false;}
    else if(suspension==='stiff')cost++;
    if(cost>0&&uses>0){cost--;uses--;}
    costs.push(cost);simulated+=cost;
    if(simulated>=12)return {status:'calculated',safeCorners:safe,failureCorner:safe+1,costs,reserve,text:'还能过'+safe+'个这种弯；第'+(safe+1)+'个会到临界。',details:'正常线/理想线，同一回合重复指定弯。已预留'+reserve+'点回合磨损；不含晚刹额外损耗和雨地事件。'};
    safe++;
  }
  throw new Error('Tire lookup bound exceeded');
}

export function setupTireLookup(calculate){
  const host=document.getElementById('engineer');if(!host)return;
  const section=document.createElement('section');section.id='tire-lookup';
  const make=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
  section.append(make('h2','轮胎还能过几个弯？'),make('p','游戏规则速查 · 手动输入配置，不读取当前比赛。'));
  const form=make('form','');form.className='controls';const fields={};
  for(const [id,label,options,value] of [
    ['wear','当前磨损',null,8],['tire','胎种',[['soft','软胎'],['medium','中胎'],['hard','硬胎'],['intermediate','半雨胎'],['wet','雨胎']],'medium'],
    ['cornerCost','重复弯的弯角值',null,3],['suspension','悬挂',[['balanced','平衡'],['soft','软'],['stiff','硬']],'balanced'],
    ['firstSoftAvailable','本回合软悬挂减耗',[['yes','尚未用'],['no','已用']],'yes'],['mechanicalUses','机械部门剩余次数',null,0],['reserve','预留回合磨损',null,0]]){
    const wrap=make('label',label+' '),field=make(options?'select':'input','');field.setAttribute('aria-label',label);
    if(options)for(const [key,name]of options){const option=make('option',name);option.value=key;field.append(option);}
    else {field.type='number';field.min='0';field.max=String(id==='cornerCost'?100:id==='mechanicalUses'?30:12);}
    field.value=String(value);fields[id]=field;wrap.append(field);form.append(wrap);
  }
  const button=make('button','问工程师');button.type='submit';form.append(button);
  const answer=make('p',''),detail=make('details',''),summary=make('summary','计算条件'),body=make('p','');detail.append(summary,body);
  section.append(form,answer,detail);host.prepend(section);
  const run=()=>{const result=calculate({wear:Number(fields.wear.value),tire:fields.tire.value,cornerCost:Number(fields.cornerCost.value),suspension:fields.suspension.value,firstSoftAvailable:fields.firstSoftAvailable.value==='yes',mechanicalUses:Number(fields.mechanicalUses.value),reserve:Number(fields.reserve.value)});answer.textContent=result.text;body.textContent=result.details||'只检查指定弯的磨损，不是整圈寿命预测。';};
  form.onsubmit=e=>{e.preventDefault();run()};run();
}
