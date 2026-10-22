// The photo album: snapshots kept from HQ, saved as small JPEGs in storage (one key each), so they
// can be looked at again in the HQ hall and hung on the wall at home.
import type { ImageSource } from '../platform/types';
import { checkAchievements, type AlbumPhoto } from './career';
import type { Game } from './game';
import type { Photo } from './hq';

export const ALBUM_MAX = 30;
const KEY = 'waqu.photo.';
/** Stored pictures are this wide (design units × 1); plenty for the frames and the big view. */
const STORE_W = 480;

export class Album {
  private cache = new Map<string, ImageSource | 'loading' | 'missing'>();
  /** Photos from today's report that went into the album, by their album id. */
  private kept = new Map<Photo, string>();

  constructor(private game: Game) {}

  get list(): AlbumPhoto[] {
    return this.game.save.album;
  }
  get full() {
    return this.list.length >= ALBUM_MAX;
  }

  keptId(p: Photo) {
    return this.kept.get(p) ?? null;
  }

  /** Keeps a snapshot from the day's report. Returns the album entry, or a reason it couldn't. */
  add(p: Photo, day: number): AlbumPhoto | 'full' | 'failed' {
    const have = this.kept.get(p);
    if (have) return this.list.find((a) => a.id === have) ?? 'failed';
    if (this.full) return 'full';
    const pl = this.game.platform;
    const w = Math.min(STORE_W, p.img.width), h = Math.round((p.img.height * w) / p.img.width);
    const c = pl.createCanvas(w, h);
    c.getContext('2d')!.drawImage(p.img, 0, 0, w, h);
    const url = pl.encodeImage(c, 0.72);
    const s = this.game.save;
    s.seq++;
    const id = `p${s.seq}`;
    if (!url || !pl.storageSet(KEY + id, url)) return 'failed';
    const a: AlbumPhoto = { id, caption: p.caption, day, kind: p.kind, at: Date.now() };
    s.album.unshift(a);
    this.cache.set(id, c);
    this.kept.set(p, id);
    this.game.celebrate(checkAchievements(s));
    this.game.writeSave();
    return a;
  }

  remove(id: string) {
    const s = this.game.save;
    s.album = s.album.filter((a) => a.id !== id);
    s.room.frames = s.room.frames.map((f) => (f && f.photo === id ? null : f));
    for (const [p, k] of this.kept) if (k === id) this.kept.delete(p);
    this.cache.delete(id);
    this.game.platform.storageRemove(KEY + id);
    this.game.writeSave();
  }

  /** The picture, once it's loaded (starts loading it the first time it's asked for). */
  image(id: string): ImageSource | null {
    const c = this.cache.get(id);
    if (c && c !== 'loading' && c !== 'missing') return c;
    if (!c) {
      const url = this.game.platform.storageGet(KEY + id);
      if (!url) {
        this.cache.set(id, 'missing');
        return null;
      }
      this.cache.set(id, 'loading');
      this.game.platform.loadImage(url).then(
        (img) => this.cache.set(id, img),
        () => this.cache.set(id, 'missing'),
      );
    }
    return null;
  }
}
