import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KycRecord, KycStatus, KycTier } from './entities/kyc.entity';
import { ApproveKycDto } from './dtos/kyc-approve';
import { User } from '../users/user.entity';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationStatus } from '../notifications/entities/notification.entity';
import { FirebaseService } from '../firebase/firebase.service';
import { UserKycTier } from '../users/user.entity';
import { WebhookService } from '../webhooks/services/webhook.service';
import {
  STORAGE_SERVICE_TOKEN,
  StorageService,
} from '../modules/storage/storage.service';
import { scanBuffer } from '../common/helpers/virus-scanner.helper';

const SIGNED_URL_EXPIRY_SECONDS = 900;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KycRecord)
    private kycRepository: Repository<KycRecord>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly firebaseService: FirebaseService,
    private readonly webhookService: WebhookService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: StorageService,
  ) {}

  async submitKyc(
    userId: string,
    dto: SubmitKycDto,
    files: {
      documentFront?: Express.Multer.File;
      documentBack?: Express.Multer.File;
      selfie?: Express.Multer.File;
    },
  ) {
    // Check for active submission
    const existingActiveKyc = await this.kycRepository.findOne({
      where: [
        { userId, status: KycStatus.PENDING },
        { userId, status: KycStatus.UNDER_REVIEW },
      ],
    });

    if (existingActiveKyc) {
      throw new BadRequestException(
        'You already have a KYC submission under review.',
      );
    }

    if (!files.documentFront) {
      throw new BadRequestException('documentFront file is required');
    }

    if (!files.selfie) {
      throw new BadRequestException('selfie file is required');
    }

    const storagePath = `kyc/${userId}`;

    // Virus scan all files before uploading
    await scanBuffer(files.documentFront.buffer);
    if (files.documentBack) {
      await scanBuffer(files.documentBack.buffer);
    }
    await scanBuffer(files.selfie.buffer);

    // Upload to storage backend — returns storage keys, never raw paths/URLs
    const documentFrontKey = await this.storageService.upload(
      files.documentFront,
      storagePath,
    );

    const documentBackKey = files.documentBack
      ? await this.storageService.upload(files.documentBack, storagePath)
      : undefined;

    const selfieKey = await this.storageService.upload(
      files.selfie,
      storagePath,
    );

    const newKyc = this.kycRepository.create({
      userId,
      ...dto,
      documentFrontKey,
      documentBackKey,
      selfieKey,
      status: KycStatus.PENDING,
      tier: KycTier.TIER_0,
      submittedAt: new Date(),
    });

    await this.kycRepository.save(newKyc);

    return {
      message: 'KYC submitted successfully',
      status: newKyc.status,
      tier: newKyc.tier,
    };
  }

  async approveKyc(
    id: string,
    approveKycDto: ApproveKycDto,
  ): Promise<KycRecord> {
    const kyc = await this.kycRepository.findOne({ where: { id } });
    if (!kyc) {
      throw new NotFoundException('KYC verification not found');
    }

    if (kyc.status !== KycStatus.PENDING) {
      throw new BadRequestException(
        'KYC verification has already been processed',
      );
    }

    kyc.status = approveKycDto.status;
    if (
      approveKycDto.status === KycStatus.REJECTED &&
      approveKycDto.rejectionReason
    ) {
      kyc.rejectionReason = approveKycDto.rejectionReason;
    }

    return this.kycRepository.save(kyc);
  }

  async getKycStatus(userId: string) {
    const latestKyc = await this.kycRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!latestKyc) {
      return { status: 'not_submitted', tier: 0 };
    }

    return {
      status: latestKyc.status,
      tier: latestKyc.tier,
      rejectionReason: latestKyc.rejectionReason,
    };
  }

  async getPendingKycSubmissions(): Promise<KycRecord[]> {
    return this.kycRepository.find({
      where: { status: KycStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  /** Returns pending KYC submissions with signed URLs for admin review */
  async listPendingKycWithUrls(): Promise<object[]> {
    const records = await this.kycRepository.find({
      where: { status: KycStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(records.map((r) => this.toReviewDto(r)));
  }

  async findByUserId(userId: string): Promise<KycRecord[]> {
    return this.kycRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async reviewKyc(kycId: string, decision: KycStatus, reason?: string) {
    return this.dataSource.transaction(async (manager) => {
      const kyc = await manager.findOne(KycRecord, { where: { id: kycId } });

      if (!kyc) throw new BadRequestException('KYC record not found');

      if (
        kyc.status === KycStatus.APPROVED ||
        kyc.status === KycStatus.REJECTED
      ) {
        throw new BadRequestException('KYC already reviewed');
      }

      if (
        decision !== KycStatus.APPROVED &&
        decision !== KycStatus.REJECTED
      ) {
        throw new BadRequestException('Invalid decision');
      }

      const user = await manager.findOne(User, { where: { id: kyc.userId } });
      if (!user) throw new BadRequestException('User not found');

      let notificationPayload: Partial<Notification>;

      if (decision === KycStatus.APPROVED) {
        kyc.status = KycStatus.APPROVED;
        const tier = this.resolveUserKycTier(kyc);
        kyc.tier =
          tier === UserKycTier.BASIC
            ? KycTier.TIER_1
            : tier === UserKycTier.UNVERIFIED
              ? KycTier.TIER_0
              : KycTier.TIER_2;
        kyc.reviewedAt = new Date();
        user.isVerified = true;
        user.kycTier = tier;

        notificationPayload = {
          userId: user.id,
          type: NotificationType.SYSTEM,
          title: 'KYC Approved',
          message:
            'Your identity verification has been approved. You now have full access to higher transaction limits.',
          status: NotificationStatus.UNREAD,
          relatedId: kyc.id,
          metadata: { entity: 'KYC', kycStatus: 'approved', tier },
        };
      } else {
        kyc.status = KycStatus.REJECTED;
        kyc.rejectionReason = reason || 'KYC rejected';
        kyc.reviewedAt = new Date();
        user.isVerified = false;
        user.kycTier = UserKycTier.UNVERIFIED;

        notificationPayload = {
          userId: user.id,
          type: NotificationType.SYSTEM,
          title: 'KYC Rejected',
          message: `Your KYC submission was rejected. Reason: ${kyc.rejectionReason}`,
          status: NotificationStatus.UNREAD,
          relatedId: kyc.id,
          metadata: {
            entity: 'KYC',
            kycStatus: 'rejected',
            reason: kyc.rejectionReason,
          },
        };
      }

      await manager.save(kyc);
      await manager.save(user);
      await manager.save(Notification, notificationPayload);

      if (user.fcmTokens && user.fcmTokens.length > 0) {
        this.firebaseService
          .sendToTokens(
            user.fcmTokens,
            notificationPayload.title!,
            notificationPayload.message!,
            { entity: 'KYC', kycStatus: decision.toLowerCase() },
          )
          .catch((err) =>
            this.logger.error(`Failed to send KYC FCM: ${err.message}`),
          );
      }

      if (decision === KycStatus.APPROVED) {
        this.webhookService
          .dispatch('kyc.approved', kyc, user.id)
          .catch((err) =>
            this.logger.error(`Webhook dispatch failed: ${err.message}`),
          );
      } else if (decision === KycStatus.REJECTED) {
        this.webhookService
          .dispatch('kyc.rejected', kyc, user.id)
          .catch((err) =>
            this.logger.error(`Webhook dispatch failed: ${err.message}`),
          );
      }

      return {
        message: `KYC ${decision} successfully`,
      };
    });
  }

  /** Convert a KycRecord to a review DTO with temporary signed URLs */
  async toReviewDto(kyc: KycRecord): Promise<object> {
    const [documentFrontUrl, selfieUrl, documentBackUrl] = await Promise.all([
      this.storageService.getSignedUrl(
        kyc.documentFrontKey,
        SIGNED_URL_EXPIRY_SECONDS,
      ),
      this.storageService.getSignedUrl(
        kyc.selfieKey,
        SIGNED_URL_EXPIRY_SECONDS,
      ),
      kyc.documentBackKey
        ? this.storageService.getSignedUrl(
            kyc.documentBackKey,
            SIGNED_URL_EXPIRY_SECONDS,
          )
        : Promise.resolve(null),
    ]);

    return {
      id: kyc.id,
      userId: kyc.userId,
      status: kyc.status,
      tier: kyc.tier,
      fullName: kyc.fullName,
      dateOfBirth: kyc.dateOfBirth,
      nationality: kyc.nationality,
      documentType: kyc.documentType,
      documentNumber: kyc.documentNumber,
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
      rejectionReason: kyc.rejectionReason,
      submittedAt: kyc.submittedAt,
      reviewedAt: kyc.reviewedAt,
      createdAt: kyc.createdAt,
    };
  }

  private resolveUserKycTier(kyc: KycRecord): UserKycTier {
    const hasId = !!kyc.documentFrontKey;
    const hasSelfie = !!kyc.selfieKey;
    const hasProofOfAddress = !!kyc.documentBackKey;

    if (hasId && hasSelfie && hasProofOfAddress) return UserKycTier.FULL;
    if (hasId && hasSelfie) return UserKycTier.ENHANCED;
    if (hasId) return UserKycTier.BASIC;
    return UserKycTier.UNVERIFIED;
  }
}
