import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drop a file onto a spot to upload it, as well as tap the spot to choose one. Spread `dropProps` on the element that
 * holds the spot (the dashed button, or the row of pictures); `dragging` is true while a file is held over it, and the
 * same state is on the element as data-dropping so one rule in admin-extras.css draws the highlight.
 *
 *   accept    'image' or 'video': what the spot takes. A dropped file of another kind is turned away in words.
 *   multiple  take every file dropped (a row of home photos), in the order given; otherwise the first.
 *   onReject  told in words when nothing dropped could be used, so the spot can show it where it shows its other errors.
 */
export function useFileDrop(onFiles, { accept = 'image', multiple = false, disabled = false, onReject } = {}) {
  const [dragging, setDragging] = useState(false);
  // dragenter and dragleave fire for every child the pointer crosses; counting them keeps the highlight steady.
  const depth = useRef(0);
  const latest = useRef({ onFiles, onReject, accept, multiple, disabled });
  latest.current = { onFiles, onReject, accept, multiple, disabled };
  useDropGuard();

  const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const onDragEnter = useCallback((event) => {
    if (latest.current.disabled || !hasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  }, []);
  const onDragOver = useCallback((event) => {
    if (latest.current.disabled || !hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);
  const onDragLeave = useCallback((event) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) setDragging(false);
  }, []);
  const onDrop = useCallback((event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    const { onFiles: take, onReject: reject, accept: kind, multiple: many, disabled: off } = latest.current;
    if (off) return;
    const all = Array.from(event.dataTransfer.files ?? []);
    const usable = all.filter((file) => file.type.startsWith(`${kind}/`));
    if (!usable.length) {
      if (all.length) reject?.(kind === 'video' ? 'That file is not a video. Drop an MP4, WebM or MOV.' : 'That file is not a picture. Drop a JPEG, PNG, WebP or GIF.');
      return;
    }
    take(many ? usable : usable[0]);
  }, []);

  return {
    dragging,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop, 'data-dropping': dragging ? 'true' : undefined },
  };
}

/** The hidden file input's change handler for a function that takes the chosen file: clears the input so the same file can be chosen again. */
export const fromInput = (take) => (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) take(file);
};

/*
 * A file dropped on a part of the page that is not a drop spot would make the browser open it and leave the admin (and
 * whatever was typed and not yet saved). While any spot is on screen, a file dragged over the rest of the page is refused
 * and dropping it does nothing.
 */
let guards = 0;
const refuse = (event) => {
  if (event.defaultPrevented || !Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
  event.preventDefault();
  if (event.type === 'dragover') event.dataTransfer.dropEffect = 'none';
};
function useDropGuard() {
  useEffect(() => {
    if (!guards) {
      window.addEventListener('dragover', refuse);
      window.addEventListener('drop', refuse);
    }
    guards += 1;
    return () => {
      guards -= 1;
      if (!guards) {
        window.removeEventListener('dragover', refuse);
        window.removeEventListener('drop', refuse);
      }
    };
  }, []);
}
