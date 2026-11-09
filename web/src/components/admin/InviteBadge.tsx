export default function InviteBadge({ kind }: { kind: string | null | undefined }) {
  if (kind !== "invite") return null;
  return (
    <span className="ml-2 inline-flex shrink-0 rounded-sm bg-orange-50 px-1.5 py-0.5 align-middle font-mono text-[10px] tracking-widest text-orange-700 uppercase">
      Invite
    </span>
  );
}
