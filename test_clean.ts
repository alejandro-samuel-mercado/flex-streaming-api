const NOISE_PATTERNS = [
  /\b(360p|480p|720p|1080p|2160p|4k|uhd)\b/gi,
  /\b(x264|x265|h264|h265|hevc|avc|xvid|divx|av1)\b/gi,
  /\b(blu[\s-]?ray|bdrip|brrip|web[\s-]?dl|web[\s-]?rip|hdtv|dvdrip|hdrip|cam|ts|screener|r5)\b/gi,
  /\b(aac|ac3|dts|dd5\.?1|atmos|truehd|flac|mp3)\b/gi,
  /\[.*?\]/g,
  /\(.*?\)/g,
  /\b\d+(\.\d+)?\s*(gb|mb|tb)\b/gi,
  /[-\.]\w{2,10}$/g,
  /\b(19|20)\d{2}\b/g,
  /[._]/g,
  /\s{2,}/g,
];

function cleanFileName(fileName: string): string {
    let clean = fileName.replace(/\.[^/.]+$/, '');
    for (const pattern of NOISE_PATTERNS) clean = clean.replace(pattern, ' ');
    clean = clean.replace(/[._-]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return clean;
}
console.log(cleanFileName("1x01 - Extradición dilatada.mp4"));
console.log(cleanFileName("El chema"));
