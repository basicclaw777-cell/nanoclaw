# Graph Report - .  (2026-04-09)

## Corpus Check
- Large corpus: 665 files · ~460,306 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 691 nodes · 870 edges · 145 communities detected
- Extraction: 64% EXTRACTED · 36% INFERRED · 0% AMBIGUOUS · INFERRED: 313 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `GroupQueue` - 15 edges
2. `Cathedral Project` - 15 edges
3. `main()` - 11 edges
4. `Build Sequence (12 Sessions)` - 11 edges
5. `runObliteratus()` - 9 edges
6. `runAnalyst()` - 9 edges
7. `NanoClaw` - 9 edges
8. `buildAtlas()` - 8 edges
9. `runGoldExtraction()` - 8 edges
10. `validateMount()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Agent Teams (TeammateTool)` --semantically_similar_to--> `Agent Swarms`  [INFERRED] [semantically similar]
  docs/SDK_DEEP_DIVE.md → README.md
- `main()` --calls--> `readStdin()`  [INFERRED]
  src/index.ts → container/agent-runner/src/index.ts
- `main()` --calls--> `waitForIpcMessage()`  [INFERRED]
  src/index.ts → container/agent-runner/src/index.ts
- `Main Channel CLAUDE.md (Andy)` --references--> `NanoClaw`  [INFERRED]
  groups/main/CLAUDE.md → README.md
- `main()` --calls--> `log()`  [INFERRED]
  src/index.ts → container/agent-runner/src/index.ts

## Hyperedges (group relationships)
- **Obliteratus 6-Stage Research Pipeline** — master_obliteratus_engine, master_epistemic_triage, master_gold_extraction, master_obliteratus_report, claude_obsidian_vault, claude_ollama [EXTRACTED 0.95]
- **Council of Four Honest Interlocutors** — interlocutors_council, interlocutors_librarian, interlocutors_physicist, interlocutors_archivist, interlocutors_experimentalist, interlocutors_epistemic_standard [EXTRACTED 1.00]
- **Living System Intelligence Layer** — addendum_vault_metabolism, addendum_belief_tracker, addendum_negative_space, addendum_convergence_atlas, addendum_oracle [EXTRACTED 0.90]

## Communities

### Community 0 - "Cathedral Research Architecture"
Cohesion: 0.06
Nodes (47): Belief Trajectory Tracker, Convergence Atlas, Drift Alert (Certainty Without Evidence), Meta-Convergence Alert, Negative Space Detector, Nugget Health States, Oracle Function, Sandbox Contradiction Engine (+39 more)

### Community 1 - "Database & Task Store"
Cohesion: 0.08
Nodes (7): createSchema(), initDatabase(), _initTestDatabase(), migrateJsonState(), setRegisteredGroup(), setRouterState(), setSession()

### Community 2 - "NanoClaw Platform Docs"
Cohesion: 0.07
Nodes (30): IPv6 DNS Issue Workaround, NAT/IP Forwarding for Containers, Apple Container Networking Setup, NanoClaw Changelog, Contributing Guidelines, Global CLAUDE.md (Andy), Main Channel CLAUDE.md (Andy), Skill Apply Flow (10 Steps) (+22 more)

### Community 3 - "Orchestrator Core"
Cohesion: 0.13
Nodes (20): createPreCompactHook(), drainIpcInput(), ensureContainerSystemRunning(), formatTranscriptMarkdown(), getAvailableGroups(), getSessionSummary(), loadState(), log() (+12 more)

### Community 4 - "Memory System"
Cohesion: 0.23
Nodes (13): callClaude(), formatHistoryForPrompt(), formatPaulProfileForPrompt(), formatSessionMemoryForPrompt(), getConversationHistory(), getMemoryStatus(), getPaulProfileFile(), getSessionFile() (+5 more)

### Community 5 - "Group Queue"
Cohesion: 0.29
Nodes (1): GroupQueue

### Community 6 - "Obliteratus Engine"
Cohesion: 0.28
Nodes (12): archive(), decompose(), extractJSON(), loadPrompt(), queryOllama(), reason(), retrieve(), runObliteratus() (+4 more)

### Community 7 - "Cath API Bridge"
Cohesion: 0.26
Nodes (12): build_dynamic_block(), build_static_block(), call_cath(), call_cath_local(), format_retrieved(), load_persona(), load_state(), load_transmission() (+4 more)

