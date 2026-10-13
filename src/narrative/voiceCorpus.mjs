export function combineVoiceCorpus(dynamicPacks,downloaded,binding,review={}){
  const templates=dynamicPacks.flatMap(pack=>pack.templates.map(t=>({...t,provenance:'luna_rp'})));
  for(const [index,entry]of binding.entries.entries()){
    const source=downloaded.expressions.find(row=>row.id===entry.sourceId);
    if(!source?.text)continue;
    const text=source.text.replaceAll('{driver_1}','{driver}').replaceAll('{driver_2}','{otherDriver}').replaceAll('{team_1}','{team}');
    templates.push({id:`downloaded:${entry.sourceId}:${entry.trigger}:${index}`,sourceId:entry.sourceId,channel:'social',trigger:entry.trigger,persona:entry.persona,act:entry.actOverride??entry.act??source.act,family:`downloaded:${source.family}`,requires:entry.requiredValues??[],when:entry.when??[],text,replyTo:entry.replyTo??null,provenance:'downloaded'});
  }
  return templates.filter(t=>t.channel!=='social'||!review.excludedIds?.includes(t.id)&&!review.downloadedExcludedSourceIds?.includes(t.sourceId));
}
