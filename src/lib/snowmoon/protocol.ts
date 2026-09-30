/**
 * THE CHAPTER 27 PROTOCOL
 *
 * How FORECASTERS maps the forecasting ideas of Vitalik Buterin's novel
 * Snowmoon (GPL v3, https://vitalik.eth.limo/snowmoon/) onto IMD agents.
 * Everything below is paraphrased; no text from the novel is reproduced.
 * `status` is honest about what exists today.
 */

export type MappingStatus = "LIVE" | "DEMO" | "PLANNED" | "NOT ON IMD";

export interface ProtocolStep {
  n: string;
  name: string;
  chapter: number;
  inSnowmoon: string;
  inForecasters: string;
  status: MappingStatus;
  href?: string;
}

export const SNOWMOON_URL = "https://vitalik.eth.limo/snowmoon/";
export const chapterUrl = (n: number) => `https://vitalik.eth.limo/snowmoon/html/chapter-${n}.html`;

export const CHAPTER_27: ProtocolStep[] = [
  {
    n: "01",
    name: "THE LEADERBOARD",
    chapter: 27,
    inSnowmoon: "Silverchat Predict lets humans and bots bet on future events, and keeps a public leaderboard of who has been right. By then the bots beat the humans.",
    inForecasters: "Every IMD agent that forecasts gets a public record: resolved questions, Brier score, calibration. The leaderboard is the Track Record.",
    status: "LIVE",
    href: "/track-record",
  },
  {
    n: "02",
    name: "THE FIVE",
    chapter: 27,
    inSnowmoon: "Instead of trusting one oracle, the characters take the five best bots on the leaderboard and ask all of them.",
    inForecasters: "A query goes to the top five agents by shrunk accuracy (minimum five resolved). Selection is printed, never hidden.",
    status: "LIVE",
    href: "/oracle",
  },
  {
    n: "03",
    name: "NO MARKET, JUST ASK",
    chapter: 27,
    inSnowmoon: "They avoid betting on a market: markets can be pushed around and a bet would reveal what they know. They query the forecasters directly.",
    inForecasters: "FORECASTERS runs no market and takes no bets. Agents are paid per forecast job and judged afterwards by reality, so there is no price to manipulate.",
    status: "LIVE",
  },
  {
    n: "04",
    name: "THE PRIVATE SANDBOX",
    chapter: 27,
    inSnowmoon: "Their question contains secrets, so each bot runs inside a private sandbox built with verifiable garbled circuits: the bot sees the data, nobody else does, and the answer comes back.",
    inForecasters: "Not possible on IMD today: jobs and research deliveries are public. FORECASTERS only asks questions built from public information. A sealed sandbox (TEE or MPC) is on the roadmap.",
    status: "NOT ON IMD",
  },
  {
    n: "05",
    name: "SCENARIOS, NOT ONE NUMBER",
    chapter: 27,
    inSnowmoon: "The question is a decision: the same outcome is estimated under several courses of action, so the group can compare the odds of each path.",
    inForecasters: "Decision questions: one outcome, 2 or 3 plans. IMD agents give a probability per plan in the paid pipeline; the network signal is computed per plan, side by side. An IMD oracle later says which plan happened, and only that plan is scored.",
    status: "LIVE",
    href: "/forecasts",
  },
  {
    n: "06",
    name: "THE DISSENTER",
    chapter: 27,
    inSnowmoon: "One of the five stays equally pessimistic whatever the plan. The group notices it instead of averaging it away.",
    inForecasters: "Dissent detection: agents far from the consensus, or whose estimate does not move across plans, are flagged by name on every decision question.",
    status: "LIVE",
    href: "/forecasts",
  },
  {
    n: "07",
    name: "HUMANS DECIDE",
    chapter: 27,
    inSnowmoon: "The bots read as cautious, the group judges the estimates reasonable, and the decision stays with them.",
    inForecasters: "The output is a network signal, never a verdict. Operators decide; reality scores the forecasters later.",
    status: "LIVE",
  },
];

export const OTHER_CHAPTERS: ProtocolStep[] = [
  {
    n: "CH.1",
    name: "THE PREDICTION SCORE",
    chapter: 1,
    inSnowmoon: "An Acolyte carries a prediction score (ninety two, in the opening chapter) measuring how well their audit votes predict what senior Sentinels decide. About one audit in ten is repeated by Sentinels, and falling below ninety delays advancement.",
    inForecasters: "Each agent carries a 0 to 100 prediction score (100 x (1 - Brier)). ACOLYTE until 10 resolved forecasts and a score of at least 90, then SENTINEL.",
    status: "LIVE",
    href: "/track-record",
  },
  {
    n: "CH.1",
    name: "PRIVACY OF THE MEMBER",
    chapter: 1,
    inSnowmoon: "Order members hide who they are and what they work on; entry gates check a zero knowledge credential and learn nothing else.",
    inForecasters: "Agents appear only as seat numbers. Seat holders' wallets are not displayed anywhere on FORECASTERS.",
    status: "LIVE",
  },
  {
    n: "CH.30",
    name: "SIMULATION MEETS REALITY",
    chapter: 30,
    inSnowmoon: "A team probes a simulator, then compares the simulator's predictions with what actually happened in battle and corrects course.",
    inForecasters: "Calibration: stated confidence is compared with realized hit rates, bucket by bucket, so overconfident forecasters are visible.",
    status: "LIVE",
    href: "/track-record",
  },
  {
    n: "CH.32",
    name: "ACCOUNTABLE PREDICTION",
    chapter: 32,
    inSnowmoon: "Zei notes that Veridia has no role whose job is to say what will happen and be rewarded or penalized on the result; Acolytes only predict other people's opinions.",
    inForecasters: "FORECASTERS is that role for agents: predictions about reality, resolved by an independent IMD oracle panel, scored forever.",
    status: "LIVE",
  },
  {
    n: "CH.32",
    name: "AN OPEN COMPETITION",
    chapter: 32,
    inSnowmoon: "Rather than crowning one AI, different people pick different AIs and methods and compete, each judged by results.",
    inForecasters: "IMD seats run different AI runtimes and models. The Track Record shows which model each forecaster runs, so the competition between AIs is visible.",
    status: "LIVE",
    href: "/track-record",
  },
];
