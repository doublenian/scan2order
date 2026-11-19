import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../../context.js';
import { badRequest } from '../../domain/errors.js';
import { success } from '../../middleware/error-handler.js';

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

export function createUploadsRouter(ctx: AppContext): Router {
  const router = Router();
  mkdirSync(ctx.config.uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, ctx.config.uploadDir),
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${ALLOWED.get(file.mimetype) ?? '.bin'}`),
    }),
    limits: { fileSize: ctx.config.maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED.has(file.mimetype)) {
        callback(badRequest('仅支持 JPG / PNG / WEBP 图片'));
        return;
      }
      callback(null, true);
    },
  });

  const single = upload.single('file');
  router.post('/admin/uploads', (req, res, next) => {
    single(req, res, (error) => {
      if (error) {
        next(badRequest(error instanceof Error ? error.message : '上传失败'));
        return;
      }
      if (!req.file) {
        next(badRequest('请选择要上传的图片文件'));
        return;
      }
      success(res, {
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename,
        size: req.file.size,
        ext: extname(req.file.filename),
      }, 'created', 201);
    });
  });

  return router;
}
