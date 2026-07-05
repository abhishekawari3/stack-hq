export interface Command<T = any> {
  type: string;
  payload: T;
}

export interface Query<T = any> {
  type: string;
  payload: T;
}

export type CommandHandler<T = any, R = any> = (command: Command<T>) => Promise<R> | R;
export type QueryHandler<T = any, R = any> = (query: Query<T>) => Promise<R> | R;

/**
 * CQRS (Command Query Responsibility Segregation) bus: commands mutate
 * state and return minimal/no data, queries read state and never mutate.
 * Each command type has exactly one handler (single writer); queries can
 * have exactly one handler each too, but are conceptually served from
 * read-optimized models/projections (see EventSourcing's projections).
 */
export class CommandBus {
  private handlers = new Map<string, CommandHandler>();
  private middlewares: Array<(cmd: Command, next: () => Promise<any>) => Promise<any>> = [];

  register<T, R>(type: string, handler: CommandHandler<T, R>): void {
    if (this.handlers.has(type)) {
      throw new Error(`Command handler already registered for "${type}"`);
    }
    this.handlers.set(type, handler as CommandHandler);
  }

  use(middleware: (cmd: Command, next: () => Promise<any>) => Promise<any>): void {
    this.middlewares.push(middleware);
  }

  async dispatch<T = any, R = any>(command: Command<T>): Promise<R> {
    const handler = this.handlers.get(command.type);
    if (!handler) throw new Error(`No handler registered for command "${command.type}"`);

    const chain = this.middlewares.reduceRight<() => Promise<any>>(
      (next, mw) => () => mw(command, next),
      () => Promise.resolve(handler(command))
    );

    return chain();
  }
}

export class QueryBus {
  private handlers = new Map<string, QueryHandler>();

  register<T, R>(type: string, handler: QueryHandler<T, R>): void {
    if (this.handlers.has(type)) {
      throw new Error(`Query handler already registered for "${type}"`);
    }
    this.handlers.set(type, handler as QueryHandler);
  }

  async execute<T = any, R = any>(query: Query<T>): Promise<R> {
    const handler = this.handlers.get(query.type);
    if (!handler) throw new Error(`No handler registered for query "${query.type}"`);
    return handler(query);
  }
}
