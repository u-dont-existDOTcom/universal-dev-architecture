export function SupervisorLink({ url, label, placeholder }: { url: string; label: string; placeholder: boolean }) {
  return (
    <div className="supervisor-link-wrap">
      <a className="supervisor-link" href={url} target="_blank" rel="noreferrer">
        <span className="chat-glyph" aria-hidden="true">◫</span>
        <span>{label}</span>
        <span aria-hidden="true">↗</span>
      </a>
      {placeholder && <span className="placeholder-flag" title="Replace this demo URL through the supervisor chat-link API">demo link</span>}
    </div>
  );
}
