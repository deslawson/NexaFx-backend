import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { DocumentType } from './entities/kyc.entity';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Readable } from 'stream';

describe('KycController', () => {
  let controller: KycController;
  let serviceMock: Partial<KycService>;
  let submitSpy: jest.Mock;

  const buildMulterFile = (
    fieldname: string,
    originalname: string,
    mimetype: string,
  ): Express.Multer.File => ({
    fieldname,
    originalname,
    encoding: '7bit',
    mimetype,
    size: 1024,
    destination: '',
    filename: originalname,
    path: '',
    buffer: Buffer.from([0xff, 0xd8, 0xff]), // JPEG magic bytes
    stream: new Readable(),
  });

  beforeEach(() => {
    submitSpy = jest.fn().mockResolvedValue({ message: 'ok', status: 'pending', tier: 0 });
    serviceMock = { submitKyc: submitSpy };
    controller = new KycController(serviceMock as KycService);
  });

  it('should call service with extracted file objects when files are provided', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const files = {
      documentFront: [buildMulterFile('documentFront', 'front.jpg', 'image/jpeg')],
      selfie: [buildMulterFile('selfie', 'selfie.jpg', 'image/jpeg')],
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'NG',
    };

    await controller.submitKyc(user, files, dto);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const [calledUserId, calledDto, calledFiles] = submitSpy.mock.calls[0] as [
      string,
      SubmitKycDto,
      { documentFront: Express.Multer.File; selfie: Express.Multer.File },
    ];
    expect(calledUserId).toBe('user-123');
    expect(calledFiles.documentFront).toBeDefined();
    expect(calledFiles.selfie).toBeDefined();
    expect(calledDto.fullName).toBe('Test User');
  });

  it('should throw BadRequestException when documentFront is missing', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'NG',
    };

    await expect(controller.submitKyc(user, {}, dto)).rejects.toThrow(
      'documentFront file is required',
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when selfie is missing', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const files = {
      documentFront: [buildMulterFile('documentFront', 'front.jpg', 'image/jpeg')],
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'NG',
    };

    await expect(controller.submitKyc(user, files, dto)).rejects.toThrow(
      'selfie file is required',
    );
  });
});
