import { IsString } from 'class-validator';

export class CreateCardDto {
  @IsString()
  id: string;
}
