import {mkdir,copyFile} from 'node:fs/promises';
const out=new URL('./dist/',import.meta.url);
await mkdir(out,{recursive:true});
await copyFile(new URL('./index.html',import.meta.url),new URL('index.html',out));
console.log('Static output ready: dist/index.html');
