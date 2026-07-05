/**
 * Helpers for a "soft delete" convention where rows are marked with a
 * `deletedAt` timestamp instead of being physically removed. Assumes
 * your Prisma schema has a nullable `deletedAt DateTime?` column on the
 * relevant models.
 */

/** Merge a `deletedAt: null` filter into a where clause so queries only see non-deleted rows */
export function excludeSoftDeleted<W extends Record<string, any>>(where: W = {} as W): W & { deletedAt: null } {
  return { ...where, deletedAt: null };
}

/** Build the `data` payload for soft-deleting a row via `.update()` */
export function softDeletePayload(): { deletedAt: Date } {
  return { deletedAt: new Date() };
}

/** Build the `data` payload for restoring a soft-deleted row */
export function restorePayload(): { deletedAt: null } {
  return { deletedAt: null };
}

export interface SoftDeleteDelegate<T> {
  update(args: { where: any; data: any }): Promise<T>;
  findMany(args?: any): Promise<T[]>;
  findFirst(args?: any): Promise<T | null>;
}

/**
 * Thin wrapper around a delegate that automatically applies soft-delete
 * semantics: `delete()` sets deletedAt instead of removing the row, and
 * `findMany`/`findFirst` automatically exclude soft-deleted rows unless
 * `includeDeleted: true` is passed.
 */
export class SoftDeleteRepository<T> {
  constructor(private delegate: SoftDeleteDelegate<T>) {}

  async delete(id: any): Promise<T> {
    return this.delegate.update({ where: { id }, data: softDeletePayload() });
  }

  async restore(id: any): Promise<T> {
    return this.delegate.update({ where: { id }, data: restorePayload() });
  }

  findMany(args: { where?: Record<string, any>; includeDeleted?: boolean; [key: string]: any } = {}): Promise<T[]> {
    const { includeDeleted, where, ...rest } = args;
    return this.delegate.findMany({
      ...rest,
      where: includeDeleted ? where : excludeSoftDeleted(where),
    });
  }

  findFirst(args: { where?: Record<string, any>; includeDeleted?: boolean; [key: string]: any } = {}): Promise<T | null> {
    const { includeDeleted, where, ...rest } = args;
    return this.delegate.findFirst({
      ...rest,
      where: includeDeleted ? where : excludeSoftDeleted(where),
    });
  }
}
