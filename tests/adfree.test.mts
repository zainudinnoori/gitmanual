import assert from "node:assert/strict";
import { test } from "node:test";
import { NextResponse } from "next/server";
import { markAdFree } from "../lib/adfree";
import { AD_FREE_COOKIE } from "../lib/site";
import { GRACE_MS } from "../lib/stripe";

// No ads for Pro: the cookie the browser reads lasts until the paid time (plus grace) ends, and goes when Pro does.

const cookie = (res: NextResponse) => res.headers.getSetCookie().find((c) => c.startsWith(`${AD_FREE_COOKIE}=`)) ?? "";
const maxAge = (c: string) => Number(c.match(/Max-Age=(\d+)/i)?.[1]);

test("Pro: set for the whole site, readable by the page, until the period ends plus grace", () => {
  const end = Date.now() + 10 * 24 * 60 * 60 * 1000;
  const c = cookie(markAdFree(NextResponse.json({}), true, end));
  assert.match(c, /^gm_noads=1;/);
  assert.match(c, /Path=\//);
  assert.doesNotMatch(c, /HttpOnly/i);
  assert.ok(Math.abs(maxAge(c) - (end + GRACE_MS - Date.now()) / 1000) < 5);
});

test("not Pro, or Pro already over: the cookie is removed", () => {
  assert.match(cookie(markAdFree(NextResponse.json({}), false)), /^gm_noads=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
  assert.match(cookie(markAdFree(NextResponse.json({}), true, Date.now() - GRACE_MS - 1000)), /^gm_noads=;/);
});
