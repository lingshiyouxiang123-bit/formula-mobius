export interface TireCornerInput {wear:number;tire:string;cornerCost:number;suspension?:string;firstSoftAvailable?:boolean;mechanicalUses?:number;reserve?:number}
export interface TireCornerResult {status:string;text:string;details?:string;safeCorners?:number|null;failureCorner?:number;costs?:number[];reserve?:number}
export function calculateTireCorners(input:TireCornerInput):TireCornerResult;
export function setupTireLookup(calculate:typeof calculateTireCorners):void;
