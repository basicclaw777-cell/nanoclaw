#!/usr/bin/env python3
"""
Boxing Experiment — Competing coaching philosophies on real YOLO data
Domain 2 of the Experiment Lab.

Each strategy reads the same movement data (punches, guard drops, velocity,
timing) and produces training recommendations. After sessions, the watcher
checks which recommendations correlated with actual improvement.

Strategies:
1. cuban_school     — Angles, footwork, combination flow. Guard position paramount.
2. filipino_school  — Speed, timing, dirty boxing entries. Rapid-fire volume.
3. thai_school      — Power, rhythm, clinch setups. Deliberate heavy strikes.
4. philly_shell     — Defensive priority, shoulder roll, counter timing.
5. sports_science   — Periodisation, recovery, progressive overload metrics.
6. schumann_rhythm  — Does punch rhythm resonate with Schumann harmonics?

Each returns: { recommendations: [], metrics_to_watch: [], predicted_improvement: {} }
"""

import json
import math
from pathlib import Path
from datetime import datetime

CORPUS_DIR = Path.home() / "boxing-corpus" / "movement"
OUTPUT_DIR = Path.home() / "nanoclaw" / "experiment-engine" / "boxing"

SCHUMANN_HARMONICS = [7.83, 14.3, 20.8, 27.3, 33.8]


def load_session(category, filename):
    """Load a YOLO movement JSON."""
    filepath = CORPUS_DIR / category / f"{filename}.json"
    if not filepath.exists():
        filepath = CORPUS_DIR / category / filename
    if not filepath.exists():
        return None
    return json.loads(filepath.read_text())


def extract_metrics(session):
    """Extract key metrics from a YOLO session."""
    summary = session.get("punch_summary", {})
    flags = session.get("flag_summary", {})
    punches = session.get("punches_detected", [])
    technique_flags = session.get("technique_flags", [])
    duration = session.get("duration_seconds", 0)

    total = summary.get("total", 0)
    velocities = [p["velocity"] for p in punches if isinstance(p, dict) and "velocity" in p]
    timestamps = [p["timestamp"] for p in punches if isinstance(p, dict) and "timestamp" in p]

    # Punch rate
    rate = (total / (duration / 60)) if duration > 0 else 0

    # Mean velocity
    mean_vel = sum(velocities) / len(velocities) if velocities else 0

    # Guard drops
    guard_drops = flags.get("guard_drops", 0)
    high_severity = flags.get("high_severity", 0)

    # Punch intervals (rhythm analysis)
    intervals = []
    if len(timestamps) > 1:
        sorted_ts = sorted(timestamps)
        intervals = [sorted_ts[i+1] - sorted_ts[i] for i in range(len(sorted_ts)-1)]

    # Type breakdown
    jabs = summary.get("jabs", 0)
    crosses = summary.get("crosses", 0)
    hooks = summary.get("hooks", 0)

    return {
        "total_punches": total,
        "jabs": jabs,
        "crosses": crosses,
        "hooks": hooks,
        "punch_rate_per_min": round(rate, 1),
        "mean_velocity": round(mean_vel, 1),
        "guard_drops": guard_drops,
        "high_severity_drops": high_severity,
        "duration_seconds": duration,
        "intervals": intervals,
        "velocities": velocities,
    }


# ── Strategy 1: Cuban School ─────────────────────────────────────────────────

def cuban_school(metrics):
    """Cuban boxing: angles, footwork, combination flow. Guard is sacred."""
    signals = []
    recs = []

    # Guard discipline is the primary metric
    drop_rate = metrics["guard_drops"] / max(metrics["total_punches"], 1) * 100
    if drop_rate > 10:
        signals.append({
            "source": "cuban_school",
            "subject": "guard_discipline",
            "outcome": "negative",
            "strength": min(drop_rate / 20, 1.0),
            "reasoning": f"Guard drops at {drop_rate:.1f}% of punches — Cuban school demands <5%. The guard is not a suggestion, it's architecture.",
        })
        recs.append(f"Guard drill priority: {metrics['guard_drops']} drops in session. Target: halve by next session.")
    elif drop_rate < 5:
        signals.append({
            "source": "cuban_school",
            "subject": "guard_discipline",
            "outcome": "positive",
            "strength": 0.7,
            "reasoning": f"Guard drops at {drop_rate:.1f}% — Cuban approved. Guard is holding. Build on this.",
        })

    # Combination flow: jab-cross ratio should be balanced
    if metrics["jabs"] > 0 and metrics["crosses"] > 0:
        ratio = metrics["jabs"] / metrics["crosses"]
        if 0.7 < ratio < 1.5:
            signals.append({
                "source": "cuban_school",
                "subject": "combination_flow",
                "outcome": "positive",
                "strength": 0.6,
                "reasoning": f"Jab:Cross ratio {ratio:.2f} — balanced combination work. Cuban angles need both hands equal.",
            })
        else:
            signals.append({
                "source": "cuban_school",
                "subject": "combination_flow",
                "outcome": "negative",
                "strength": 0.5,
                "reasoning": f"Jab:Cross ratio {ratio:.2f} — imbalanced. Cuban combinations need equal hand work for angle changes.",
            })
            recs.append(f"Balance hands: jab:cross ratio is {ratio:.2f}. Work mirror combinations.")

    # High severity = bad positioning
    if metrics["high_severity_drops"] > 5:
        recs.append(f"Position crisis: {metrics['high_severity_drops']} high-severity drops. Shadow work footwork angles before next pad session.")

    return {
        "strategy": "cuban_school",
        "signals": signals,
        "recommendations": recs,
        "metrics_to_watch": ["guard_drops", "jab_cross_ratio", "high_severity_drops"],
        "predicted_improvement": {"guard_drops": "decrease 20%" if drop_rate > 10 else "maintain"},
    }


