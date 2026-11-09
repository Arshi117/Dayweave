const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const site=path.resolve(__dirname,'..'),root=path.resolve(site,'..'),dest=path.join(site,'dist');
fs.mkdirSync(path.join(dest,'assets'),{recursive:true});
for(const name of ['index.html','style.css','app.js'])fs.copyFileSync(path.join(site,'site',name),path.join(dest,name));
fs.copyFileSync(path.join(root,'build/icon.png'),path.join(dest,'assets/icon.png'));
// Former films are deliberately excluded from the published site.
for(const name of fs.readdirSync(path.join(dest,'assets')))if(/^dayweave-walkthrough.*\.(mp4|jpg)$/.test(name))fs.unlinkSync(path.join(dest,'assets',name));
execFileSync(process.execPath,[path.join(__dirname,'prepare-demo.cjs'),process.argv[2]||path.join(root,'out/renderer')],{stdio:'inherit'});
// Version transport and iframe entry points too, so a refreshed page cannot
// combine the new host with a browser-cached, older product renderer.
const version=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dest,file))).digest('hex').slice(0,12);
const html=fs.readFileSync(path.join(dest,'index.html'),'utf8')
  .replace(/src="app\.js(?:\?[^"]*)?"/,'src="app.js?v='+version('app.js')+'"')
  .replace('href="style.css"','href="style.css?v='+version('style.css')+'"')
  .replace('src="product-demo/index.html?surface=focus"','src="product-demo/index.html?surface=focus&amp;v='+version('product-demo/index.html')+'"');
fs.writeFileSync(path.join(dest,'index.html'),html);
fs.writeFileSync(path.join(dest,'.nojekyll'),'');
console.log('Static website ready: '+dest);
