async function getVideoInfo(url,ytDlpPath){ 
const fs=require('fs'); 
const MIN=1024*1024; 
function isValid(p){try{return fs.statSync(p).size>=MIN;}catch{return false;}} 
if(!ytDlpPath||!isValid(ytDlpPath))throw new Error('yt-dlp ??? ???? ???'); 
} 
(async()=>{try{await getVideoInfo('x',null);}catch(e){console.log('RACE_MSG:',e.message);}})(); 
