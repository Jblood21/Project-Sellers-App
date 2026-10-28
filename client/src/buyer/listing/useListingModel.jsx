import { useEffect, useRef, useState } from 'react';

import { calcPayment, videoEmbed } from '@shared/domain.js';
import { homeMeta } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import { useOpenHouses } from '../openHouse.js';
import { canTalkFinancing } from '../reach.js';

/**
 * Everything a layout's listing page needs, worked out once so eight different pages never disagree about a fact:
 * the home and its photos, the facts and the status, the open houses still to come, a payment estimate, and the
 * actions (each null when there is nothing for the buyer to do). A layout decides where things go and how they look;
 * it never changes what an action does.
 *
 * `viewer` holds what the actions open (the photo viewer, floor plans, the video, the payment sheet) so every layout
 * shares them: a layout calls `model.openPhoto(i)` and the page draws the viewers.
 */
export default function useListingModel({ onOpenLender, onRequestShowing }) {
  const { community, homes, lead, toggleSave, track, setTool, agents, features } = useBuyer();
  const { today, time, sessions } = useOpenHouses(community?.settings);
  const home = homes[0] ?? null;

  const [photoIndex, setPhotoIndex] = useState(null);
  const [planIndex, setPlanIndex] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // The agent sees that the buyer looked at the home.
  const viewed = useRef(null);
  useEffect(() => {
    if (!home || viewed.current === home.id) return;
    viewed.current = home.id;
    track(`Viewed ${home.name} (${home.photos.length} photos)`);
  }, [home, track]);

  if (!home) return { home: null };

  const settings = community?.settings ?? {};
  const status = community?.status ?? 'Active';
  const sold = status === 'Sold';
  const mls = String(settings.mlsNumber ?? '').trim();
  const brokerage = String(community?.builder ?? '').trim();
  const price = Number(home.price) > 0 ? Number(home.price) : 0;
  const embed = home.videoUrl ? '' : videoEmbed(home.videoLink);
  const agent = features?.agents && agents?.length ? agents[0] : null;

  // A monthly figure to put beside the price: the Payment tool's own sum at a common way to buy (5% down, conventional).
  let estimate = null;
  if (community?.tools?.payment && price && !sold) {
    try {
      const sum = calcPayment({ price, program: 'conv', downPct: 5, settings });
      if (Number.isFinite(sum.total) && sum.total > 0) estimate = { monthly: Math.round(sum.total), down: Math.round(sum.down), downPct: 5, rate: sum.rate };
    } catch {
      estimate = null;
    }
  }

  const saved = Boolean(lead?.savedHomeIds?.includes(home.id));
  const model = {
    community, home, agent, agents: agent ? agents : [], features,
    name: home.name, city: community?.location ?? '', status, sold,
    price, estimate, beds: home.beds, baths: home.baths, sqft: home.sqft,
    meta: homeMeta(home), mls, brokerage,
    description: home.description ?? '',
    photos: home.photos ?? [], hero: home.photos?.[0] ?? null, more: (home.photos ?? []).slice(1),
    floorPlans: home.floorPlans ?? [],
    hasVideo: Boolean(home.videoUrl || embed),
    sessions: sold ? [] : sessions, today, time, nextSession: sold ? null : sessions[0] ?? null,
    saved,
    // Actions
    openPhoto: (index) => setPhotoIndex(index),
    openPlan: (index) => setPlanIndex(index),
    openVideo: () => {
      track(`Watched the video tour of ${home.name}`);
      setVideoOpen(true);
    },
    requestShowing: !sold && onRequestShowing ? onRequestShowing : null,
    talkFinancing: canTalkFinancing(community, features)
      ? () => {
        track(`Asked about financing for ${home.name}`);
        onOpenLender();
      }
      : null,
    openPayment: community?.tools?.payment
      ? () => {
        setTool('pay', { homeId: home.id });
        track(`Opened payment for ${home.name}`);
        setPaymentOpen(true);
      }
      : null,
    toggleSave: () => toggleSave(home),
    // The viewers' own state, for the page that draws them.
    viewer: {
      photoIndex, setPhotoIndex, planIndex, setPlanIndex, videoOpen, setVideoOpen, paymentOpen, setPaymentOpen,
      embed: embed ?? '',
    },
  };
  return model;
}
