import { Role } from '@prisma/client';

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithTimestamps<T> = T & {
  createdAt: Date;
  updatedAt: Date;
};

export type SoftDeletable<T> = T & {
  deletedAt: Date | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
};

export type SortOrder = 'asc' | 'desc';

export type UserRole = Role;

export type AsyncHandler<T = void> = (...args: unknown[]) => Promise<T>;

export type Constructor<T = object> = new (...args: unknown[]) => T;

export type PartialRecord<K extends keyof unknown, T> = Partial<Record<K, T>>;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];
