/** /setup resumes at the first step neither answered nor skipped, or goes home. */
import type { GetServerSideProps } from "next";
import { db } from "../../lib/db";
import { loadClient } from "../../lib/client";

export const config = { unstable_runtimeJS: false };

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { rows } = await db().query("select app.setup_next_step($1) as step", [loaded.client.id]);
  const step = rows[0]?.step as string | null;
  return { redirect: { destination: step ? `/setup/${step}` : "/", permanent: false } };
};

export default function Setup() {
  return null;
}
