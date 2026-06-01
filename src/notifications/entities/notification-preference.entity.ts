import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { NotificationType } from '../enum/notificationType.enum';

export enum NotificationDigestMode {
  IMMEDIATE = 'IMMEDIATE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
}

@Index(['userId', 'notificationType'], { unique: true })
@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  notificationType: NotificationType;

  @Column({ type: 'boolean', default: true })
  emailEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  pushEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  inAppEnabled: boolean;

  @Column({
    type: 'enum',
    enum: NotificationDigestMode,
    default: NotificationDigestMode.IMMEDIATE,
  })
  digestMode: NotificationDigestMode;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
