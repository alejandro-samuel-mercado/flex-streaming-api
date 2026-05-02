import axios from 'axios';
import fs from 'fs';
import { env } from '../shared/config/env';

export class TMDBService {
  private static readonly baseURL = env.TMDB_BASE_URL;
  private static readonly accessToken = env.TMDB_ACCESS_TOKEN;

  private static getHeaders() {
    return {
      accept: 'application/json',
      Authorization: `Bearer ${this.accessToken}`
    };
  }

  /**
   * Search for movies or series by title
   */
  static async search(query: string, type: 'movie' | 'tv' | 'multi' = 'multi', lang: string = 'es-ES') {
    try {
      const response = await axios.get(`${this.baseURL}/search/${type}`, {
        headers: this.getHeaders(),
        params: {
          query,
          language: lang,
          include_adult: false
        }
      });
      return response.data.results;
    } catch (error) {
      console.error('TMDB Search Error:', error);
      throw error;
    }
  }

  /**
   * Get full details of a movie or series
   */
  static async getDetails(id: string | number, type: 'movie' | 'tv', lang: string = 'es-ES') {
    try {
      const response = await axios.get(`${this.baseURL}/${type}/${id}`, {
        headers: this.getHeaders(),
        params: {
          language: lang,
          append_to_response: 'credits,videos,images'
        }
      });
      return response.data;
    } catch (error) {
      console.error('TMDB Details Error:', error);
      throw error;
    }
  }

  /**
   * Resolve full image URL from TMDB path
   */
  static getImageUrl(path: string | null, size: string = 'original') {
    if (!path) return null;
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  /**
   * Download image from TMDB to local storage
   */
  static async downloadImage(tmdbPath: string, targetPath: string) {
    try {
      const url = this.getImageUrl(tmdbPath);
      if (!url) return null;

      const response = await axios.get(url, { responseType: 'stream' });
      const writer = fs.createWriteStream(targetPath);

      response.data.pipe(writer);

      return new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', (err) => reject(err));
      });
    } catch (error) {
      console.error('TMDB Image Download Error:', error);
      throw error;
    }
  }
}
