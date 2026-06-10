import { useEffect, useState } from 'react';

interface TocEntry {
  id: string;
  label: string;
}

const toc: TocEntry[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'getting-started', label: 'Getting started' },
  { id: 'pages', label: 'Tour of the pages' },
  { id: 'ratings', label: 'Ratings (Glicko-2)' },
  { id: 'ladder', label: 'Challenge ladder' },
  { id: 'vacation', label: 'Vacation mode' },
  { id: 'matches', label: 'Logging matches' },
  { id: 'undo', label: 'Undo (admin)' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'profile-badges', label: 'Player profile & badges' },
  { id: 'stats', label: 'Aggregate stats' },
  { id: 'roles', label: 'Roles & permissions' },
  { id: 'glossary', label: 'Glossary' },
];

export default function Docs() {
  const [activeId, setActiveId] = useState<string>(toc[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    for (const { id } of toc) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
      <aside className="hidden lg:block">
        <nav className="sticky top-6 space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Contents
          </p>
          {toc.map((entry) => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              className={`block px-2 py-1 rounded transition-colors ${
                activeId === entry.id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </aside>

      <article className="space-y-6 min-w-0">
        <header>
          <h1 className="text-2xl font-bold">Afterpong Documentation</h1>
          <p className="text-slate-400 text-sm mt-1">
            Everything the app does, what the numbers mean, and how the rules
            actually work.
          </p>
        </header>

        <Section id="overview" title="Overview">
          <p>
            Afterpong is an office ping-pong tracker. It keeps an ongoing record
            of every match played and uses that record to compute three
            interlocking views of who's good and who's hot:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Rating leaderboard</strong> — a continuous Glicko-2 skill
              rating that updates after every match.
            </li>
            <li>
              <strong>Challenge ladder</strong> — a discrete ordering where you
              can only fight your immediate neighbors.
            </li>
            <li>
              <strong>Tournaments</strong> — occasional single-elimination
              brackets seeded from current ratings.
            </li>
          </ul>
          <p className="mt-2">
            Sign in once, log matches when you play, browse the rest. There is
            no fancy onboarding — everyone shares one set of credentials.
          </p>
        </Section>

        <Section id="getting-started" title="Getting started">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>Sign in</strong> on the login page with the shared
              password. The same password decides whether you land as a regular
              user or as an admin — there are no usernames.
            </li>
            <li>
              <strong>Add yourself</strong> on the Leaderboard page if you're
              new. A fresh player starts at a skill rating of <Mono>1500</Mono>{' '}
              with maximum uncertainty (<Mono>±350</Mono>), so their leaderboard
              score starts near the bottom and climbs quickly as they play. New
              players also get appended to the bottom of the challenge ladder.
            </li>
            <li>
              <strong>Play a match</strong>, then click <em>Log a match</em>{' '}
              and record the result.
            </li>
            <li>
              Browse Stats, Tournaments, and individual player profiles to see
              what's been happening.
            </li>
          </ol>
        </Section>

        <Section id="pages" title="Tour of the pages">
          <dl className="space-y-3">
            <Page name="Ladder" path="/">
              The challenge ladder, ordered top to bottom. From here you can
              see who can challenge whom, mark a player as on vacation (admin),
              and log a match between two adjacent players.
            </Page>
            <Page name="Leaderboard" path="/leaderboard">
              Players ranked by their conservative rating (see{' '}
              <a className="underline" href="#ratings">Ratings</a>). Add new
              players here.
            </Page>
            <Page name="Matches" path="/matches">
              Reverse-chronological history of every match. Filter by one or
              two players to scope it down. Admins can undo the most recent
              match from this page.
            </Page>
            <Page name="Stats" path="/stats">
              League-wide superlatives: longest streaks, biggest upsets,
              biggest climbers, most-defended titles, who shows up most often
              as someone else's nemesis or friend.
            </Page>
            <Page name="Tournaments" path="/tournaments">
              List of past and active tournaments. Admins start a new one from
              here.
            </Page>
            <Page name="Tournament detail" path="/tournaments/:id">
              The bracket, round by round. Click a slot to log that match.
            </Page>
            <Page name="Player profile" path="/players/:id">
              Per-player stats, rating history chart, recent form, head-to-head
              against every opponent, and the three relationship badges.
            </Page>
            <Page name="Docs" path="/docs">
              This page.
            </Page>
          </dl>
        </Section>

        <Section id="ratings" title="Ratings (Glicko-2)">
          <p>
            Afterpong uses <strong>Glicko-2</strong>, a Bayesian successor to
            ELO designed for small pools and uneven play frequency. Every
            player carries three numbers:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Skill rating</strong> — best estimate of strength.
              Starts at <Mono>1500</Mono>.
            </li>
            <li>
              <strong>RD (rating deviation)</strong> — how uncertain that
              estimate is. Starts at <Mono>350</Mono>, shrinks as you play, and
              grows back while you're idle.
            </li>
            <li>
              <strong>Volatility</strong> — how erratic your results have been.
              Erratic players' ratings move more.
            </li>
          </ul>
          <p className="mt-2">
            The leaderboard ranks and displays the{' '}
            <strong>conservative rating</strong>:
          </p>
          <pre className="bg-slate-900 border border-slate-700 rounded p-3 text-xs overflow-x-auto mt-2">
{`leaderboard score = skill rating − 2 × RD`}
          </pre>
          <p className="mt-2">
            Read it as "we're confident you're at least this good." A brand-new
            player at 1500 ±350 scores 800 and starts near the bottom — winning
            doesn't just raise their rating, it shrinks their RD, so the score
            climbs fast over the first ~10 games. No more squatting mid-table
            on one lucky win.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              Ratings update after <strong>every match</strong>. How much they
              move scales with both players' uncertainty: new players move in
              big steps, established players in small ones.
            </li>
            <li>
              Glicko-2 is <strong>not zero-sum</strong> and there is no fixed
              maximum swing — the winner's gain and loser's loss can differ.
            </li>
            <li>
              <strong>Idle time grows RD.</strong> Skip a few weeks and the
              system trusts your old rating less; on return, your rating
              re-converges quickly to wherever you actually are.
            </li>
            <li>
              An <strong>upset</strong> is any win where the winner's pre-match
              win probability was below <Mono>37.5%</Mono>.
            </li>
          </ul>
          <p className="mt-2">
            All match types (challenge, tournament, casual) change ratings the
            same way. The only difference is the <em>side effects</em>:
            challenges can swap ladder positions, tournament matches advance
            the bracket.
          </p>
        </Section>

        <Section id="ladder" title="Challenge ladder">
          <p>
            The ladder is a strict ordering of players. Lower rank number =
            higher position. New players are appended to the bottom.
          </p>
          <Rule label="Who can challenge whom">
            Two players can play a challenge match only if there is{' '}
            <strong>at most one other active player</strong> between them on
            the ladder. In practice this means you can challenge your immediate
            neighbor, or jump one slot. Vacationing players are skipped over
            entirely — see <a className="underline" href="#vacation">vacation mode</a>.
          </Rule>
          <Rule label="What happens after">
            If the lower-ranked player wins, the two players <strong>swap</strong>{' '}
            ladder positions. There is no cascade — nobody else moves. If the
            higher-ranked player wins, the ladder is unchanged. Either way, both
            players' ratings update as normal.
          </Rule>
          <Rule label="Non-challenge matches">
            Casual matches affect ratings but never the ladder. To play a match
            that <em>could</em> swap ladder positions, the logger has to
            explicitly tick the <em>challenge</em> box.
          </Rule>
        </Section>

        <Section id="vacation" title="Vacation mode">
          <p>
            Players who are away can be marked as on vacation (admin action,
            done from the Ladder page). While on vacation:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              They <strong>keep their ladder position</strong> for when they
              return.
            </li>
            <li>
              They are <strong>transparent</strong> for adjacency rules — a
              player can challenge across them as if they weren't there.
            </li>
            <li>
              They <strong>cannot be entered</strong> as a winner or loser on a
              regular logged match. (Tournament matches are exempt because the
              bracket was set before they left.)
            </li>
          </ul>
          <p className="mt-2">
            Toggling vacation off restores normal eligibility immediately. The
            skill rating itself doesn't drift during vacation, but RD grows
            with idle time — so a returning player's leaderboard score is a
            little lower, and their first matches back move their rating
            faster while the system re-confirms where they stand.
          </p>
        </Section>

        <Section id="matches" title="Logging matches">
          <p>
            Any signed-in user can log a match. The match form captures:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Winner and loser</strong>.</li>
            <li>
              <strong>Per-game scores</strong>. A match can be one game or a
              best-of series. The series score (e.g. <Mono>2–1</Mono>) is
              derived from the games you enter, not stored separately.
            </li>
            <li>
              <strong>Challenge flag</strong>. Only set this if both players
              are on the ladder within range. The API rejects invalid
              challenges.
            </li>
          </ul>
          <p className="mt-2">
            <strong>Validation:</strong> the winner must have won strictly more
            games than the loser, all scores must be non-negative, and the two
            players must be different. Rating updates and any ladder swap
            happen atomically with the match insert.
          </p>
        </Section>

        <Section id="undo" title="Undo (admin)">
          <p>
            Admins can undo the most recent match from the Matches page. The
            undo:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              Restores both players' exact pre-match rating state (skill
              rating, RD, volatility, and last-played time) from the stored
              snapshots.
            </li>
            <li>Reverts the ladder swap, if one happened.</li>
            <li>
              For tournament matches, clears the played-match link and pulls
              the advanced player back out of the next-round slot.
            </li>
            <li>Deletes the match row.</li>
          </ul>
          <p className="mt-2">
            <strong>Limitation:</strong> a tournament match cannot be undone if
            the <em>next round</em> for those players has already been played —
            undo the later match first. This keeps the bracket consistent.
          </p>
          <p className="mt-2 text-slate-400">
            Note: every match stores pre-match snapshots (ladder ranks and the
            full rating state of both players), so undo doesn't have to replay
            history — it just reads the snapshot.
          </p>
        </Section>

        <Section id="tournaments" title="Tournaments">
          <p>
            Tournaments are single-elimination brackets. Only one tournament
            can be active at a time. Admins create them; anyone can log matches
            in them.
          </p>
          <Rule label="Seeding">
            <strong>Snake</strong> seeds by leaderboard rating descending
            (highest is seed 1, lowest is seed N). <strong>Random</strong>{' '}
            shuffles participants. The bracket itself uses standard 1-vs-N
            placement.
          </Rule>
          <Rule label="Byes">
            If the participant count isn't a power of two, the bracket is
            padded up to the next power of two and the top seeds receive byes
            into round 2. Byes are applied automatically when the tournament is
            created.
          </Rule>
          <Rule label="Playing">
            From the bracket page, click any slot whose two players are known
            and log the result. The winner is automatically slotted into the
            next round. Tournament matches still count toward ratings and
            global stats.
          </Rule>
          <Rule label="Completion">
            When the final match is logged, the tournament is marked completed
            and the winner is recorded. Undoing the final match reopens the
            tournament.
          </Rule>
        </Section>

        <Section id="profile-badges" title="Player profile & badges">
          <p>
            Each player page shows wins/losses, current streak, recent form
            (last 5), peak/min rating, a rating chart, and head-to-head records
            against every opponent. It also surfaces three relationship badges:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong>Nemesis</strong> — the opponent who has taken the most
              <em> net </em>rating from you. If no opponent has a negative net
              against you, you have no nemesis yet.
            </li>
            <li>
              <strong>Rival</strong> — the opponent (played ≥2 times) with the
              smallest <Mono>|wins − losses|</Mono> gap. Ties favor opponents
              you've both beaten and been beaten by, then most games played,
              then lowest opponent id.
            </li>
            <li>
              <strong>Friend</strong> — the opponent you've played the most
              total games against. Tiebreak by lowest opponent id.
            </li>
          </ul>
          <p className="mt-2 text-slate-400">
            The same logic powers the relationship counts on the Stats page —
            both the profile and stats import from the same shared module so
            they can't drift.
          </p>
        </Section>

        <Section id="stats" title="Aggregate stats">
          <p>
            The Stats page is computed in a single chronological pass over the
            entire match log. Categories:
          </p>
          <dl className="space-y-3 mt-2">
            <StatGroup title="Streaks">
              Current and longest win streaks; current and longest loss
              streaks. Players tied at the top are listed together.
            </StatGroup>
            <StatGroup title="Matches">
              <strong>Biggest upset</strong> — single match where the winner
              had the lowest pre-match win probability.
              <br />
              <strong>Most upsets caused</strong> — players with the most wins
              below the upset threshold.
            </StatGroup>
            <StatGroup title="Players">
              <strong>Peak rating</strong> — highest skill rating ever reached.
              <br />
              <strong>Biggest climber</strong> — largest difference between
              current and personal-minimum rating.
              <br />
              <strong>Biggest faller</strong> — largest difference between
              personal-peak and current rating.
            </StatGroup>
            <StatGroup title="Ladder">
              <strong>Most successful climbs</strong> — most challenge wins as
              the lower-ranked player.
              <br />
              <strong>Best defender</strong> — most challenge wins as the
              higher-ranked player.
            </StatGroup>
            <StatGroup title="Rivalries">
              <strong>Biggest rivalry</strong> — the pair that has played the
              most matches.
              <br />
              <strong>Dominator</strong> — the pair with the largest{' '}
              <em>absolute</em> win-gap (one player far ahead of the other).
            </StatGroup>
            <StatGroup title="Relationships">
              <strong>Most friendly</strong> — most often named as someone's
              Friend.
              <br />
              <strong>Biggest villain</strong> — most often named as someone's
              Nemesis.
              <br />
              <strong>Biggest op</strong> — most often named as someone's
              Rival.
            </StatGroup>
          </dl>
        </Section>

        <Section id="roles" title="Roles & permissions">
          <p>There are two roles, distinguished only by which password you used:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>User</strong> — can do everything except admin actions:
              browse, add players, log matches.
            </li>
            <li>
              <strong>Admin</strong> — additionally can undo the latest match,
              toggle a player's vacation status, and create tournaments.
            </li>
          </ul>
          <p className="mt-2">
            Sessions last 30 days. The token lives in <Mono>localStorage</Mono>;
            an expired token bounces you back to login automatically on the
            next API call.
          </p>
        </Section>

        <Section id="glossary" title="Glossary">
          <dl className="space-y-2">
            <Term word="Glicko-2">
              The rating system Afterpong uses — a Bayesian successor to ELO
              that tracks a skill rating plus an uncertainty (RD) per player.
            </Term>
            <Term word="Skill rating">
              Best estimate of a player's strength. Starts at 1500, moves after
              every match.
            </Term>
            <Term word="RD (rating deviation)">
              How uncertain the skill rating is. Starts at 350, shrinks with
              games played, grows with idle time.
            </Term>
            <Term word="Conservative rating">
              Skill rating − 2×RD. The number the leaderboard ranks and
              displays — "at least this good."
            </Term>
            <Term word="Volatility">
              How erratic a player's results have been. Higher volatility lets
              the rating move faster.
            </Term>
            <Term word="Upset">
              A win where the winner's pre-match win probability was below
              37.5%. Implies the winner was substantially lower-rated going in.
            </Term>
            <Term word="Challenge match">
              A match where the two players are adjacent (or one slot apart,
              skipping vacationers) on the ladder. Winning as the lower-ranked
              player swaps positions.
            </Term>
            <Term word="Climb / Defense">
              On a challenge match: a <em>climb</em> is a win by the
              lower-ranked player; a <em>defense</em> is a win by the
              higher-ranked player.
            </Term>
            <Term word="Bye">
              A free pass to the next round, given to top seeds when the
              participant count is not a power of two.
            </Term>
            <Term word="Snake seeding">
              Seeding strategy that orders players by current leaderboard
              rating, descending — strongest player is seed 1.
            </Term>
          </dl>
        </Section>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="bg-slate-800 border border-slate-700 rounded-lg p-5 scroll-mt-6"
    >
      <h2 className="text-lg font-semibold mb-2">
        <a href={`#${id}`} className="hover:underline">
          {title}
        </a>
      </h2>
      <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
    </section>
  );
}

function Rule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="font-medium text-slate-100">{label}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function Page({ name, path, children }: { name: string; path: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-slate-100">
        {name} <Mono>{path}</Mono>
      </dt>
      <dd className="mt-0.5 text-slate-300">{children}</dd>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-slate-100">{title}</dt>
      <dd className="mt-0.5 text-slate-300">{children}</dd>
    </div>
  );
}

function Term({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-slate-100">{word}</dt>
      <dd className="mt-0.5 text-slate-300">{children}</dd>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1 py-0.5 rounded bg-slate-900 text-slate-200 text-xs font-mono">
      {children}
    </code>
  );
}
