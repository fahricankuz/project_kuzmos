import { ACC,post,balance,createLedger } from './journal.mjs';
const line=(account,debit=0,credit=0)=>({account,debit,credit});

// Amounts are document inputs, not statutory rates. INPUT_VAT is pending accountant review.
export function serviceInvoice(ledger,{key,date,net,vat,vatWithheld=0,incomeWithheld=0}){
 const values=[net,vat,vatWithheld,incomeWithheld];
 if(values.some(x=>!Number.isSafeInteger(x)||x<0)||net===0||vatWithheld>vat||incomeWithheld>net)throw Error('INVALID_TAX_DOCUMENT');
 const vendor=net+vat-vatWithheld-incomeWithheld;
 const lines=[line(ACC.SERVICE,net)];
 if(vat)lines.push(line(ACC.INPUT_VAT,vat));
 if(vendor)lines.push(line(ACC.SUPPLIER,0,vendor));
 if(vatWithheld)lines.push(line(ACC.VAT_WITHHELD,0,vatWithheld));
 if(incomeWithheld)lines.push(line(ACC.INCOME_WITHHELD,0,incomeWithheld));
 return post(ledger,{tenant:ledger.tenant,key,date,kind:'service_invoice',lines});
}
function settleLiability(ledger,{key,date,account,amount,paymentAccount=ACC.BANK,kind}){
 if(!Number.isSafeInteger(amount)||amount<=0)throw Error('INVALID_SETTLEMENT');
 if(paymentAccount!==ACC.BANK&&paymentAccount!==ACC.CARD)throw Error('INVALID_PAYMENT_ACCOUNT');
 const existing=ledger.entries.find(e=>e.key===key);
 if(existing)return post(ledger,{tenant:ledger.tenant,key,date,kind,lines:[line(account,amount),line(paymentAccount,0,amount)]});
 if(amount>balance(ledger,account,date))throw Error('EXCEEDS_LIABILITY');
 return post(ledger,{tenant:ledger.tenant,key,date,kind,lines:[line(account,amount),line(paymentAccount,0,amount)]});
}
export function payServiceSupplier(ledger,input){return settleLiability(ledger,{...input,account:ACC.SUPPLIER,kind:'supplier_payment'});}
export function payTaxLiability(ledger,input){
 if(![ACC.VAT_WITHHELD,ACC.INCOME_WITHHELD,ACC.TAX_DUE].includes(input.account))throw Error('INVALID_TAX_ACCOUNT');
 return settleLiability(ledger,{...input,kind:'tax_payment'});
}
export function serviceTaxScenario({mode='plain',supplierPaid=false,taxPaid=false,paymentAccount=ACC.BANK}={}){
 if(!['plain','vat-withholding','income-withholding'].includes(mode))throw Error('INVALID_TAX_MODE');
 const ledger=createLedger();
 post(ledger,{tenant:ledger.tenant,key:'bank-opening',date:'2026-11-01',kind:'opening',lines:[line(ACC.BANK,10000000),line(ACC.OPENING,0,10000000)]});
 const vatWithheld=mode==='vat-withholding'?100000:0,incomeWithheld=mode==='income-withholding'?200000:0;
 serviceInvoice(ledger,{key:'service-invoice',date:'2026-11-05',net:1000000,vat:200000,vatWithheld,incomeWithheld});
 if(supplierPaid)payServiceSupplier(ledger,{key:'service-payment',date:'2026-11-10',amount:1200000-vatWithheld-incomeWithheld,paymentAccount});
 if(taxPaid&&(vatWithheld||incomeWithheld))payTaxLiability(ledger,{key:'tax-payment',date:'2026-11-20',account:vatWithheld?ACC.VAT_WITHHELD:ACC.INCOME_WITHHELD,amount:vatWithheld||incomeWithheld});
 return ledger;
}

