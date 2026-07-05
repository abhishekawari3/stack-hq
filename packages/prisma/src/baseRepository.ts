import { PrismaModelDelegate } from "./delegate";

/**
 * Generic repository wrapping a Prisma model delegate with a consistent
 * CRUD interface. Extend this per-model to add domain-specific query
 * methods while inheriting the common ones for free.
 *
 * Example:
 *   class UserRepository extends BaseRepository<User> {
 *     constructor(prisma: PrismaClient) { super(prisma.user); }
 *     findByEmail(email: string) { return this.delegate.findFirst({ where: { email } }); }
 *   }
 */
export class BaseRepository<T> {
  constructor(protected delegate: PrismaModelDelegate<T>) {}

  findById(id: any, args: Record<string, any> = {}): Promise<T | null> {
    return this.delegate.findUnique({ where: { id }, ...args });
  }

  findMany(args: Record<string, any> = {}): Promise<T[]> {
    return this.delegate.findMany(args);
  }

  findOne(where: Record<string, any>): Promise<T | null> {
    return this.delegate.findFirst({ where });
  }

  create(data: Record<string, any>): Promise<T> {
    return this.delegate.create({ data });
  }

  update(id: any, data: Record<string, any>): Promise<T> {
    return this.delegate.update({ where: { id }, data });
  }

  delete(id: any): Promise<T> {
    return this.delegate.delete({ where: { id } });
  }

  count(where: Record<string, any> = {}): Promise<number> {
    return this.delegate.count({ where });
  }

  exists(where: Record<string, any>): Promise<boolean> {
    return this.count(where).then((c) => c > 0);
  }
}
