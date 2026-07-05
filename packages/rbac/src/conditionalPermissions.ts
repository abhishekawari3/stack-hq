export type PermissionCondition = (context: Record<string, any>) => boolean;

/**
 * Layer on top of plain RBAC that adds ABAC-style conditions, e.g.
 * "editor can update:post only if post.authorId === user.id", or
 * "manager can approve:expense only if expense.amount <= manager.approvalLimit".
 */
export class ConditionalPermissionEngine {
  private conditions = new Map<string, PermissionCondition[]>();

  /** Attach one or more conditions to a permission. ALL must pass. */
  addCondition(permission: string, condition: PermissionCondition): this {
    const list = this.conditions.get(permission) ?? [];
    list.push(condition);
    this.conditions.set(permission, list);
    return this;
  }

  /** Common shortcut: require context.resource[ownerField] === context.user[idField] */
  addOwnershipRule(permission: string, ownerField = "ownerId", userIdField = "id"): this {
    return this.addCondition(permission, (ctx) => {
      return ctx.resource?.[ownerField] === ctx.user?.[userIdField];
    });
  }

  /** Evaluate whether a permission is allowed given the current context */
  evaluate(permission: string, context: Record<string, any>): boolean {
    const rules = this.conditions.get(permission);
    if (!rules || rules.length === 0) return true; // no conditions => allowed
    return rules.every((rule) => rule(context));
  }

  clear(permission: string): void {
    this.conditions.delete(permission);
  }
}
