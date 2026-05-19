/*
 * Dynamic Open Graph image generator.
 *
 * Hit  /api/og.png?title=Your+Title&kicker=OBSIDIAN+WEB+CO  to get a
 * 1200×630 PNG sized for OG and Twitter card previews. The image
 * keeps the editorial brand (cream-on-warm-black, Instrument Serif
 * display, ember accent rule) and falls back to the site tagline
 * when no title is supplied.
 *
 * Edge runtime so @vercel/og can render efficiently. Astro routes
 * inside /api/ are server-rendered by default; explicit prerender:
 * false makes that intent obvious.
 */
import type { APIRoute } from 'astro';
import { ImageResponse } from '@vercel/og';

export const prerender = false;

const COLOR_BG = '#0b0907';
const COLOR_INK = '#F5ECD9';
const COLOR_MUTED = '#9a8e78';
const COLOR_EMBER = '#E9A246';

export const GET: APIRoute = async ({ url }) => {
  const title = (url.searchParams.get('title') || 'Websites built to outwork you.').slice(0, 120);
  const kicker = (url.searchParams.get('kicker') || 'OBSIDIAN WEB CO. · FAIRFAX, VA').slice(0, 60);
  const tagline = (url.searchParams.get('tagline') || 'Custom-coded sites for small businesses in Northern Virginia and Central VA.').slice(0, 160);

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '70px 80px',
          background: COLOR_BG,
          color: COLOR_INK,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        children: [
          // Kicker line — uppercase mono-style label, ember accent dot
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '20px',
                letterSpacing: '0.22em',
                color: COLOR_MUTED,
                textTransform: 'uppercase',
              },
              children: [
                { type: 'div', props: { style: { width: '10px', height: '10px', background: COLOR_EMBER } } },
                kicker,
              ],
            },
          },
          // Title — large serif headline
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                marginTop: '40px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontFamily: 'Georgia, serif',
                      fontSize: '88px',
                      lineHeight: 0.95,
                      letterSpacing: '-0.03em',
                      color: COLOR_INK,
                      maxWidth: '1000px',
                    },
                    children: title,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '28px',
                      color: COLOR_MUTED,
                      lineHeight: 1.4,
                      fontStyle: 'italic',
                      fontFamily: 'Georgia, serif',
                      maxWidth: '900px',
                    },
                    children: tagline,
                  },
                },
              ],
            },
          },
          // Footer rule — ember stripe + url
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '24px',
                borderTop: `1px solid ${COLOR_MUTED}66`,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '24px',
                      letterSpacing: '0.12em',
                      color: COLOR_EMBER,
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                    },
                    children: 'obsidianwebco.com',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '20px',
                      letterSpacing: '0.18em',
                      color: COLOR_MUTED,
                      textTransform: 'uppercase',
                    },
                    children: 'EST. 2026',
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
    },
  );
};
