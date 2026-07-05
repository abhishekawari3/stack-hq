# @stackhq/rbac

Role-based access control: role management with inheritance, permission
guard middleware, conditional (ABAC-style) permissions, and a default role
hierarchy.

```bash
npm install @stackhq/rbac
```

## Table of contents

- [RoleManager](#rolemanager)
- [RoleHierarchyBuilder](#rolehierarchybuilder)
- [ConditionalPermissionEngine](#conditionalpermissionengine)
- [PermissionGuard](#permissionguard)
- [setupDefaultRoles](#setupdefaultroles)

---

## RoleManager

Central registry of roles and their permissions, with recursive role
inheritance (cycle-safe).

### Methods

| Method               | Signature                                 | Description                                                |
| -------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `createRole`         | `(name, permissions?, inherits?) => Role` | Define a new role                                          |
| `getRole`            | `(name) => Role \| undefined`             | Look up a role                                             |
| `deleteRole`         | `(name) => boolean`                       | Remove a role                                              |
| `addPermission`      | `(roleName, permission) => void`          | Add a permission to a role                                 |
| `removePermission`   | `(roleName, permission) => void`          | Remove a permission from a role                            |
| `setInheritance`     | `(roleName, parents: string[]) => void`   | Set which roles this role inherits from (throws on cycles) |
| `resolvePermissions` | `(roleName) => Set<string>`               | All permissions, including inherited ones                  |
| `hasPermission`      | `(roleName, permission) => boolean`       | Check if a role (or its ancestors) grants a permission     |
| `listRoles`          | `() => string[]`                          | All defined role names                                     |

### Example

```ts
import { RoleManager } from "@stackhq/rbac";

const roles = new RoleManager();
roles.createRole("viewer", ["read:posts"]);
roles.createRole("editor", ["write:posts"], ["viewer"]);
roles.createRole("admin", ["delete:posts"], ["editor"]);

roles.hasPermission("admin", "read:posts"); // true (inherited from viewer)
```

---

## RoleHierarchyBuilder

Fluent builder for defining a role hierarchy in one pass, without worrying
about declaration order (forward references to not-yet-created parent
roles are resolved automatically).

```ts
new RoleHierarchyBuilder(roleManager)
  .define(name: string, permissions?: string[], inherits?: string[]): this
  .build(): RoleManager
```

### Example

```ts
import {
  RoleManager,
  RoleHierarchyBuilder,
  getAncestorChain,
} from "@stackhq/rbac";

const roles = new RoleHierarchyBuilder(new RoleManager())
  .define("viewer", ["read:posts"])
  .define("editor", ["write:posts"], ["viewer"])
  .define("admin", ["delete:posts", "manage:users"], ["editor"])
  .build();

getAncestorChain(roles, "admin"); // ["editor", "viewer"]
```

---

## ConditionalPermissionEngine

Adds ABAC-style conditions on top of plain RBAC — e.g. "editor can
`update:post` only if they own it".

### Methods

| Method                                                    | Description                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `addCondition(permission, fn)`                            | Attach a custom condition; `fn(context) => boolean`                    |
| `addOwnershipRule(permission, ownerField?, userIdField?)` | Shortcut: `context.resource[ownerField] === context.user[userIdField]` |
| `evaluate(permission, context)`                           | Returns `true` if all conditions for that permission pass              |
| `clear(permission)`                                       | Remove all conditions for a permission                                 |

### Example

```ts
import { ConditionalPermissionEngine } from "@stackhq/rbac";

const conditions = new ConditionalPermissionEngine()
  .addOwnershipRule("write:own", "authorId", "id")
  .addCondition(
    "approve:expense",
    (ctx) => ctx.resource.amount <= ctx.user.approvalLimit,
  );
```

---

## PermissionGuard

Express-style middleware factory that checks a route against required
permissions — resolved through `RoleManager` (with inheritance) and
optionally refined by a `ConditionalPermissionEngine`.

### Constructor

```ts
new PermissionGuard(
  roleManager: RoleManager,
  conditionalEngine?: ConditionalPermissionEngine,
  options?: GuardOptions
)
```

```ts
interface GuardOptions {
  getRoles?: (req: any) => string[]; // default: reads req.user.role(s)
  buildContext?: (req: any) => Record<string, any>; // for conditional checks
}
```

### Methods

| Method                       | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `require(...permissions)`    | Middleware — user must have **all** listed permissions                 |
| `requireAny(...permissions)` | Middleware — user must have **at least one** of the listed permissions |

### Example

```ts
import {
  setupDefaultRoles,
  PermissionGuard,
  ConditionalPermissionEngine,
} from "@stackhq/rbac";

const roles = setupDefaultRoles();
const conditions = new ConditionalPermissionEngine().addOwnershipRule(
  "write:own",
);
const guard = new PermissionGuard(roles, conditions, {
  buildContext: (req) => ({ user: req.user, resource: req.post }),
});

app.put(
  "/posts/:id",
  loadPostMiddleware,
  guard.require("write:own"),
  updatePostHandler,
);
app.get(
  "/admin/*",
  guard.requireAny("manage:users", "manage:system"),
  adminHandler,
);
```

---

## setupDefaultRoles

Bootstraps a `RoleManager` with a sensible out-of-the-box hierarchy covering
most SaaS apps:

```
guest -> user -> moderator -> admin -> superadmin
```

```ts
setupDefaultRoles(roleManager?: RoleManager): RoleManager
```

| Role         | Own permissions                                           |
| ------------ | --------------------------------------------------------- |
| `guest`      | `read:public`                                             |
| `user`       | `read:own`, `write:own`, `delete:own`                     |
| `moderator`  | `read:any`, `edit:any`, `flag:content`                    |
| `admin`      | `write:any`, `delete:any`, `manage:users`, `manage:roles` |
| `superadmin` | `manage:billing`, `manage:system`, `impersonate:user`     |

Each role also inherits everything from the role above it in the chain.

### Example

```ts
import { setupDefaultRoles } from "@stackhq/rbac";

const roles = setupDefaultRoles();
roles.hasPermission("admin", "read:public"); // true — inherited all the way down
```
