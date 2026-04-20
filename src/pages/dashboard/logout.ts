/**
 * GET or POST /dashboard/logout
 * Clears the session cookie and redirects to the login page.
 */

import type { APIRoute } from 'astro';
import { buildLogoutCookie } from '../../lib/auth.js';

export const prerender = false;

const response = () =>
  new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard/login',
      'Set-Cookie': buildLogoutCookie(),
    },
  });

export const GET: APIRoute = () => response();
export const POST: APIRoute = () => response();
