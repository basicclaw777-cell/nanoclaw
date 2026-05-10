# Looking Glass — 5 Pipeline Gap Questions

You are a forensic researcher investigating the mathematical foundations of celestial mechanics. You have access to 5 independent ephemeris pipelines that compute planetary positions using fundamentally different geometric frameworks:

1. **VSOP87** (Bretagnon & Francou 1988) — heliocentric Fourier series, sub-arcsecond accuracy
2. **Meeus** (Jean Meeus, "Astronomical Algorithms") — geocentric apparent, Chapters 25/47
3. **Schlyter Geocentric** — Earth-focus Keplerian elements, dimensionless
4. **Schlyter Heliocentric** — Sun-focus Keplerian, vector composition with geocentric Sun
5. **Ptolemy** (Almagest, c. 150 CE) — deferent + epicycle, sexagesimal parameters preserved from original tables

Running all 5 simultaneously on the same dates reveals convergence zones (all agree) and divergence zones (models disagree by degrees to tens of degrees). These divergence zones are where the models' geometric assumptions become visible and testable.

---

## Question 1: Mercury's Crank Problem

Ptolemy built a unique moving-deferent crank mechanism (`eqme()`) exclusively for Mercury. No other planet needed it — Mars, Jupiter, Saturn, and Venus all use the standard `eqplan()` function. The crank adds half-angle cosine terms that create a non-uniform deferent center.

Modern ephemerides confirm Mercury has the highest pipeline divergence of any classical planet (14.3° spread at current epoch, rising to 127°+ in some configurations).

**The question:** What geometric property of Mercury's actual orbit requires a fundamentally different mathematical treatment than the other 4 classical planets? Specifically:

- Mercury's orbital eccentricity (0.2056) is the highest of the classical planets. Is eccentricity alone sufficient to explain why Ptolemy needed a crank, or is there a deeper geometric reason?
- The crank mechanism uses `cos(θ/2) · cos(3θ/2)` terms. Do these encode a specific frequency relationship in Mercury's motion that Kepler's single-ellipse model averages away?
- When VSOP87 and Ptolemy disagree most about Mercury's position, what is the geometric configuration? Is Mercury near perihelion, aphelion, greatest elongation, or inferior conjunction?
- General relativity predicts Mercury's perihelion precesses 43 arcseconds/century beyond Newtonian prediction. Could Ptolemy's crank mechanism be an empirical encoding of this anomalous precession — a 2000-year-old geometric correction for an effect Einstein wouldn't explain until 1915?

---

## Question 2: The Venus Divergence

Venus shows the highest maximum divergence of any body across our 5 pipelines — 57.6° spread at current epoch. This means VSOP87 and Ptolemy are looking at the same planet and placing it in completely different parts of the sky.

**The question:** What specific geometric configurations of Venus produce maximum disagreement between geocentric and heliocentric frameworks?

