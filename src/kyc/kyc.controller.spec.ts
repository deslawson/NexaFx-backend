import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ResubmitKycDto } from './dtos/kyc-resubmit';
import { DocumentType } from './entities/kyc.entity';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import type { Request } from 'express';
import { Readable } from 'stream';

describe('KycController', () => {
  let controller: KycController;
  let serviceMock: KycService;
  let submitSpy: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;
  let resubmitSpy: jest.Mock<
    Promise<unknown>,
    [string, Record<string, unknown>]
  >;

  beforeEach(() => {
    submitSpy = jest
      .fn<Promise<unknown>, [string, Record<string, unknown>]>()
      .mockResolvedValue({ message: 'ok' });
    resubmitSpy = jest
      .fn<Promise<unknown>, [string, Record<string, unknown>]>()
      .mockResolvedValue({ message: 'ok' });
    serviceMock = {
      submitKyc: submitSpy,
      resubmitKyc: resubmitSpy,
      getKycStatus: jest.fn().mockResolvedValue({ status: 'not_submitted' }),
    } as unknown as KycService;

    controller = new KycController(serviceMock);
  });

  it('should call submitKyc with documentFrontUrl and selfieUrl when files provided', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const filesForController: {
      documentFront?: Express.Multer.File[];
      documentBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    } = {
      documentFront: [
        {
          fieldname: 'documentFront',
          originalname: 'front.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 1024,
          destination: '',
          filename: 'front.jpg',
          path: '',
          buffer: Buffer.from([]),
          stream: new Readable(),
        },
      ],
      selfie: [
        {
          fieldname: 'selfie',
          originalname: 'selfie.png',
          encoding: '7bit',
          mimetype: 'image/png',
          size: 2048,
          destination: '',
          filename: 'selfie.png',
          path: '',
          buffer: Buffer.from([]),
          stream: new Readable(),
        },
      ],
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'X',
    };

    const reqForController = { kycUploadVersion: 'v1' } as unknown as Request;
    await controller.submitKyc(user, filesForController, dto, reqForController);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const calledArgs = submitSpy.mock.calls as [
      string,
      { documentFrontUrl?: string; selfieUrl?: string },
    ][];
    const payload = calledArgs[0][1];
    expect(payload.documentFrontUrl!.replace(/\\/g, '/')).toContain(
      'uploads/kyc/user-123/v1',
    );
    expect(payload.selfieUrl!.replace(/\\/g, '/')).toContain(
      'uploads/kyc/user-123/v1',
    );
  });

  it('should call resubmitKyc when resubmission is submitted with files', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-456',
      email: 'test@example.com',
      role: 'user',
    };

    const filesForController: {
      documentFront?: Express.Multer.File[];
      documentBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    } = {
      documentFront: [
        {
          fieldname: 'documentFront',
          originalname: 'front.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 1024,
          destination: '',
          filename: 'new-front.jpg',
          path: '',
          buffer: Buffer.from([]),
          stream: new Readable(),
        },
      ],
      selfie: [
        {
          fieldname: 'selfie',
          originalname: 'selfie.png',
          encoding: '7bit',
          mimetype: 'image/png',
          size: 2048,
          destination: '',
          filename: 'new-selfie.png',
          path: '',
          buffer: Buffer.from([]),
          stream: new Readable(),
        },
      ],
    };

    const dto: ResubmitKycDto = {
      fullName: 'Test User Updated',
      documentType: DocumentType.NATIONAL_ID,
      documentNumber: 'XYZ789',
      dateOfBirth: new Date().toISOString(),
      nationality: 'Y',
    };

    const reqForController = {
      kycUploadVersion: 'v2',
    } as unknown as Request;
    await controller.resubmitKyc(
      user,
      filesForController,
      dto,
      reqForController,
    );

    expect(resubmitSpy).toHaveBeenCalledTimes(1);
    const calledArgs = resubmitSpy.mock.calls as [
      string,
      { documentFrontUrl?: string; selfieUrl?: string },
    ][];
    const payload = calledArgs[0][1];
    expect(payload.documentFrontUrl!.replace(/\\/g, '/')).toContain(
      'uploads/kyc/user-456/v2',
    );
    expect(payload.selfieUrl!.replace(/\\/g, '/')).toContain(
      'uploads/kyc/user-456/v2',
    );
  });

  it('should return KYC status for authenticated user', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-789',
      email: 'test@example.com',
      role: 'user',
    };

    const result = await controller.getKycStatus(user);
    expect(result).toEqual({ status: 'not_submitted' });
  });
});
