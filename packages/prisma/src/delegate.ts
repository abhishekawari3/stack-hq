/**
 * Minimal shape of a Prisma model delegate (e.g. `prisma.user`). Any
 * real Prisma-generated delegate satisfies this structurally, so these
 * helpers compile and run without requiring @prisma/client as a hard
 * dependency — just pass your real `prisma.<model>` delegate in.
 */
export interface PrismaModelDelegate<T = any> {
  findMany(args?: any): Promise<T[]>;
  findUnique(args: { where: any; [key: string]: any }): Promise<T | null>;
  findFirst(args?: any): Promise<T | null>;
  create(args: { data: any; [key: string]: any }): Promise<T>;
  update(args: { where: any; data: any; [key: string]: any }): Promise<T>;
  delete(args: { where: any; [key: string]: any }): Promise<T>;
  count(args?: any): Promise<number>;
}

/** Minimal shape of a PrismaClient — just enough for $transaction */
export interface PrismaClientLike {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
  $transaction<T>(operations: Promise<T>[]): Promise<T[]>;
}
