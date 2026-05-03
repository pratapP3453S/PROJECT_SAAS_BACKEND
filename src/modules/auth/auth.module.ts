import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * AuthModule — feature module for all authentication flows.
 *
 * Responsibility: Wires the auth Controller → Service → Repository layer and
 * configures Passport + JWT for the access token strategy.
 *
 * Imports:
 *  PassportModule.register({ defaultStrategy: 'jwt' }) : sets 'jwt' as the
 *    default strategy so AuthGuard() can be used without specifying 'jwt' explicitly.
 *  JwtModule.registerAsync : loads jwt.secret and jwt.expiresIn from ConfigService
 *    so JwtService.signAsync() in AuthService can sign tokens without extra config.
 *
 * Providers:
 *  AuthService    : business logic (register, login, refresh, logout).
 *  AuthRepository : Prisma data access for the users table (auth-specific methods).
 *  JwtStrategy    : Passport strategy that validates Bearer tokens on each request.
 *
 * Exports:
 *  AuthService   : re-exported in case other modules need auth helpers.
 *  JwtModule     : re-exported so other modules can inject JwtService.
 *  PassportModule: re-exported for guard compatibility.
 *
 * Used by: AppModule → imports: [..., AuthModule]
 * See also:
 *  AuthController  → src/modules/auth/auth.controller.ts
 *  JwtStrategy     → src/modules/auth/strategies/jwt.strategy.ts
 *  JwtAuthGuard    → src/common/guards/jwt-auth.guard.ts
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
export class AuthModule {}
