import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ResubmitKycDto } from './dtos/kyc-resubmit';
import { KycRecord } from './entities/kyc.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { join } from 'path';

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit KYC verification' })
  @ApiBody({ type: SubmitKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'documentFront', maxCount: 1 },
      { name: 'documentBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  @ApiResponse({
    status: 201,
    description: 'KYC submission successful',
    type: KycRecord,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, wrong file type/size, or existing submission',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async submitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles()
    files: Partial<
      Record<
        'documentFront' | 'documentBack' | 'selfie',
        { filename: string }[]
      >
    >,
    @Body() dto: SubmitKycDto,
    @Req() req: Request,
  ) {
    const anyReq = req as unknown as Record<string, unknown> & {
      fileValidationError?: string;
      kycUploadVersion?: string;
    };
    if (anyReq.fileValidationError) {
      throw new BadRequestException(anyReq.fileValidationError);
    }

    // Required files
    if (!files?.documentFront || files.documentFront.length === 0) {
      throw new BadRequestException('documentFront file is required');
    }

    if (!files?.selfie || files.selfie.length === 0) {
      throw new BadRequestException('selfie file is required');
    }

    // Compute stored relative paths
    const version = anyReq.kycUploadVersion ?? '';
    const userId = user.userId;
    const base = join('uploads', 'kyc', userId, version);

    const documentFrontUrl: string | undefined =
      files.documentFront && files.documentFront[0]
        ? join(base, files.documentFront[0].filename)
        : undefined;

    const documentBackUrl: string | undefined =
      files.documentBack && files.documentBack[0]
        ? join(base, files.documentBack[0].filename)
        : undefined;

    const selfieUrl: string | undefined =
      files.selfie && files.selfie[0]
        ? join(base, files.selfie[0].filename)
        : undefined;

    const payload: SubmitKycDto & {
      documentFrontUrl?: string;
      documentBackUrl?: string;
      selfieUrl?: string;
    } = {
      ...dto,
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
    };

    return this.kycService.submitKyc(user.userId, payload);
  }

  @Post('resubmit')
  @ApiOperation({
    summary: 'Resubmit KYC verification',
    description:
      'Resubmit KYC documents. Only allowed when status is RESUBMISSION_REQUIRED.',
  })
  @ApiBody({ type: ResubmitKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'documentFront', maxCount: 1 },
      { name: 'documentBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  @ApiResponse({
    status: 201,
    description: 'KYC resubmission successful',
  })
  @ApiResponse({
    status: 400,
    description: 'Not in RESUBMISSION_REQUIRED status, wrong file type/size',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async resubmitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles()
    files: Partial<
      Record<
        'documentFront' | 'documentBack' | 'selfie',
        { filename: string }[]
      >
    >,
    @Body() dto: ResubmitKycDto,
    @Req() req: Request,
  ) {
    const anyReq = req as unknown as Record<string, unknown> & {
      fileValidationError?: string;
      kycUploadVersion?: string;
    };
    if (anyReq.fileValidationError) {
      throw new BadRequestException(anyReq.fileValidationError);
    }

    if (!files?.documentFront || files.documentFront.length === 0) {
      throw new BadRequestException('documentFront file is required');
    }

    if (!files?.selfie || files.selfie.length === 0) {
      throw new BadRequestException('selfie file is required');
    }

    const version = anyReq.kycUploadVersion ?? '';
    const userId = user.userId;
    const base = join('uploads', 'kyc', userId, version);

    const documentFrontUrl: string | undefined =
      files.documentFront && files.documentFront[0]
        ? join(base, files.documentFront[0].filename)
        : undefined;

    const documentBackUrl: string | undefined =
      files.documentBack && files.documentBack[0]
        ? join(base, files.documentBack[0].filename)
        : undefined;

    const selfieUrl: string | undefined =
      files.selfie && files.selfie[0]
        ? join(base, files.selfie[0].filename)
        : undefined;

    const payload: ResubmitKycDto & {
      documentFrontUrl?: string;
      documentBackUrl?: string;
      selfieUrl?: string;
    } = {
      ...dto,
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
    };

    return this.kycService.resubmitKyc(user.userId, payload);
  }

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status" })
  @ApiResponse({
    status: 200,
    description: 'KYC status retrieved successfully',
    type: 'object',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getKycStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.kycService.getKycStatus(user.userId);
  }
}
