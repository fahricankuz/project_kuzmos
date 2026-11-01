import {IMPORT_HEADERS} from './import.mjs';
const textDecoder=new TextDecoder();
export async function unzipXlsx(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>10*1024*1024)throw Error('Dosya en fazla 10 MB olabilir.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Geçerli bir XLSX dosyası seçin.');
 const count=v.getUint16(end+10,true);let offset=v.getUint32(end+16,true),total=0;
 if(count>2000)throw Error('Dosya çok fazla ZIP parçası içeriyor.');
 const files=new Map();
 for(let i=0;i<count;i++){
  if(offset+46>bytes.length||v.getUint32(offset,true)!==0x02014b50)throw Error('XLSX arşivi bozuk.');
  const flags=v.getUint16(offset+8,true),method=v.getUint16(offset+10,true),compressed=v.getUint32(offset+20,true),size=v.getUint32(offset+24,true),n=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true),local=v.getUint32(offset+42,true);
  const name=textDecoder.decode(bytes.slice(offset+46,offset+46+n));offset+=46+n+extra+comment;
  if(flags&1||size>20*1024*1024||name.includes('..')||name.startsWith('/'))throw Error('Desteklenmeyen veya güvenli olmayan XLSX arşivi.');
  if(local+30>bytes.length||v.getUint32(local,true)!==0x04034b50)throw Error('XLSX parçası bozuk.');
  const from=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
  if(from+compressed>bytes.length)throw Error('XLSX parçası eksik.');
  let data;
  if(method===0)data=bytes.slice(from,from+compressed);
  else if(method===8){
   if(typeof DecompressionStream==='undefined')throw Error('Bu tarayıcı XLSX açmayı desteklemiyor. Güncel Chrome/Safari deneyin.');
   const reader=new Blob([bytes.slice(from,from+compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
   const chunks=[];let length=0;
   while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>20*1024*1024){await reader.cancel();throw Error('XLSX içeriği çok büyük.');}chunks.push(value);}
   data=new Uint8Array(length);let at=0;for(const c of chunks){data.set(c,at);at+=c.length;}
  }else throw Error('XLSX sıkıştırma biçimi desteklenmiyor.');
  if(data.length!==size)throw Error('XLSX boyut kontrolü başarısız.');
  total+=data.length;if(total>30*1024*1024)throw Error('XLSX açılmış içeriği çok büyük.');
  files.set(name,data);
 }
 return files;
}
const decodeXml=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[e.toLowerCase()]));
const attributes=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1],decodeXml(m[2])]));
const txt=s=>[...s.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>decodeXml(m[1])).join('');
const col=s=>[...s.match(/^[A-Z]+/)[0]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
export function rowsFromXlsxParts(parts){
 const xml=name=>{const bytes=parts.get(name);if(!bytes)throw Error('XLSX parçası eksik: '+name);const t=typeof bytes==='string'?bytes:textDecoder.decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(t))throw Error('XML varlık tanımları desteklenmiyor.');return t;};
 const workbook=xml('xl/workbook.xml'),rels=xml('xl/_rels/workbook.xml.rels');
 const sheet=[...workbook.matchAll(/<(?:\w+:)?sheet\s([^>]*?)\/?>/g)].map(m=>attributes(m[1])).find(x=>x.name==='Stok');
 if(!sheet)throw Error('Stok adlı sayfa bulunamadı. Şablonu kullanın.');
 const rel=[...rels.matchAll(/<(?:\w+:)?Relationship\s([^>]*?)\/?>/g)].map(m=>attributes(m[1])).find(x=>x.Id===sheet['r:id']);
 if(!rel||rel.TargetMode==='External'||/^(?:https?:|file:)/i.test(rel.Target))throw Error('Geçersiz sayfa bağlantısı.');
 const path=rel.Target.startsWith('/')?rel.Target.slice(1):'xl/'+rel.Target.replace(/^\.\//,'');
 const sheetXml=xml(path);if(/<(?:\w+:)?f(?:\s|>)/.test(sheetXml))throw Error('Stok sayfasında formül bulunamaz. Değer olarak yapıştırın.');
 const shared=parts.has('xl/sharedStrings.xml')?[...xml('xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>txt(m[1])):[];
 const grid=[];
 for(const m of sheetXml.matchAll(/<(?:\w+:)?row(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?row>/g)){
  const values=Array(IMPORT_HEADERS.length).fill('');
  for(const c of m[1].matchAll(/<(?:\w+:)?c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)){
   const a=attributes(c[1]);if(!a.r||!/^[A-Z]+\d+$/.test(a.r))throw Error('Geçersiz hücre adresi.');const index=col(a.r);if(index>=IMPORT_HEADERS.length)continue;
   const body=c[2]||'',raw=body.match(/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
   values[index]=a.t==='s'?shared[Number(raw)]??'':a.t==='inlineStr'?txt(body):a.t==='str'?decodeXml(raw||''):raw===undefined?'':Number(raw);
  }
  if(values.some(x=>x!==''))grid.push(values);
 }
 if(!grid.length||IMPORT_HEADERS.some((h,i)=>grid[0][i]!==h))throw Error('Kolon başlıkları şablonla aynı olmalı.');
 if(grid.length>2001)throw Error('En fazla 2000 veri satırı yüklenebilir.');
 return grid.slice(1).map(r=>Object.fromEntries(IMPORT_HEADERS.map((h,i)=>[h,r[i]])));
}
export async function readInventoryXlsx(bytes){return rowsFromXlsxParts(await unzipXlsx(bytes));}

