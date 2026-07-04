import 'dotenv/config';
import { TMDBService } from './src/services/tmdb.service';

async function test(id: number) {
  try {
    const resMovie = await TMDBService.getFullDetails(id, 'movie');
    console.log(`Movie ${id}:`, resMovie.title);
  } catch (e: any) {
    console.log(`Movie ${id} failed:`, e.message);
    try {
      const resTv = await TMDBService.getFullDetails(id, 'tv');
      console.log(`TV ${id}:`, resTv.title);
    } catch (e2: any) {
      console.log(`TV ${id} failed:`, e2.message);
    }
  }
}

test(10142);
test(11007);
test(1014209);
