/**
 * A card that behaves like a button without nesting block content inside a
 * <button>, which is invalid HTML and breaks layout in some browsers.
 */
export default function CardButton({ onClick, className = 'card elev-sm', style, children, label }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={className}
      style={{ cursor: 'pointer', textAlign: 'left', ...style }}
    >
      {children}
    </div>
  );
}
