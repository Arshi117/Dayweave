const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),site=path.join(root,'marketing'),renderer=path.resolve(process.argv[2]||path.join(root,'out/renderer')),dest=path.join(site,'dist/product-demo');
fs.mkdirSync(path.join(dest,'assets'),{recursive:true});
for(const name of fs.readdirSync(path.join(dest,'assets')))if(/\.(m?js|css)$/.test(name))fs.unlinkSync(path.join(dest,'assets',name));
const manifest=[];
for(const name of fs.readdirSync(path.join(renderer,'assets'))){if(!/\.(m?js|css)$/.test(name))continue;const from=path.join(renderer,'assets',name),to=path.join(dest,'assets',name);fs.copyFileSync(from,to);manifest.push({file:'assets/'+name,sha256:crypto.createHash('sha256').update(fs.readFileSync(from)).digest('hex')});}
if(fs.existsSync(path.join(renderer,'pdfjs')))fs.cpSync(path.join(renderer,'pdfjs'),path.join(dest,'pdfjs'),{recursive:true});
let html=fs.readFileSync(path.join(renderer,'index.html'),'utf8');
html=html.replace('<title>Dayweave</title>','<title>Dayweave actual product UI demo</title>');
html=html.replace('<head>','<head>\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'self\'; worker-src \'self\' blob:; form-action \'none\'; object-src \'none\'; base-uri \'self\'">\n<script src="./demo-bridge.js"></script>');
fs.writeFileSync(path.join(dest,'index.html'),html);
fs.copyFileSync(path.join(site,'demo/demo-bridge.js'),path.join(dest,'demo-bridge.js'));
const audit=path.join(renderer,'source-audit.json');
fs.writeFileSync(path.join(dest,'renderer-provenance.json'),JSON.stringify({productVersion:process.argv[3]||JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,source:fs.existsSync(audit)?'current D:/Dayweave renderer source':'out/renderer',uiModified:false,assets:manifest,...(fs.existsSync(audit)?{sourceAudit:JSON.parse(fs.readFileSync(audit,'utf8'))}:{})},null,2)+'\n');
console.log('Copied actual desktop renderer unchanged:',manifest.length,'assets. Only data and window transport are simulated.');
