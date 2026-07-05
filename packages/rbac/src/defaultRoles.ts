import { RoleManager } from "./roleManager";
import { RoleHierarchyBuilder } from "./roleInheritance";

/**
 * Sensible out-of-the-box role set covering the vast majority of
 * SaaS-style apps. Call setupDefaultRoles() to bootstrap a RoleManager
 * instead of hand-defining roles from scratch.
 */
export function setupDefaultRoles(roleManager: RoleManager = new RoleManager()): RoleManager {
  return new RoleHierarchyBuilder(roleManager)
    .define("guest", ["read:public"])
    .define("user", ["read:own", "write:own", "delete:own"], ["guest"])
    .define("moderator", ["read:any", "edit:any", "flag:content"], ["user"])
    .define("admin", ["write:any", "delete:any", "manage:users", "manage:roles"], ["moderator"])
    .define("superadmin", ["manage:billing", "manage:system", "impersonate:user"], ["admin"])
    .build();
}

export const DEFAULT_ROLE_NAMES = ["guest", "user", "moderator", "admin", "superadmin"] as const;
