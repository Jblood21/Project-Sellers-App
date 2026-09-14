/**
 * Renders a photo, or a labelled placeholder when the community/home has none.
 * The buyer app is photo-led, so an empty slot still has to look deliberate.
 */
export default function Photo({ photo, alt, label, radius, style, className = '' }) {
  const wrapperStyle = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: radius,
    ...style,
  };
  return (
    <div className={className} style={wrapperStyle}>
      {photo?.url ? (
        <img className="photo-img" src={photo.url} alt={alt || label || ''} loading="lazy" />
      ) : (
        <div className="photo-empty">{label || 'Photo coming soon'}</div>
      )}
    </div>
  );
}
