# @stackhq/prisma

Prisma helpers: base repository pattern, transaction wrapper with retry,
offset & cursor pagination, and soft-delete utilities. Works against any
real `@prisma/client` delegate — the helpers are duck-typed, so no hard
dependency is required just to build against them.

```bash
npm install @stackhq/prisma @prisma/client
```

## Table of contents

- [BaseRepository](#baserepository)
- [Pagination](#pagination)
- [runTransaction](#runtransaction)
- [SoftDeleteRepository](#softdeleterepository)

---

## BaseRepository

Generic repository wrapping a Prisma model delegate (`prisma.user`,
`prisma.post`, etc.) with a consistent CRUD interface. Extend it per-model
to add domain-specific queries while inheriting the common ones.

```ts
class BaseRepository<T> {
  constructor(delegate: PrismaModelDelegate<T>);
  findById(id, args?): Promise<T | null>;
  findMany(args?): Promise<T[]>;
  findOne(where): Promise<T | null>;
  create(data): Promise<T>;
  update(id, data): Promise<T>;
  delete(id): Promise<T>;
  count(where?): Promise<number>;
  exists(where): Promise<boolean>;
}
```

### Example

```ts
import { BaseRepository } from "@stackhq/prisma";
import { PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

class UserRepository extends BaseRepository<User> {
  constructor() {
    super(prisma.user);
  }

  findByEmail(email: string) {
    return this.delegate.findFirst({ where: { email } });
  }
}

const users = new UserRepository();
await users.create({ email: "a@b.com", name: "Alice" });
await users.findById(1);
await users.exists({ email: "a@b.com" });
```

---

## Pagination

### paginateOffset — page-number pagination

Good for admin tables, "Page 3 of 10" style UIs.

```ts
paginateOffset<T>(
  delegate: PrismaModelDelegate<T>,
  params?: { page?: number; pageSize?: number; where?: object; orderBy?: object }
): Promise<{
  data: T[]; page: number; pageSize: number; totalCount: number;
  totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean;
}>
```

```ts
const result = await paginateOffset(prisma.user, {
  page: 2,
  pageSize: 20,
  where: { active: true },
});
```

### paginateCursor — cursor pagination

Stable under concurrent inserts/deletes — better for infinite scroll and
large datasets, since results don't shift when rows are added mid-list.

```ts
paginateCursor<T>(
  delegate: PrismaModelDelegate<T>,
  params?: { cursor?: any; take?: number; where?: object; orderBy?: object; cursorField?: string }
): Promise<{ data: T[]; nextCursor: any | null; hasNextPage: boolean }>
```

```ts
let cursor: number | undefined;
do {
  const { data, nextCursor, hasNextPage } = await paginateCursor(prisma.post, {
    cursor,
    take: 50,
  });
  await process(data);
  cursor = nextCursor;
  if (!hasNextPage) break;
} while (cursor);
```

---

## runTransaction

Wraps `prisma.$transaction` with automatic retry on transient write
conflicts/deadlocks (Prisma error code `P2034` by default).

```ts
runTransaction<T>(
  prisma: PrismaClientLike,
  fn: (tx) => Promise<T>,
  config?: { maxAttempts?: number; retryDelayMs?: number; retryableErrorCodes?: string[] }
): Promise<T>
```

### Example

```ts
import { runTransaction } from "@stackhq/prisma";

await runTransaction(prisma, async (tx) => {
  await tx.order.update({ where: { id }, data: { status: "paid" } });
  await tx.inventory.update({
    where: { sku },
    data: { qty: { decrement: 1 } },
  });
});
```

---

## SoftDeleteRepository

Convention helpers for soft-deleting rows (setting `deletedAt` instead of
physically removing them). Requires a nullable `deletedAt DateTime?` column
on the model.

```ts
excludeSoftDeleted(where?)     // merges { deletedAt: null } into a where clause
softDeletePayload()            // { deletedAt: new Date() }
restorePayload()                // { deletedAt: null }

class SoftDeleteRepository<T> {
  constructor(delegate: SoftDeleteDelegate<T>);
  delete(id): Promise<T>;    // sets deletedAt instead of removing the row
  restore(id): Promise<T>;  // clears deletedAt
  findMany(args?: { where?; includeDeleted?; [key]: any }): Promise<T[]>;
  findFirst(args?: { where?; includeDeleted?; [key]: any }): Promise<T | null>;
}
```

### Example

```ts
import { SoftDeleteRepository } from "@stackhq/prisma";

const posts = new SoftDeleteRepository(prisma.post);

await posts.delete(id); // sets deletedAt, row stays in the DB
await posts.findMany(); // excludes soft-deleted rows by default
await posts.findMany({ includeDeleted: true }); // include them explicitly
await posts.restore(id); // undo the soft delete
```
