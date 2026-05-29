import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CreateDepositDto } from '../dtos/transaction.dto';

/**
 * Controller-level validation tests for POST /transactions/deposit.
 *
 * These tests exercise the ValidationPipe (configured identically to main.ts)
 * against CreateDepositDto to confirm that missing required fields produce
 * field-level 400 errors — not generic ones.
 */
describe('POST /transactions/deposit – DTO validation', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
  });

  async function validate(body: object): Promise<string[]> {
    const dto = plainToInstance(CreateDepositDto, body);
    try {
      await pipe.transform(dto, { type: 'body', metatype: CreateDepositDto });
      return [];
    } catch (err: any) {
      // ValidationPipe throws a BadRequestException whose response contains
      // the field-level message array.
      const response = err.getResponse?.() as { message?: string[] };
      return response?.message ?? [];
    }
  }

  it('passes with all required fields present', async () => {
    const errors = await validate({
      amount: 100,
      currency: 'XLM',
      sourceAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    });
    expect(errors).toHaveLength(0);
  });

  it('returns 400 with field-level error when sourceAddress is missing', async () => {
    const errors = await validate({ amount: 100, currency: 'XLM' });
    expect(errors.some((m) => m.includes('sourceAddress'))).toBe(true);
  });

  it('returns 400 with field-level error when amount is missing', async () => {
    const errors = await validate({
      currency: 'XLM',
      sourceAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    });
    expect(errors.some((m) => m.includes('amount'))).toBe(true);
  });

  it('returns 400 with field-level error when currency is missing', async () => {
    const errors = await validate({
      amount: 100,
      sourceAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    });
    expect(errors.some((m) => m.includes('currency'))).toBe(true);
  });

  it('returns 400 for all three fields when body is empty', async () => {
    const errors = await validate({});
    const fields = ['amount', 'currency', 'sourceAddress'];
    for (const field of fields) {
      expect(errors.some((m) => m.includes(field))).toBe(true);
    }
  });

  it('returns 400 when amount is below minimum (0.01)', async () => {
    const errors = await validate({
      amount: 0,
      currency: 'XLM',
      sourceAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    });
    expect(errors.some((m) => m.includes('amount'))).toBe(true);
  });
});
