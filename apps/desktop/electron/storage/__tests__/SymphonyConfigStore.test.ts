import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './testDb';
import { SymphonyConfigStore } from '../stores/SymphonyConfigStore.js';

function makeStore(): SymphonyConfigStore {
  const db = createTestDb();
  const store = new SymphonyConfigStore(db);
  store.initialize();
  return store;
}

describe('SymphonyConfigStore', () => {
  let store: SymphonyConfigStore;
  beforeEach(() => { store = makeStore(); });

  it('returns null for unknown project', () => {
    expect(store.get('proj-1')).toBeNull();
  });

  it('upserts and retrieves config', () => {
    store.upsert({ projectId: 'proj-1', trackerKind: 'linear', apiKey: 'key-abc', projectSlug: 'my-team/my-proj' });
    const cfg = store.get('proj-1');
    expect(cfg).not.toBeNull();
    expect(cfg!.trackerKind).toBe('linear');
    expect(cfg!.apiKey).toBe('key-abc');
    expect(cfg!.projectSlug).toBe('my-team/my-proj');
  });

  it('updates existing config on second upsert', () => {
    store.upsert({ projectId: 'proj-1', trackerKind: 'linear', apiKey: 'old', projectSlug: 'slug' });
    store.upsert({ projectId: 'proj-1', trackerKind: 'github', apiKey: 'new', projectSlug: 'owner/repo' });
    const cfg = store.get('proj-1');
    expect(cfg!.trackerKind).toBe('github');
    expect(cfg!.apiKey).toBe('new');
  });

  it('deletes config', () => {
    store.upsert({ projectId: 'proj-1', trackerKind: 'linear', apiKey: 'k', projectSlug: 's' });
    store.delete('proj-1');
    expect(store.get('proj-1')).toBeNull();
  });
});
