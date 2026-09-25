import { uuid } from "./offlineStore";

export type AdminEntity = "driver" | "company" | "employee";

export type AdminOp = {
  client_id: string;
  entity: AdminEntity;
  kind: "create" | "update" | "delete";
  payload?: Record<string, unknown>;
  id?: number | string;
  created_at: string;
};

const KEY = "ds_admin_ops";

function load(): AdminOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AdminOp[]) : [];
  } catch {
    return [];
  }
}
function save(list: AdminOp[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function isLocalRowId(id: number | string | undefined): boolean {
  return typeof id === "string" && id.startsWith("LOCAL-");
}

export function localRowId(op: AdminOp): string {
  return "LOCAL-" + op.client_id;
}

export function queueAdminOp(op: Omit<AdminOp, "client_id" | "created_at">): AdminOp {
  const rec: AdminOp = { ...op, client_id: "OP-" + uuid().slice(0, 8), created_at: new Date().toISOString() };
  const list = load();
  list.push(rec);
  save(list);
  return rec;
}
export function getAdminOps(): AdminOp[] {
  return load();
}
export function removeAdminOp(clientId: string) {
  save(load().filter((o) => o.client_id !== clientId));
}
export function adminPendingCount(): number {
  return load().length;
}

export function findLocalCreateOp(clientRowId: string): AdminOp | null {
  return load().find((o) => o.kind === "create" && localRowId(o) === clientRowId) || null;
}
export function replaceLocalCreatePayload(clientRowId: string, payload: Record<string, unknown>) {
  const list = load();
  const op = list.find((o) => o.kind === "create" && localRowId(o) === clientRowId);
  if (op) {
    op.payload = { ...(op.payload || {}), ...payload };
    save(list);
  }
}
export function dropLocalCreate(clientRowId: string) {
  const op = findLocalCreateOp(clientRowId);
  if (op) removeAdminOp(op.client_id);
}

export function applyAdminOps(entity: AdminEntity, base: unknown[]): unknown[] {
  const ops = load().filter((o) => o.entity === entity);
  const del = new Set(ops.filter((o) => o.kind === "delete").map((o) => String(o.id)));
  const upd = new Map(ops.filter((o) => o.kind === "update").map((o) => [String(o.id), o.payload]));
  const creates = ops
    .filter((o) => o.kind === "create")
    .map((o) => ({ id: localRowId(o), local: true, ...(o.payload || {}) } as any));
  let list = base.filter((x: any) => {
    const id = String(x.id);
    return !del.has(id) && !isLocalRowId(id);
  });
  list = list.map((x: any) => (upd.has(String(x.id)) ? { ...x, ...(upd.get(String(x.id)) || {}) } : x));
  return [...creates, ...list];
}

export function isNetworkError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err ?? "")).trim();
  if (!m) return true;
  const l = m.toLowerCase();
  return /fetch|network|timeout|timed out|timedout|abort|sock|econn|enot|etimed|could not connect|failed to fetch|load failed|unreachable|unable to fetch|cannot read|inet|ipaddr|networkerror|neterr_|undefined/.test(l);
}

export type LocalDriverAccount = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  driver_code?: string | null;
  company_code: string;
};

export function findLocalDriverAccount(username: string): LocalDriverAccount | null {
  const ops = load().filter((o) => o.entity === "driver" && o.kind === "create");
  for (const op of ops) {
    const p = (op.payload || {}) as Record<string, any>;
    if (String(p.username) === username) {
      return {
        id: localRowId(op),
        username: String(username),
        full_name: String(p.full_name ?? username),
        role: "driver",
        driver_code: (p.driver_code as string | null) ?? null,
        company_code: String(p.company_code ?? ""),
      };
    }
  }
  return null;
}