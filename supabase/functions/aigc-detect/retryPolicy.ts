type Role = { role: string; college_id: string | null };

export function canReviewDetection(roles: Role[], collegeId: string | null): boolean {
  return roles.some((r) => r.role === "super_admin" ||
    ((r.role === "teacher" || r.role === "admin") && collegeId !== null && r.college_id === collegeId));
}

export function shouldSkipDetection(status: string | null, force: boolean): boolean {
  return !force && !!status && status !== "pending";
}