const fs=require('fs'); 
const q=String.fromCharCode(34); 
let s=fs.readFileSync('url-last-test.js','utf8'); 
s=s.replace('const args=[url,','const args=['); 
s=s.replace(q+'--no-warnings'+q+');', q+'--no-warnings'+q+',url);'); 
fs.writeFileSync('url-last-test.js',s); 
