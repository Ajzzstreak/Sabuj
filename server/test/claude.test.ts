import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityEvent, UserProfile } from '../src/contract.js';
import { Store } from '../src/db.js';
import { buildActivityDigest, ClaudeProfiler, parseRefinedProfile, type ProfilerClient } from '../src/profile/claude.js';
import { buildHeuristicProfile } from '../src/profile/heuristic.js';
import { ProfileLearner } from '../src/profile/learner.js';
import { click, NOW } from './helpers.js';

const DEVICE = 'device-claude-0001';

const goodInput = {
  retailerAffinity: { amazon: 0, walmart: -0.2, samsclub: 0, target: 0.8, costco: 0, bestbuy: 0 },
  priceSensitivity: 0.35,
  speedPreference: 0.4,
  qualityPreference: 0.2,
  memberships: ['costco'],
  categoryAffinity: [{ name: 'Rice Cookers', weight: 1 }],
  brandAffinity: [{ name: 'Zojirushi', weight: 0.7 }],
  summary: 'A Target-loyal shopper who buys kitchen gear.',
  insights: ["You usually pick Target when it's within $3"],
  suggestedQueries: ['Zojirushi Rice Cooker', 'air fryer'],
};

function message(content: unknown[], stop_reason = 'tool_use'): Anthropic.Message {
  return { id: 'msg_1', type: 'message', role: 'assistant', model: 'test', content, stop_reason, stop_sequence: null, usage: {} } as unknown as Anthropic.Message;
}
const toolUse = (input: unknown) => ({ type: 'tool_use', id: 'toolu_1', name: 'save_profile', input });

