const path=require('path'); 
const fs=require('fs'); 
const {spawn}=require('child_process'); 
const ffmpegStatic=require('ffmpeg-static'); 
const yt=path.join(__dirname,'..','bin','yt-dlp.exe'); 
const NODE=path.join(process.env.ProgramFiles||'C:\\Program Files','nodejs','node.exe'); 
function runYtDlp(args){return new Promise((res,rej)=>{const c=spawn(yt,args,{windowsHide:true});let o='',e='';c.stdout.on('data',d=>o+=d);c.stderr.on('data',d=>e+=d);c.on('close',code=>code===0?res(o):rej(new Error(e.trim()||'code '+code)));});} 
async function getVideoInfo(url){const args=[url,'--ffmpeg-location',ffmpegStatic];if(fs.existsSync(NODE))args.push('--js-runtimes','node:'+NODE);args.push('--dump-single-json','--no-playlist','--no-warnings');const out=await runYtDlp(args);return JSON.parse(out);} 
(async()=>{for (const q of ['funny cats','https://notreal.example.com/v']){try{await getVideoInfo(q);}catch(e){console.log('Q:',JSON.stringify(q));console.log('USER_SEES:',e.message.slice(0,300));console.log('---');}}})(); 
