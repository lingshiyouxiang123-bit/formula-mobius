export interface VoiceTemplate {id:string;channel:string;trigger:string;persona:string;speaker?:string;act:string;family:string;requires:string[];when:Array<{field:string;op:string;value?:unknown}>;text:string;replyTo:string|null;provenance?:string;sourceId?:string;socialPlacement?:'standalone'|'discussion'|'either'}
export interface RenderedVoice {templateId:string;persona:string;speaker?:string;act:string;family:string;replyTo:string|null;text:string;provenance:string;sourceId?:string;socialPlacement?:'standalone'|'discussion'|'either'}
export interface VoiceOptions {trigger:string;channel:string;values:Record<string,unknown>;seed?:number;limit?:number;recentFamilies?:string[];recentTexts?:string[];parentTemplateId?:string|null;preferDifferentActs?:boolean}
export function generateRaceVoices(templates:VoiceTemplate[],options:VoiceOptions):RenderedVoice[];
export function generateRaceVoiceThread(templates:VoiceTemplate[],options:VoiceOptions):RenderedVoice[];
