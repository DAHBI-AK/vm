const path=require('path'); 
const fs=require('fs'); 
const {spawn}=require('child_process'); 
const ffmpegStatic=require('ffmpeg-static'); 
const yt=path.join(__dirname,'..','bin','yt-dlp.exe'); 
const MIN=1024*1024; 
let ytDlpPath; 
function isValid(p){try{return fs.statSync(p).size>=MIN;}catch{return false;}} 
async function ensureYtDlp(){ytDlpPath=yt;await new Promise(r=>setTimeout(r,3000));} 
async function getVideoInfo(url){if(!ytDlpPath||!isValid(ytDlpPath))throw new Error('yt-dlp ??? ???? ???');return 'ok';} 
async function ipc(url){try{return{success:true,data:await getVideoInfo(url)};}catch(e){return{success:false,error:e.message};}} 
(async()=>{ensureYtDlp();const r=await ipc('https://youtu.be/x');console.log('immediate IPC:',r);await new Promise(r=>setTimeout(r,3500));const r2=await ipc('https://youtu.be/x');console.log('after init:',r2);})(); 
