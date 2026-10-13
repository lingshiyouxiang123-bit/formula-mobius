import type {NarrativeLine} from '../types';

/** Mostly discussion, with ordinary accounts also posting their own takes. Real replies never detach. */
export function placeViewerPost(line:NarrativeLine, root:NarrativeLine|undefined, recent:NarrativeLine[], seed:number):boolean {
  if(line.account?.role!=='viewer'||line.replyToId||line.repostOfId||line.quoteOfId)return true;
  const ownRoot=recent.some(p=>p.id!==line.id&&p.account?.id===line.account?.id&&p.round===line.round&&!p.replyToId&&!p.repostOfId);
  const independent=line.socialPlacement==='standalone'||line.socialPlacement!=='discussion'&&!ownRoot&&Math.abs(seed+line.round+(line.eventIds[0]??0))%3===0;
  if(independent) {
    if(ownRoot&&line.socialPlacement==='standalone')return false;
    line.topicPostId=root?.id;
    if(root&&line.socialPlacement!=='standalone'&&Math.abs(seed)%2===0)line.quoteOfId=root.id;
    line.socialPlacement='standalone';
  } else if(root){line.replyToId=root.id;line.socialPlacement='discussion';}
  return true;
}

/** Previously forced comments can regain their original placement, without breaking their replies. */
export function restoreViewerRoots(lines:NarrativeLine[]):NarrativeLine[] {
  const output=lines.map(line=>({...line})),byId=new Map(output.map(p=>[p.id,p]));
  for(const line of output) {
    const parent=line.replyToId?byId.get(line.replyToId):undefined;
    if(line.account?.role!=='viewer'||line.socialPlacement==='discussion'||line.templateId==='social.withdrawn'||!parent||parent.account?.role==='viewer'||parent.account?.role==='driver')continue;
    const original=line.replyToId;delete line.replyToId;
    if(line.socialPlacement==='standalone')line.topicPostId=parent.id;
    else if(!placeViewerPost(line,parent,output,line.round+(line.eventIds[0]??0)))line.replyToId=original;
  }
  return output;
}