function fakeClient(impl: (body: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>) {
  const create = vi.fn<ProfilerClient['messages']['create']>((body) => impl(body));
  return { client: { messages: { create } } as ProfilerClient, create };
}

const events: ActivityEvent[] = [
  { type: 'search', ts: NOW - 5000, query: 'rice cooker' },
  ...Array.from({ length: 30 }, () => click('target', { wasCheapest: false, premiumPaid: 3, category: 'Rice Cookers', brand: 'Zojirushi' })),
];
const heuristic = buildHeuristicProfile(DEVICE, events, { now: NOW });
const profiler = (client: ProfilerClient) => new ClaudeProfiler({ client, model: 'claude-haiku-5-5', timeoutMs: 1000 });

describe('ClaudeProfiler.refine', () => {
  it('sends a bounded digest with a cached system prompt and a strict tool, and returns a claude profile', async () => {
    const { client, create } = fakeClient(async () => message([toolUse(goodInput)]));
    const refined = await profiler(client).refine(events, heuristic, NOW);

    expect(refined).toMatchObject({
      deviceId: DEVICE,
      eventCount: heuristic.eventCount,
      source: 'claude',
      priceSensitivity: 0.35,
      retailerAffinity: { target: 0.8, walmart: -0.2 },
      memberships: ['costco'],
      categoryAffinity: { 'Rice Cookers': 1 },
      suggestedQueries: ['zojirushi rice cooker', 'air fryer'],
    });

    const [body, options] = create.mock.calls[0]!;
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(body.tools).toHaveLength(1);
    expect(body.tools![0]).toMatchObject({ name: 'save_profile', strict: true });
    expect(body.system).toEqual([expect.objectContaining({ type: 'text', cache_control: { type: 'ephemeral' } })]);
    expect(body).not.toHaveProperty('temperature');
    expect(options).toMatchObject({ timeout: 1000 });
    const sent = JSON.stringify(body);
    expect(sent).not.toContain(DEVICE); // the device id never leaves the server
  });

  it('keeps the system prompt byte-identical across users (cacheable prefix)', async () => {
    const { client, create } = fakeClient(async () => message([toolUse(goodInput)]));
    await profiler(client).refine(events, heuristic, NOW);
    await profiler(client).refine(events.slice(0, 5), { ...heuristic, deviceId: 'device-other-0002' }, NOW + 99_999);
    expect(create.mock.calls[0]![0].system).toEqual(create.mock.calls[1]![0].system);
    expect(create.mock.calls[0]![0].tools).toEqual(create.mock.calls[1]![0].tools);
  });

  it('clamps out-of-range numbers and drops unknown retailers', async () => {
    const wild = {
      ...goodInput,
      priceSensitivity: 7,
      speedPreference: -3,
      retailerAffinity: { ...goodInput.retailerAffinity, target: 12, ebay: 1 },
      memberships: ['costco', 'costco', 'ebay'],
      categoryAffinity: Array.from({ length: 20 }, (_, i) => ({ name: `C${i}`, weight: 2 })),
      summary: 'x'.repeat(5000),
      insights: Array.from({ length: 15 }, (_, i) => `insight ${i}`),
    };
    const { client } = fakeClient(async () => message([toolUse(wild)]));
    const p = (await profiler(client).refine(events, heuristic, NOW))!;
    expect(p.priceSensitivity).toBe(1);
    expect(p.speedPreference).toBe(0);
    expect(p.retailerAffinity.target).toBe(1);
    expect(p.retailerAffinity).not.toHaveProperty('ebay');
    expect(p.memberships).toEqual(['costco']);
    expect(Object.keys(p.categoryAffinity)).toHaveLength(8);
    expect(Object.values(p.categoryAffinity).every((v) => v === 1)).toBe(true);
    expect(p.summary.length).toBe(600);
    expect(p.insights).toHaveLength(6);
  });

  it.each([
    ['invalid tool input', async () => message([toolUse({ ...goodInput, priceSensitivity: 'high' })])],
    ['missing fields', async () => message([toolUse({ summary: 'hi' })])],
    ['no tool call', async () => message([{ type: 'text', text: 'Here is the profile...' }], 'end_turn')],
    ['refusal', async () => message([], 'refusal')],
    ['truncated', async () => message([toolUse(goodInput)], 'max_tokens')],
    ['thrown error', async () => Promise.reject(new Error('network down'))],
    ['api error', async () => Promise.reject(new Anthropic.APIError(500, undefined, 'server error', undefined))],
  ])('returns null on %s', async (_name, impl) => {
    const { client } = fakeClient(impl as () => Promise<Anthropic.Message>);
    expect(await profiler(client).refine(events, heuristic, NOW)).toBeNull();
  });

  it('parseRefinedProfile never lets the model set identity or provenance', () => {
    const p = parseRefinedProfile({ ...goodInput, deviceId: 'evil', eventCount: 1e9, source: 'none' }, heuristic, NOW) as UserProfile;
    expect(p.deviceId).toBe(DEVICE);
    expect(p.eventCount).toBe(heuristic.eventCount);
    expect(p.source).toBe('claude');
  });
});

describe('buildActivityDigest', () => {
  it('stays bounded no matter how many events there are', () => {
    const many: ActivityEvent[] = Array.from({ length: 5000 }, (_, i) => ({
      type: i % 2 ? 'search' : 'offer_click',
      ts: NOW - i * 1000,
      query: `query number ${i} ${'x'.repeat(150)}`,
      retailerId: 'target',
      category: `Category ${i % 40}`,
      brand: `Brand ${i % 40}`,
    }));
    const digest = buildActivityDigest(many, heuristic, NOW);
    expect(digest.eventsAnalysed).toBe(5000);
    expect(digest.recentEvents.length).toBe(30);
    expect(digest.topQueries.length).toBeLessThanOrEqual(10);
    expect(digest.topCategories.length).toBeLessThanOrEqual(10);
    expect(digest.recentEvents.every((e) => (e.query?.length ?? 0) <= 80)).toBe(true);
    expect(JSON.stringify(digest).length).toBeLessThan(12_000);
    expect(digest.baselineProfile).not.toHaveProperty('deviceId');
  });
});

describe('ProfileLearner with Claude', () => {
  function setup(impl: () => Promise<Anthropic.Message>, opts: { cooldownMs?: number } = {}) {
    const store = new Store(':memory:');
    const { client, create } = fakeClient(impl);
    let now = NOW;
    const learner = new ProfileLearner(store, null, profiler(client), {
      debounceMs: 1,
      claudeEveryNEvents: 25,
      claudeCooldownMs: opts.cooldownMs ?? 60_000,
      now: () => now,
    });
    const ingest = async (n: number) => {
      store.insertEvents(DEVICE, Array.from({ length: n }, () => click('target', { wasCheapest: false, premiumPaid: 3 })));
      learner.notify(DEVICE);
      await learner.flush();
    };
    return { store, learner, create, ingest, advance: (ms: number) => (now += ms) };
  }

  it('runs only after N events, then respects the cooldown', async () => {
    const t = setup(async () => message([toolUse(goodInput)]));
    await t.ingest(10);
    expect(t.create).not.toHaveBeenCalled();
    expect(t.learner.getProfile(DEVICE).source).toBe('heuristic');

    await t.ingest(20); // 30 total >= 25
    expect(t.create).toHaveBeenCalledTimes(1);
    const p = t.learner.getProfile(DEVICE);
    expect(p.source).toBe('claude');
    expect(p.eventCount).toBe(30);
    expect(p.retailerAffinity.target).toBe(0.8);

    await t.ingest(30); // enough new events, but inside the cooldown
    expect(t.create).toHaveBeenCalledTimes(1);
    expect(t.learner.getProfile(DEVICE).eventCount).toBe(60);

    t.advance(60_001);
    await t.ingest(1);
    expect(t.create).toHaveBeenCalledTimes(2);
  });

  it('keeps the heuristic profile when Claude fails, and backs off', async () => {
    const t = setup(async () => Promise.reject(new Error('boom')));
    await t.ingest(30);
    expect(t.create).toHaveBeenCalledTimes(1);
    const p = t.learner.getProfile(DEVICE);
    expect(p.source).toBe('heuristic');
    expect(p.retailerAffinity.target).toBeGreaterThan(0.5);
    await t.ingest(30);
    expect(t.create).toHaveBeenCalledTimes(1); // cooldown applies to failures too
  });

  it('falls back to the heuristic profile once the Claude profile is stale', async () => {
    const t = setup(async () => message([toolUse(goodInput)]));
    await t.ingest(30);
    expect(t.learner.getProfile(DEVICE).source).toBe('claude');
    await t.ingest(100); // 4 x N new events with no refresh allowed
    expect(t.learner.getProfile(DEVICE).source).toBe('heuristic');
  });

  it('does not write a profile back if the device is erased mid-request', async () => {
    let release!: (m: Anthropic.Message) => void;
    const t = setup(() => new Promise<Anthropic.Message>((r) => (release = r)));
    t.store.insertEvents(DEVICE, Array.from({ length: 30 }, () => click('target')));
    t.learner.notify(DEVICE);
    const flushed = t.learner.flush();
    await vi.waitFor(() => expect(t.create).toHaveBeenCalledTimes(1));
    t.learner.forget(DEVICE);
    release(message([toolUse(goodInput)]));
    await flushed;
    expect(t.store.getRow(DEVICE)).toBeNull();
    expect(t.store.storedEventCount(DEVICE)).toBe(0);
    expect(t.learner.getProfile(DEVICE).source).toBe('none');
  });
});
