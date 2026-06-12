const fs = require('fs');
const start = Date.now();
const stream = fs.createReadStream('/home/peliplus_gran_disco/hls/cmplpz5uc02fugrtz5dklfrm4/1080p_000.ts');
let bytes = 0;
stream.on('data', chunk => { bytes += chunk.length; });
stream.on('end', () => {
    const ms = Date.now() - start;
    console.log(`Read ${bytes} bytes in ${ms}ms. Speed: ${(bytes / 1024 / 1024 / (ms / 1000)).toFixed(2)} MB/s`);
});
stream.on('error', err => console.error(err));
