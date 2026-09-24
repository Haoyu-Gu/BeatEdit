// Local-only static preview, including byte-range support for Safari audio.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.mid':'audio/midi', '.ico':'image/x-icon' };
http.createServer((req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  let filename;
  try {filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}
  catch {res.writeHead(400);res.end();return;}
  if (!filename.startsWith(root+path.sep) && filename!==root) {res.writeHead(403);res.end();return;}
  if (path.relative(root,filename).split(path.sep).some(part=>part.startsWith('.'))) {res.writeHead(403);res.end();return;}
  try {
    if(fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');
    if(!fs.realpathSync(filename).startsWith(root+path.sep))throw new Error('Outside root');
    const size=fs.statSync(filename).size;
    let start=0,end=size-1,code=200;
    if(req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!match || (!match[1]&&!match[2])) {res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
      if(!match[1])start=Math.max(0,size-Number(match[2]));
      else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(start>end || start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
      code=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
    }
    res.writeHead(code,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-cache'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(filename,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(3013,'127.0.0.1',()=>console.log('BeatEdit preview: http://127.0.0.1:3013/'));
