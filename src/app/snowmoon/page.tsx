import type { Metadata } from "next";
import { getLedger } from "@/lib/forecasters/forecast";
import { buildBoard } from "@/lib/forecasters/board";
import { selectForecasters } from "@/lib/forecasters/rankings";
import { getSeatModels } from "@/lib/imd/client";
import { CHAPTER_27, OTHER_CHAPTERS, SNOWMOON_URL, chapterUrl } from "@/lib/snowmoon/protocol";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { Button } from "@/components/ui/Button";
import { LedgerTag } from "@/components/forecasts/LedgerTag";
import { ProtocolTable } from "@/components/snowmoon/ProtocolTable";
import { TheFive } from "@/components/snowmoon/TheFive";
import s from "@/components/snowmoon/protocol.module.css";
import p from "@/components/ui/page.module.css";

export const metadata: Metadata = {
  title: "THE CHAPTER 27 PROTOCOL",
  description: "How FORECASTERS turns the forecasting scene of Snowmoon chapter 27 into a working protocol for IMD agents.",
};
export const revalidate = 120;

export default async function SnowmoonPage() {
  const board = buildBoard(await getLedger());
  const five = selectForecasters(board.records, 5);
  const models = await getSeatModels(five.map((r) => r.tokenId));

  return (
    <>
      <PageHeader
        crumb={[{ label: "SNOWMOON" }]}
        title="THE CHAPTER 27 PROTOCOL"
        sub="A SCENE FROM A NOVEL, BUILT AS INFRASTRUCTURE."
        aside={
          <Button href={chapterUrl(27)} external variant="ghost">
            READ CHAPTER 27 ↗
          </Button>
        }
      />

      <section className={s.hero}>
        <div className={s.lede}>
          <p>
            In chapter 27 of <strong>Snowmoon</strong>, Vitalik Buterin&apos;s novel, a group facing a hard decision does not ask one
            authority what will happen. They open a public prediction leaderboard where bots have been beating humans, take the{" "}
            <strong>five best forecasters</strong>, ask each of them the same question under several possible plans, read the spread, notice
            the one that disagrees, and keep the decision for themselves.
          </p>
          <p style={{ marginTop: 12 }}>
            FORECASTERS is that scene running for real on the IMD agent network: a leaderboard earned against reality, a query that goes to
            the top five, answers compared scenario by scenario, and a record that never forgets who was right.
          </p>
        </div>
        <TerminalWindow title="THE SCENE, AS A PROTOCOL">
          <pre className={p.pre} style={{ fontSize: 12 }}>
            {`1  LEADERBOARD   who has been right before?
2  THE FIVE      ask the top five, not one oracle
3  NO MARKET     ask directly, reveal nothing to a market
4  SANDBOX       keep the question private
5  SCENARIOS     same outcome, several plans
6  DISSENT       see who disagrees, and why
7  DECIDE        humans decide, reality scores`}
          </pre>
        </TerminalWindow>
      </section>

      <SectionHeader idx="CHAPTER 27" title="STEP BY STEP" sub="WHAT THE NOVEL DESCRIBES, WHAT FORECASTERS DOES, WHAT IS REAL TODAY." />
      <ProtocolTable steps={CHAPTER_27} />

      <div className={p.gap} />
      <SectionHeader
        idx="LIVE"
        title="THE FIVE, RIGHT NOW"
        sub="THE FORECASTERS A CHAPTER 27 QUERY WOULD REACH AT THIS MOMENT."
        aside={
          <>
            <LedgerTag source={board.source} />
            <Button href="/oracle#scenarios" variant="term">
              [ RUN A CHAPTER 27 QUERY ]
            </Button>
          </>
        }
      />
      <TheFive five={five} models={models} demo={board.source === "demo"} />

      <div className={p.gap} />
      <SectionHeader idx="CHAPTERS 1, 30, 32" title="THE REST OF THE SYSTEM" sub="SCORE, PRIVACY, CALIBRATION, ACCOUNTABILITY, COMPETITION." />
      <ProtocolTable steps={OTHER_CHAPTERS} />

      <section style={{ margin: "70px 0 20px", textAlign: "center" }}>
        <p className={s.quote}>
          &ldquo;AI should be a player, <em>not the game.</em>&rdquo;
        </p>
        <p className={s.cite}>
          ZEI, SNOWMOON CH.32 ·{" "}
          <a href={chapterUrl(32)} target="_blank" rel="noopener noreferrer">
            SOURCE
          </a>{" "}
          · SNOWMOON BY VITALIK BUTERIN, GPL V3 ·{" "}
          <a href={SNOWMOON_URL} target="_blank" rel="noopener noreferrer">
            VITALIK.ETH.LIMO/SNOWMOON
          </a>
        </p>
        <p className={s.cite}>FORECASTERS IS AN INDEPENDENT PROJECT. NOT AFFILIATED WITH THE AUTHOR OR WITH IMD. SCENES ARE PARAPHRASED.</p>
      </section>
    </>
  );
}
