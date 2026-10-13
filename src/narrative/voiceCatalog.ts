import first from '../../research/text-generation/rp/2026-10-10/dynamic-voice-templates-1.json';
import second from '../../research/text-generation/rp/2026-10-10/dynamic-voice-templates-2.json';
import third from '../../research/text-generation/rp/2026-10-10/dynamic-voice-templates-3.json';
import fourth from '../../research/text-generation/rp/2026-10-10/dynamic-voice-templates-4.json';
import fifth from '../../research/text-generation/rp/2026-10-10/dynamic-voice-templates-5.json';
import downloaded from '../../research/text-generation/expansion/build/expressions.json';
import binding from '../../research/text-generation/rp/2026-10-10/downloaded-runtime-binding.json';
import review from '../../research/text-generation/rp/2026-10-11/social-quality-review.json';
import {combineVoiceCorpus} from './voiceCorpus.mjs';
import type {VoiceTemplate} from './voiceRenderer.mjs';

const packs=[first,second,third,fourth,fifth] as Array<{templates:VoiceTemplate[]}>;
export const allVoiceTemplates=combineVoiceCorpus(packs,downloaded,binding);
export const voiceTemplates=combineVoiceCorpus(packs,downloaded,binding,review);
