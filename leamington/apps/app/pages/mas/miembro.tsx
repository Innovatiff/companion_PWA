/**
 * Tu membresía: the member card (app.member_card, 0041) and the badges
 * (app.member_badges). Everything here is free; renewal is only mentioned as
 * available at any Hoy business, never pushed.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { BadgeGrid, MemberCardView, MemberFacts, type Badge, type MemberCard } from "../../lib/member";
import { MIEMBRO_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Props = { lang: "es" | "en"; m: MemberCard; badges: Badge[]; seasonal: boolean };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query("select app.member_card($1) as m, app.member_badges($1) as b", [client.id]);
  const m = rows[0]?.m as MemberCard | null;
  if (!m) return { redirect: { destination: "/login?e=inactive", permanent: false } };
  const badges = (rows[0]?.b ?? []) as Badge[];
  await recordView(client.id, "miembro", {
    founder: m.founder, member_number: m.member_number != null, status: m.status,
    badges_earned: badges.filter((b) => b.earned).length, badges_total: badges.length,
  });
  return { props: { lang: client.language, m, badges, seasonal: client.segment === "seasonal" } };
};

export default function Miembro({ lang, m, badges, seasonal }: Props) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <>
      <Head>
        <title>{`${t(lang, "Miembro", "Member")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: MIEMBRO_CSS }} />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Tu membresía", "Your membership")} art="wave" back />
        <MemberCardView m={m} lang={lang} />
        <MemberFacts m={m} lang={lang} />
        {badges.length > 0 && (
          <>
            <div className="sh"><h2>{t(lang, "Insignias", "Badges")}</h2><span className="chip">{t(lang, `${earned} de ${badges.length}`, `${earned} of ${badges.length}`)}</span></div>
            <BadgeGrid badges={badges} lang={lang} seasonal={seasonal} />
          </>
        )}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
