import { NextRequest } from 'next/server';
import { describe, expect, test } from 'vitest';

import { proxy } from './proxy';

const visit = (headers: Record<string, string>) =>
  proxy(new NextRequest('https://bridge.example/', { headers }));
const blocked = (headers: Record<string, string>) =>
  visit(headers).headers.get('location') === 'https://bridge.example/blocked';

describe('proxy geoblock', () => {
  test('blocks a listed country', () => {
    expect(blocked({ 'x-vercel-ip-country': 'CU' })).toBe(true);
  });

  test('lets other countries through', () => {
    expect(blocked({ 'x-vercel-ip-country': 'DE' })).toBe(false);
  });

  test('blocks a listed region of a country by its country region', () => {
    expect(blocked({ 'x-vercel-ip-country': 'UA', 'x-vercel-ip-country-region': '43' })).toBe(true);
  });

  test('lets other regions of that country through', () => {
    expect(blocked({ 'x-vercel-ip-country': 'UA', 'x-vercel-ip-country-region': '30' })).toBe(
      false,
    );
  });
});
