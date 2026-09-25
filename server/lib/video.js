/**
 * Serving a stored video over HTTP.
 *
 * Range support is not an optimisation here, it is the difference between a
 * player that works and one that doesn't: without it the scrubber does nothing,
 * and Safari won't begin playback at all — it asks for `bytes=0-1` first and
 * needs a 206 back before it commits to the file.
 *
 * Two routes serve video (a resource in "Worth knowing", and a home's
 * walkthrough) and they must behave identically, so the behaviour lives here
 * once rather than being copied and drifting.
 */

/**
 * Write `video` ({ content_type, data }, data being base64) to the response,
 * honouring a Range header. Whole file as 200, a slice as 206, and anything
 * unparseable or out of bounds as 416 with the length — never a silent clamp,
 * which would hand a player bytes it did not ask for.
 */
export function sendVideo(req, res, video) {
  const buffer = Buffer.from(video.data, 'base64');
  res.set('Content-Type', video.content_type || 'video/mp4');
  // The bytes never change once uploaded — a replacement writes a new file.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  if (!range) {
    res.set('Content-Length', String(buffer.length));
    return res.send(buffer);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    // A range we cannot parse is not a range we should guess at.
    res.set('Content-Range', `bytes */${buffer.length}`);
    return res.status(416).end();
  }
  const [, rawStart, rawEnd] = match;
  const start = rawStart === '' ? buffer.length - Number(rawEnd) : Number(rawStart);
  const end = rawStart === '' || rawEnd === '' ? buffer.length - 1 : Number(rawEnd);
  if (!Number.isFinite(start) || start < 0 || start >= buffer.length || end < start) {
    res.set('Content-Range', `bytes */${buffer.length}`);
    return res.status(416).end();
  }
  const last = Math.min(end, buffer.length - 1);

  res.status(206);
  res.set('Content-Range', `bytes ${start}-${last}/${buffer.length}`);
  res.set('Content-Length', String(last - start + 1));
  return res.send(buffer.subarray(start, last + 1));
}
