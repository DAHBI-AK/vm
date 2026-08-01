const path=require('path'); 
const fs=require('fs'); 
const yt=path.join(__dirname,'..','bin','yt-dlp.exe'); 
const MIN=1024*1024; 
let ytDlpPath; 
function isValid(p){try{return fs.statSync(p).size>=MIN;}catch{return false;}} 
async function ensureYtDlp(){ytDlpPath=yt;if(!isValid(ytDlpPath)){if(fs.existsSync(ytDlpPath))fs.unlinkSync(ytDlpPath);await new Promise(r=>setTimeout(r,2000));fs.copyFileSync(yt+'.bak',yt);}} 
async function getVideoInfo(){if(!ytDlpPath||!isValid(ytDlpPath))throw new Error('yt-dlp ??? ???? ???');} 
(async()=>{fs.copyFileSync(yt,yt+'.bak');if(fs.existsSync(yt))fs.unlinkSync(yt);ensureYtDlp();try{await getVideoInfo();}catch(e){console.log('USER_SEES:',e.message);}await new Promise(r=>setTimeout(r,2500));try{await getVideoInfo();console.log('after ready: OK');}catch(e){console.log('still fail',e.message);}fs.copyFileSync(yt+'.bak',yt);})(); 
