import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// ─── Directory config ────────────────────────────────────────────────────────
const APK_BASE_DIR = process.env.APK_BASE_DIR || '/home/media/apks';

export interface ApkVersionEntry {
    filename: string;
    versionName: string;
    versionCode: number;
    platform: 'android' | 'tv';
    uploadedAt: string;
    fileSize: number;
    downloadUrl: string;
    changelogFile: string | null;
    changelog: string;
    isActive: boolean;
}

interface VersionRegistry {
    active: string | null;
    versions: ApkVersionEntry[];
}

export class AppVersionService {

    static getApkDir(platform: string): string {
        const safe = platform === 'tv' ? 'tv' : 'android';
        return path.join(APK_BASE_DIR, safe);
    }

    private static getRegistryPath(platform: string): string {
        return path.join(AppVersionService.getApkDir(platform), 'registry.json');
    }

    private static readRegistry(platform: string): VersionRegistry {
        const registryPath = AppVersionService.getRegistryPath(platform);
        const dir = AppVersionService.getApkDir(platform);
        fs.mkdirSync(dir, { recursive: true });

        if (!fs.existsSync(registryPath)) {
            return { active: null, versions: [] };
        }
        try {
            return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
        } catch {
            return { active: null, versions: [] };
        }
    }

    private static writeRegistry(platform: string, registry: VersionRegistry): void {
        const registryPath = AppVersionService.getRegistryPath(platform);
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
    }

    /**
     * Parse versionCode and versionName from filename.
     * Patterns: NUBA-ANDROID-V2.apk → versionCode=2, versionName="2.0"
     *           NUBA-TV-V3.5.apk  → versionCode=35, versionName="3.5"
     */
    private static parseVersionFromFilename(filename: string): { versionCode: number; versionName: string } {
        // Try to extract version from pattern like V2, V2.1, v3.5, etc.
        const match = filename.match(/[Vv](\d+)(?:\.(\d+))?/);
        if (match) {
            const major = parseInt(match[1], 10);
            const minor = match[2] ? parseInt(match[2], 10) : 0;
            const versionCode = major * 100 + minor;
            const versionName = minor > 0 ? `${major}.${minor}` : `${major}.0`;
            return { versionCode, versionName };
        }
        return { versionCode: 1, versionName: '1.0' };
    }

