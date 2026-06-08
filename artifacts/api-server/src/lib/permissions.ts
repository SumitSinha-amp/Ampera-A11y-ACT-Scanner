import { db, userPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface EffectivePermissions {
  canScan: boolean;
  canExport: boolean;
  canViewAllScans: boolean;
  canEditScan: boolean;
  canDeleteScan: boolean;
  canManageScan: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canDisableJs: boolean;
  allowedRules: string[] | null;
}

const FULL_ACCESS: EffectivePermissions = {
  canScan: true,
  canExport: true,
  canViewAllScans: true,
  canEditScan: true,
  canDeleteScan: true,
  canManageScan: true,
  canCreateProject: true,
  canDeleteProject: true,
  canDisableJs: true,
  allowedRules: null,
};

export async function getEffectivePermissions(
  userId: number,
  role: string,
): Promise<EffectivePermissions> {
  if (role === "super_admin" || role === "admin") return FULL_ACCESS;

  const [perm] = await db
    .select()
    .from(userPermissionsTable)
    .where(eq(userPermissionsTable.userId, userId));

  return {
    canScan: perm?.canScan ?? true,
    canExport: perm?.canExport ?? true,
    canViewAllScans: perm?.canViewAllScans ?? false,
    canEditScan: perm?.canEditScan ?? true,
    canDeleteScan: perm?.canDeleteScan ?? true,
    canManageScan: perm?.canManageScan ?? true,
    canCreateProject: perm?.canCreateProject ?? true,
    canDeleteProject: perm?.canDeleteProject ?? true,
    canDisableJs: perm?.canDisableJs ?? false,
    allowedRules: (perm?.allowedRules as string[] | null) ?? null,
  };
}
