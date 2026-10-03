import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import ImageSlot from './ImageSlot.jsx';
import { logoToDataUrl } from './readImage.js';

/**
 * The development's own logo, shown in the buyer header and on the printed sign.
 *
 * Both uploads save the moment they finish, and a new upload replaces the old
 * one in that slot. The dark-background version is optional: without it the
 * buyer app sits the main logo on a light plate where the header is dark.
 */
export default function LogoCard({ community, reload }) {
  const { token } = useAdmin();

  const upload = (kind) => async (dataUrl) => {
    await adminApi.addCommunityPhoto(token, community.id, kind, { dataUrl });
    await reload();
  };
  const remove = (photo) => async () => {
    await adminApi.deletePhoto(token, photo.id);
    await reload();
  };

  return (
    <div className="card elev-sm" style={{ gap: 12 }}>
      <span className="card-kicker">Development logo</span>
      <ImageSlot
        label="Development logo"
        image={community.logo?.url ?? null}
        alt={`${community.name} logo as saved`}
        read={logoToDataUrl}
        onPick={upload('logo')}
        onRemove={community.logo ? remove(community.logo) : undefined}
        hint="Used on light backgrounds. A transparent PNG at least 600 pixels wide looks best."
      />
      <ImageSlot
        label="Logo for dark backgrounds (optional)"
        plate="dark"
        image={community.logoLight?.url ?? null}
        alt={`${community.name} light logo as saved`}
        read={logoToDataUrl}
        onPick={upload('logolight')}
        onRemove={community.logoLight ? remove(community.logoLight) : undefined}
        hint="A white or light version, used where the buyer app has a dark header or footer."
      />
      <span className="text-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
        PNG, WebP, JPEG or GIF up to 3 MB. SVG files are not accepted. Without a logo, buyers see
        the community name as text.
      </span>
    </div>
  );
}
