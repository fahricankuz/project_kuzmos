// Payment workflow prototype. Plans are not invoices or cash movements.
export const PAYMENT_GROUPS=['Tedarikçi','Hizmet firması','Vergi / SGK','Kredi kartı ekstresi','Şahsi / aile'];
export const PAYMENT_METHODS=['Havale / EFT','Nakit','Kredi kartı','Çek','Senet'];
export const isoDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function createPaymentStore(){return {revision:0,records:[],events:[],keys:{}};}
export function paymentRemaining(p){return Math.max(0,p.amount-p.settlements.reduce((s,x)=>s+x.amount,0));}
export function paymentStatus(p,asOf){if(p.cancelled)return 'İptal';if(!paymentRemaining(p))return 'Ödendi';if(p.settlements.length)return 'Kısmi ödendi';if(p.due<asOf)return 'Gecikmiş';if(p.due===asOf)return 'Bugün';return 'Planlandı';}
export function addPayment(store,input){
 if(!input.id||store.records.some(p=>p.id===input.id))throw Error('DUPLICATE_PAYMENT');
 if(!PAYMENT_GROUPS.includes(input.group)||!PAYMENT_METHODS.includes(input.method)||!String(input.payee??'').trim()||!isoDate(input.due)||!Number.isSafeInteger(input.amount)||input.amount<=0)throw Error('INVALID_PAYMENT');
 if(input.group==='Kredi kartı ekstresi'&&!['Havale / EFT','Nakit'].includes(input.method))throw Error('INVALID_CARD_BILL_METHOD');
 if(input.method==='Kredi kartı'&&!input.cardAccount)throw Error('CARD_REQUIRED');
 if(input.group==='Kredi kartı ekstresi'&&!input.cardAccount)throw Error('CARD_REQUIRED');
 if(['Çek','Senet'].includes(input.method)&&!String(input.instrumentRef??'').trim())throw Error('INSTRUMENT_NUMBER_REQUIRED');
 if(input.group==='Şahsi / aile'&&(!String(input.beneficiary??'').trim()||!String(input.personalCategory??'').trim()))throw Error('BENEFICIARY_REQUIRED');
 const p={...structuredClone(input),payee:input.payee.trim(),settlements:[],cancelled:false,issued:false};
 store.records.push(p);store.revision++;return p;
}
export function issueInstrument(store,id,date){
 const p=store.records.find(x=>x.id===id);if(!p||p.cancelled||!['Çek','Senet'].includes(p.method)||!isoDate(date))throw Error('INVALID_INSTRUMENT');
 if(p.issued)return false;if(p.settlements.length)throw Error('ALREADY_SETTLED');
 p.issued=true;p.issueDate=date;store.events.push({type:'instrument-issued',id,date,amount:p.amount});store.revision++;return true;
}
export function confirmPayment(store,id,{key,amount,date,account,asOf,receipt='',accountLabel=''}){
 const p=store.records.find(x=>x.id===id);
 if(!p||p.cancelled||!key||!isoDate(date)||asOf&&date>asOf||!Number.isSafeInteger(amount)||amount<=0)throw Error('INVALID_CONFIRMATION');
 const signature=JSON.stringify([id,amount,date,account,receipt]);
 if(store.keys[key]){if(store.keys[key]!==signature)throw Error('IDEMPOTENCY_CONFLICT');return false;}
 if(amount>paymentRemaining(p))throw Error('EXCEEDS_PAYMENT');
 if(['Çek','Senet'].includes(p.method)&&amount!==paymentRemaining(p))throw Error('INSTRUMENT_FULL_REDEMPTION_REQUIRED');
 if(p.method==='Kredi kartı'){if(account!==p.cardAccount)throw Error('WRONG_CARD_ACCOUNT');}
 else if(!account||account.startsWith('card-'))throw Error('CASH_ACCOUNT_REQUIRED');
 const settlement={key,amount,date,account,receipt:String(receipt).trim().slice(0,100),accountLabel};p.settlements.push(settlement);
 store.keys[key]=signature;store.events.push({type:p.method==='Kredi kartı'?'card-charge':'cash-out',id,date,amount,account,group:p.group,cardAccount:p.cardAccount||''});
 store.revision++;return true;
}
export function cancelPayment(store,id){
 const p=store.records.find(x=>x.id===id);if(!p||p.settlements.length||p.issued)throw Error('CANNOT_CANCEL_EXECUTED');p.cancelled=true;store.revision++;
}
export function paymentTotals(store,asOf='9999-12-31'){
 const actual=store.events.filter(e=>e.date<=asOf);
 return {cashOut:actual.filter(e=>e.type==='cash-out').reduce((s,e)=>s+e.amount,0),
 personalOut:actual.filter(e=>e.type==='cash-out'&&e.group==='Şahsi / aile').reduce((s,e)=>s+e.amount,0),
 cardCharges:actual.filter(e=>e.type==='card-charge').reduce((s,e)=>s+e.amount,0),
 cardRepayments:actual.filter(e=>e.type==='cash-out'&&e.group==='Kredi kartı ekstresi').reduce((s,e)=>s+e.amount,0)};
}
export function paymentSeed(){
 const store=createPaymentStore();
 const rows=[
 {id:'OD-1001',group:'Tedarikçi',payee:'Luxottica',amount:25000000,due:'2026-11-20',method:'Çek',instrumentRef:'CK-2026-018',source:'Fatura LUX-2048',note:'Kasım çerçeve alımı'},
 {id:'OD-1002',group:'Hizmet firması',payee:'Örnek reklam ajansı',amount:1800000,due:'2026-11-22',method:'Havale / EFT',source:'Fatura HZ-112',note:'Kasım hizmeti'},
 {id:'OD-1003',group:'Vergi / SGK',payee:'Vergi dairesi',amount:1250000,due:'2026-11-25',method:'Havale / EFT',taxType:'KDV',period:'2026-10',note:'Örnek tahakkuk; yasal vade önerisi değildir'},
 {id:'OD-1004',group:'Kredi kartı ekstresi',payee:'Garanti şirket kredi kartı',amount:5400000,due:'2026-11-24',method:'Havale / EFT',cardAccount:'card-garanti',source:'Kasım ekstresi',note:'50.000 Seiko + 4.000 önceki borç'},
 {id:'OD-1005',group:'Şahsi / aile',payee:'Örnek sigorta firması',amount:800000,due:'2026-11-21',method:'Havale / EFT',beneficiary:'Şirket sahibi',personalCategory:'Şahsi sağlık sigortası',note:'Şirket işletme giderinden ayrı'},
 {id:'OD-1006',group:'Tedarikçi',payee:'Seiko Optical',amount:5000000,due:'2026-11-10',method:'Kredi kartı',cardAccount:'card-garanti',source:'Fatura SEI-105'},
 {id:'OD-1007',group:'Tedarikçi',payee:'Örnek cam tedarikçisi',amount:4000000,due:'2026-11-28',method:'Senet',instrumentRef:'SN-2026-006',source:'Fatura CAM-18'}
 ];
 rows.forEach(r=>addPayment(store,r));
 issueInstrument(store,'OD-1001','2026-11-05');
 confirmPayment(store,'OD-1006',{key:'seed-seiko',amount:5000000,date:'2026-11-10',account:'card-garanti',asOf:'2026-11-20'});
 return store;
}

