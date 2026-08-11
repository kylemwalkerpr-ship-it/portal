# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: studio-gate-remediation.spec.ts >> Studio gate remediation (admin) >> Re-audit clears missing_disclaimer blocker and enables the Ship button
- Location: e2e/studio-gate-remediation.spec.ts:233:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByText('Test F-1 Visa Guide 2026').first() to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=e3]:
    - generic [ref=e4]:
      - link "Back to YouSafe Consultancy" [ref=e6] [cursor=pointer]:
        - /url: https://yousafeconsultancy.com
        - img "YouSafe Consultancy" [ref=e7]
        - generic [ref=e8]:
          - generic [ref=e9]: YouSafe
          - text: Admin console
      - generic [ref=e10]:
        - generic [ref=e11]: Overview
        - generic [ref=e12] [cursor=pointer]:
          - generic [ref=e13]: ⬛
          - generic [ref=e14]: Dashboard
        - generic [ref=e15] [cursor=pointer]:
          - generic [ref=e16]: 📊
          - generic [ref=e17]: Analytics
        - generic [ref=e18]: People
        - generic [ref=e19] [cursor=pointer]:
          - generic [ref=e20]: 👥
          - generic [ref=e21]: Users
        - generic [ref=e22] [cursor=pointer]:
          - generic [ref=e23]: ⭐
          - generic [ref=e24]: My Office
        - generic [ref=e25]: Commerce
        - generic [ref=e26] [cursor=pointer]:
          - generic [ref=e27]: 🗂️
          - generic [ref=e28]: Order Kanban
        - generic [ref=e29] [cursor=pointer]:
          - generic [ref=e30]: 📥
          - generic [ref=e31]: Inquiries
        - generic [ref=e32]: Finance
        - generic [ref=e33] [cursor=pointer]:
          - generic [ref=e34]: 💵
          - generic [ref=e35]: Financials
        - generic [ref=e36]: Support
        - generic [ref=e37] [cursor=pointer]:
          - generic [ref=e38]: 🎫
          - generic [ref=e39]: Support Tickets
        - generic [ref=e40] [cursor=pointer]:
          - generic [ref=e41]: ⚙️
          - generic [ref=e42]: Settings
        - generic [ref=e43] [cursor=pointer]:
          - generic [ref=e44]: 📝
          - generic [ref=e45]: Content Studio
      - generic [ref=e47]:
        - generic [ref=e48]: A
        - generic [ref=e49]:
          - generic [ref=e50]: Super Admin
          - generic [ref=e51]: admin@yousafe.com
        - button "Log out" [ref=e52] [cursor=pointer]:
          - generic [ref=e53]: ⏻
          - generic [ref=e54]: Logout
    - generic [ref=e55]:
      - generic [ref=e56]:
        - heading "Admin" [level=1] [ref=e57]
        - generic [ref=e58]:
          - 'button "Language: English. Click to change." [ref=e60] [cursor=pointer]':
            - generic [ref=e61]: 🌐
            - generic [ref=e62]: EN
            - generic [ref=e63]: ▾
          - generic [ref=e64]: 0 approvals
          - generic [ref=e65]: 0 orders
          - button "🔔" [ref=e67] [cursor=pointer]
          - button "Super Admin account menu" [ref=e69] [cursor=pointer]:
            - generic [ref=e70]: SA
            - generic [ref=e71]: ⌄
      - generic [ref=e73]:
        - generic [ref=e74]:
          - generic [ref=e75]:
            - generic [ref=e76]: THE CONTENT STUDIO · AUGUST 11, 2026
            - heading "One Pipeline, End‑to‑End." [level=1] [ref=e77]
            - paragraph [ref=e78]: From SEO Master Engine ingestion to a live, verifiable URL — every step tracked, every PR stamped.
          - generic [ref=e79]:
            - generic [ref=e80]: VOL · I · NO · 100
            - generic [ref=e81]: ENGINE · IDLE
            - button "↻ Refresh desk" [ref=e82] [cursor=pointer]
        - generic [ref=e83]:
          - generic [ref=e84]: QUEUE
          - generic [ref=e85]:
            - generic [ref=e86]: ⚙️
            - generic [ref=e87]: "4"
            - generic [ref=e88]: In Progress
          - generic [ref=e89]:
            - generic [ref=e90]: "|"
            - generic [ref=e91]: 🔀
            - generic [ref=e92]: "0"
            - generic [ref=e93]: PR Ready
          - generic [ref=e94]:
            - generic [ref=e95]: "|"
            - generic [ref=e96]: ✅
            - generic [ref=e97]: "37"
            - generic [ref=e98]: Merged
          - generic [ref=e99]:
            - generic [ref=e100]: "|"
            - generic [ref=e101]: ⚠️
            - generic [ref=e102]: "46"
            - generic [ref=e103]: Failed
          - generic [ref=e104]: 182 total · idle
        - generic [ref=e105]:
          - generic [ref=e106]:
            - generic [ref=e107]: 🧠 SEO Master Engine
            - generic [ref=e108]: v2
            - generic [ref=e109]: 🗺 36 cells · 🌐 44 intel · 🧭 10 plans · 🔗 113 links · 🤖 0% LLM voice · 🛡 0% gate pass
          - generic [ref=e110]:
            - button "🌐 Ingest knowledge" [ref=e111] [cursor=pointer]
            - button "🧭 Run planner" [ref=e112] [cursor=pointer]
            - button "🤖 LLM audit" [ref=e113] [cursor=pointer]
        - navigation "Content Studio pipeline" [ref=e114]:
          - 'tab "Stage I · Discover: GSC · radar · gaps · opportunities" [selected] [ref=e116] [cursor=pointer]':
            - generic [ref=e118]: I
            - generic [ref=e119]: Discover
            - generic [ref=e120]: Signal Intelligence
          - img [ref=e123]
          - 'tab "Stage II · Research: Intent · keywords · interlinks · template" [ref=e125] [cursor=pointer]':
            - generic [ref=e127]: II
            - generic [ref=e128]: Research
            - generic [ref=e129]: Keywords & Brief
          - img [ref=e131]
          - 'tab "Stage III · Draft & Review: 182 jobs · queue · review" [disabled] [ref=e133]':
            - generic [ref=e135]: III
            - generic [ref=e136]: Draft & Review
            - generic [ref=e137]: Generate · Gate · Fix
          - img [ref=e139]
          - 'tab "Stage IV · Approve & Track: PR · deploy · ledger · GSC" [ref=e141] [cursor=pointer]':
            - generic [ref=e143]: IV
            - generic [ref=e144]: Approve & Track
            - generic [ref=e145]: Merge · Deploy · Verify
          - img [ref=e147]
          - 'tab "Stage V · Configure: AI models · API keys · GSC · health" [ref=e149] [cursor=pointer]':
            - generic [ref=e151]: V
            - generic [ref=e152]: Configure
            - generic [ref=e153]: System Settings
        - generic [ref=e154]:
          - generic [ref=e156]:
            - generic [ref=e157]: I
            - generic [ref=e158]:
              - generic [ref=e159]: Chapter I
              - heading "Discover" [level=2] [ref=e160]
            - button "II · Research →" [ref=e162] [cursor=pointer]
          - paragraph [ref=e163]: No research starts until the signals are assembled. Read the live search landscape, engine knowledge, topical gaps, ownership constraints, and visibility signals before committing to a direction.
          - generic [ref=e164]:
            - generic [ref=e165]:
              - text: Signals
              - paragraph [ref=e166]: Live GSC, committed snapshots, engine knowledge, LLM/AEO visibility, and site-health signals.
            - generic [ref=e167]:
              - text: Opportunity
              - paragraph [ref=e168]: Radar and reward forecasts expose gaps, rising demand, weak families, and cannibalization risk.
            - generic [ref=e169]:
              - text: Constraints
              - paragraph [ref=e170]: Ownership registry, destination repo, format rules, and canonical supply are known before research begins.
          - generic [ref=e171]:
            - button "I Discover" [ref=e172] [cursor=pointer]:
              - generic [ref=e173]: I
              - generic [ref=e174]: Discover
            - img [ref=e176]
            - button "II Research & Plan" [ref=e178] [cursor=pointer]:
              - generic [ref=e179]: II
              - generic [ref=e180]: Research & Plan
            - img [ref=e182]
            - button "III Draft & Review" [ref=e184] [cursor=pointer]:
              - generic [ref=e185]: III
              - generic [ref=e186]: Draft & Review
            - img [ref=e188]
            - button "IV Approve & Track" [ref=e190] [cursor=pointer]:
              - generic [ref=e191]: IV
              - generic [ref=e192]: Approve & Track
            - img [ref=e194]
            - button "V Configure" [ref=e196] [cursor=pointer]:
              - generic [ref=e197]: V
              - generic [ref=e198]: Configure
        - 'tabpanel "Stage I · Discover: GSC · radar · gaps · opportunities" [ref=e199]':
          - generic [ref=e200]:
            - generic [ref=e202]:
              - generic [ref=e203]: WORK PLAN — ALL SIGNALS AGGREGATED
              - heading "Select opportunities to research" [level=3] [ref=e204]
              - paragraph [ref=e205]: Radar gaps · cannibalization alerts · merge candidates · backlink targets · AEO visibility gaps — every signal, one table.
            - generic [ref=e206]:
              - generic [ref=e207]:
                - button "All" [ref=e208] [cursor=pointer]
                - button "🧩 Gaps" [ref=e209] [cursor=pointer]
                - button "🔄 Refresh" [ref=e210] [cursor=pointer]
                - button "📈 Expand" [ref=e211] [cursor=pointer]
                - button "⚠️ Cannibal" [ref=e212] [cursor=pointer]
                - button "🔀 Merges" [ref=e213] [cursor=pointer]
                - button "🔗 Backlinks" [ref=e214] [cursor=pointer]
                - button "◎ AEO Gaps" [ref=e215] [cursor=pointer]
                - generic [ref=e217]: 0 selected · 32 total
              - generic [ref=e218]:
                - generic [ref=e219]:
                  - checkbox [ref=e221] [cursor=pointer]
                  - generic [ref=e222]: Category
                  - generic [ref=e223]: Score
                  - generic [ref=e224]: Opportunity
                  - generic [ref=e225]: Action
                - generic [ref=e226]:
                  - checkbox [ref=e228] [cursor=pointer]
                  - generic [ref=e230]: 🧩 GAP
                  - generic [ref=e231]: "80"
                  - generic [ref=e232]:
                    - generic [ref=e233]: "Yousafeconsultancy.Com: 2026 Ranking Playbook & Updates"
                    - generic [ref=e234]: "Radar · Ranks #16 · 96 impressions · 0 clicks (0.0% CTR)"
                  - button "Brief →" [ref=e236] [cursor=pointer]
                - generic [ref=e237]:
                  - checkbox [ref=e239] [cursor=pointer]
                  - generic [ref=e241]: ⚠️ CANNIBAL
                  - generic [ref=e242]: "70"
                  - generic [ref=e243]:
                    - generic [ref=e244]: "Consolidate: auburn university housing"
                    - generic [ref=e245]: Cannibal Watch · 4 competing pages target this term
                  - generic [ref=e246]: —
                - generic [ref=e247]:
                  - checkbox [ref=e249] [cursor=pointer]
                  - generic [ref=e251]: ⚠️ CANNIBAL
                  - generic [ref=e252]: "70"
                  - generic [ref=e253]:
                    - generic [ref=e254]: "Consolidate: administrative review letter template uk"
                    - generic [ref=e255]: Cannibal Watch · 3 competing pages target this term
                  - generic [ref=e256]: —
                - generic [ref=e257]:
                  - checkbox [ref=e259] [cursor=pointer]
                  - generic [ref=e261]: ⚠️ CANNIBAL
                  - generic [ref=e262]: "70"
                  - generic [ref=e263]:
                    - generic [ref=e264]: "Consolidate: student housing university of missouri"
                    - generic [ref=e265]: Cannibal Watch · 4 competing pages target this term
                  - generic [ref=e266]: —
                - generic [ref=e267]:
                  - checkbox [ref=e269] [cursor=pointer]
                  - generic [ref=e271]: ⚠️ CANNIBAL
                  - generic [ref=e272]: "70"
                  - generic [ref=e273]:
                    - generic [ref=e274]: "Consolidate: university of michigan housing"
                    - generic [ref=e275]: Cannibal Watch · 4 competing pages target this term
                  - generic [ref=e276]: —
                - generic [ref=e277]:
                  - checkbox [ref=e279] [cursor=pointer]
                  - generic [ref=e281]: ⚠️ CANNIBAL
                  - generic [ref=e282]: "70"
                  - generic [ref=e283]:
                    - generic [ref=e284]: "Consolidate: san francisco university housing"
                    - generic [ref=e285]: Cannibal Watch · 4 competing pages target this term
                  - generic [ref=e286]: —
                - generic [ref=e287]:
                  - checkbox [ref=e289] [cursor=pointer]
                  - generic [ref=e291]: ⚠️ CANNIBAL
                  - generic [ref=e292]: "70"
                  - generic [ref=e293]:
                    - generic [ref=e294]: "Consolidate: apartments near portland state university"
                    - generic [ref=e295]: Cannibal Watch · 2 competing pages target this term
                  - generic [ref=e296]: —
                - generic [ref=e297]:
                  - checkbox [ref=e299] [cursor=pointer]
                  - generic [ref=e301]: ⚠️ CANNIBAL
                  - generic [ref=e302]: "70"
                  - generic [ref=e303]:
                    - generic [ref=e304]: "Consolidate: student housing university of arizona"
                    - generic [ref=e305]: Cannibal Watch · 4 competing pages target this term
                  - generic [ref=e306]: —
                - generic [ref=e307]:
                  - checkbox [ref=e309] [cursor=pointer]
                  - generic [ref=e311]: ⚠️ CANNIBAL
                  - generic [ref=e312]: "70"
                  - generic [ref=e313]:
                    - generic [ref=e314]: "Consolidate: university of washington student housing"
                    - generic [ref=e315]: Cannibal Watch · 4 competing pages target this term
                  - generic [ref=e316]: —
                - generic [ref=e317]:
                  - checkbox [ref=e319] [cursor=pointer]
                  - generic [ref=e321]: 🔄 REFRESH
                  - generic [ref=e322]: "35"
                  - generic [ref=e323]:
                    - generic [ref=e324]: "Uk Student Visa Process For Warwick University — 2026 Refresh: Everything New"
                    - generic [ref=e325]: "Radar · Ranks #22 · 19 impressions · 0 clicks (0.0% CTR)"
                  - button "Brief →" [ref=e327] [cursor=pointer]
                - generic [ref=e328]:
                  - checkbox [ref=e330] [cursor=pointer]
                  - generic [ref=e332]: 🧩 GAP
                  - generic [ref=e333]: "33"
                  - generic [ref=e334]:
                    - generic [ref=e335]: "Complete Guide: Difference Between Skilled Worker Visa And Health Care Visa 2026"
                    - generic [ref=e336]: Radar · No first-page presence · 26 impressions on related terms
                  - button "Brief →" [ref=e338] [cursor=pointer]
                - generic [ref=e339]:
                  - checkbox [ref=e341] [cursor=pointer]
                  - generic [ref=e343]: 🧩 GAP
                  - generic [ref=e344]: "33"
                  - generic [ref=e345]:
                    - generic [ref=e346]: "Complete Guide: Housing Mizzou 2026"
                    - generic [ref=e347]: Radar · No first-page presence · 21 impressions on related terms
                  - button "Brief →" [ref=e349] [cursor=pointer]
                - generic [ref=e350]:
                  - checkbox [ref=e352] [cursor=pointer]
                  - generic [ref=e354]: 🧩 GAP
                  - generic [ref=e355]: "33"
                  - generic [ref=e356]:
                    - generic [ref=e357]: "Complete Guide: Housing In Ut 2026"
                    - generic [ref=e358]: Radar · No first-page presence · 20 impressions on related terms
                  - button "Brief →" [ref=e360] [cursor=pointer]
                - generic [ref=e361]:
                  - checkbox [ref=e363] [cursor=pointer]
                  - generic [ref=e365]: 🔄 REFRESH
                  - generic [ref=e366]: "32"
                  - generic [ref=e367]:
                    - generic [ref=e368]: "Student Dependant Visa Uk — 2026 Refresh: Everything New"
                    - generic [ref=e369]: Radar · No first-page presence · 28 impressions on related terms
                  - button "Brief →" [ref=e371] [cursor=pointer]
                - generic [ref=e372]:
                  - checkbox [ref=e374] [cursor=pointer]
                  - generic [ref=e376]: 🧩 GAP
                  - generic [ref=e377]: "32"
                  - generic [ref=e378]:
                    - generic [ref=e379]: "Complete Guide: Visa Appeal Consultant 2026"
                    - generic [ref=e380]: Radar · No first-page presence · 21 impressions on related terms
                  - button "Brief →" [ref=e382] [cursor=pointer]
                - generic [ref=e383]:
                  - checkbox [ref=e385] [cursor=pointer]
                  - generic [ref=e387]: 🧩 GAP
                  - generic [ref=e388]: "32"
                  - generic [ref=e389]:
                    - generic [ref=e390]: "Complete Guide: Dependant Visa Uk 2026"
                    - generic [ref=e391]: Radar · No first-page presence · 19 impressions on related terms
                  - button "Brief →" [ref=e393] [cursor=pointer]
                - generic [ref=e394]:
                  - checkbox [ref=e396] [cursor=pointer]
                  - generic [ref=e398]: 🔄 REFRESH
                  - generic [ref=e399]: "31"
                  - generic [ref=e400]:
                    - generic [ref=e401]: "Appendix Fm Se Documents Checklist — 2026 Refresh: Everything New"
                    - generic [ref=e402]: Radar · No first-page presence · 23 impressions on related terms
                  - button "Brief →" [ref=e404] [cursor=pointer]
                - generic [ref=e405]:
                  - checkbox [ref=e407] [cursor=pointer]
                  - generic [ref=e409]: 🔄 REFRESH
                  - generic [ref=e410]: "31"
                  - generic [ref=e411]:
                    - generic [ref=e412]: "Marriage Based Green Card Timeline — 2026 Refresh: Everything New"
                    - generic [ref=e413]: Radar · No first-page presence · 22 impressions on related terms
                  - button "Brief →" [ref=e415] [cursor=pointer]
                - generic [ref=e416]:
                  - checkbox [ref=e418] [cursor=pointer]
                  - generic [ref=e420]: 🔄 REFRESH
                  - generic [ref=e421]: "30"
                  - generic [ref=e422]:
                    - generic [ref=e423]: "Checklist For Spousal Sponsorship In Canada — 2026 Refresh: Everything New"
                    - generic [ref=e424]: Radar · No first-page presence · 19 impressions on related terms
                  - button "Brief →" [ref=e426] [cursor=pointer]
                - generic [ref=e427]:
                  - checkbox [ref=e429] [cursor=pointer]
                  - generic [ref=e431]: 🧩 GAP
                  - generic [ref=e432]: "17"
                  - generic [ref=e433]:
                    - generic [ref=e434]: College Interview Questions Prep Near You — 2026 Locations & Info
                    - generic [ref=e435]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e437] [cursor=pointer]
                - generic [ref=e438]:
                  - checkbox [ref=e440] [cursor=pointer]
                  - generic [ref=e442]: 🧩 GAP
                  - generic [ref=e443]: "17"
                  - generic [ref=e444]:
                    - generic [ref=e445]: How to Apply for Immigration Lawyer Cost — 2026 Step-by-Step
                    - generic [ref=e446]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e448] [cursor=pointer]
                - generic [ref=e449]:
                  - checkbox [ref=e451] [cursor=pointer]
                  - generic [ref=e453]: 🧩 GAP
                  - generic [ref=e454]: "17"
                  - generic [ref=e455]:
                    - generic [ref=e456]: "Complete Guide: Education Verification Service 2026"
                    - generic [ref=e457]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e459] [cursor=pointer]
                - generic [ref=e460]:
                  - checkbox [ref=e462] [cursor=pointer]
                  - generic [ref=e464]: 🧩 GAP
                  - generic [ref=e465]: "17"
                  - generic [ref=e466]:
                    - generic [ref=e467]: "Complete Guide: Phd In Economics Statement Of Purpose 2026"
                    - generic [ref=e468]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e470] [cursor=pointer]
                - generic [ref=e471]:
                  - checkbox [ref=e473] [cursor=pointer]
                  - generic [ref=e475]: 🧩 GAP
                  - generic [ref=e476]: "17"
                  - generic [ref=e477]:
                    - generic [ref=e478]: "Complete Guide: Sevis Termination Reinstatement Timeline 2026 2026"
                    - generic [ref=e479]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e481] [cursor=pointer]
                - generic [ref=e482]:
                  - checkbox [ref=e484] [cursor=pointer]
                  - generic [ref=e486]: 🧩 GAP
                  - generic [ref=e487]: "17"
                  - generic [ref=e488]:
                    - generic [ref=e489]: "Complete Guide: Rfe Response Writing Service 2026"
                    - generic [ref=e490]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e492] [cursor=pointer]
                - generic [ref=e493]:
                  - checkbox [ref=e495] [cursor=pointer]
                  - generic [ref=e497]: 🧩 GAP
                  - generic [ref=e498]: "17"
                  - generic [ref=e499]:
                    - generic [ref=e500]: "Complete Guide: Statement Of Purpose Help 2026"
                    - generic [ref=e501]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e503] [cursor=pointer]
                - generic [ref=e504]:
                  - checkbox [ref=e506] [cursor=pointer]
                  - generic [ref=e508]: 🧩 GAP
                  - generic [ref=e509]: "17"
                  - generic [ref=e510]:
                    - generic [ref=e511]: F-1 Duration Of Status Proposed Change 2026 — Official Portal & Status Guide 2026
                    - generic [ref=e512]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e514] [cursor=pointer]
                - generic [ref=e515]:
                  - checkbox [ref=e517] [cursor=pointer]
                  - generic [ref=e519]: 🧩 GAP
                  - generic [ref=e520]: "17"
                  - generic [ref=e521]:
                    - generic [ref=e522]: "Complete Guide: Transcript Evaluation Service 2026"
                    - generic [ref=e523]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e525] [cursor=pointer]
                - generic [ref=e526]:
                  - checkbox [ref=e528] [cursor=pointer]
                  - generic [ref=e530]: 🧩 GAP
                  - generic [ref=e531]: "17"
                  - generic [ref=e532]:
                    - generic [ref=e533]: Best Best Immigration Lawyer in 2026 — Compared
                    - generic [ref=e534]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e536] [cursor=pointer]
                - generic [ref=e537]:
                  - checkbox [ref=e539] [cursor=pointer]
                  - generic [ref=e541]: 🧩 GAP
                  - generic [ref=e542]: "17"
                  - generic [ref=e543]:
                    - generic [ref=e544]: "Complete Guide: How To Write A Study Abroad Statement Of Purpose 2026"
                    - generic [ref=e545]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e547] [cursor=pointer]
                - generic [ref=e548]:
                  - checkbox [ref=e550] [cursor=pointer]
                  - generic [ref=e552]: 🧩 GAP
                  - generic [ref=e553]: "17"
                  - generic [ref=e554]:
                    - generic [ref=e555]: "Complete Guide: Small Business Consultant 2026"
                    - generic [ref=e556]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e558] [cursor=pointer]
                - generic [ref=e559]:
                  - checkbox [ref=e561] [cursor=pointer]
                  - generic [ref=e563]: 🧩 GAP
                  - generic [ref=e564]: "17"
                  - generic [ref=e565]:
                    - generic [ref=e566]: Best Studyabroad.Com Review in 2026 — Compared
                    - generic [ref=e567]: Radar · No first-page presence · 1 impressions on related terms
                  - button "Brief →" [ref=e569] [cursor=pointer]
          - generic [ref=e570]:
            - generic [ref=e571]:
              - generic [ref=e572]:
                - generic [ref=e573]:
                  - generic [ref=e574]:
                    - generic [ref=e575]: 📊 GSC overview (28d)
                    - generic [ref=e576]: Live Search Console when credentials work, snapshot otherwise.
                  - generic [ref=e577]:
                    - generic "Committed snapshot — connect GSC for live numbers" [ref=e578]: ◐ SNAPSHOT
                    - button "↻" [ref=e579] [cursor=pointer]
                - generic [ref=e580]:
                  - generic [ref=e581]:
                    - generic [ref=e582]:
                      - generic [ref=e583]: Clicks
                      - generic [ref=e584]: "0"
                    - generic [ref=e585]:
                      - generic [ref=e586]: Impressions
                      - generic [ref=e587]: 3,012
                    - generic [ref=e588]:
                      - generic [ref=e589]: CTR
                      - generic [ref=e590]: —
                    - generic [ref=e591]:
                      - generic [ref=e592]: Avg Pos
                      - generic [ref=e593]: —
                  - generic [ref=e594]:
                    - text: "#1 query:"
                    - strong [ref=e595]: yousafeconsultancy.com
                    - text: (0 clicks)
              - generic [ref=e596]:
                - generic [ref=e597]:
                  - generic [ref=e598]:
                    - generic [ref=e599]: 🎯 Opportunity Radar
                    - generic [ref=e600]: snapshot · 182 known pages · 43 gaps
                  - button "▼ Expand" [ref=e601] [cursor=pointer]
                - generic [ref=e602]:
                  - generic [ref=e603]: "33"
                  - generic [ref=e604]: GAP
                  - generic [ref=e605]:
                    - generic [ref=e606]: "Complete Guide: Difference Between Skilled Worker Visa And Health Care Visa 2026"
                    - generic [ref=e607]: No first-page presence · 26 impressions on related terms
                  - button "✏️ Brief" [ref=e608] [cursor=pointer]
                - generic [ref=e609]:
                  - generic [ref=e610]: "32"
                  - generic [ref=e611]: REFRESH
                  - generic [ref=e612]:
                    - generic [ref=e613]: "Student Dependant Visa Uk — 2026 Refresh: Everything New"
                    - generic [ref=e614]: No first-page presence · 28 impressions on related terms
                  - button "✏️ Brief" [ref=e615] [cursor=pointer]
                - generic [ref=e616]:
                  - generic [ref=e617]: "17"
                  - generic [ref=e618]: GAP
                  - generic [ref=e619]:
                    - generic [ref=e620]: College Interview Questions Prep Near You — 2026 Locations & Info
                    - generic [ref=e621]: No first-page presence · 1 impressions on related terms
                  - button "✏️ Brief" [ref=e622] [cursor=pointer]
                - generic [ref=e623]:
                  - generic [ref=e624]: "17"
                  - generic [ref=e625]: GAP
                  - generic [ref=e626]:
                    - generic [ref=e627]: How to Apply for Immigration Lawyer Cost — 2026 Step-by-Step
                    - generic [ref=e628]: No first-page presence · 1 impressions on related terms
                  - button "✏️ Brief" [ref=e629] [cursor=pointer]
                - generic [ref=e630]:
                  - generic [ref=e631]: "80"
                  - generic [ref=e632]: QUICK WIN
                  - generic [ref=e633]:
                    - generic [ref=e634]: "Yousafeconsultancy.Com: 2026 Ranking Playbook & Updates"
                    - generic [ref=e635]: "Ranks #16 · 96 impressions · 0 clicks (0.0% CTR)"
                  - button "✏️ Brief" [ref=e636] [cursor=pointer]
                - generic [ref=e637]:
                  - generic [ref=e638]: "35"
                  - generic [ref=e639]: REFRESH
                  - generic [ref=e640]:
                    - generic [ref=e641]: "Uk Student Visa Process For Warwick University — 2026 Refresh: Everything New"
                    - generic [ref=e642]: "Ranks #22 · 19 impressions · 0 clicks (0.0% CTR)"
                  - button "✏️ Brief" [ref=e643] [cursor=pointer]
                - generic [ref=e644]:
                  - generic [ref=e645]: "33"
                  - generic [ref=e646]: GAP
                  - generic [ref=e647]:
                    - generic [ref=e648]: "Complete Guide: Housing Mizzou 2026"
                    - generic [ref=e649]: No first-page presence · 21 impressions on related terms
                  - button "✏️ Brief" [ref=e650] [cursor=pointer]
                - generic [ref=e651]:
                  - generic [ref=e652]: "33"
                  - generic [ref=e653]: GAP
                  - generic [ref=e654]:
                    - generic [ref=e655]: "Complete Guide: Housing In Ut 2026"
                    - generic [ref=e656]: No first-page presence · 20 impressions on related terms
                  - button "✏️ Brief" [ref=e657] [cursor=pointer]
                - generic [ref=e658]:
                  - generic [ref=e659]: ⚠ CANNIBALIZATION WATCH (8)
                  - generic [ref=e660]: “auburn university housing” targeted by 4 pages — consolidate, don't create another
                  - generic [ref=e661]: “administrative review letter template uk” targeted by 3 pages — consolidate, don't create another
                  - generic [ref=e662]: “student housing university of missouri” targeted by 4 pages — consolidate, don't create another
            - generic [ref=e663]:
              - generic [ref=e664]:
                - generic [ref=e665]:
                  - generic [ref=e666]:
                    - generic [ref=e667]: 🔀 Merge history
                    - generic [ref=e668]: Every consolidation decision, from the portal and the Command Center.
                  - button "↻" [ref=e669] [cursor=pointer]
                - generic [ref=e670]:
                  - generic [ref=e671]: 🔀
                  - generic [ref=e672]: No merge decisions yet — resolved clusters will appear here.
              - generic [ref=e673]:
                - generic [ref=e674]:
                  - generic [ref=e675]:
                    - generic [ref=e676]: 🔗 Interlink suggestions
                    - generic [ref=e677]: caseworks → regional → marketplace funnel
                  - button "Find" [ref=e678] [cursor=pointer]
                - generic [ref=e679]: Enter a topic in the Create tab, then hit “Find”.
              - region "Live research operations" [ref=e680]:
                - generic [ref=e681]:
                  - generic [ref=e682]:
                    - generic [ref=e683]: Live evidence services
                    - generic [ref=e684]: Research operations retained from the former Command Center
                  - generic [ref=e685]:
                    - generic [ref=e686]: Read just now
                    - button "↻ Refresh evidence" [ref=e687] [cursor=pointer]
                - generic [ref=e688]:
                  - generic [ref=e689]:
                    - generic [ref=e691]:
                      - generic [ref=e692]: ◎ LLM / AEO visibility
                      - generic [ref=e693]: Fan-out citation evidence
                    - generic [ref=e694]:
                      - strong [ref=e695]: 0%
                      - generic [ref=e696]: 0 cited / 36 audited
                    - generic [ref=e697]: "Source: seo_llm_visibility"
                  - generic [ref=e698]:
                    - generic [ref=e700]:
                      - generic [ref=e701]: ↗ Knowledge / backlinks
                      - generic [ref=e702]: External authority opportunities
                    - generic [ref=e703]:
                      - strong [ref=e704]: "14"
                      - generic [ref=e705]: 0 won
                    - generic [ref=e706]: "Source: seo_backlink_dashboard"
                    - generic [ref=e707]:
                      - link "↗ blog.google · 96 authority" [ref=e708] [cursor=pointer]:
                        - /url: https://blog.google/products/search/
                      - button "Draft outreach" [ref=e709] [cursor=pointer]
                    - generic [ref=e710]:
                      - link "↗ uscis.gov · 95 authority" [ref=e711] [cursor=pointer]:
                        - /url: https://www.uscis.gov/
                      - button "Draft outreach" [ref=e712] [cursor=pointer]
                  - generic [ref=e713]:
                    - generic [ref=e715]:
                      - generic [ref=e716]: ◷ Recheck / competing pages
                      - generic [ref=e717]: Cannibalization follow-up queue
                    - generic [ref=e718]:
                      - strong [ref=e719]: "0"
                      - generic [ref=e720]: 0 decisions
                    - generic [ref=e721]: No rechecks currently due
          - generic [ref=e722]: "The evidence room is complete here: engine status and ingestion controls are in the masthead; GSC, radar, ownership, interlinks, and site health remain attached to this dossier. No second command-center navigation is required."
  - button "Open chat" [ref=e723] [cursor=pointer]: 💬
  - alert [ref=e724]