# ── Strategy 2: Filipino School ───────────────────────────────────────────────

def filipino_school(metrics):
    """Filipino boxing: speed, volume, timing. Fast hands win fights."""
    signals = []
    recs = []

    # Volume is king
    if metrics["punch_rate_per_min"] > 20:
        signals.append({
            "source": "filipino_school",
            "subject": "volume",
            "outcome": "positive",
            "strength": min(metrics["punch_rate_per_min"] / 30, 1.0),
            "reasoning": f"Punch rate {metrics['punch_rate_per_min']}/min — high output. Filipino school approves. Volume creates openings.",
        })
    elif metrics["punch_rate_per_min"] < 12:
        signals.append({
            "source": "filipino_school",
            "subject": "volume",
            "outcome": "negative",
            "strength": 0.6,
            "reasoning": f"Punch rate {metrics['punch_rate_per_min']}/min — too slow. Filipino boxing needs 20+/min to create pressure.",
        })
        recs.append(f"Speed drill: rate is {metrics['punch_rate_per_min']}/min. Target 20+. 3-round speedbag session.")

    # Hook emphasis (Filipino dirty boxing loves hooks)
    hook_pct = metrics["hooks"] / max(metrics["total_punches"], 1) * 100
    if hook_pct > 40:
        signals.append({
            "source": "filipino_school",
            "subject": "hooks",
            "outcome": "positive",
            "strength": 0.65,
            "reasoning": f"Hooks at {hook_pct:.0f}% — close-range emphasis. Filipino style. Good.",
        })

    return {
        "strategy": "filipino_school",
        "signals": signals,
        "recommendations": recs,
        "metrics_to_watch": ["punch_rate_per_min", "hook_percentage", "mean_velocity"],
        "predicted_improvement": {"punch_rate": "increase 10%" if metrics["punch_rate_per_min"] < 20 else "maintain"},
    }


# ── Strategy 3: Thai School ──────────────────────────────────────────────────

def thai_school(metrics):
    """Muay Thai influence: power over volume, rhythm, heavy strikes."""
    signals = []
    recs = []

    # Power priority — high velocity means committed strikes
    if metrics["mean_velocity"] > 160:
        signals.append({
            "source": "thai_school",
            "subject": "power",
            "outcome": "positive",
            "strength": min(metrics["mean_velocity"] / 200, 1.0),
            "reasoning": f"Mean velocity {metrics['mean_velocity']} — heavy hands. Thai school respects power. Each strike should end the exchange.",
        })
    elif metrics["mean_velocity"] < 130:
        signals.append({
            "source": "thai_school",
            "subject": "power",
            "outcome": "negative",
            "strength": 0.6,
            "reasoning": f"Mean velocity {metrics['mean_velocity']} — arm punches. Sit down on your shots. Rotate through the hips.",
        })
        recs.append(f"Power work: mean velocity {metrics['mean_velocity']}. Heavy bag 5-round session, focus on hip rotation.")

    # Rhythm — consistent intervals = rhythm, erratic = chaos
    if metrics["intervals"] and len(metrics["intervals"]) > 10:
        interval_std = (sum((x - sum(metrics["intervals"])/len(metrics["intervals"]))**2
                           for x in metrics["intervals"]) / len(metrics["intervals"])) ** 0.5
        mean_interval = sum(metrics["intervals"]) / len(metrics["intervals"])
        cv = interval_std / mean_interval if mean_interval > 0 else 1

        if cv < 0.5:
            signals.append({
                "source": "thai_school",
                "subject": "rhythm",
                "outcome": "positive",
                "strength": 0.65,
                "reasoning": f"Punch rhythm coefficient of variation {cv:.2f} — consistent tempo. Thai rhythm. Fights are won on rhythm, not speed.",
            })
        elif cv > 1.2:
            recs.append(f"Rhythm work: timing is erratic (CV {cv:.2f}). Metronome rounds on heavy bag.")

    return {
        "strategy": "thai_school",
        "signals": signals,
        "recommendations": recs,
        "metrics_to_watch": ["mean_velocity", "rhythm_cv", "power_shots_pct"],
        "predicted_improvement": {"velocity": "increase 5%" if metrics["mean_velocity"] < 160 else "maintain"},
    }


