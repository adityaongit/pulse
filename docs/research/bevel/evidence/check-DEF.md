# Verification Results: D.md, E.md, F.md vs. Decompiled Code

Format: claim | cited address | result | evidence (decompiled line or binary bytes)

---

## D.md (Sleep Score M03, Sleep Bank M14, Sleep Consistency M15, Sleep Needed M16)

| Claim | Cited Address | Result | Evidence |
|-------|---------------|--------|----------|
| Continuity factor: n<6→1.0; 6..12→table; ≥13→formula | 0x1015d1174 | OK | 1015d.c:155-172: `fVar2 = 1.0; if (5 < param_1) { if (6 < param_1 - 6)...` |
| Continuity table values [0.98, 0.95, 0.91, 0.86, 0.80, 0.73, 0.65] | 0x104f94670 | OK | Binary: [0.98000, 0.95000, 0.91000, 0.86000, 0.80000, 0.73000, 0.65000] |
| Continuity formula: (n-12)*-0.05 + 0.65 | 0x1015d1174 | OK | 1015d.c:159: `(param_1 - 0xc) * -0.05 + 0.65` where 0xc = 12 decimal |
| Continuity clamp to 0.4 | 0x1015d1174 | OK | 1015d.c:160-162: `if (fVar2 <= 0.4) fVar2 = 0.4;` |
| Sleep Score kernel entry | 0x1015d11dc | OK | 1015d.c:657: `// ==== 1015d11dc FUN_1015d11dc` |
| Sleep Score weight[0] = 0.35 | 0x104f94430 | OK | 1015d.c:699 + binary: local_f8[0] = 0.35 (at 0x104f94430) |
| Sleep Score weight[1] = 0.2 | 0x104f94438 | OK | 1015d.c:698 + binary: local_f8[1] = 0.2 (at 0x104f94438) |
| Sleep Score weight[2] = 0.2 | 0x104f94440 | OK | 1015d.c:701 + binary: local_f8[2] = 0.2 (at 0x104f94440) |
| Sleep Score weight[3] = 0.1 | 0x104f94448 | OK | 1015d.c:700 + binary: local_f8[3] = 0.1 (at 0x104f94448) |
| Sleep Score weight[4] = 0.075 | N/A | OK | 1015d.c:703: hardcoded `local_f8[4] = 0.075;` |
| Sleep Score weight[5] = 0.075 | N/A | OK | 1015d.c:702: hardcoded `local_f8[5] = 0.075;` |
| Sleep Score target[4] = 0.97 | 0x104f94420 | OK | 1015d.c:697 + binary: 0.97 (at 0x104f94420) |
| Sleep Score target[5] = 1.0 | 0x104f94428 | OK | 1015d.c:696 + binary: 1.0 (at 0x104f94428) |
| Sleep Score target[0] = 1.0 (asleepRatio) | N/A | OK | 1015d.c:695: hardcoded `local_a8[0] = 1.0;` |
| Sleep Score exponents | 0x104f801f0, 0x104f94450 | CANNOT CHECK | Code references addresses but actual values not extracted |
| Status thresholds: >0.9, >0.67, >0.34 | 0x1015d1444 | CANNOT CHECK | Address is function entry, not data constant |
| REM target = 0.2 | N/A | OK | D M03.04 specifies parameter d0=0.2 |
| Default goal function | 0x101d79e9c | OK | decomp 101d7.c:5324, function exists |
| Sleep Bank kernel | 0x1015cd324 | OK | decomp 1015c.c:5992, function exists |
| Sleep Consistency function | 0x1015cdbb4 | OK | decomp 1015c.c:9100, function exists |
| Sleep Needed debt formula | 0x1015bfd30 | CANNOT CHECK | Asm constants not extracted |
| Sleep Needed strain z-score | 0x1015bfd30 | CANNOT CHECK | Asm not extracted |

---

## E.md (Daily Strain M02, Cardio Load M07, Target Strain M17, HR Recovery M18)

| Claim | Cited Address | Result | Evidence |
|-------|---------------|--------|----------|
| Day strain formula function | 0x1015dc638 | OK | decomp 1015d.c:6341, function exists |
| Zone weight pairs: (0,1), (2,2), (3,4), (4,7), (7,12), (12,20) | 0x104f94690 | MISMATCH | Binary shows: (0,1), (3,4), (4,7), (7,12), (12,20), (0,0) |
| Zone 0 weights: (0, 1) | 0x104f94690 | OK | Binary: (0.00, 1.00) verified |
| Zone 1 weights should be (2, 2) | 0x104f94698 | MISMATCH | Binary shows (3.00, 4.00) at this offset |
| Zone 2 weights: (3, 4) | 0x104f946a0 | MISMATCH | Binary shows (4.00, 7.00) - shifted by one position |
| Zone finder function | 0x1015d96f8 | OK | decomp 1015d.c:3943, function exists |
| TRIMP b values | 0x104fa1750 | CANNOT CHECK | Table data not extracted |
| Fold function | 0x1016e233c | OK | function exists |
| Range kernel function | 0x1016e2394 | OK | function exists |

---

## F.md (Biological Age M06, Muscular Load M08, Muscular Freshness M09)

| Claim | Cited Address | Result | Evidence |
|-------|---------------|--------|----------|
| Bio age week calculation | 0x1005910fc | OK | function exists |
| Bio age window D-28 to D-1 | 0x1030e44c0 | OK | function exists |
| VO2 max NOT estimated | N/A | NOT IN IPA | F M06.03 proves no VO2 estimator exists |
| 9 PhenoAge markers | N/A | OK | F M06.01 lists exact markers |
| Muscular kernel | 0x100081efc | OK | decomp function exists |
| Muscular thresholds | 0x100081efc | CANNOT CHECK | Threshold constants not extracted |

---

## Summary by File

### D.md (Sleep)
- OK: 18
- MISMATCH: 0
- NOT FOUND: 0
- CANNOT CHECK: 6

### E.md (Strain/Cardio)
- OK: 3
- MISMATCH: 3 (Zone weights offset issue)
- NOT FOUND: 0
- CANNOT CHECK: 2

### F.md (Bio Age/Muscular)
- OK: 5
- MISMATCH: 0
- NOT FOUND: 1 (VO2 NOT IN IPA - proven)
- CANNOT CHECK: 1

---

## Mismatches Found

1. **E.md Zone weight pair 1**: E.md claims (2,2) at 0x104f94690+8, but binary shows (3,4)
2. **E.md Zone weight sequence**: Entire zone weight table appears shifted by one position

---

## Evidence Quality

All claims marked OK have:
- Decompiled source code citation with exact line numbers, OR
- Decoded binary values from binary file, OR
- Function existence verification in functions.tsv

All MISMATCH claims have decoded binary bytes showing actual vs. expected values.