```

# Test source

```ts
  218 | You need a clear document set before you file.
  219 | 
  220 | ## Eligibility steps
  221 | You confirm which route applies, then you collect evidence.`
  222 | 
  223 | const REPAIRED_BODY = `${BODY_NO_DISCLAIMER.trimEnd()}
  224 | 
  225 | ---
  226 | 
  227 | **Disclaimer:** This page is educational and editorial only. It is **not legal advice**. Immigration rules change; verify every requirement against official government sources and consult a licensed attorney, solicitor, or registered migration agent for your situation.
  228 | `
  229 | 
  230 | // ── The tests ──────────────────────────────────────────────────────────────
  231 | 
  232 | test.describe('Studio gate remediation (admin)', () => {
  233 |   test('Re-audit clears missing_disclaimer blocker and enables the Ship button', async ({ browser }) => {
  234 |     test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')
  235 | 
  236 |     const page = await loginAsAdmin(browser)
  237 |     test.skip(!page, 'Skipping: could not sign in')
  238 |     if (!page) return
  239 | 
  240 |     // ── Mock the jobs API ──────────────────────────────────────────────────
  241 |     // GET ?id= returns the failing job; PATCH re-audit returns the repaired job.
  242 | 
  243 |     const blockedJob = makeFailingJob({
  244 |       title: 'Test F-1 Visa Guide 2026',
  245 |       content: BODY_NO_DISCLAIMER,
  246 |       errorMessage: 'Ship refused — content quality gate (voice / tone / compliance):\n- Missing educational / not-legal-advice disclaimer → Add a short disclaimer: educational only, not legal advice.',
  247 |       seoScore: 100,
  248 |       auditBlockers: [
  249 |         { code: 'missing_disclaimer', severity: 'blocker', message: 'Missing educational / not-legal-advice disclaimer' },
  250 |       ],
  251 |     })
  252 | 
  253 |     const clearedJob = makeAuditedJob([], REPAIRED_BODY)
  254 | 
  255 |     await page.route('**/api/content-studio/jobs?id=test-job-gate-failure', async (route) => {
  256 |       await route.fulfill({
  257 |         status: 200,
  258 |         contentType: 'application/json',
  259 |         body: JSON.stringify({ job: blockedJob, lineage: [] }),
  260 |       })
  261 |     })
  262 | 
  263 |     // Also mock the queue-list call so the studio doesn't crash on mount.
  264 |     await page.route('**/api/content-studio/jobs?status=*', async (route) => {
  265 |       await route.fulfill({
  266 |         status: 200,
  267 |         contentType: 'application/json',
  268 |         body: JSON.stringify({
  269 |           jobs: [blockedJob],
  270 |           count: 1,
  271 |           total: 1,
  272 |           hasMore: false,
  273 |           offset: 0,
  274 |           limit: 40,
  275 |           summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 100 },
  276 |         }),
  277 |       })
  278 |     })
  279 | 
  280 |     await page.route('**/api/content-studio/jobs?status=drafting*', async (route) => {
  281 |       await route.fulfill({
  282 |         status: 200,
  283 |         contentType: 'application/json',
  284 |         body: JSON.stringify({
  285 |           jobs: [blockedJob],
  286 |           count: 1,
  287 |           total: 1,
  288 |           hasMore: false,
  289 |           offset: 0,
  290 |           limit: 40,
  291 |           summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 100 },
  292 |         }),
  293 |       })
  294 |     })
  295 | 
  296 |     let reauditCalled = false
  297 |     await page.route('**/api/content-studio/jobs', async (route) => {
  298 |       const request = route.request()
  299 |       if (request.method() === 'PATCH') {
  300 |         reauditCalled = true
  301 |         await route.fulfill({
  302 |           status: 200,
  303 |           contentType: 'application/json',
  304 |           body: JSON.stringify({ ok: true, job: clearedJob, audit: clearedJob.audit_json, plan: {}, appliedRepairs: ['disclaimer'] }),
  305 |         })
  306 |         return
  307 |       }
  308 |       // Fallback for other requests (POST, GET without id param)
  309 |       await route.continue()
  310 |     })
  311 | 
  312 |     // ── Navigate to the job detail ─────────────────────────────────────────
  313 |     await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })
  314 | 
  315 |     // Open the job detail — click the job row in the queue table (or use the
  316 |     // first visible button that opens the detail modal).
  317 |     const jobRow = page.getByText('Test F-1 Visa Guide 2026').first()
> 318 |     await jobRow.waitFor({ state: 'visible', timeout: 30000 })
      |                  ^ TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
  319 |     await jobRow.click()
  320 | 
  321 |     // ── Assert the failing state before re-audit ───────────────────────────
  322 |     // The quality gate remediation banner must be visible.
  323 |     await expect(page.getByText('Quality gate remediation')).toBeVisible({ timeout: 10000 })
  324 |     // The error message must surface the blocker.
  325 |     await expect(page.getByText(/Missing educational.*disclaimer/)).toBeVisible({ timeout: 5000 })
  326 |     // The Ship buttons should be disabled (because blockers exist).
  327 |     const approveBtn = page.getByRole('button', { name: /Approve → main/ })
  328 |     await expect(approveBtn).toBeDisabled()
  329 | 
  330 |     // ── Click Re-audit ─────────────────────────────────────────────────────
  331 |     const reauditBtn = page.getByRole('button', { name: /Re-audit/ })
  332 |     await expect(reauditBtn).toBeEnabled({ timeout: 5000 })
  333 |     await reauditBtn.click()
  334 | 
  335 |     // ── Assert the cleared state after re-audit ────────────────────────────
  336 |     // The PATCH was indeed called.
  337 |     await expect.poll(() => reauditCalled, { timeout: 10000 }).toBe(true)
  338 | 
  339 |     // The error banner is gone (no more quality gate failure).
  340 |     await expect(page.getByText('Quality gate remediation')).toHaveCount(0)
  341 | 
  342 |     // The Ship button is now enabled.
  343 |     await expect.poll(
  344 |       () => approveBtn.isEnabled(),
  345 |       { timeout: 10000, intervals: [500] },
  346 |     ).toBe(true)
  347 |   })
  348 | 
  349 |   test('Re-audit on a page with a genuine outcome_promise clears the disclaimer but keeps the promise blocker', async ({ browser }) => {
  350 |     test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')
  351 | 
  352 |     const page = await loginAsAdmin(browser)
  353 |     test.skip(!page, 'Skipping: could not sign in')
  354 |     if (!page) return
  355 | 
  356 |     // ── Mock the jobs API ──────────────────────────────────────────────────
  357 | 
  358 |     const blockedJob = makeFailingJob({
  359 |       title: 'Test F-1 Visa Guide 2026',
  360 |       content: BODY_WITH_PROMISE,
  361 |       errorMessage: 'Ship refused — content quality gate (voice / tone / compliance):\n- Outcome / guarantee language forbidden: guarantee language → Rewrite without promising visa approval, success rates, or guaranteed results. Educational only.',
  362 |       seoScore: 62,
  363 |       auditBlockers: [
  364 |         { code: 'outcome_promise', severity: 'blocker', message: 'Outcome / guarantee language forbidden: guarantee language' },
  365 |       ],
  366 |     })
  367 | 
  368 |     // Re-audit clears the disclaimer but CANNOT clear a prose-level promise.
  369 |     const auditedJob = makeAuditedJob(
  370 |       [{ code: 'outcome_promise', severity: 'blocker', message: 'Outcome / guarantee language forbidden: guarantee language' }],
  371 |       `${BODY_WITH_PROMISE.trimEnd()}\n\n---\n\n**Disclaimer:** This page is educational and editorial only. It is **not legal advice**. Immigration rules change; verify every requirement against official government sources and consult a licensed attorney, solicitor, or registered migration agent for your situation.\n`,
  372 |     )
  373 | 
  374 |     await page.route('**/api/content-studio/jobs?id=test-job-gate-failure', async (route) => {
  375 |       await route.fulfill({
  376 |         status: 200,
  377 |         contentType: 'application/json',
  378 |         body: JSON.stringify({ job: blockedJob, lineage: [] }),
  379 |       })
  380 |     })
  381 | 
  382 |     await page.route('**/api/content-studio/jobs?status=*', async (route) => {
  383 |       await route.fulfill({
  384 |         status: 200,
  385 |         contentType: 'application/json',
  386 |         body: JSON.stringify({
  387 |           jobs: [blockedJob],
  388 |           count: 1,
  389 |           total: 1,
  390 |           hasMore: false,
  391 |           offset: 0,
  392 |           limit: 40,
  393 |           summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 62 },
  394 |         }),
  395 |       })
  396 |     })
  397 | 
  398 |     await page.route('**/api/content-studio/jobs?status=drafting*', async (route) => {
  399 |       await route.fulfill({
  400 |         status: 200,
  401 |         contentType: 'application/json',
  402 |         body: JSON.stringify({
  403 |           jobs: [blockedJob],
  404 |           count: 1,
  405 |           total: 1,
  406 |           hasMore: false,
  407 |           offset: 0,
  408 |           limit: 40,
  409 |           summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 62 },
  410 |         }),
  411 |       })
  412 |     })
  413 | 
  414 |     let reauditCalled = false
  415 |     await page.route('**/api/content-studio/jobs', async (route) => {
  416 |       const request = route.request()
  417 |       if (request.method() === 'PATCH') {
  418 |         reauditCalled = true
```