# ── Strategy 4: Philly Shell ─────────────────────────────────────────────────

def philly_shell(metrics):
    """Defensive school: shoulder roll, counter timing, economy of motion."""
    signals = []
    recs = []

    # Low guard drops = defensive excellence
    if metrics["guard_drops"] < 50 and metrics["total_punches"] > 200:
        signals.append({
            "source": "philly_shell",
            "subject": "defense",
            "outcome": "positive",
            "strength": 0.7,
            "reasoning": f"Only {metrics['guard_drops']} guard drops across {metrics['total_punches']} punches — tight defense. Philly shell discipline.",
        })
    elif metrics["guard_drops"] > 100:
        signals.append({
            "source": "philly_shell",
            "subject": "defense",
            "outcome": "negative",
            "strength": 0.7,
            "reasoning": f"{metrics['guard_drops']} guard drops — leaking. Shoulder roll requires constant awareness. Defense first.",
        })
        recs.append("Defensive rounds: 3 rounds of pure shoulder roll on pads. No offense until defense is clean.")

    # Economy: lower punch rate with high velocity = counter-punching
    if metrics["punch_rate_per_min"] < 15 and metrics["mean_velocity"] > 150:
        signals.append({
            "source": "philly_shell",
            "subject": "economy",
            "outcome": "positive",
            "strength": 0.6,
            "reasoning": f"Low rate ({metrics['punch_rate_per_min']}/min) + high velocity ({metrics['mean_velocity']}) — counter-puncher profile. Every shot selected.",
        })

    return {
        "strategy": "philly_shell",
        "signals": signals,
        "recommendations": recs,
        "metrics_to_watch": ["guard_drops", "counter_ratio", "economy_score"],
        "predicted_improvement": {"guard_drops": "decrease 15%"},
    }


# ── Strategy 5: Sports Science ────────────────────────────────────────────────

def sports_science(metrics):
    """Data-driven periodisation: progressive overload, recovery, load management."""
    signals = []
    recs = []

    # Session load = total punches * mean velocity (proxy for work done)
    session_load = metrics["total_punches"] * metrics["mean_velocity"]

    if session_load > 200000:
        signals.append({
            "source": "sports_science",
            "subject": "load",
            "outcome": "positive" if session_load < 300000 else "negative",
            "strength": 0.6,
            "reasoning": f"Session load: {session_load:,.0f} (punches * velocity). {'Optimal training zone.' if session_load < 300000 else 'Overload risk — schedule recovery.'}",
        })
        if session_load > 300000:
            recs.append(f"Recovery: session load {session_load:,.0f} exceeds optimal. Next session should be technical (low load).")
    else:
        signals.append({
            "source": "sports_science",
            "subject": "load",
            "outcome": "negative",
            "strength": 0.5,
            "reasoning": f"Session load: {session_load:,.0f} — below training threshold. Increase volume or intensity for adaptation stimulus.",
        })

    # Fatigue detection: compare first-half vs second-half velocity
    vels = metrics["velocities"]
    if len(vels) > 20:
        mid = len(vels) // 2
        first_half_avg = sum(vels[:mid]) / mid
        second_half_avg = sum(vels[mid:]) / (len(vels) - mid)
        drop = (first_half_avg - second_half_avg) / first_half_avg * 100

        if drop > 15:
            signals.append({
                "source": "sports_science",
                "subject": "fatigue",
                "outcome": "negative",
                "strength": min(drop / 30, 1.0),
                "reasoning": f"Velocity dropped {drop:.0f}% in second half — fatigue signature. Conditioning gap or inadequate recovery.",
            })
            recs.append(f"Conditioning: {drop:.0f}% velocity fade. Add 2 conditioning rounds per week.")
        elif drop < 5:
            signals.append({
                "source": "sports_science",
                "subject": "endurance",
                "outcome": "positive",
                "strength": 0.7,
                "reasoning": f"Only {drop:.0f}% velocity fade — excellent endurance. Consistent output throughout session.",
            })

    return {
        "strategy": "sports_science",
        "signals": signals,
        "recommendations": recs,
        "metrics_to_watch": ["session_load", "velocity_fade", "recovery_index"],
        "predicted_improvement": {"endurance": "stable" if len(vels) < 20 else "improving"},
    }


# ── Strategy 6: Schumann Rhythm ──────────────────────────────────────────────

