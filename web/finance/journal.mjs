// Prototype accounting kernel. Not a Supabase migration or production posting service.
export const ACC={BANK:'bank',SUPPLIER:'supplier',CARD:'company_card',INVENTORY:'inventory',OPENING:'opening',UNALLOCATED:'unallocated',FEES:'finance_fees',SERVICE:'service_expense',INPUT_VAT:'input_vat_pending',VAT_WITHHELD:'vat_withheld',INCOME_WITHHELD:'income_withheld',TAX_DUE:'tax_due'};
const debitBalance=new Set([ACC.BANK,ACC.INVENTORY,ACC.UNALLOCATED,ACC.FEES,ACC.SERVICE,ACC.INPUT_VAT]);
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function createLedger(tenant='demo-optik'){return {tenant,entries:[],keys:new Map()};}
export function post(ledger,entry){
 if(entry.tenant!==ledger.tenant)throw Error('TENANT_MISMATCH');
 if(!entry.key||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||Number.isNaN(Date.parse(entry.date))||new Date(entry.date).toISOString().slice(0,10)!==entry.date)throw Error('INVALID_ENTRY');
 if(entry.lines.length<2)throw Error('UNBALANCED_ENTRY');
 let dr=0,cr=0;
 for(const l of entry.lines){if(!Object.values(ACC).includes(l.account)||!Number.isSafeInteger(l.debit)||!Number.isSafeInteger(l.credit)||l.debit<0||l.credit<0||(!l.debit&&!l.credit)||(l.debit&&l.credit))throw Error('INVALID_LINE');dr+=l.debit;cr+=l.credit;}
 if(dr!==cr||!Number.isSafeInteger(dr))throw Error('UNBALANCED_ENTRY');
 const hash=canonical(entry),existing=ledger.keys.get(entry.key);
 if(existing){if(existing!==hash)throw Error('IDEMPOTENCY_CONFLICT');return false;}
 ledger.entries.push(structuredClone(entry));ledger.keys.set(entry.key,hash);return true;
}
const line=(account,debit=0,credit=0)=>({account,debit,credit});
export function balance(ledger,account,asOf='9999-12-31'){return ledger.entries.filter(e=>e.date<=asOf).flatMap(e=>e.lines).filter(l=>l.account===account).reduce((s,l)=>s+(debitBalance.has(account)?l.debit-l.credit:l.credit-l.debit),0);}
export function bankOutflow(ledger,asOf='9999-12-31'){return ledger.entries.filter(e=>e.date<=asOf&&e.kind!=='opening').flatMap(e=>e.lines).filter(l=>l.account===ACC.BANK).reduce((s,l)=>s+l.credit,0);}
export function supplierCardScenario({stage='settled',classifyDifference=false}={}){
 const ledger=createLedger();const base={tenant:ledger.tenant};
 post(ledger,{...base,key:'opening-bank',date:'2026-11-01',kind:'opening',lines:[line(ACC.BANK,10000000),line(ACC.OPENING,0,10000000)]});
 post(ledger,{...base,key:'opening-supplier',date:'2026-11-01',kind:'opening',lines:[line(ACC.INVENTORY,5000000),line(ACC.SUPPLIER,0,5000000)]});
 post(ledger,{...base,key:'supplier-card-10',date:'2026-11-10',kind:'supplier_settlement',supplier:'Seiko Optical',lines:[line(ACC.SUPPLIER,5000000),line(ACC.CARD,0,5000000)]});
 if(stage==='settled'){
  post(ledger,{...base,key:'statement-payment-24',date:'2026-11-24',kind:'card_repayment',lines:[line(ACC.CARD,5000000),line(ACC.UNALLOCATED,400000),line(ACC.BANK,0,5400000)]});
  if(classifyDifference)post(ledger,{...base,key:'classify-difference-24',date:'2026-11-24',kind:'reclassification',lines:[line(ACC.FEES,400000),line(ACC.UNALLOCATED,0,400000)]});
 }
 return ledger;
}

