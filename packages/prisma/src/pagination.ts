import { PrismaModelDelegate } from "./delegate";

export interface OffsetPageParams {
  page?: number; // 1-indexed
  pageSize?: number;
  where?: Record<string, any>;
  orderBy?: Record<string, any> | Record<string, any>[];
}

export interface OffsetPageResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Classic page-number pagination (good for admin tables, "Page 3 of 10" UIs) */
export async function paginateOffset<T>(
  delegate: PrismaModelDelegate<T>,
  params: OffsetPageParams = {}
): Promise<OffsetPageResult<T>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 20);
  const where = params.where ?? {};

  const [data, totalCount] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: params.orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    delegate.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    data,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export interface CursorPageParams {
  cursor?: any; // last-seen ID (or unique field value) from the previous page
  take?: number;
  where?: Record<string, any>;
  orderBy?: Record<string, any>;
  cursorField?: string; // defaults to "id"
}

export interface CursorPageResult<T> {
  data: T[];
  nextCursor: any | null;
  hasNextPage: boolean;
}

/** Cursor-based pagination (stable under inserts/deletes — good for infinite scroll & large datasets) */
export async function paginateCursor<T>(
  delegate: PrismaModelDelegate<T>,
  params: CursorPageParams = {}
): Promise<CursorPageResult<T>> {
  const take = params.take ?? 20;
  const cursorField = params.cursorField ?? "id";

  const queryArgs: Record<string, any> = {
    where: params.where ?? {},
    orderBy: params.orderBy ?? { [cursorField]: "asc" },
    take: take + 1, // fetch one extra to know if there's a next page
  };

  if (params.cursor !== undefined) {
    queryArgs.cursor = { [cursorField]: params.cursor };
    queryArgs.skip = 1; // skip the cursor record itself
  }

  const results = await delegate.findMany(queryArgs);
  const hasNextPage = results.length > take;
  const data = hasNextPage ? results.slice(0, take) : results;
  const nextCursor = hasNextPage ? (data[data.length - 1] as any)[cursorField] : null;

  return { data, nextCursor, hasNextPage };
}
