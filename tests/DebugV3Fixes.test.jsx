/**
 * Regression tests for Debug file v3 fixes:
 *  - Add dish: JPG/PNG-only photos, MP4-only videos, 10 MB / 15 MB per-dish totals
 *  - Every "contact Super Admin" action is a pre-filled e-mail
 */
import {
  checkDishVideos,
  prepareDishImages,
  isAllowedImageFile,
  isAllowedVideoFile,
  MAX_TOTAL_IMAGE_BYTES,
  MAX_TOTAL_VIDEO_BYTES,
} from '../src/lib/mediaAspect';
import { buildSuperAdminMailUrl, SUPER_ADMIN_TEMPLATES } from '../src/lib/superAdminContact';

jest.mock('../src/lib/supabaseClient', () => ({
  fetchSuperAdminEmail: jest.fn().mockResolvedValue({ email: 'owner-desk@example.test' }),
}));

function fakeFile(name, type, size) {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('Dish media rules', () => {
  test('only JPG / PNG photos are allowed', () => {
    expect(isAllowedImageFile(fakeFile('a.jpg', 'image/jpeg', 10))).toBe(true);
    expect(isAllowedImageFile(fakeFile('a.png', 'image/png', 10))).toBe(true);
    expect(isAllowedImageFile(fakeFile('a.webp', 'image/webp', 10))).toBe(false);
    expect(isAllowedImageFile(fakeFile('a.gif', 'image/gif', 10))).toBe(false);
    expect(isAllowedImageFile(fakeFile('a.jpg', 'image/webp', 10))).toBe(false);
  });

  test('only MP4 videos are allowed', () => {
    expect(isAllowedVideoFile(fakeFile('v.mp4', 'video/mp4', 10))).toBe(true);
    expect(isAllowedVideoFile(fakeFile('v.mov', 'video/quicktime', 10))).toBe(false);
    expect(isAllowedVideoFile(fakeFile('v.webm', 'video/webm', 10))).toBe(false);
  });

  test('rejects a non-JPG/PNG photo', async () => {
    const { files, errors } = await prepareDishImages([fakeFile('photo.webp', 'image/webp', 1000)]);
    expect(files).toHaveLength(0);
    expect(errors.join(' ')).toMatch(/only JPG and PNG/i);
  });

  test('rejects photos that take the dish over 10 MB in total', async () => {
    const big = fakeFile('big.jpg', 'image/jpeg', 6 * 1024 * 1024);
    const { files, errors } = await prepareDishImages([big], { existingBytes: 5 * 1024 * 1024 });
    expect(MAX_TOTAL_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(files).toHaveLength(0);
    expect(errors.join(' ')).toMatch(/10\.0 MB/);
  });

  test('rejects non-MP4 videos and videos over 15 MB in total', async () => {
    const mov = await checkDishVideos([fakeFile('clip.mov', 'video/quicktime', 1000)]);
    expect(mov.files).toHaveLength(0);
    expect(mov.errors.join(' ')).toMatch(/only MP4/i);

    const tooBig = await checkDishVideos([fakeFile('clip.mp4', 'video/mp4', 9 * 1024 * 1024)], { existingBytes: 7 * 1024 * 1024 });
    expect(MAX_TOTAL_VIDEO_BYTES).toBe(15 * 1024 * 1024);
    expect(tooBig.files).toHaveLength(0);
    expect(tooBig.errors.join(' ')).toMatch(/15\.0 MB/);
  });
});

describe('Contact Super Admin e-mail templates', () => {
  const hotel = { id: 'h-1', name: 'Spice Garden', subdomain: 'spice', plan: 'free', status: 'verified' };

  test.each(Object.keys(SUPER_ADMIN_TEMPLATES))('"%s" builds a pre-filled compose URL', (key) => {
    const url = new URL(buildSuperAdminMailUrl('desk@example.test', key, { hotel, ownerEmail: 'o@example.test', email: 'o@example.test' }));
    expect(url.hostname).toBe('mail.google.com');
    expect(url.searchParams.get('to')).toBe('desk@example.test');
    expect(url.searchParams.get('su')).toBeTruthy();
    expect(url.searchParams.get('body')).toMatch(/Hello Super Admin team/);
  });

  test('hotel templates include the hotel details', () => {
    const { body } = SUPER_ADMIN_TEMPLATES.support({ hotel, ownerEmail: 'o@example.test' });
    expect(body).toMatch(/Hotel: Spice Garden/);
    expect(body).toMatch(/Hotel ID: h-1/);
    expect(body).toMatch(/Owner e-mail: o@example.test/);
  });
});
