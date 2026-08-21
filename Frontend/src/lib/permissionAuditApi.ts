import { api } from "./api";

export interface PermissionMismatch {
  employeeId: string;
  name: string;
  app: string;
  issue: "missing-child" | "missing-parent";
}

export async function listPermissionMismatches(): Promise<PermissionMismatch[]> {
  const res = await api.get<{ mismatches: PermissionMismatch[] }>("/admin/permission-audit");
  return res.data.mismatches;
}
