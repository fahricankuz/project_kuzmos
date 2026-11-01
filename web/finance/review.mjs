export const ROLE_PANELS={admin:['manager','staff','finance','inventory'],accountant:['finance'],staff:['staff','inventory']};
export function canPanel(role,panel){return ROLE_PANELS[role]?.includes(panel)||false;}
export function monthDays(month){if(!/^\d{4}-\d{2}$/.test(month))throw Error('INVALID_MONTH');const [y,m]=month.split('-').map(Number);if(m<1||m>12)throw Error('INVALID_MONTH');const n=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;return {offset,days:Array.from({length:n},(_,i)=>month+'-'+String(i+1).padStart(2,'0'))};}
export function paymentRows(store){return store.records.flatMap(p=>[
 {id:p.id,date:p.due,payee:p.payee,group:p.group,kind:p.cancelled?'İptal plan':'Ödeme planı',amount:p.amount,cashOut:0,cardChange:0,account:p.plannedAccount||p.cardAccount||'',source:p.source||''},
 ...store.events.filter(e=>e.id===p.id).map(e=>({id:p.id,date:e.date,payee:p.payee,group:p.group,kind:e.type==='card-charge'?'Kartla ödeme':e.type==='cash-out'?(p.group==='Kredi kartı ekstresi'?'Ekstre ödemesi':'Nakit / banka ödemesi'):'Çek / senet teslimi',amount:e.amount,cashOut:e.type==='cash-out'?e.amount:0,cardChange:e.type==='card-charge'?e.amount:e.type==='cash-out'&&p.group==='Kredi kartı ekstresi'?-e.amount:0,account:e.account||'',source:p.source||''}))
 ]).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));}
