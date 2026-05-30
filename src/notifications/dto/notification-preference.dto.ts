import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '../enum/notificationType.enum';
import { NotificationDigestMode } from '../entities/notification-preference.entity';

export class NotificationPreferenceUpdateDto {
  @IsEnum(NotificationType)
  notificationType: NotificationType;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsEnum(NotificationDigestMode)
  digestMode?: NotificationDigestMode;
}

export class BulkUpdateNotificationPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceUpdateDto)
  preferences: NotificationPreferenceUpdateDto[];
}

export class UnsubscribeTokenQueryDto {
  @IsString()
  token: string;
}
