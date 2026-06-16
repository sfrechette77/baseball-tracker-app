'use client'

import Link from 'next/link'
import { BottomNav } from '@/components/BottomNav'
import { useActiveOrg } from '@/components/org-context'

const LEAGUE_RULES = [
  {
    section: '1. Mission Statement',
    content: 'The Mid Suburban Baseball League (MSBL) was founded to provide travel teams from local communities with a fair, flexible, and affordable way to compete in organized league and tournament play. Our mission is to promote good sportsmanship, inclusiveness, and respect for all players, coaches, and families, while allowing teams to shape their own schedules based on field availability and needs.'
  },
  {
    section: '2. League Entry',
    content: [
      'Entry is by invitation only.',
      'League entry fee is $600 ($800 for 15/16U). Includes the MSBL Tournament. Teams must complete 75% of regular season games to be eligible.',
      'Teams must upload a Certificate of Insurance to the MSBL website. Birth certificates produced within 24 hours of coach request.',
      '2025 B/National Regular Season Champions must register for A/American division in 2026.'
    ]
  },
  {
    section: '3. Rostered Players and Coaches',
    content: [
      'Maximum of 15 players per team. No add/replace players after 3/31/2026.',
      'Limit of 3 coaches + 1 manager + 1 scorekeeper in dugout at any one time.',
      'Late arrivals placed at end of batting order.',
      'Players can only be rostered on one MSBL team.',
      'No "Hired Gun" rule: rostered players must have played in 70% of games to be used (calculation begins on the 11th game).',
      'Exceptions: Injury/illness games not counted. House players as fill-ins eligible. Travel players playing up require notification and approval.'
    ]
  },
  {
    section: '4. Games',
    content: [
      'League games begin no earlier than April 1st. Approximately 16-20 games per season (8U: 10-12).',
      '11U Regular Season ends 11:59 PM 6/22/2026, Bracket Play 6/25 – 6/28.',
      'No double-booking. 14-day notice required for postponement due to scheduling conflicts.',
      'Home team manager must contact visiting team at least 1½ hours before game time to cancel due to weather.',
      'Home team supplies one "patched" umpire (IHSA preferred) and two new game balls (Rawlings ROLB, ROLB1 R100, or Wilson).',
      'Wait 15 minutes after scheduled time for traveling teams. Game can begin with 8 players (9th spot is automatic out).',
      'Teams must play 100% of scheduled games. Forfeits scored 6-0 (8U-10U) or 7-0 (11U-14U).',
      'Hosting team selects their dugout regardless of scheduled "home team".'
    ]
  },
  {
    section: '5. Playing Rules — 11U Specific',
    content: [
      'Base Distance: 70\'',
      'Pitching Distance: 50\'',
      'Pitching Inning Limit: 3 innings (3 consecutive outs = 1 inning)',
      'Game Length: 7 innings (official after 5 innings)',
      'Bunts: Allowed',
      'Steals: Allowed',
      'Leadoffs: Allowed',
      'Balks: 1 warning per pitcher per inning',
      'Dropped Third Strike: Yes',
      'Infield Fly: Yes',
      'Metal Spikes: No',
      'Breaking Balls: No',
      'Run Rule: 12 runs after 4 innings, 10 runs after 5 innings'
    ]
  },
  {
    section: '5. General Playing Rules',
    content: [
      'IHSA rules apply unless otherwise noted.',
      'Tied games at end of regulation play California Rules: extra inning starts with 1 out, last batted out on 2nd base, 1-1 count.',
      'Continuous batting lineup. Free defensive substitutions. Players leaving early result in automatic out (with exceptions for pre-announced or injury).',
      'Courtesy Runners: Allowed for catchers, pitchers, and injured players. Must be last batted out.',
      'Avoid Contact Rule: Runners must slide or attempt to avoid contact. Malicious contact may result in ejection.',
      'Run Rule: 12 runs after 4 innings, 10 runs after 5 innings.',
      'Bunt Rule: Batters showing bunt must bunt or take the pitch. No swinging after showing bunt.',
      'Pitching: 1 free mound visit per inning, 2 per pitcher per game. Removed pitchers cannot re-enter as pitchers. Pitcher hitting 3 batters in a game must be removed.'
    ]
  },
  {
    section: '6. Equipment',
    content: [
      'No metal spikes at 8U-12U.',
      'Helmets required for batters, on-deck hitters, base runners, and player base coaches.',
      'No jewelry.',
      'Bats must be marked "1.15 BPF", "USSSA", "USA", "BBCOR", or be wood. 13U: -8 minimum. 14U: -5 or -3 only.',
      'Protective cup required for all players. Catchers must wear full catcher\'s equipment.'
    ]
  },
  {
    section: '7. Conduct',
    content: [
      'Only team managers may discuss calls with umpires (rules questions only — judgment calls are final).',
      'Ejections: 1st = warning + up to 1 game suspension. 2nd = minimum 3 game suspension. 3rd = Disciplinary Committee.',
      'Ejections must be reported by both managers within 24 hours.',
      'Team managers responsible for conduct of coaches, players, and fans.',
      'No vocal distractions during pitcher\'s wind-up. No protests allowed.',
      'Disputes (rules, not judgment calls) submitted via email to MSBL — final decision by MSBL.'
    ]
  },
  {
    section: '8. Tie Breakers — Divisional Standings',
    content: [
      '1. Best record in head-to-head competition (2 teams only).',
      '2. Best division/conference record.',
      '3. Fewest runs allowed overall.',
      '4. Most runs scored overall.',
      '5. One game playoff.'
    ]
  },
  {
    section: '9. MSBL Tournament',
    content: [
      'All teams required to participate. Must complete 75% of regular season games to be eligible.',
      'Format: Single elimination. Teams seeded into "Gold" or "Silver" bracket based on regular season record.',
      'Two tournament winners per league level (Gold + Silver).',
      'Seeding Tie Breakers: Head-to-head → Runs Allowed → Runs Scored → Coin Flip.'
    ]
  }
]

export default function RulesPage() {
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  return (
    <main className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto max-w-sm px-4 pt-6 pb-2">
        <p
          className="text-xl tracking-[0.1em] font-bold"
          style={{ color: brandColor }}
        >
          2026
        </p>
        <h1 className="text-3xl font-extrabold text-white mt-1">MSBL Rules</h1>
        <Link
          href="/team?view=standings"
          className="mt-3 inline-block text-sm"
          style={{ color: brandColor }}
        >
          ← Back to Standings
        </Link>
      </div>
      <div className="mx-auto max-w-sm space-y-4 px-4 pt-4">
        <section>
          <div className="space-y-2">
            {LEAGUE_RULES.map((rule) => (
              <details key={rule.section} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <summary className="cursor-pointer text-sm font-bold text-white">
                  {rule.section}
                </summary>
                <div className="mt-3 text-sm text-slate-300 space-y-2">
                  {Array.isArray(rule.content) ? (
                    <ul className="list-disc list-inside space-y-1.5">
                      {rule.content.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{rule.content}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 text-center">
            Source: 2026 MSBL Official League Rules
          </p>
        </section>
      </div>
      <BottomNav active="team" />
    </main>
  )
}