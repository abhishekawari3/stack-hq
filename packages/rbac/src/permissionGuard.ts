import { RoleManager } from "./roleManager";
import { ConditionalPermissionEngine } from "./conditionalPermissions";

export interface GuardOptions {
  /** How to read the user's role(s) off the request. Defaults to req.user.role */
  getRoles?: (req: any) => string[];
  /** Optional context builder for conditional (ABAC-style) checks, e.g. resource ownership */
  buildContext?: (req: any) => Record<string, any>;
}

/**
 * Express/Koa-style middleware factory that guards a route behind one
 * or more required permissions, resolved through the RoleManager
 * (including inherited permissions) and optionally refined by
 * conditional permission rules.
 */
export class PermissionGuard {
  constructor(
    private roleManager: RoleManager,
    private conditionalEngine?: ConditionalPermissionEngine,
    private options: GuardOptions = {}
  ) {}

  private defaultGetRoles(req: any): string[] {
    const r = req.user?.roles ?? req.user?.role;
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  }

  /** require(permission) -> middleware. Pass multiple perms to require ALL of them. */
  require(...permissions: string[]) {
    const getRoles = this.options.getRoles ?? this.defaultGetRoles;
    const buildContext = this.options.buildContext ?? (() => ({}));

    return (req: any, res: any, next: any) => {
      const roles = getRoles(req);
      if (roles.length === 0) {
        return res.status(403).json({ error: "No role assigned" });
      }

      const context = buildContext(req);

      const hasAll = permissions.every((perm) => {
        const roleHasIt = roles.some((role) => this.roleManager.hasPermission(role, perm));
        if (!roleHasIt) return false;

        if (this.conditionalEngine) {
          return this.conditionalEngine.evaluate(perm, context);
        }
        return true;
      });

      if (!hasAll) {
        return res.status(403).json({ error: "Insufficient permissions", required: permissions });
      }
      next();
    };
  }

  /** requireAny(permissions) -> middleware; passes if the user has at least one */
  requireAny(...permissions: string[]) {
    const getRoles = this.options.getRoles ?? this.defaultGetRoles;
    const buildContext = this.options.buildContext ?? (() => ({}));

    return (req: any, res: any, next: any) => {
      const roles = getRoles(req);
      const context = buildContext(req);

      const hasAny = permissions.some((perm) => {
        const roleHasIt = roles.some((role) => this.roleManager.hasPermission(role, perm));
        if (!roleHasIt) return false;
        return this.conditionalEngine ? this.conditionalEngine.evaluate(perm, context) : true;
      });

      if (!hasAny) {
        return res.status(403).json({ error: "Insufficient permissions", requiredAnyOf: permissions });
      }
      next();
    };
  }
}
