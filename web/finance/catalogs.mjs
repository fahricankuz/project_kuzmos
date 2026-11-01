// Stable IDs and immutable payment snapshots; labels are editable, accounting behavior is not.
const methodKinds=['Havale / EFT','Nakit','Kredi kartı','Çek','Senet'];
const clean=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const key=s=>clean(s).toLocaleLowerCase('tr-TR');
export function catalogSeed(){return {
 payees:[['lux','Luxottica'],['seiko','Seiko Optical'],['agency','Örnek reklam ajansı'],['tax','Vergi dairesi'],['insurance','Örnek sigorta firması'],['vendor','Örnek cam tedarikçisi'],['garanti','Garanti şirket kredi kartı']].map(([id,label])=>({id,label,active:true})),
 methods:methodKinds.map((kind,i)=>({id:'method-'+i,label:kind,kind,active:true})),
 accounts:[{id:'bank-garanti',label:'Garanti şirket banka hesabı',kind:'bank',opening:100000000},{id:'cash-store',label:'Mağaza nakit kasası',kind:'cash',opening:5000000},{id:'card-garanti',label:'Garanti şirket kredi kartı',kind:'card',opening:400000}].map(a=>({...a,active:true}))
};}
export function saveCatalog(catalog,collection,input){
 const rows=catalog[collection];if(!['payees','methods','accounts'].includes(collection)||!Array.isArray(rows))throw Error('Geçersiz tanım listesi.');
 const label=clean(input.label);if(!label||label.length>100)throw Error('Ad 1–100 karakter olmalı.');
 if(rows.some(x=>x.id!==input.id&&key(x.label)===key(label)))throw Error('Bu ad zaten kayıtlı.');
 const existing=rows.find(x=>x.id===input.id);if(input.id&&!existing)throw Error('Tanım bulunamadı.');
 const kind=existing?.kind||input.kind;
 if(collection==='methods'&&!methodKinds.includes(kind))throw Error('Ödeme davranışını seçin.');
 if(collection==='accounts'&&!['bank','cash','card'].includes(kind))throw Error('Hesap türünü seçin.');
 if(existing){existing.label=label;return existing;}
 const prefix=collection==='accounts'?kind:collection;
 let n=1;while(rows.some(x=>x.id===prefix+'-custom-'+n))n++;
 const row={id:prefix+'-custom-'+n,label,active:true,...(kind?{kind}:{}),...(collection==='accounts'?{opening:0}:{})};rows.push(row);return row;
}
export function toggleCatalog(catalog,collection,id){const row=catalog[collection]?.find(x=>x.id===id);if(!row)throw Error('Tanım bulunamadı.');row.active=!row.active;return row;}
export function activeCatalog(catalog,collection){return catalog[collection].filter(x=>x.active);}
export function paymentAccounts(catalog,method){if(!methodKinds.includes(method))return [];const kinds=method==='Nakit'?['cash']:method==='Havale / EFT'?['bank']:method==='Kredi kartı'?['card']:['bank','cash'];return activeCatalog(catalog,'accounts').filter(a=>kinds.includes(a.kind));}
export function resolvePaymentSelection(catalog,input){
 const payee=activeCatalog(catalog,'payees').find(x=>x.id===input.payeeId),m=activeCatalog(catalog,'methods').find(x=>x.id===input.methodId);
 if(!payee||!m)throw Error('Aktif firma ve ödeme şekli seçin.');
 if(input.group==='Kredi kartı ekstresi'&&!['Havale / EFT','Nakit'].includes(m.kind))throw Error('Ekstre banka veya nakit hesabından ödenmeli.');
 const source=paymentAccounts(catalog,m.kind).find(a=>a.id===input.plannedAccount);
 if(!source)throw Error('Ödeme şekline uygun aktif hesap seçin.');
 const card=(input.group==='Kredi kartı ekstresi'?activeCatalog(catalog,'accounts').find(a=>a.kind==='card'&&a.id===input.cardAccount):m.kind==='Kredi kartı'?source:null);
 if((input.group==='Kredi kartı ekstresi'||m.kind==='Kredi kartı')&&!card)throw Error('Aktif şirket kartını seçin.');
 return {...input,payee:payee.label,method:m.kind,methodLabel:m.label,plannedAccount:source.id,plannedAccountLabel:source.label,cardAccount:card?.id||'',cardAccountLabel:card?.label||''};
}
export function validateSettlementAccount(catalog,p,account){
 const a=paymentAccounts(catalog,p.method).find(x=>x.id===account);
 if(!a||p.method==='Kredi kartı'&&account!==p.cardAccount)throw Error('Ödeme şekline uygun aktif hesap seçin.');return a;
}
export function accountBalances(catalog,store,asOf){return catalog.accounts.map(a=>({...a,balance:store.events.filter(e=>e.date<=asOf).reduce((n,e)=>{
 if(a.kind==='card'){if(e.type==='card-charge'&&e.account===a.id)return n+e.amount;if(e.type==='cash-out'&&e.group==='Kredi kartı ekstresi'&&e.cardAccount===a.id)return n-e.amount;}
 else if(e.type==='cash-out'&&e.account===a.id)return n-e.amount;
 return n;
 },a.opening)}));}
