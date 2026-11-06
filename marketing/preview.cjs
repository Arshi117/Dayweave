const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'dist');
http.createServer((req,res)=>{let requested;try{requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return;}
const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream');res.end(data);});
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));

