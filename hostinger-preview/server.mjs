import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const page=readFileSync(new URL('./index.html',import.meta.url));
export function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/health'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:'ok');}
 if(path==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(!['/','/index.html'].includes(path)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:'Not found');}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':page.length});res.end(req.method==='HEAD'?undefined:page);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT||3000);
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid PORT');
 createServer(handler).listen(port,'0.0.0.0',()=>console.log('Kuzmos preview listening on port '+port));
}
