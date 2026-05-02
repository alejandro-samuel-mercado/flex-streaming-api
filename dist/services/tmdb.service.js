"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TMDBService = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../shared/config/env");
class TMDBService {
    static baseURL = env_1.env.TMDB_BASE_URL;
    static accessToken = env_1.env.TMDB_ACCESS_TOKEN;
    static getHeaders() {
        return {
            accept: 'application/json',
            Authorization: `Bearer ${this.accessToken}`
        };
    }
    /**
     * Search for movies or series by title
     */
    static async search(query, type = 'multi', lang = 'es-ES') {
        try {
            const response = await axios_1.default.get(`${this.baseURL}/search/${type}`, {
                headers: this.getHeaders(),
                params: {
                    query,
                    language: lang,
                    include_adult: false
                }
            });
            return response.data.results;
        }
        catch (error) {
            console.error('TMDB Search Error:', error);
            throw error;
        }
    }
    /**
     * Get full details of a movie or series
     */
    static async getDetails(id, type, lang = 'es-ES') {
        try {
            const response = await axios_1.default.get(`${this.baseURL}/${type}/${id}`, {
                headers: this.getHeaders(),
                params: {
                    language: lang,
                    append_to_response: 'credits,videos,images'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('TMDB Details Error:', error);
            throw error;
        }
    }
    /**
     * Resolve full image URL from TMDB path
     */
    static getImageUrl(path, size = 'original') {
        if (!path)
            return null;
        return `https://image.tmdb.org/t/p/${size}${path}`;
    }
    /**
     * Download image from TMDB to local storage
     */
    static async downloadImage(tmdbPath, targetPath) {
        try {
            const url = this.getImageUrl(tmdbPath);
            if (!url)
                return null;
            const response = await axios_1.default.get(url, { responseType: 'stream' });
            const writer = fs_1.default.createWriteStream(targetPath);
            response.data.pipe(writer);
            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', (err) => reject(err));
            });
        }
        catch (error) {
            console.error('TMDB Image Download Error:', error);
            throw error;
        }
    }
}
exports.TMDBService = TMDBService;
//# sourceMappingURL=tmdb.service.js.map