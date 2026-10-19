'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mobile=path.join(root,'mobile');
const cli=path.join(mobile,'node_modules/@capacitor/cli/bin/capacitor');
const env={...process.env,PATH:path.dirname(process.execPath)+path.delimiter+(process.env.PATH||'')};
function run(command,args,cwd=root){const r=spawnSync(command,args,{cwd,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error(`${path.basename(command)} exited with status ${r.status}`);}
function available(command,args){const r=spawnSync(command,args,{env,encoding:'utf8'});return !r.error&&r.status===0;}
function doctor(){
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||path.join(os.homedir(),'Library/Android/sdk');
  const result={node:process.versions.node,dependencies:fs.existsSync(cli),bundledAssets:fs.existsSync(path.join(mobile,'www/index.html')),android:{project:fs.existsSync(path.join(mobile,'android/gradlew')),java:available('java',['-version']),sdk:fs.existsSync(path.join(sdk,'platforms'))},ios:{project:fs.existsSync(path.join(mobile,'ios/App/App.xcodeproj')),xcode:process.platform==='darwin'&&available('xcodebuild',['-version'])}};
  console.log(JSON.stringify(result,null,2));
  if(!result.ios.xcode)console.log('iOS compilation requires full Xcode (26+) on macOS; Command Line Tools alone are not enough. Signing is configured in Xcode.');
  if(!result.android.java||!result.android.sdk)console.log('Android compilation requires Android Studio, its JDK and Android SDK. Set JAVA_HOME / ANDROID_HOME as needed.');
  return result;
}
async function main(args){
  const [command,platform]=args;
  if(command==='doctor'){doctor();return;}
  if(!fs.existsSync(cli))throw Error('Install the pinned mobile dependencies first: corepack pnpm --dir mobile install --frozen-lockfile');
  if(command==='build'||command==='sync'){
    run(process.execPath,['scripts/build.cjs']);
    await require('./prepare-mobile.cjs').prepareMobile();
    run(process.execPath,['scripts/check-static.cjs','mobile/www']);
    if(command==='sync')run(process.execPath,[cli,'sync'],mobile);
  }else if(command==='open'&&['android','ios'].includes(platform))run(process.execPath,[cli,'open',platform],mobile);
  else if(command==='apk'){
    const d=doctor();if(!d.android.java||!d.android.sdk)throw Error('Android build tools are missing. Install them, then rerun npm run mobile:apk.');
    await main(['sync']);run(process.platform==='win32'?'gradlew.bat':'./gradlew',['assembleDebug'],path.join(mobile,'android'));
  }else throw Error('Usage: node scripts/mobile.cjs doctor|build|sync|open android|open ios|apk');
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={doctor};
