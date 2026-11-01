import {variantKey} from './variants.mjs';
export const IMPORT_HEADERS=['urun_turu','marka','model','renk','numara','ekartman','burun','kol_boyu','kategori','ic_sku','uretici_barkodu','sube','adet','birim_fiyat_tl','islem','referans'];
const kindMap={'Gozluk':'eyewear','Cam':'opticalLens','Lens':'contactLens'};
export function importPreview(state,rows){
 const errors=[],changes=[],seen=new Set(),barcodeOwners=new Map(state.items.map(x=>[x.barcode,x.sku]));
 if(rows.length>2000)throw Error('MAX_2000_ROWS');
 const fingerprint=JSON.stringify(rows);
 if(state.applied?.includes(fingerprint))errors.push({row:0,message:'Bu dosya daha önce uygulandı.'});
 rows.forEach((r,i)=>{
  const row=i+2;
  try{
   const kind=kindMap[r.urun_turu];if(!kind)throw Error('Ürün türü Gozluk, Cam veya Lens olmalı.');
   if(typeof r.ic_sku!=='string'||!r.ic_sku.trim()||typeof r.uretici_barkodu!=='string'||!r.uretici_barkodu.trim())throw Error('SKU ve barkod metin olarak doldurulmalı.');
   const sku=r.ic_sku.trim(),barcode=r.uretici_barkodu.trim(),branch=String(r.sube||'').trim();
   if(!branch)throw Error('Şube gerekli.');
   if(seen.has(sku+'|'+branch))throw Error('Dosyada aynı SKU/şube tekrarlanıyor.');seen.add(sku+'|'+branch);
   if(!['EKLE','SAYIM','URUN'].includes(r.islem))throw Error('İşlem EKLE, SAYIM veya URUN olmalı.');
   if(!String(r.referans||'').trim())throw Error('Referans gerekli.');
   if(!String(r.kategori||'').trim())throw Error('Kategori gerekli.');
   const qty=Number(r.adet),price=Number(r.birim_fiyat_tl);
   if(r.adet===''||!Number.isSafeInteger(qty)||qty<0)throw Error('Adet sıfır veya pozitif tam sayı olmalı.');
   if(r.birim_fiyat_tl===''||!Number.isFinite(price)||price<0||Math.abs(price*100-Math.round(price*100))>1e-6)throw Error('Birim fiyat en fazla iki ondalıklı olmalı.');
   const item={kind,brand:String(r.marka||'').trim(),model:String(r.model||'').trim(),color:String(r.renk||'').trim(),power:String(r.numara??'').trim(),eyeSize:String(r.ekartman??'').trim(),bridge:String(r.burun??'').trim(),temple:String(r.kol_boyu??'').trim(),category:String(r.kategori).trim(),sku,barcode,branch,price:Math.round(price*100)};
   const identity=variantKey(kind,item),existing=state.items.find(x=>x.sku===sku&&x.branch===branch),other=state.items.find(x=>x.sku===sku);
   if(other&&variantKey(other.kind,other)!==identity)throw Error('SKU başka bir varyanta ait.');
   if(barcodeOwners.has(barcode)&&barcodeOwners.get(barcode)!==sku)throw Error('Barkod başka SKU ile eşleşiyor.');barcodeOwners.set(barcode,sku);
   const prior=state.items.find(x=>x.barcode===barcode&&x.sku!==sku);if(prior)throw Error('Barkod başka SKU ile eşleşiyor.');
   const operationKey=branch+'|'+sku+'|'+r.islem+'|'+r.referans;
   if(state.operations?.includes(operationKey))throw Error('Bu referansla stok işlemi daha önce uygulandı.');
   if(r.islem==='URUN'&&qty!==0)throw Error('URUN işleminde adet 0 olmalı; stok değişmez.');
   const reserved=existing?.reserved||0,before=existing?.qty||0,after=r.islem==='EKLE'?before+qty:r.islem==='SAYIM'?qty:before;
   if(!Number.isSafeInteger(after)||after<reserved)throw Error('Yeni stok rezerve adetten az olamaz.');
   const dupe=changes.find(x=>x.item.sku===sku&&variantKey(x.item.kind,x.item)!==identity);if(dupe)throw Error('Aynı SKU farklı varyantlar için kullanılamaz.');
   changes.push({row,item:{...item,qty:after,reserved},before,after,operationKey,operation:r.islem});
  }catch(e){errors.push({row,message:e.message});}
 });
 return {revision:state.revision,fingerprint,errors,changes,applied:false};
}
export function applyImport(state,plan){
 if(plan.errors.length)throw Error('IMPORT_HAS_ERRORS');
 if(plan.applied||state.applied?.includes(plan.fingerprint))throw Error('IMPORT_ALREADY_APPLIED');
 if(plan.revision!==state.revision)throw Error('STALE_IMPORT_PREVIEW');
 const updated=structuredClone(state.items);
 for(const c of plan.changes){const index=updated.findIndex(x=>x.sku===c.item.sku&&x.branch===c.item.branch);if(index>=0)updated[index]=structuredClone(c.item);else updated.push(structuredClone(c.item));}
 state.items=updated;state.operations.push(...plan.changes.map(c=>c.operationKey));state.applied.push(plan.fingerprint);state.revision++;plan.applied=true;return plan.changes.length;
}
export function orderProductFromBarcode(state,barcode,branch){
 if(typeof barcode!=='string')throw Error('BARCODE_MUST_BE_TEXT');
 const hits=state.items.filter(x=>x.barcode===barcode.trim()&&x.branch===branch);
 if(hits.length!==1)throw Error(hits.length?'AMBIGUOUS_BARCODE':'BARCODE_NOT_FOUND');
 const p=hits[0];return {urun:p.brand+' '+p.model+(p.color?' · '+p.color:'')+(p.power?' · '+p.power:''),adet:'1',ekartman:p.eyeSize||'',kopru:p.bridge||'',kol:p.temple||'',kategori:p.category,fiyat:(p.price/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}),sku:p.sku,available:p.qty-p.reserved};
}
export function inventorySeed(){return {revision:0,applied:[],operations:[],items:[
 {kind:'eyewear',brand:'Ray-Ban',model:'RX5154',color:'Siyah',eyeSize:'51',bridge:'21',temple:'145',category:'Optik Çerçeve',sku:'GOZ-001',barcode:'8680000001041',branch:'Atrium',qty:8,reserved:2,price:850000},
 {kind:'opticalLens',brand:'Seiko',model:'Örnek stok camı',power:'+1.00',color:'',eyeSize:'',bridge:'',temple:'',category:'Optik Cam',sku:'CAM-001',barcode:'8680000001065',branch:'Atrium',qty:20,reserved:4,price:225000},
 {kind:'contactLens',brand:'Demo Lens',model:'Color',power:'-1.00',color:'Ela',eyeSize:'',bridge:'',temple:'',category:'Lens',sku:'LEN-001',barcode:'8680000001089',branch:'Atrium',qty:6,reserved:1,price:125000}
]};}
export function templateRows(){return [
 ['Gozluk','Ray-Ban','RX5154','Siyah','','51','21','145','Optik Çerçeve','GOZ-001','8680000001041','Atrium',2,8500,'EKLE','MAL-KABUL-001'],
 ['Cam','Seiko','Örnek stok camı','','+1.00','','','','Optik Cam','CAM-001','8680000001065','Atrium',3,2250,'EKLE','MAL-KABUL-001'],
 ['Lens','Demo Lens','Color','Ela','-1.00','','','','Lens','LEN-001','8680000001089','Atrium',1,1250,'EKLE','MAL-KABUL-001']
].map(a=>Object.fromEntries(IMPORT_HEADERS.map((h,i)=>[h,a[i]])));}