### Community 8 - "Belief Tracker"
Cohesion: 0.24
Nodes (9): detectDrift(), extractBeliefs(), extractConfidence(), formatDriftAlerts(), getDriftAlerts(), queryOllama(), recordStatement(), runBeliefScan() (+1 more)

### Community 9 - "Vault Metabolism"
Cohesion: 0.29
Nodes (8): archiveNugget(), buildHealthReport(), calculateHealth(), daysBetween(), detectContradictions(), detectCorroborations(), queryOllama(), runMetabolism()

### Community 10 - "Oracle Engine"
Cohesion: 0.26
Nodes (7): loadAtlasContext(), loadGoldContext(), loadNegativeSpaceContext(), loadPrompt(), parseOracleResponse(), queryOllama(), runOracle()

### Community 11 - "Gold Extractor"
Cohesion: 0.32
Nodes (11): blobToEmbedding(), cosineSimilarity(), detectCrossDomainBridges(), detectGeometricRecurrences(), detectRatioConvergences(), detectSuppressionMatches(), formatGoldBriefing(), getOrRunGold() (+3 more)

### Community 12 - "Vault Embedder"
Cohesion: 0.26
Nodes (7): embedAllNuggets(), embeddingToBlob(), embedFile(), findMdFiles(), getEmbedding(), parseNugget(), semanticSearch()

### Community 13 - "Telegram Bot"
Cohesion: 0.24
Nodes (7): callCloud(), formatVectorContext(), generatePostCaptions(), generateVisualDirection(), safeSend(), safeSendPhoto(), searchVectorStore()

### Community 14 - "Platform Detection"
Cohesion: 0.29
Nodes (9): commandExists(), getNodeMajorVersion(), getNodeVersion(), getPlatform(), getServiceManager(), hasSystemd(), isHeadless(), isWSL() (+1 more)

### Community 15 - "Vortex Analyst"
Cohesion: 0.35
Nodes (10): analyseFailures(), callClaude(), getFailureSamples(), getLowScoringFiles(), loadKeywords(), markReviewed(), readMissedContent(), runAnalyst() (+2 more)

