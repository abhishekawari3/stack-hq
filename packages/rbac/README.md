# @stack-hq/rbac

Role-based access control: role management with inheritance, permission guard middleware, conditional (ABAC-style) permissions, and a sensible default role hierarchy.

## Install
```bash
npm install @stack-hq/rbac
```

## Usage
```ts
import { setupDefaultRoles, PermissionGuard, ConditionalPermissionEngine, RoleHierarchyBuilder } from "@stack-hq/rbac";

const roles = setupDefaultRoles(); // guest -> user -> moderator -> admin -> superadmin
const conditions = new ConditionalPermissionEngine().addOwnershipRule("write:own");
const guard = new PermissionGuard(roles, conditions);

app.put("/posts/:id", guard.require("write:own"), updatePostHandler);
```

## License
MIT
