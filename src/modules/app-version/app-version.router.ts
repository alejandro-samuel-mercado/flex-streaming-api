import express, { Router, RequestHandler, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';
import { AppVersionService } from './app-version.service';

export const appVersionRouter = Router();

// ─── Multer setup (APK + changelog) ─────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req: any, file, cb) => {
        const platform = req.body?.platform || req.query?.platform || 'android';
        const dir = AppVersionService.getApkDir(platform);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req: any, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 300 * 1024 * 1024 }, // 300MB max
    fileFilter: (req, file, cb) => {
        const allowedExts = ['.apk', '.txt', '.md'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext)) cb(null, true);
        else cb(new Error(`Tipo de archivo no permitido: ${ext}`));
    }
});

// ─── PUBLIC: Get latest version info ─────────────────────────────────────────
// GET /api/app/version?platform=android|tv
appVersionRouter.get('/version', (async (req: Request, res: Response) => {
    const platform = (req.query.platform as string) || 'android';
    const info = await AppVersionService.getLatestVersion(platform);
    res.json({ success: true, data: info });
}) as RequestHandler);

// ─── PUBLIC: Download APK ────────────────────────────────────────────────────
// GET /api/app/download?platform=android|tv&filename=NUBA-ANDROID-V2.apk
appVersionRouter.get('/download', (async (req: Request, res: Response) => {
    const platform = (req.query.platform as string) || 'android';
    const filename = req.query.filename as string;
    if (!filename || !filename.endsWith('.apk')) {
        res.status(400).json({ success: false, error: 'Filename inválido' });
        return;
    }
    const apkDir = AppVersionService.getApkDir(platform);
    const filePath = path.resolve(apkDir, filename);
    // Security: ensure file stays within apkDir
    if (!filePath.startsWith(path.resolve(apkDir))) {
        res.status(403).json({ success: false, error: 'Acceso denegado' });
        return;
    }
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'APK no encontrada' });
        return;
    }
    res.download(filePath, filename);
}) as RequestHandler);

// ─── ADMIN: List all versions ────────────────────────────────────────────────
// GET /api/app/admin/list?platform=android|tv
appVersionRouter.get('/admin/list', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res: Response) => {
    const platform = (req.query.platform as string) || 'android';
    const versions = await AppVersionService.listVersions(platform);
    ok(res, versions);
}) as RequestHandler);

// ─── ADMIN: Upload APK + optional changelog file ─────────────────────────────
// POST /api/app/admin/upload?platform=android|tv
appVersionRouter.post(
    '/admin/upload',
    authenticate as RequestHandler,
    requireRole('ADMIN') as RequestHandler,
    upload.fields([
        { name: 'apk', maxCount: 1 },
        { name: 'changelog', maxCount: 1 }
    ]),
    (async (req: AuthenticatedRequest, res: Response) => {
        const platform = (req.body?.platform as string) || 'android';
        const files = req.files as Record<string, Express.Multer.File[]>;
        const apkFile = files?.apk?.[0];
        const changelogFile = files?.changelog?.[0];

        if (!apkFile) {
            res.status(400).json({ success: false, error: 'Se requiere el archivo APK' });
            return;
        }

        const result = await AppVersionService.registerVersion(platform, apkFile.filename, changelogFile?.filename);
        ok(res, result);
    }) as RequestHandler
);

// ─── ADMIN: Add version by URL (remote download) ────────────────────────────
// POST /api/app/admin/add-by-url
appVersionRouter.post('/admin/add-by-url', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res: Response) => {
    const { platform, apkUrl, changelog, versionName, versionCode } = req.body;
    if (!platform || !apkUrl || !versionName || !versionCode) {
        res.status(400).json({ success: false, error: 'Faltan campos obligatorios: platform, apkUrl, versionName, versionCode' });
        return;
    }
    const result = await AppVersionService.addVersionByUrl(platform, apkUrl, versionName, Number(versionCode), changelog || '');
    ok(res, result);
}) as RequestHandler);

// ─── ADMIN: Set active version ───────────────────────────────────────────────
// PATCH /api/app/admin/set-active
appVersionRouter.patch('/admin/set-active', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res: Response) => {
    const { platform, filename } = req.body;
    if (!platform || !filename) {
        res.status(400).json({ success: false, error: 'Se requieren platform y filename' });
        return;
    }
    const result = await AppVersionService.setActiveVersion(platform, filename);
    ok(res, result);
}) as RequestHandler);

// ─── ADMIN: Delete a version ─────────────────────────────────────────────────
// DELETE /api/app/admin/version
appVersionRouter.delete('/admin/version', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res: Response) => {
    const { platform, filename } = req.body;
    if (!platform || !filename) {
        res.status(400).json({ success: false, error: 'Se requieren platform y filename' });
        return;
    }
    await AppVersionService.deleteVersion(platform, filename);
    ok(res, { deleted: true });
}) as RequestHandler);

// ─── ADMIN: Update changelog text directly ──────────────────────────────────
// PATCH /api/app/admin/changelog
appVersionRouter.patch('/admin/changelog', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res: Response) => {
    const { platform, filename, changelog } = req.body;
    if (!platform || !filename) {
        res.status(400).json({ success: false, error: 'Se requieren platform y filename' });
        return;
    }
    await AppVersionService.updateChangelog(platform, filename, changelog || '');
    ok(res, { updated: true });
}) as RequestHandler);
