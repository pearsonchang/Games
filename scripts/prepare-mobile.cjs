'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildStatic}=require('./build-static.cjs');
const root=path.resolve(__dirname,'..'),mobile=path.join(root,'mobile');
async function prepareMobile(){
  const esbuild=require(path.join(mobile,'node_modules/esbuild'));
  const staging=path.join(mobile,`.www-${process.pid}`),output=path.join(mobile,'www');
  try{
    fs.rmSync(staging,{recursive:true,force:true});
    const manifest=buildStatic(path.join(root,'src'),staging);
    await esbuild.build({entryPoints:[path.join(mobile,'entry.js')],outfile:path.join(staging,'native-bridge.js'),bundle:true,format:'iife',platform:'browser',target:['safari15','chrome100'],minify:true,legalComments:'eof'});
    // The native bridge is never copied into the ordinary Vercel website.
    // Keep it in the parent lobby only, not in unprivileged game frames.
    for(const name of ['index.html','lobby-demo.html','palette-demo.html']){
      const p=path.join(staging,name);let html=fs.readFileSync(p,'utf8');
      html=html.replace('<head>','<head><script src="native-bridge.js"></script>');
      fs.writeFileSync(p,html);
    }
    const hash=crypto.createHash('sha256').update(manifest.version).update(fs.readFileSync(path.join(staging,'native-bridge.js')));
    for(const name of ['capacitor.config.json','pnpm-lock.yaml'])hash.update(fs.readFileSync(path.join(mobile,name)));
    hash.update(fs.readFileSync(__filename));
    const release={webVersion:manifest.version,mobileVersion:hash.digest('hex').slice(0,16),mode:'local-demo',backendConnected:false};
    fs.writeFileSync(path.join(staging,'mobile-manifest.json'),JSON.stringify(release,null,2)+'\n');
    fs.rmSync(output,{recursive:true,force:true});fs.renameSync(staging,output);
    console.log(`Prepared bundled mobile assets (${release.mobileVersion}); no remote site URL or backend credentials.`);
    return release;
  }finally{fs.rmSync(staging,{recursive:true,force:true});}
}
if(require.main===module)prepareMobile().catch(e=>{console.error(e.message+'\nInstall mobile dependencies with: corepack pnpm --dir mobile install --frozen-lockfile');process.exitCode=1;});
module.exports={prepareMobile};
