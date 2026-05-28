import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppModule } from '../app.module';

describe('AuthController (validation & responses)', () => {
  let app: INestApplication;

  const mockAuthService = {
    refreshAccessToken: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for empty body', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({})
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('returns 401 when AuthService throws UnauthorizedException', () => {
    mockAuthService.refreshAccessToken.mockImplementationOnce(() => {
      const err: any = new Error('Unauthorized');
      err.status = HttpStatus.UNAUTHORIZED;
      throw err;
    });

    return request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'expired-token' })
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('returns 200 with access token when AuthService succeeds', () => {
    mockAuthService.refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'new-token',
      expiresIn: 3600,
    });

    return request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'valid-token' })
      .expect(HttpStatus.OK)
      .expect((res) => {
        if (!res.body.accessToken) throw new Error('missing accessToken');
      });
  });
});