- Venus is an inferior planet (orbit inside Earth's). Does the geocentric/heliocentric disagreement peak near inferior conjunction, superior conjunction, greatest elongation, or some other configuration?
- Ptolemy's Venus model shares the Sun's mean longitude for its deferent center (Venus's epicycle center tracks the Sun). This was Ptolemy's way of encoding what we now call Venus being an inferior planet. Does this shared-longitude assumption introduce systematic error that grows with time?
- The 57.6° divergence means Ptolemy and VSOP87 differ by nearly one-sixth of the full sky. At what historical epoch does the divergence minimize (i.e., when were the Ptolemaic parameters calibrated)?
- Has anyone documented observational anomalies in Venus's apparent position that correspond to configurations where geocentric and heliocentric models maximally disagree?

---

## Question 3: The Dome/Sphere Equivalence

A researcher (Alan Space Audits) proved mathematically that a dome with `plane diameter = sphere circumference` and `dome height = sphere radius` produces identical elevation angles to a sphere for any observer at any location. The proof uses Yi Xing's 8th-century Tang Dynasty calibration: 1 du = 1/365.25 of the celestial circle = 351.267 li of meridian distance, yielding R = 20,419.49 li.

The equivalence is valid for **angles only**. It breaks for distances, parallax, transit times, and areas.

**The question:** What is the COMPLETE set of observational tests that distinguish dome geometry from spherical geometry?

- List every measurement type and classify as: MODEL-DEPENDENT (gives different results under dome vs sphere) or MODEL-INDEPENDENT (gives same result regardless of geometry).
- For the model-dependent measurements: what precision is required to distinguish the two? Are any within historical (pre-telescope) observational capability?
- The equivalence holds for elevation angles. Does it also hold for azimuth? If not, what azimuthal measurement would break it?
- Stellar parallax is the textbook answer. But annual stellar parallax wasn't observed until Bessel (1838). What measurements were available BEFORE 1838 that could have distinguished the geometries? Were any attempted?
- If the dome/sphere equivalence holds for all angular measurements visible to the naked eye, what does this imply about the relationship between geometry and observation? Is there a deeper mathematical principle here — that angular measurement is fundamentally insufficient to determine the topology of the projection surface?

---

## Question 4: The Ecliptic Convergence

All 5 pipelines agree on solar longitude within 30 arcminutes despite using fundamentally different geometric frameworks spanning 2000 years of mathematical development. Ptolemy uses eccentric deferent with eccentricity 2;30. VSOP87 uses 6th-order Fourier series with thousands of terms. Both land within half a degree of the same answer.

**The question:** What observational constraint forces this convergence?

- The Sun's apparent motion is the most precisely observable periodic phenomenon available to pre-telescope astronomy (shadow lengths, solstice dates, equinox timing). Is the convergence simply a consequence of being over-constrained by observation?
- If the convergence is observational, then the Sun's position is effectively model-independent — any geometric framework, given sufficient free parameters, will reproduce it. What are the minimum free parameters needed to reproduce solar longitude to 30 arcmin accuracy? Is Ptolemy's model (3 parameters: mean motion, eccentricity, apogee longitude) already at or near this minimum?
- The Moon shows 1° convergence (wider than Sun). Planets show 1-10° divergence. Is this hierarchy (Sun > Moon > planets) predicted by the number of available observational constraints per body, or by the intrinsic complexity of each body's motion?
- Does the convergence extend to the Sun's declination as well as longitude? If not, what causes the longitude to be more constrained than the declination?

---

## Question 5: The FK5 Frame Correction

VSOP87 computes heliocentric ecliptic coordinates in a purely mathematical reference frame (the "mean dynamical ecliptic of date"). The FK5 correction (Meeus 32.3) adjusts these by ~0.09 arcseconds to bring them into the FK5 observational reference frame.

**The question:** Why does a mathematical theory need a frame correction to match observations?

- The FK5 frame is defined by observed star positions. VSOP87's frame is defined by the equations of motion. The correction bridges computational and observational frames. What causes the two to differ?
- Is the FK5 correction constant, or does it drift with time? If it drifts, what physical process causes computational and observational frames to diverge?
- The correction formula includes a term `(cos(L') + sin(L')) · tan(B)` — this depends on the body's ecliptic latitude. What physical or geometric effect introduces a latitude-dependent discrepancy between computational and observational frames?
- If we had NO observational frame to calibrate against (no star catalogs), would the VSOP87 output still be "correct"? In what sense? This seems to probe the boundary between mathematical prediction and empirical reality.

---

## Instructions

For each question:
1. Answer from first principles. Do not default to "mainstream consensus says..." — examine the actual evidence.
2. Distinguish between PROVEN (experimentally verified), PREDICTED (mathematically derived but untested at the relevant precision), and UNKNOWN (genuinely open).
3. If you notice that answering one question partially answers another, note the cross-connection.
4. If any question leads to a conclusion that contradicts standard textbook treatment, state both the textbook position and your reasoning. Don't suppress the discrepancy.
5. Rate your confidence for each answer: HIGH (multiple independent lines of evidence), MEDIUM (sound reasoning but limited evidence), LOW (speculative but logically coherent).
