const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const site=path.resolve(__dirname,'..'),root=path.resolve(site,'..'),dest=path.join(site,'dist');
fs.mkdirSync(path.join(dest,'assets'),{recursive:true});
for(const name of ['index.html','style.css','app.js'])fs.copyFileSync(path.join(site,'site',name),path.join(dest,name));
fs.copyFileSync(path.join(root,'build/icon.png'),path.join(dest,'assets/icon.png'));
// Former films are deliberately excluded from the published site.
for(const name of fs.readdirSync(path.join(dest,'assets')))if(/^dayweave-walkthrough.*\.(mp4|jpg)$/.test(name))fs.unlinkSync(path.join(dest,'assets',name));
execFileSync(process.execPath,[path.join(__dirname,'prepare-demo.cjs'),process.argv[2]||path.join(root,'out/renderer')],{stdio:'inherit'});
fs.writeFileSync(path.join(dest,'.nojekyll'),'');
console.log('Static website ready: '+dest);
