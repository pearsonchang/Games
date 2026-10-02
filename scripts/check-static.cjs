'use strict';
// Buildless deployment gate: validate syntax and literal local resource paths.
// Keep exact filename case checks even on case-insensitive developer machines.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const publicRoot=path.join(root,'dist');
function walk(directory){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const filename=path.join(directory,entry.name);
  return entry.isDirectory()?walk(filename):[filename];
 });
}
const files=walk(publicRoot);
const names=new Set(files.map(filename=>path.relative(publicRoot,filename).split(path.sep).join('/')));
const errors=[];
let references=0,javascript=0;
function checkReference(owner,value){
 const resource=value.trim().split(/[?#]/)[0];
 if(!resource||/^(?:[a-z][\w+.-]*:|\/\/)/i.test(resource))return;
 references++;
 let decoded;
 try{decoded=decodeURIComponent(resource);}catch{errors.push(`${owner}: invalid resource URL ${value}`);return;}
 const relative=decoded.startsWith('/')?decoded.slice(1):path.posix.join(path.posix.dirname(owner),decoded);
 let target=path.posix.normalize(relative||'index.html');
 if(decoded.endsWith('/'))target=path.posix.join(target,'index.html');
 if(!names.has(target))errors.push(`${owner}: missing resource or incorrect filename case: ${value}`);
}
for(const filename of files){
 const owner=path.relative(publicRoot,filename).split(path.sep).join('/');
 const extension=path.extname(filename);
 if(!['.html','.css','.js'].includes(extension))continue;
 const source=fs.readFileSync(filename,'utf8');
 if(extension==='.js'){
  javascript++;
  const result=spawnSync(process.execPath,['--check',filename],{encoding:'utf8'});
  if(result.status!==0)errors.push(`${owner}: ${result.error?.message||result.stderr||'syntax check failed'}`);
  // Game entrypoints and artwork also appear as literal strings in controllers.
  for(const match of source.matchAll(/['"]([\w./-]+\.(?:html|css|js|png|jpe?g|webp|svg|avif)(?:\?[^'"\s]*)?)['"]/g))checkReference(owner,match[1]);
 }
 if(extension==='.html'){
  for(const match of source.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gs))checkReference(owner,match[2]);
 }
 if(extension==='.css'){
  for(const match of source.matchAll(/url\(\s*(["']?)([^)]+?)\1\s*\)/g))checkReference(owner,match[2]);
 }
}
for(const entry of ['index','minesweeper','rocket','dice','plinko','horse']){
 if(!names.has(`${entry}.html`))errors.push(`Missing required entrypoint: ${entry}.html`);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Static checks passed: ${javascript} JavaScript files, ${references} local references, 6 game/platform entrypoints.`);
console.log('dist/ is ready to serve; this project has no compilation or runtime package dependencies.');
