import { RoleManager } from "./roleManager";

/**
 * Fluent builder for defining role hierarchies concisely, e.g.:
 *
 *   new RoleHierarchyBuilder(roleManager)
 *     .define("viewer", ["read:posts"])
 *     .define("editor", ["write:posts"], ["viewer"])
 *     .define("admin", ["delete:posts", "manage:users"], ["editor"])
 *     .build();
 *
 * "admin" ends up with delete:posts, manage:users, write:posts, read:posts.
 */
export class RoleHierarchyBuilder {
  private pending: { name: string; permissions: string[]; inherits: string[] }[] = [];

  constructor(private roleManager: RoleManager) {}

  define(name: string, permissions: string[] = [], inherits: string[] = []): this {
    this.pending.push({ name, permissions, inherits });
    return this;
  }

  build(): RoleManager {
    // First pass: create all roles without inheritance (so forward references work)
    for (const { name, permissions } of this.pending) {
      if (!this.roleManager.getRole(name)) {
        this.roleManager.createRole(name, permissions);
      }
    }
    // Second pass: wire up inheritance now that every role exists
    for (const { name, inherits } of this.pending) {
      if (inherits.length > 0) {
        this.roleManager.setInheritance(name, inherits);
      }
    }
    return this.roleManager;
  }
}

/** Returns the full ancestor chain (parents, grandparents, ...) for a role */
export function getAncestorChain(roleManager: RoleManager, roleName: string): string[] {
  const chain: string[] = [];
  const visit = (name: string) => {
    const role = roleManager.getRole(name);
    for (const parent of role?.inherits ?? []) {
      if (!chain.includes(parent)) {
        chain.push(parent);
        visit(parent);
      }
    }
  };
  visit(roleName);
  return chain;
}
