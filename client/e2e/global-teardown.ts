import { cleanupE2eData } from "./fixtures/db";

/**
 * The suite creates real users and real games in `blurtz_test`. Everything it
 * creates is named `e2e_*`, and this removes all of it - including anything a
 * previous crashed run left behind, which is what keeps the suite re-runnable
 * without manual surgery.
 */
export default async function globalTeardown(): Promise<void> {
  await cleanupE2eData();
}
