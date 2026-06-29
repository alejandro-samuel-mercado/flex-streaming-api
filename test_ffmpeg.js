const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

if (!fs.existsSync('test_out')) fs.mkdirSync('test_out');

// Create a dummy video with 2 audio tracks to test
const { execSync } = require('child_process');
try {
  execSync('ffmpeg -f lavfi -i testsrc=duration=2:size=640x360:rate=24 -f lavfi -i sine=frequency=1000:duration=2 -f lavfi -i sine=frequency=500:duration=2 -map 0:v -map 1:a -map 2:a -c:v libx264 -c:a aac -metadata:s:a:0 language=eng -metadata:s:a:0 title="English" -metadata:s:a:1 language=spa -metadata:s:a:1 title="Spanish" test_input.mkv -y');
} catch (e) {
  console.log(e);
}

ffmpeg('test_input.mkv')
  .outputOptions([
    '-map', '0:v:0',
    '-map', '0:a:0',
    '-map', '0:a:1',
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', 'test_out/%v_%03d.ts',
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', 'v:0,agroup:audio a:0,agroup:audio,language:eng,name:Audio_0 a:1,agroup:audio,language:spa,name:Audio_1'
  ])
  .output('test_out/%v.m3u8')
  .on('end', () => console.log('Done!'))
  .on('error', (err, stdout, stderr) => console.log('Error:', err.message, stderr))
  .run();
