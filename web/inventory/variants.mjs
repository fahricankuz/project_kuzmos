export const IDENTITY_FIELDS=Object.freeze({
 eyewear:['brand','model','color','eyeSize','bridge','temple'],
 opticalLens:['brand','model','power'],
 contactLens:['brand','model','power','color']
});
const normalize=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
const normalizePower=x=>{const s=String(x??'').trim().replace(',','.');if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s))throw Error('INVALID_POWER');const n=Number(s);return (n>0?'+':'')+n.toFixed(2);};
export function variantKey(kind,attributes){
 const fields=IDENTITY_FIELDS[kind];if(!fields)throw Error('UNKNOWN_PRODUCT_KIND');
 return JSON.stringify([kind,...(kind==='eyewear'?[...fields,'colorCode']:fields).map(f=>{const v=f==='power'?normalizePower(attributes[f]):normalize(attributes[f]);if(!v&&f!=='colorCode')throw Error('MISSING_'+f);return v;})]);
}
export function isValidEAN13(value){
 return /^\d{13}$/.test(value)&&(10-[...value.slice(0,12)].reduce((s,c,i)=>s+Number(c)*(i%2?3:1),0)%10)%10===Number(value[12]);
}
export function barcodeLookup(records,tenant,code){
 if(typeof code!=='string')throw Error('BARCODE_MUST_BE_TEXT');
 const hits=records.filter(r=>r.tenant===tenant&&r.barcodes.includes(code.trim()));
 if(hits.length>1)throw Error('AMBIGUOUS_BARCODE');return hits[0]??null;
}

