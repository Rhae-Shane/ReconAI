/**
 * Legal-entity registry for the Controller (Workstream W2-D — multi-entity + currency/FX).
 *
 * Reconciliation data is scoped to one or more legal entities, each with its own base currency
 * (the master/base for the whole Controller is INR, in paise). Entities are persisted under
 * `close:entities`; when the list is empty — including when Redis is unconfigured — a single
 * default entity is returned ({ id:"rhae", name:"Rhae", baseCurrency:"INR" }) so callers always
 * get a usable entity without requiring a write.
 */

import { jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

export interface Entity {
  id: string;
  name: string;
  baseCurrency: string;
}

/** The always-available fallback entity, returned when the stored list is empty/unconfigured. */
export const DEFAULT_ENTITY: Entity = { id: "rhae", name: "Rhae", baseCurrency: "INR" };

/** Entities are stored as a list under `close:entities`. */
const ENTITIES_KEY = redisKey("close", "entities");

/**
 * List configured legal entities. When the store is empty (fresh state or Redis unconfigured this
 * returns the default `{ rhae / Rhae / INR }` entity — no write is performed to seed it.
 */
export async function listEntities(): Promise<Entity[]> {
  const list = await jsonGet<Entity[]>(ENTITIES_KEY);
  if (!list || list.length === 0) return [DEFAULT_ENTITY];
  return list;
}

/**
 * Insert or update an entity by `id` (id also substitutes the default when Redis is unconfigured,
 * where the write is a no-op that reports false). Returns false when Redis is unconfigured or the
 * write fails.
 */
export async function upsertEntity(e: Entity): Promise<boolean> {
  const list = (await jsonGet<Entity[]>(ENTITIES_KEY)) ?? [];
  const idx = list.findIndex((x) => x.id === e.id);
  if (idx >= 0) list[idx] = e;
  else list.push(e);
  return jsonSet(ENTITIES_KEY, list);
}
