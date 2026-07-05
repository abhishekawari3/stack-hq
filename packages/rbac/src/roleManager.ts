export interface Role {
  name: string;
  permissions: Set<string>;
  inherits?: string[]; // names of parent roles
}

/**
 * Central registry of roles and permissions, with support for
 * role inheritance (a role automatically gains all permissions
 * of the roles it inherits from, recursively).
 */
export class RoleManager {
  private roles = new Map<string, Role>();

  createRole(name: string, permissions: string[] = [], inherits: string[] = []): Role {
    if (this.roles.has(name)) {
      throw new Error(`Role "${name}" already exists`);
    }
    const role: Role = { name, permissions: new Set(permissions), inherits };
    this.roles.set(name, role);
    return role;
  }

  getRole(name: string): Role | undefined {
    return this.roles.get(name);
  }

  deleteRole(name: string): boolean {
    return this.roles.delete(name);
  }

  addPermission(roleName: string, permission: string): void {
    const role = this.requireRole(roleName);
    role.permissions.add(permission);
  }

  removePermission(roleName: string, permission: string): void {
    const role = this.requireRole(roleName);
    role.permissions.delete(permission);
  }

  setInheritance(roleName: string, parents: string[]): void {
    const role = this.requireRole(roleName);
    this.assertNoCycle(roleName, parents);
    role.inherits = parents;
  }

  /** Resolve all permissions of a role, walking the inheritance chain */
  resolvePermissions(roleName: string, seen: Set<string> = new Set()): Set<string> {
    if (seen.has(roleName)) return new Set(); // cycle guard
    seen.add(roleName);

    const role = this.requireRole(roleName);
    const result = new Set(role.permissions);

    for (const parent of role.inherits ?? []) {
      for (const perm of this.resolvePermissions(parent, seen)) {
        result.add(perm);
      }
    }
    return result;
  }

  hasPermission(roleName: string, permission: string): boolean {
    return this.resolvePermissions(roleName).has(permission);
  }

  listRoles(): string[] {
    return [...this.roles.keys()];
  }

  private requireRole(name: string): Role {
    const role = this.roles.get(name);
    if (!role) throw new Error(`Unknown role "${name}"`);
    return role;
  }

  private assertNoCycle(roleName: string, parents: string[], visited = new Set<string>()): void {
    for (const parent of parents) {
      if (parent === roleName) throw new Error(`Role inheritance cycle detected at "${roleName}"`);
      if (visited.has(parent)) continue;
      visited.add(parent);
      const parentRole = this.roles.get(parent);
      if (parentRole?.inherits) this.assertNoCycle(roleName, parentRole.inherits, visited);
    }
  }
}