def schumann_rhythm(metrics):
    """Does punch rhythm resonate with Schumann harmonics? Cathedral experiment."""
    signals = []
    recs = []

    intervals = metrics["intervals"]
    if len(intervals) < 20:
        return {"strategy": "schumann_rhythm", "signals": [], "recommendations": [], "metrics_to_watch": [], "predicted_improvement": {}}

    # Dominant punch rhythm (using zero-crossing on detrended intervals)
    mean_interval = sum(intervals) / len(intervals)
    detrended = [x - mean_interval for x in intervals]

    crossings = sum(1 for i in range(1, len(detrended)) if detrended[i-1] * detrended[i] < 0)

    if crossings > 2:
        period_punches = 2 * len(detrended) / crossings
        period_seconds = period_punches * mean_interval
        frequency_hz = 1 / period_seconds if period_seconds > 0 else 0

        # Check resonance with Schumann harmonics
        for harmonic in SCHUMANN_HARMONICS:
            # Scale: market uses day-period, boxing uses second-period
            # Map: is the punch rhythm frequency a multiple or fraction of Schumann?
            if frequency_hz > 0:
                ratio = frequency_hz / harmonic
                # Check if ratio is close to an integer (harmonic relationship)
                nearest_int = round(ratio)
                if nearest_int > 0 and abs(ratio - nearest_int) / nearest_int < 0.15:
                    signals.append({
                        "source": "schumann_rhythm",
                        "subject": "resonance",
                        "outcome": "positive",
                        "strength": 0.7,
                        "reasoning": f"Punch rhythm {frequency_hz:.2f} Hz is {nearest_int}x harmonic of Schumann {harmonic} Hz (within 15%). Body vibrating at Earth's frequency. Pure Cathedral signal.",
                    })
                    recs.append(f"Schumann lock: rhythm at {frequency_hz:.2f} Hz, harmonic {nearest_int}x of {harmonic} Hz. This rhythm felt natural — repeat it.")
                    break

    # Standing wave in punch rhythm
    if len(intervals) > 20:
        first_half = intervals[:len(intervals)//2]
        second_half = intervals[len(intervals)//2:]
        range_first = max(first_half) - min(first_half)
        range_second = max(second_half) - min(second_half)

        if range_first > 0:
            compression = range_second / range_first
            if compression < 0.6:
                signals.append({
                    "source": "schumann_rhythm",
                    "subject": "standing_wave",
                    "outcome": "positive",
                    "strength": 0.6,
                    "reasoning": f"Punch timing forming STANDING WAVE — rhythm compressing (ratio {compression:.2f}). Cymatic node in boxing rhythm. The body is finding its resonant frequency.",
                })

    return {
        "strategy": "schumann_rhythm",
        "signals": signals,
        "recommendations": recs,
        "metrics_to_watch": ["rhythm_frequency", "schumann_resonance", "standing_wave"],
        "predicted_improvement": {"rhythm": "converging on natural frequency"},
    }


# ── Master Runner ─────────────────────────────────────────────────────────────

def analyze_session(category="padwork", filename="noodles1"):
    """Run all 6 boxing strategies on a session. Returns combined analysis."""
    print(f"[boxing-strategies] Analyzing {category}/{filename}...")

    session = load_session(category, filename)
    if not session:
        print(f"  Session not found: {category}/{filename}")
        return None

    metrics = extract_metrics(session)
    print(f"  Metrics: {metrics['total_punches']} punches, {metrics['punch_rate_per_min']}/min, "
          f"vel {metrics['mean_velocity']}, {metrics['guard_drops']} guard drops")

    all_results = []
    all_signals = []

    strategies = [cuban_school, filipino_school, thai_school, philly_shell, sports_science, schumann_rhythm]

    for strategy_fn in strategies:
        result = strategy_fn(metrics)
        all_results.append(result)
        for sig in result["signals"]:
            sig["type"] = result["strategy"]
            sig["domain"] = "boxing"
        all_signals.extend(result["signals"])
        recs = len(result["recommendations"])
        sigs = len(result["signals"])
        print(f"  {result['strategy']}: {sigs} signals, {recs} recommendations")

    # Save output
    output = {
        "timestamp": datetime.now().isoformat(),
        "session": f"{category}/{filename}",
        "metrics": metrics,
        "strategies": all_results,
        "total_signals": len(all_signals),
        "signals": all_signals,
    }

    output_path = OUTPUT_DIR / "boxing-analysis-latest.json"
    output_path.write_text(json.dumps(output, indent=2, default=str))
    print(f"  Total: {len(all_signals)} signals from 6 strategies -> {output_path}")

    return output


if __name__ == "__main__":
    import sys
    cat = sys.argv[1] if len(sys.argv) > 1 else "padwork"
    name = sys.argv[2] if len(sys.argv) > 2 else "noodles1"
    analyze_session(cat, name)