    /**
     * Read changelog text from a .txt or .md file next to the APK.
     */
    private static readChangelogText(platform: string, apkFilename: string, changelogFilename?: string | null): string {
        const dir = AppVersionService.getApkDir(platform);
        // Priority: explicit changelog file > same name .txt > same name .md
        const candidates = changelogFilename
            ? [changelogFilename]
            : [
                apkFilename.replace(/\.apk$/i, '.txt'),
                apkFilename.replace(/\.apk$/i, '.md'),
            ];

        for (const candidate of candidates) {
            const filePath = path.join(dir, candidate);
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf-8').trim();
            }
        }
        return '';
    }

    /**
     * Get download URL for an APK.
     */
    private static buildDownloadUrl(platform: string, filename: string): string {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        return `${backendUrl}/api/app/download?platform=${platform}&filename=${encodeURIComponent(filename)}`;
    }

    // ── Public: Get latest (active) version ──────────────────────────────────
    static async getLatestVersion(platform: string): Promise<ApkVersionEntry | null> {
        const registry = AppVersionService.readRegistry(platform);
        if (!registry.active) {
            // Return newest by versionCode if none is explicitly active
            if (registry.versions.length === 0) return null;
            const sorted = [...registry.versions].sort((a, b) => b.versionCode - a.versionCode);
            return sorted[0];
        }
        const entry = registry.versions.find(v => v.filename === registry.active);
        return entry || null;
    }

    // ── Admin: List all versions ──────────────────────────────────────────────
    static async listVersions(platform: string): Promise<ApkVersionEntry[]> {
        const registry = AppVersionService.readRegistry(platform);
        // Refresh changelog text from disk in case files were added manually
        const dir = AppVersionService.getApkDir(platform);
        return registry.versions.map(v => ({
            ...v,
            isActive: registry.active === v.filename,
            changelog: AppVersionService.readChangelogText(platform, v.filename, v.changelogFile),
            fileSize: fs.existsSync(path.join(dir, v.filename)) ? fs.statSync(path.join(dir, v.filename)).size : 0,
        })).sort((a, b) => b.versionCode - a.versionCode);
    }

    // ── Admin: Register an uploaded APK ──────────────────────────────────────
    static async registerVersion(platform: string, apkFilename: string, changelogFilename?: string): Promise<ApkVersionEntry> {
        const registry = AppVersionService.readRegistry(platform);
        const dir = AppVersionService.getApkDir(platform);
        const apkPath = path.join(dir, apkFilename);

        if (!fs.existsSync(apkPath)) {
            throw new Error(`APK file not found: ${apkFilename}`);
        }

        const { versionCode, versionName } = AppVersionService.parseVersionFromFilename(apkFilename);
        const changelog = AppVersionService.readChangelogText(platform, apkFilename, changelogFilename);
        const fileSize = fs.statSync(apkPath).size;

        // Remove any previous entry with same filename
        registry.versions = registry.versions.filter(v => v.filename !== apkFilename);

        const entry: ApkVersionEntry = {
            filename: apkFilename,
            versionName,
            versionCode,
            platform: platform === 'tv' ? 'tv' : 'android',
            uploadedAt: new Date().toISOString(),
            fileSize,
            downloadUrl: AppVersionService.buildDownloadUrl(platform, apkFilename),
            changelogFile: changelogFilename || null,
            changelog,
            isActive: false,
        };

        registry.versions.push(entry);

        // Auto-activate if it's the first or has the highest versionCode
        const maxCode = Math.max(...registry.versions.map(v => v.versionCode));
        if (entry.versionCode >= maxCode) {
            registry.active = apkFilename;
        }

        AppVersionService.writeRegistry(platform, registry);
        return { ...entry, isActive: registry.active === apkFilename };
    }

    // ── Admin: Add by URL ──────────────────────────────────────────────────────
    static async addVersionByUrl(platform: string, apkUrl: string, versionName: string, versionCode: number, changelog: string): Promise<ApkVersionEntry> {
        const dir = AppVersionService.getApkDir(platform);
        fs.mkdirSync(dir, { recursive: true });

        // Derive filename from URL
        const urlFilename = decodeURIComponent(path.basename(new URL(apkUrl).pathname));
        const apkFilename = urlFilename.endsWith('.apk') ? urlFilename : `NUBA-${platform.toUpperCase()}-V${versionName}.apk`;
        const apkPath = path.join(dir, apkFilename);

        // Download the file
        await new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(apkPath);
            const protocol = apkUrl.startsWith('https') ? https : http;
            protocol.get(apkUrl, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode} al descargar APK`));
                    return;
                }
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', (err) => {
                fs.unlink(apkPath, () => {});
                reject(err);
            });
        });

        // Write changelog as text file
        if (changelog) {
            const changelogPath = path.join(dir, apkFilename.replace(/\.apk$/i, '.txt'));
            fs.writeFileSync(changelogPath, changelog, 'utf-8');
        }

        const registry = AppVersionService.readRegistry(platform);
        const fileSize = fs.statSync(apkPath).size;

        const entry: ApkVersionEntry = {
            filename: apkFilename,
            versionName,
            versionCode,
            platform: platform === 'tv' ? 'tv' : 'android',
            uploadedAt: new Date().toISOString(),
            fileSize,
            downloadUrl: AppVersionService.buildDownloadUrl(platform, apkFilename),
            changelogFile: changelog ? apkFilename.replace(/\.apk$/i, '.txt') : null,
            changelog,
            isActive: false,
        };

        registry.versions = registry.versions.filter(v => v.filename !== apkFilename);
        registry.versions.push(entry);

        const maxCode = Math.max(...registry.versions.map(v => v.versionCode));
        if (versionCode >= maxCode) {
            registry.active = apkFilename;
        }

        AppVersionService.writeRegistry(platform, registry);
        return { ...entry, isActive: registry.active === apkFilename };
    }

    // ── Admin: Set active version ─────────────────────────────────────────────
    static async setActiveVersion(platform: string, filename: string): Promise<{ active: string }> {
        const registry = AppVersionService.readRegistry(platform);
        const exists = registry.versions.find(v => v.filename === filename);
        if (!exists) throw new Error(`Versión no encontrada: ${filename}`);
        registry.active = filename;
        AppVersionService.writeRegistry(platform, registry);
        return { active: filename };
    }

    // ── Admin: Delete a version ───────────────────────────────────────────────
    static async deleteVersion(platform: string, filename: string): Promise<void> {
        const registry = AppVersionService.readRegistry(platform);
        const dir = AppVersionService.getApkDir(platform);

        // Remove files
        const apkPath = path.join(dir, filename);
        const txtPath = path.join(dir, filename.replace(/\.apk$/i, '.txt'));
        const mdPath = path.join(dir, filename.replace(/\.apk$/i, '.md'));

        [apkPath, txtPath, mdPath].forEach(p => {
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
        });

        registry.versions = registry.versions.filter(v => v.filename !== filename);
        if (registry.active === filename) {
            // Activate the next newest
            const sorted = [...registry.versions].sort((a, b) => b.versionCode - a.versionCode);
            registry.active = sorted[0]?.filename || null;
        }

        AppVersionService.writeRegistry(platform, registry);
    }

    // ── Admin: Update changelog text ──────────────────────────────────────────
    static async updateChangelog(platform: string, filename: string, changelog: string): Promise<void> {
        const dir = AppVersionService.getApkDir(platform);
        const changelogPath = path.join(dir, filename.replace(/\.apk$/i, '.txt'));
        fs.writeFileSync(changelogPath, changelog, 'utf-8');

        const registry = AppVersionService.readRegistry(platform);
        const entry = registry.versions.find(v => v.filename === filename);
        if (entry) {
            entry.changelogFile = path.basename(changelogPath);
            AppVersionService.writeRegistry(platform, registry);
        }
    }
}
