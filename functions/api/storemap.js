// Store prices + optional accessory fit tweaks, saved by the admin page (D1 table `config`, key "store").
// Shape: { "o:OutfitName": {price:200}, "a:HatName": {price:500,slot:"hat",scale:1,lift:0,fwd:0,flip:false}, "s:CamoName": {price:0}, ... }
// o = outfit, a = accessory, s = gun camo, b = body skin. Missing entry = default price (DEFAULT_PRICE in account.js). price 0 = free.
import {cfgRoute} from '../../lib/cfgmap.js';
export const onRequestPost=cfgRoute('store');
