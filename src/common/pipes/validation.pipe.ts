import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
  ValidationError,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FieldError } from '../errors/api.error';

/**
 * AppValidationPipe — global DTO validation pipe with structured error output.
 *
 * Responsibility: Transforms and validates incoming request payloads against
 * class-validator-annotated DTO classes. Produces a structured FieldError[]
 * instead of NestJS's default flat message array. Applied globally in main.ts.
 *
 * transform() flow:
 * 1. If metatype is a primitive (String, Number, etc.) skip validation → return as-is.
 * 2. plainToInstance(metatype, value) — deserialize plain object into DTO class
 *    so class-transformer decorators (@Type, @Transform) are applied.
 * 3. validate(object, { whitelist, forbidNonWhitelisted }) — run class-validator.
 *    whitelist=true strips unknown properties.
 *    forbidNonWhitelisted=true throws if extra properties are present.
 * 4. If errors → extractFields() → throw BadRequestException with payload:
 *    { name, code: ERR_VALIDATION_FAILED, message, details, fields: FieldError[] }
 * 5. If valid → return the transformed DTO instance.
 *
 * extractFields() algorithm:
 *  - Iterates ValidationError[] recursively (handles nested DTOs via .children).
 *  - Builds dot-notated field names (e.g. "address.street").
 *  - Takes the first constraint message and key per field.
 *
 * shouldValidate(): returns false for primitive types (String, Boolean, Number,
 * Array, Object) so raw query params / route params bypass class-validator.
 *
 * Caught by: AllExceptionsFilter — normalizes the BadRequestException payload.
 * See also: FieldError → src/common/errors/api.error.ts
 */
@Injectable()
export class AppValidationPipe implements PipeTransform {
  async transform(value: unknown, { metatype }: ArgumentMetadata): Promise<unknown> {
    if (!metatype || !this.shouldValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      skipMissingProperties: false,
    });

    if (errors.length > 0) {
      const fields = this.extractFields(errors);
      throw new BadRequestException({
        name: 'ValidationError',
        code: 'ERR_VALIDATION_FAILED',
        message: 'The request contains invalid data.',
        details: `${fields.length} field(s) failed validation.`,
        fields,
      });
    }

    return object;
  }

  private extractFields(errors: ValidationError[], parentField = ''): FieldError[] {
    const fields: FieldError[] = [];

    for (const error of errors) {
      const fieldName = parentField ? `${parentField}.${error.property}` : error.property;

      if (error.constraints) {
        const messages = Object.values(error.constraints);
        fields.push({
          field: fieldName,
          message: messages[0] || 'Validation failed.',
          value: error.value,
          constraint: Object.keys(error.constraints)[0],
        });
      }

      if (error.children && error.children.length > 0) {
        fields.push(...this.extractFields(error.children, fieldName));
      }
    }

    return fields;
  }

  private shouldValidate(metatype: unknown): boolean {
    const primitives: unknown[] = [String, Boolean, Number, Array, Object];
    return !primitives.includes(metatype);
  }
}
