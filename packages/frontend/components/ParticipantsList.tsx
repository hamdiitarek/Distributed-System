"use client";
export default function ParticipantsList({
  users,
  names,
}: {
  users: string[];
  names?: Record<string, string>;
}) {
  return (
    <div className="gild-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white">Participants</h4>
        <span className="text-xs text-neutral-500">{users.length}</span>
      </div>
      <ul className="space-y-2">
        {users.length === 0 && (
          <li className="text-sm text-neutral-500">No one in the room yet.</li>
        )}
        {users.map((u) => (
          <li key={u} className="flex items-center gap-2 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400" />
            <span className="text-neutral-200">{names?.[u] ?? u.slice(0, 16)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
