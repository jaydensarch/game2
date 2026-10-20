// Store prices + optional accessory fit tweaks (accessories auto-fit the default character; slot/scale/lift/fwd/flip only nudge), saved by the admin page (D1 table config, key "store").
// Shape: { "o:OutfitName": {price:200}, "a:HatName": {price:500,slot:"hat",scale:1,lift:0,fwd:0,flip:false}, "s:CamoName": {price:0}, ... }
// o = character outfit, a = accessory, s = gun camo, b = body skin (a full character .glb that replaces the default body). Missing entry = default price (see DEFAULT_PRICE in account.js). price 0 = free.
import {cfgRoute} from './_cfgmap.js';
export const POST=cfgRoute('store');
