import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../shared/constants/app.constants';

/**
 * @Public() — marks a route or controller as publicly accessible.
 *
 * Skips the global JwtAuthGuard so no Bearer token is required.
 * Applied at the method level to exempt specific routes within an
 * otherwise protected controller.
 *
 * Mechanism: Sets IS_PUBLIC_KEY metadata to `true`. JwtAuthGuard
 * reads this via Reflector.getAllAndOverride() in canActivate().
 *
 * Usage:
 *  @Public()
 *  @Post('register')
 *  async register() { ... }
 *
 * Used on: AuthController (register, login, refresh)
 *          HealthController (health, ping)
 * See also: JwtAuthGuard → src/core/guards/jwt-auth.guard.ts
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
