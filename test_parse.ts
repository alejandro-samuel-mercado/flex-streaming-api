const fileName = "1x01 - Extradición dilatada.mp4";

function parseSeasonEpisodeFromFilename(fileName: string): { season: number; episode: number } | null {
  const m = fileName.match(/[Ss](\d+)[-_\s]*[Ee](?:[Pp])?[-_\s]*(\d+)/i);
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

  const tFormat = fileName.match(/[Tt](\d+)[-\s]*[Ee]?(?:[Pp])?[-\s]*(\d+)/i);
  if (tFormat) return { season: parseInt(tFormat[1], 10), episode: parseInt(tFormat[2], 10) };

  const xFormat = fileName.match(/(\d+)[xX](\d+)/i);
  if (xFormat) return { season: parseInt(xFormat[1], 10), episode: parseInt(xFormat[2], 10) };

  const epFormat = fileName.match(/(?:[Ee]pisodio|[Ee]p|[Cc]apitulo|[Cc]ap)[-_\s]*(\d+)/i);
  if (epFormat) return { season: 1, episode: parseInt(epFormat[1], 10) };

  const eFormat = fileName.match(/[Ee](\d+)/i);
  if (eFormat) return { season: 1, episode: parseInt(eFormat[1], 10) };

  return null;
}

console.log(parseSeasonEpisodeFromFilename(fileName));
