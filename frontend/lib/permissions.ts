export type Permissions = Record<"view" | "add" | "edit" | "delete", boolean>;

const ROLE_DEFAULTS: Record<string, Permissions> = {
  admin: { view: true, add: true, edit: true, delete: true },
  supervisor: { view: true, add: true, edit: true, delete: true },
  viewer: { view: true, add: false, edit: false, delete: false },
  driver: { view: false, add: false, edit: false, delete: false },
};

const ACTIONS: Array<keyof Permissions> = ["view", "add", "edit", "delete"];

export function effectivePermissions(user: { role?: string | null; permissions?: Record<string, boolean> | null } | null | undefined): Permissions {
  if (!user) return { view: false, add: false, edit: false, delete: false };
  const role = user.role || "";
  if (role === "admin") return { view: true, add: true, edit: true, delete: true };
  const base: Permissions = { ...(ROLE_DEFAULTS[role] ?? { view: false, add: false, edit: false, delete: false }) };
  const stored = user.permissions;
  if (stored && typeof stored === "object") {
    for (const action of ACTIONS) {
      if (typeof stored[action] === "boolean") base[action] = stored[action];
    }
  }
  return base;
}

export function canDo(user: { role?: string | null; permissions?: Record<string, boolean> | null } | null | undefined, action: keyof Permissions): boolean {
  return effectivePermissions(user)[action];
}