import { Module, BadRequestException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycRecord } from './entities/kyc.entity';
import { KycEmailService } from './kyc-email.service';
import { KycGuard } from '../common/guards/kyc.guard';
import { User } from '../users/user.entity';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage, StorageEngine } from 'multer';
import { join } from 'path';
import * as fs from 'fs';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { FirebaseModule } from '../firebase/firebase.module';

// runtime type guard to satisfy strict ESLint rules about unsafe member access
function isMulterFile(x: unknown): x is Express.Multer.File {
  if (typeof x !== 'object' || x === null) return false;
  const rec = x as Record<string, unknown>;
  return (
    typeof rec.originalname === 'string' && typeof rec.mimetype === 'string'
  );
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Shared destination builder
function buildDiskDestination(
  req: Request & {
    user?: { userId?: string };
    kycUploadVersion?: string;
  },
  _file: unknown,
  cb: (err: Error | null, destination: string) => void,
): void {
  try {
    const userId = req.user?.userId ?? 'anonymous';
    const version = Date.now().toString();
    const uploadPath = join(process.cwd(), 'uploads', 'kyc', userId, version);
    fs.mkdirSync(uploadPath, { recursive: true });
    req.kycUploadVersion = version;
    cb(null, uploadPath);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    cb(e, '');
  }
}

// Shared filename builder
function buildFilename(
  _req: Request,
  file: unknown,
  cb: (err: Error | null, filename: string) => void,
): void {
  if (!isMulterFile(file)) {
    return cb(
      new BadRequestException('Invalid file uploaded'),
      `${randomUUID()}`,
    );
  }
  const multerFile = file;
  const original = multerFile.originalname ?? '';
  const idx = original.lastIndexOf('.');
  const ext = idx >= 0 ? original.substring(idx) : '';
  cb(null, `${randomUUID()}${ext}`);
}

// Shared file type filter
function fileFilter(
  _req: Request,
  file: unknown,
  cb: (err: Error | null, acceptFile: boolean) => void,
): void {
  if (!isMulterFile(file)) {
    return cb(new BadRequestException('Invalid file uploaded'), false);
  }
  const multerFile = file;
  const mimetype = multerFile.mimetype ?? '';
  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    return cb(
      new BadRequestException(
        `Invalid file type: ${mimetype}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      ),
      false,
    );
  }
  cb(null, true);
}

@Module({
  imports: [
    TypeOrmModule.forFeature([KycRecord, User]),
    WebhooksModule,
    FirebaseModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const storageProvider =
          configService.get<string>('STORAGE_PROVIDER') ?? 'local';

        // When STORAGE_PROVIDER=s3, you can swap to S3-compatible storage here.
        // Requires: npm install multer-s3 @aws-sdk/client-s3
        // Then import:
        //   import multerS3 from 'multer-s3';
        //   import { S3Client } from '@aws-sdk/client-s3';
        // And return:
        //   storage: multerS3({
        //     s3: new S3Client({
        //       region: configService.get('AWS_REGION'),
        //       credentials: { ... }
        //     }),
        //     bucket: configService.get('S3_BUCKET'),
        //     key: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
        //   }),
        const useS3 = storageProvider === 's3';

        const storage: StorageEngine = useS3
          ? // Fallback to disk storage until S3 is configured
            diskStorage({
              destination: buildDiskDestination,
              filename: buildFilename,
            })
          : diskStorage({
              destination: buildDiskDestination,
              filename: buildFilename,
            });

        return {
          storage,
          fileFilter,
          limits: { fileSize: 5 * 1024 * 1024 },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [KycController],
  providers: [KycService, KycEmailService, KycGuard],
  exports: [
    KycService,
    KycEmailService,
    KycGuard,
    TypeOrmModule.forFeature([KycRecord]),
  ],
})
export class KycModule {}
