const labels: Record<string, string> = { planned: "مخططة", available: "متاحة", started: "بدأت", boarding: "صعود الموظفين", completed: "مكتملة", transferred: "مرحّلة", received: "مستلمة", cancelled: "ملغاة", needs_review: "تحتاج مراجعة" };
export default function StatusBadge({ status }: { status: string }) { return <span className={`status status-${status}`}>{labels[status] || status}</span>; }
