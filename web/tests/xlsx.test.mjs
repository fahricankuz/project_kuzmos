import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {unzipXlsx,rowsFromXlsxParts,readInventoryXlsx} from '../inventory/xlsx.mjs';
import {inventorySeed,importPreview,applyImport} from '../inventory/import.mjs';
const file=new URL('../templates/Kuzmos_Stok_Aktarim_Sablonu.xlsx',import.meta.url);
test('gerçek XLSX şablonu açılır, barkod ve numara metin kalır',async()=>{const rows=await readInventoryXlsx(fs.readFileSync(file));assert.equal(rows.length,3);assert.equal(rows[0].uretici_barkodu,'8680000001041');assert.equal(rows[1].numara,'+1.00');assert.equal(rows[2].numara,'-1.00');const s=inventorySeed(),p=importPreview(s,rows);assert.deepEqual(p.errors,[]);applyImport(s,p);assert.equal(s.items[0].qty,10)});
test('formüllü Stok sayfası uygulanmadan reddedilir',async()=>{const parts=await unzipXlsx(fs.readFileSync(file));const key=[...parts.keys()].find(k=>/worksheets\/sheet1\.xml$/i.test(k));const xml=new TextDecoder().decode(parts.get(key));parts.set(key,xml.replace(/(<\/(?:\w+:)?sheetData>)/,'<row r="5"><c r="A5"><f>1+1</f><v>2</v></c></row>$1'));assert.throws(()=>rowsFromXlsxParts(parts),/formül/)});
test('bozuk XLSX dosyası ve yanlış sayfa başlığı reddedilir',async()=>{await assert.rejects(()=>readInventoryXlsx(new Uint8Array(10)));const p=await unzipXlsx(fs.readFileSync(file));p.set('xl/workbook.xml',new TextDecoder().decode(p.get('xl/workbook.xml')).replace('name="Stok"','name="Yanlis"'));assert.throws(()=>rowsFromXlsxParts(p),/Stok/)});
test('aynı belge referansı yeni dosyada tekrar stok ekleyemez',async()=>{const rows=await readInventoryXlsx(fs.readFileSync(file)),s=inventorySeed();applyImport(s,importPreview(s,rows));rows[0].adet=9;assert.ok(importPreview(s,rows).errors.some(e=>e.message.includes('referans')))});

