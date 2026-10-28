import ImageViewer from '../ImageViewer.jsx';
import VideoViewer from '../VideoViewer.jsx';
import { ToolSheet } from '../tools/index.jsx';
import { useBuyer } from '../BuyerContext.jsx';
import { layoutFor } from '../layouts/index.js';
import useListingModel from './useListingModel.jsx';

/**
 * A listing's page, drawn by the layout the agent chose: each layout has its own composition of the same facts
 * (layouts/<name>/Listing.jsx), so the eight read as eight different pages, not one page in eight colours. This wrapper
 * works out the model, draws the layout's page, and owns the viewers every layout shares.
 */
export default function ListingPage({ Page, onOpenLender, onRequestShowing }) {
  const model = useListingModel({ onOpenLender, onRequestShowing });
  const { layout } = useBuyer();
  void layout;
  const { home, viewer } = model;
  if (!home) {
    return (
      <div className="b-shell" style={{ paddingTop: 24 }}>
        <p style={{ color: 'var(--t-mut)', fontSize: 14 }}>This home isn&apos;t ready to view yet. Check back soon.</p>
      </div>
    );
  }
  return (
    <>
      <Page model={model} />
      <ToolSheet open={viewer.paymentOpen} toolKey="payment" label="See My Payment" onClose={() => viewer.setPaymentOpen(false)} />
      <ImageViewer
        photos images={home.photos} index={viewer.photoIndex} onIndex={viewer.setPhotoIndex}
        onClose={() => viewer.setPhotoIndex(null)} label={`${home.name} photo`}
      />
      <VideoViewer
        open={viewer.videoOpen} onClose={() => viewer.setVideoOpen(false)} label={`${home.name} video tour`}
        src={home.videoUrl} embed={viewer.embed}
      />
      <ImageViewer
        images={home.floorPlans ?? []} index={viewer.planIndex} onIndex={viewer.setPlanIndex}
        onClose={() => viewer.setPlanIndex(null)} label={`${home.name} floor plan`}
      />
    </>
  );
}

/** The page the chosen layout draws for a listing, or null when it has none (the shared home page is used). */
export function listingPageFor(layout) {
  return layoutFor(layout).Listing ?? null;
}
