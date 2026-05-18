import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from '../../application/use-cases/auth.service';
import { AuthRepository } from '../../infrastructure/prisma/auth.repository';
import { JwtStrategy } from '../../infrastructure/jwt/jwt.strategy';

/**
 * AuthV1Module — v1 API surface for the auth feature.
 *
 * Wires the v1 AuthController together with everything the auth flow needs:
 *  - Application: AuthService (use-cases)
 *  - Infrastructure: AuthRepository (Prisma), JwtStrategy (Passport)
 *  - Framework: PassportModule + JwtModule for signing
 *
 * Imported by: AuthModule
 *
 * Re-exports JwtModule + PassportModule so feature modules that need to issue
 * tokens directly (rare) can inject JwtService.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn', '7d'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthV1Module {}
