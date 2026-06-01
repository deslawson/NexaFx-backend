import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationPreferences1760000000000 implements MigrationInterface {
  name = 'CreateNotificationPreferences1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(`
      CREATE TYPE "public"."notification_preferences_notificationtype_enum" AS ENUM(
        'SYSTEM',
        'PROJECT',
        'TRANSACTION',
        'OTP',
        'MESSAGING',
        'CONTRIBUTION',
        'INVITATION',
        'SWAP_COMPLETED',
        'WALLET_UPDATED',
        'TRANSACTION_FAILED',
        'DEPOSIT_CONFIRMED',
        'WITHDRAWAL_PROCESSED',
        'REFERRAL_REWARDED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."notification_preferences_digestmode_enum" AS ENUM(
        'IMMEDIATE',
        'DAILY',
        'WEEKLY'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "notificationType" "public"."notification_preferences_notificationtype_enum" NOT NULL,
        "emailEnabled" boolean NOT NULL DEFAULT true,
        "pushEnabled" boolean NOT NULL DEFAULT true,
        "inAppEnabled" boolean NOT NULL DEFAULT true,
        "digestMode" "public"."notification_preferences_digestmode_enum" NOT NULL DEFAULT 'IMMEDIATE',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_preferences_user_type" UNIQUE ("userId", "notificationType"),
        CONSTRAINT "FK_notification_preferences_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('notification_preferences'))) {
      return;
    }

    await queryRunner.query('DROP TABLE "notification_preferences"');
    await queryRunner.query(
      'DROP TYPE "public"."notification_preferences_digestmode_enum"',
    );
    await queryRunner.query(
      'DROP TYPE "public"."notification_preferences_notificationtype_enum"',
    );
  }
}
