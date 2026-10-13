// Shared by the game and offline preview. Templates never generate facts.
export function generateRaceVoices(templates,options){
  const {trigger,channel,values,limit=3,recentFamilies=[],recentTexts=[],parentTemplateId=null}=options;
  let rng=options.seed>>>0||42;
  const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)/4294967296;};
  const present=key=>values[key]!==undefined&&values[key]!==null;
  const labels={soft:'软胎',medium:'中胎',hard:'硬胎',intermediate:'半雨胎',wet:'全雨胎',sunny:'晴天',cloudy:'阴天',light_rain:'小雨',heavy_rain:'大雨',yellow:'黄旗',redFlag:'红旗',green:'绿旗'};
  const display=key=>['tire','oldTire','newTire','weather','oldWeather','newWeather','control'].includes(key)?labels[values[key]]??String(values[key]):String(values[key]);
  const candidates=templates.filter(t=>t.trigger===trigger&&t.channel===channel&&(t.replyTo??null)===parentTemplateId&&
    t.requires.every(present)&&[...t.text.matchAll(/\{(\w+)\}/g)].every(m=>present(m[1]))&&
    t.when.every(c=>c.op==='present'?present(c.field):c.op==='eq'?present(c.field)&&values[c.field]===c.value:c.op==='gt'?present(c.field)&&values[c.field]>c.value:c.op==='lt'?present(c.field)&&values[c.field]<c.value:false)&&
    !recentFamilies.includes(t.family)&&(parentTemplateId===null||t.act!=='echo'));
  const pool=[...candidates],result=[],families=new Set(),texts=new Set();
  while(pool.length&&result.length<limit){
    const source=result.length===0?'downloaded':result.length===1?'luna_rp':null;
    const sourceChoices=pool.filter(t=>!source||t.provenance===source);
    const choices=sourceChoices.length?sourceChoices:pool;
    const differentActs=options.preferDifferentActs?choices.filter(t=>!result.some(r=>r.act===t.act)):[];
    const selection=differentActs.length?differentActs:choices;
    const chosen=selection[Math.floor(random()*selection.length)];
    const template=pool.splice(pool.indexOf(chosen),1)[0];
    if(families.has(template.family))continue;
    const text=template.text.replace(/\{(\w+)\}/g,(_,key)=>display(key));
    if(texts.has(text)||recentTexts.includes(text))continue;
    texts.add(text);
    families.add(template.family);
    result.push({templateId:template.id,persona:template.persona,speaker:template.speaker,act:template.act,family:template.family,replyTo:template.replyTo,text,provenance:template.provenance??'luna_rp',sourceId:template.sourceId,socialPlacement:template.replyTo?'discussion':template.socialPlacement??'either'});
  }
  return result;
}

// A single shared event budget, not two forced replies beneath every root.
export function generateRaceVoiceThread(templates,options){
  const {channel,seed=42,recentTexts=[]}=options;
  const roots=generateRaceVoices(templates,{...options,limit:channel==='social'?2:1,preferDifferentActs:true});
  if(channel!=='social')return roots;
  const threads=roots.map(root=>[root]);
  let remaining=2;
  const seen=[...recentTexts,...roots.map(root=>root.text)];
  const stopped=new Set();
  for(let depth=0;depth<2&&remaining>0;depth++){
    for(const [index,thread]of threads.entries()){
      if(!remaining||stopped.has(index))continue;
      const parent=thread[thread.length-1];
      const reply=generateRaceVoices(templates,{...options,seed:seed+index+depth+1,limit:1,parentTemplateId:parent.templateId,recentFamilies:[],recentTexts:seen})[0];
      if(!reply){stopped.add(index);continue;}
      thread.push(reply);seen.push(reply.text);remaining--;
    }
  }
  return threads.flat();
}
