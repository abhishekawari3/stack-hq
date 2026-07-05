# @stack-hq/prisma

Prisma helpers: base repository pattern, transaction wrapper with retry-on-conflict, offset & cursor pagination, and soft-delete utilities. Works with any real `@prisma/client` delegate — no hard dependency required to build against.

## Install
```bash
npm install @stack-hq/prisma @prisma/client
```

## Usage
```ts
import { BaseRepository, paginateOffset, paginateCursor, runTransaction, SoftDeleteRepository } from "@stack-hq/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

class UserRepository extends BaseRepository<User> {
  constructor() { super(prisma.user); }
  findByEmail(email: string) { return this.delegate.findFirst({ where: { email } }); }
}

const page = await paginateOffset(prisma.user, { page: 1, pageSize: 20 });
const { data, nextCursor } = await paginateCursor(prisma.post, { take: 20 });

await runTransaction(prisma, async (tx) => {
  await tx.order.update({ where: { id }, data: { status: "paid" } });
  await tx.inventory.update({ where: { sku }, data: { qty: { decrement: 1 } } });
});

const posts = new SoftDeleteRepository(prisma.post); // requires a `deletedAt DateTime?` column
await posts.delete(id); // sets deletedAt instead of removing the row
```

## License
MIT
