const path=require('path'); 
const fs=require('fs'); 
const {spawn}=require('child_process'); 
const ffmpegStatic=require('ffmpeg-static'); 
const yt=path.join(__dirname,'..','bin','yt-dlp.exe'); 
const NODE=path.join(process.env.ProgramFiles||'C:\\Program Files','nodejs','node.exe'); 
const url='https://www.youtube.com/watch?v=jNQXAC9IVRw'; 
function run(args){return new Promise((res,rej)=>{const c=spawn(yt,args,{windowsHide:true});let o='',e='';c.stdout.on('data',d=>o+=d);c.stderr.on('data',d=>e+=d);c.on('close',code=>code===0?res({o,e}):rej(new Error(e.trim()||'code '+code)));});} 
async function getVideoInfo(url){if(!fs.existsSync(yt)||fs.statSync(yt).size<1024*1024)throw new Error('yt-dlp ??? ???? ???');const base=['--ffmpeg-location',ffmpegStatic];if(fs.existsSync(NODE))base.push('--js-runtimes','node:'+NODE);const out=await run([url,...base,'--dump-single-json','--no-playlist','--no-warnings']);return JSON.parse(out.o);} 
(async()=>{const i=await getVideoInfo(url);console.log('MIMIC_OK',i.title);const r=await run([url,'--ffmpeg-location',ffmpegStatic,'--dump-single-json','--no-playlist','--no-warnings']);console.log('JSON_on_stdout',r.o.length>1000,'stderr',r.e.length);})().catch(e=>console.log('MIMIC_FAIL',e.message.slice(0,200))); 
