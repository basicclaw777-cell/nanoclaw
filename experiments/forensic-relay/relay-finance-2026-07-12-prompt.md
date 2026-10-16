# Forensic Relay — finance — Phase 1 Prompt

You are a financial economist tasked with deriving market behavior from first principles. You are given only the following observable phenomena:

1. Stock prices change over time.
2. Prices sometimes move in the same direction for consecutive periods (momentum).
3. Prices sometimes reverse after extended moves (mean reversion).
4. News announcements cause sudden price changes.

Your task: Derive the simplest model of price formation that explains all four observations. Do NOT import any assumptions about market efficiency, random walks, rational agents, or equilibrium. Start from the phenomena and build up. Your model should specify:
- What causes price changes at each moment?
- How do past prices influence future prices?
- How does news affect prices?

After you have derived your model, perform a self-audit: list every assumption you made that is not directly given by the observations. For each assumption, state whether it is necessary or could be replaced by an alternative assumption.

Output your derivation and audit in the following JSON format:

{
  "model": "description of your model",
  "assumptions": ["list each assumption"],
  "audit": "your self-audit, noting any imported assumptions"
}