### Community 16 - "Vault Reader (Python)"
Cohesion: 0.27
Nodes (9): format_vault_search(), list_directory(), main(), List .md files and subdirectories in a vault folder.     path is relative to vau, Format search results for injection into dynamic block., Search vault .md files for query terms.     Returns list of {path, matches, titl, Read full content of a vault .md file.     path is relative to vault root., read_note() (+1 more)

### Community 17 - "Universal Memory"
Cohesion: 0.38
Nodes (9): callClaude(), extractInsights(), getFullProfile(), getProfileContext(), initDirs(), loadProfile(), logConversation(), saveProfile() (+1 more)

### Community 18 - "Convergence Atlas"
Cohesion: 0.38
Nodes (9): buildAtlas(), buildGeometricSubstrate(), buildInstitutionalSubstrate(), buildMathematicalSubstrate(), detectMetaConvergences(), formatAtlasMap(), getLatestAtlas(), getOrBuildAtlas() (+1 more)

### Community 19 - "Negative Space Detector"
Cohesion: 0.42
Nodes (8): buildResearcherCorpora(), detectCounterEvidenceAbsence(), detectDocumentationAsymmetry(), detectResearcherDisappearance(), detectTimelineGaps(), formatNegativeSpaceFindings(), queryOllama(), runNegativeSpaceScan()

### Community 20 - "State Tracking"
Cohesion: 0.4
Nodes (8): compareSemver(), getAppliedSkills(), getCustomModifications(), getStatePath(), readState(), recordCustomModification(), recordSkillApplication(), writeState()

### Community 21 - "Mount Security"
Cohesion: 0.4
Nodes (8): expandPath(), findAllowedRoot(), getRealPath(), isValidContainerPath(), loadMountAllowlist(), matchesBlockedPattern(), validateAdditionalMounts(), validateMount()

### Community 22 - "Epistemic Triage"
Cohesion: 0.39
Nodes (7): computeGrade(), extractJSON(), loadPrompt(), normaliseScores(), queryOllama(), triageBatch(), triageClaim()

### Community 23 - "Vortex Report"
Cohesion: 0.46
Nodes (7): generateReport(), getRecentTrend(), getStats(), getStruggleMoments(), getSurprises(), interpretWithClaude(), saveToVault()

### Community 24 - "Path Remapping"
Cohesion: 0.46
Nodes (7): isWithinRoot(), loadPathRemap(), nearestExistingPathOrSymlink(), recordPathRemap(), resolvePathRemap(), sanitizeRemapEntries(), toSafeProjectRelativePath()

### Community 25 - "Structured Merge Ops"
Cohesion: 0.36
Nodes (5): areRangesCompatible(), compareVersionParts(), extractHostPort(), mergeDockerComposeServices(), mergeNpmDependencies()

### Community 26 - "Test Helpers"
Cohesion: 0.29
Nodes (2): createMinimalState(), writeState()

### Community 27 - "Service Management"
Cohesion: 0.5
Nodes (7): checkDockerGroupStale(), killOrphanedProcesses(), run(), setupLaunchd(), setupLinux(), setupNohupFallback(), setupSystemd()

### Community 28 - "Seed Generator"
Cohesion: 0.48
Nodes (5): createSeed(), generateSeedWithClaude(), loadSageContext(), readVaultNuggets(), saveSeedToVault()

### Community 29 - "Council Engine"
Cohesion: 0.43
Nodes (4): detectDisagreements(), loadInterlocutor(), queryInterlocutor(), runCouncil()

### Community 30 - "Lock Manager"
Cohesion: 0.62
Nodes (6): acquireLock(), getLockPath(), isLocked(), isProcessAlive(), isStale(), releaseLock()

### Community 31 - "Skill Validation"
Cohesion: 0.52
Nodes (6): discoverSkills(), initNanoclaw(), main(), resetWorkingTree(), setOutput(), truncate()

### Community 32 - "Message Router"
Cohesion: 0.38
Nodes (4): escapeXml(), formatMessages(), formatOutbound(), stripInternalTags()

### Community 33 - "Container Runtime"
Cohesion: 0.33
Nodes (2): cleanupOrphans(), stopContainer()

### Community 34 - "Sender Allowlist"
Cohesion: 0.48
Nodes (6): getEntry(), isSenderAllowed(), isTriggerAllowed(), isValidEntry(), loadSenderAllowlist(), shouldDropMessage()

### Community 35 - "Cathedral Manager"
Cohesion: 0.67
Nodes (5): answerManagerQuery(), callClaude(), getDailyBriefing(), getQuickStatus(), scanCathedral()

### Community 36 - "File Operations"
Cohesion: 0.6
Nodes (5): executeFileOps(), isWithinRoot(), nearestExistingPathOrSymlink(), resolveRealPathWithSymlinkAwareAnchor(), safePath()

### Community 37 - "Customize Flow"
Cohesion: 0.67
Nodes (5): abortCustomize(), commitCustomize(), getPendingPath(), isCustomizeActive(), startCustomize()

### Community 38 - "Manifest Validation"
Cohesion: 0.33
Nodes (0): 

### Community 39 - "Group Folder"
Cohesion: 0.67
Nodes (5): assertValidGroupFolder(), ensureWithinBase(), isValidGroupFolder(), resolveGroupFolderPath(), resolveGroupIpcPath()

### Community 40 - "Container Runner"
Cohesion: 0.47
Nodes (3): buildContainerArgs(), buildVolumeMounts(), runContainerAgent()

### Community 41 - "Obsidian Harvester"
Cohesion: 0.7
Nodes (4): extractNuggets(), main(), saveNugget(), saveRawChat()

### Community 42 - "Backup System"
Cohesion: 0.7
Nodes (4): clearBackup(), createBackup(), getBackupDir(), restoreBackup()

### Community 43 - "Rebase Engine"
Cohesion: 0.6
Nodes (3): collectTrackedFiles(), rebase(), walkDir()

### Community 44 - "Groups CLI"
Cohesion: 0.7
Nodes (4): listGroups(), parseArgs(), run(), syncGroups()

### Community 45 - "Skill Drift Fix"
Cohesion: 0.7
Nodes (4): fixSkill(), main(), readManifest(), setOutput()

### Community 46 - "Task Scheduler"
Cohesion: 0.5
Nodes (2): computeNextRun(), runTask()

### Community 47 - "Container Security Docs"
Cohesion: 0.4
Nodes (5): Container Isolation (Primary Boundary), Agent Runner (In-Container), Rationale: Container Isolation as Primary Security, Container Runner, Per-Group Queue

### Community 48 - "Deep Harvester"
Cohesion: 0.83
Nodes (3): deepExtract(), main(), saveNugget()

### Community 49 - "Local Harvester"
Cohesion: 0.83
Nodes (3): localExtract(), main(), saveNugget()

### Community 50 - "Init System"
Cohesion: 0.83
Nodes (3): copyDirFiltered(), getCoreVersion(), initNanoclawDir()

### Community 51 - "Vector Search"
Cohesion: 0.67
Nodes (2): embedQuery(), searchVectorStore()

### Community 52 - "Formatting Tests"
Cohesion: 0.67
Nodes (2): shouldProcess(), shouldRequireTrigger()

### Community 53 - "Config Files"
Cohesion: 0.5
Nodes (0): 

### Community 54 - "Registry Tests"
Cohesion: 0.5
Nodes (0): 

### Community 55 - "Channel Registry"
Cohesion: 0.5
Nodes (0): 

### Community 56 - "Migration System"
Cohesion: 0.67
Nodes (0): 

### Community 57 - "Replay Engine"
Cohesion: 0.67
Nodes (0): 

### Community 58 - "Git Merge"
Cohesion: 0.67
Nodes (0): 

### Community 59 - "Migration Tests"
Cohesion: 0.67
Nodes (0): 

### Community 60 - "Service Tests"
Cohesion: 0.67
Nodes (0): 

### Community 61 - "Container CLI"
Cohesion: 1.0
Nodes (2): parseArgs(), run()

### Community 62 - "Mounts CLI"
Cohesion: 1.0
Nodes (2): parseArgs(), run()

### Community 63 - "Register CLI"
Cohesion: 1.0
Nodes (2): parseArgs(), run()

### Community 64 - "Container Runner Tests"
Cohesion: 0.67
Nodes (0): 

### Community 65 - "Allowlist Tests"
Cohesion: 1.0
Nodes (2): cfgPath(), writeConfig()

### Community 66 - "IPC Watcher"
Cohesion: 0.67
Nodes (0): 

### Community 67 - "Message Processing Docs"
Cohesion: 0.67
Nodes (3): Message Loop (SQLite Polling), Orchestrator (index.ts), SQLite Database (messages.db)

### Community 68 - "Research Prompts"
Cohesion: 0.67
Nodes (3): Oracle Function System Prompt, Obliteratus Reasoning Engine Prompt, Obliteratus Synthesis Engine Prompt

### Community 69 - "Cathedral MCP Server"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Skill Apply"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Skill Uninstall"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "FS Utils"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Uninstall Tests"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "File Ops Tests"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Status Emitter"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Verify CLI"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Register Tests"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Environment CLI"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Environment Tests"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "IPC MCP Stdio"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Migration Runner"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Uninstall Skill CLI"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Timezone Utils"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "DB Tests"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "IPC Auth Tests"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Env Reader"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Channel System Docs"
Cohesion: 1.0
Nodes (2): Channel Factory Registry, Channel System (Self-Registration)

### Community 88 - "Brand Assets"
Cohesion: 1.0
Nodes (2): NanoClaw Logo (Wordmark on Light BG), NanoClaw Logo Dark (Wordmark on Dark BG)

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (0): 

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (0): 

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (0): 

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (0): 

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (0): 

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (0): 

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (0): 

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (0): 

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (0): 

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (0): 

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (0): 

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (0): 

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (0): 

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (0): 

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (0): 

### Community 108 - "Community 108"
Cohesion: 1.0
Nodes (0): 

### Community 109 - "Community 109"
Cohesion: 1.0
Nodes (0): 

### Community 110 - "Community 110"
Cohesion: 1.0
Nodes (0): 

### Community 111 - "Community 111"
Cohesion: 1.0
Nodes (0): 

### Community 112 - "Community 112"
Cohesion: 1.0
Nodes (0): 

### Community 113 - "Community 113"
Cohesion: 1.0
Nodes (1): Chatterbox TTS

### Community 114 - "Community 114"
Cohesion: 1.0
Nodes (1): Contributors List

### Community 115 - "Community 115"
Cohesion: 1.0
Nodes (1): NanoClaw Specification

### Community 116 - "Community 116"
Cohesion: 1.0
Nodes (1): Channel Interface

### Community 117 - "Community 117"
Cohesion: 1.0
Nodes (1): IPC Watcher (File-Based)

### Community 118 - "Community 118"
Cohesion: 1.0
Nodes (1): Task Scheduler

### Community 119 - "Community 119"
Cohesion: 1.0
Nodes (1): Hierarchical Memory System (CLAUDE.md)

### Community 120 - "Community 120"
Cohesion: 1.0
Nodes (1): Session Management (JSONL Transcripts)

### Community 121 - "Community 121"
Cohesion: 1.0
Nodes (1): NanoClaw MCP Server (Built-In)

### Community 122 - "Community 122"
Cohesion: 1.0
Nodes (1): Message Router

### Community 123 - "Community 123"
Cohesion: 1.0
Nodes (1): Mount Security (Allowlist Validation)

### Community 124 - "Community 124"
Cohesion: 1.0
Nodes (1): macOS launchd Service (com.nanoclaw)

### Community 125 - "Community 125"
Cohesion: 1.0
Nodes (1): Trigger Word Pattern (@Assistant)

### Community 126 - "Community 126"
Cohesion: 1.0
Nodes (1): Conversation Catch-Up

### Community 127 - "Community 127"
Cohesion: 1.0
Nodes (1): NanoClaw Skills Architecture

### Community 128 - "Community 128"
Cohesion: 1.0
Nodes (1): Three-Level Resolution Model (Git/Claude/User)

### Community 129 - "Community 129"
Cohesion: 1.0
Nodes (1): Shared Base (.nanoclaw/base/)

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (1): Code File Three-Way Merge (git merge-file)

### Community 131 - "Community 131"
Cohesion: 1.0
Nodes (1): Structured Operations (Deterministic)

### Community 132 - "Community 132"
Cohesion: 1.0
Nodes (1): Skill Package Structure

### Community 133 - "Community 133"
Cohesion: 1.0
Nodes (1): Intent Files (.intent.md)

### Community 134 - "Community 134"
Cohesion: 1.0
Nodes (1): Skill Manifest (manifest.yaml)

### Community 135 - "Community 135"
Cohesion: 1.0
Nodes (1): Skill Apply Flow (12-Step)

### Community 136 - "Community 136"
Cohesion: 1.0
Nodes (1): Shared Resolution Cache (.nanoclaw/resolutions/)

### Community 137 - "Community 137"
Cohesion: 1.0
Nodes (1): State Tracking (state.yaml)

### Community 138 - "Community 138"
Cohesion: 1.0
Nodes (1): Design Principles (19 Principles)

### Community 139 - "Community 139"
Cohesion: 1.0
Nodes (1): NanoClaw Debug Checklist

### Community 140 - "Community 140"
Cohesion: 1.0
Nodes (1): NanoClaw Security Model

### Community 141 - "Community 141"
Cohesion: 1.0
Nodes (1): Mount Security (External Allowlist)

### Community 142 - "Community 142"
Cohesion: 1.0
Nodes (1): Trust Model (Main/Non-Main/Container/Input)

### Community 143 - "Community 143"
Cohesion: 1.0
Nodes (1): Agent-Browser Skill (Browser Automation)

### Community 144 - "Community 144"
Cohesion: 1.0
Nodes (1): NanoClaw Icon (Cute Shrimp/Claw Mascot)

## Knowledge Gaps
- **87 isolated node(s):** `Search vault .md files for query terms.     Returns list of {path, matches, titl`, `Read full content of a vault .md file.     path is relative to vault root.`, `List .md files and subdirectories in a vault folder.     path is relative to vau`, `Format search results for injection into dynamic block.`, `Block 1: transmission + persona only. B-grade nuggets move to retrieval.` (+82 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cathedral MCP Server`** (2 nodes): `cathedral-mcp-server.js`, `vaultFetch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Skill Apply`** (2 nodes): `apply.ts`, `applySkill()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Skill Uninstall`** (2 nodes): `uninstall.ts`, `uninstallSkill()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `FS Utils`** (2 nodes): `fs-utils.ts`, `copyDir()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Uninstall Tests`** (2 nodes): `uninstall.test.ts`, `setupSkillPackage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `File Ops Tests`** (2 nodes): `file-ops.test.ts`, `shouldSkipSymlinkTests()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Status Emitter`** (2 nodes): `status.ts`, `emitStatus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Verify CLI`** (2 nodes): `verify.ts`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Register Tests`** (2 nodes): `register.test.ts`, `createTestDb()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Environment CLI`** (2 nodes): `environment.ts`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Environment Tests`** (2 nodes): `environment.test.ts`, `hasAuth()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `IPC MCP Stdio`** (2 nodes): `ipc-mcp-stdio.ts`, `writeIpcFile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Migration Runner`** (2 nodes): `run-migrations.ts`, `resolveTsx()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Uninstall Skill CLI`** (2 nodes): `uninstall-skill.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Timezone Utils`** (2 nodes): `timezone.ts`, `formatLocalTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DB Tests`** (2 nodes): `db.test.ts`, `store()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `IPC Auth Tests`** (2 nodes): `ipc-auth.test.ts`, `isMessageAuthorized()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Env Reader`** (2 nodes): `env.ts`, `readEnvFile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Channel System Docs`** (2 nodes): `Channel Factory Registry`, `Channel System (Self-Registration)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Brand Assets`** (2 nodes): `NanoClaw Logo (Wordmark on Light BG)`, `NanoClaw Logo Dark (Wordmark on Dark BG)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `Telegram-bot-memory.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `structured.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `customize.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (1 nodes): `manifest.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (1 nodes): `merge.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (1 nodes): `path-remap.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (1 nodes): `rebase.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (1 nodes): `apply.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `lock.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (1 nodes): `state.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `replay.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `constants.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `backup.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `platform.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `apply-skill.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `task-scheduler.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `group-folder.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `routing.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `group-queue.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (1 nodes): `container-runtime.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (1 nodes): `logger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (1 nodes): `timezone.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (1 nodes): `Chatterbox TTS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (1 nodes): `Contributors List`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (1 nodes): `NanoClaw Specification`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (1 nodes): `Channel Interface`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (1 nodes): `IPC Watcher (File-Based)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (1 nodes): `Task Scheduler`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 119`** (1 nodes): `Hierarchical Memory System (CLAUDE.md)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (1 nodes): `Session Management (JSONL Transcripts)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 121`** (1 nodes): `NanoClaw MCP Server (Built-In)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (1 nodes): `Message Router`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 123`** (1 nodes): `Mount Security (Allowlist Validation)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 124`** (1 nodes): `macOS launchd Service (com.nanoclaw)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 125`** (1 nodes): `Trigger Word Pattern (@Assistant)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 126`** (1 nodes): `Conversation Catch-Up`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 127`** (1 nodes): `NanoClaw Skills Architecture`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (1 nodes): `Three-Level Resolution Model (Git/Claude/User)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 129`** (1 nodes): `Shared Base (.nanoclaw/base/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (1 nodes): `Code File Three-Way Merge (git merge-file)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (1 nodes): `Structured Operations (Deterministic)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (1 nodes): `Skill Package Structure`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (1 nodes): `Intent Files (.intent.md)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (1 nodes): `Skill Manifest (manifest.yaml)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (1 nodes): `Skill Apply Flow (12-Step)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (1 nodes): `Shared Resolution Cache (.nanoclaw/resolutions/)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (1 nodes): `State Tracking (state.yaml)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 138`** (1 nodes): `Design Principles (19 Principles)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 139`** (1 nodes): `NanoClaw Debug Checklist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (1 nodes): `NanoClaw Security Model`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 141`** (1 nodes): `Mount Security (External Allowlist)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (1 nodes): `Trust Model (Main/Non-Main/Container/Input)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (1 nodes): `Agent-Browser Skill (Browser Automation)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 144`** (1 nodes): `NanoClaw Icon (Cute Shrimp/Claw Mascot)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 10 inferred relationships involving `main()` (e.g. with `readStdin()` and `log()`) actually correct?**
  _`main()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `runObliteratus()` (e.g. with `decompose()` and `retrieve()`) actually correct?**
  _`runObliteratus()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Search vault .md files for query terms.     Returns list of {path, matches, titl`, `Read full content of a vault .md file.     path is relative to vault root.`, `List .md files and subdirectories in a vault folder.     path is relative to vau` to the rest of the system?**
  _87 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cathedral Research Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Database & Task Store` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `NanoClaw Platform Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Orchestrator Core` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._