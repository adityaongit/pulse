# Findings H: patches (G13), evidence labels (G14), scope discovery (G15), resources/remote (G16)

Agent H. Scratch and tools: `/Users/adityajindal/bevel-re/work/H/` (see "Tools and reproducibility" at the end).
Nothing was executed on a device. Everything below comes from bytes/decompiles plus a small ARM64 interpreter I wrote
(`H/emu.py`) that single-steps the obfuscated dylib code on this Mac with all external calls intercepted (no network, no dlopen, no
foreign code was run natively).

---

## G13: the two injected dylibs

### G13 — RESOLVED

Hypothesis "the patch unlocks Bevel's own paywalled premium features" is **proven for the Pro tier, client side only**. The patch contains
no scoring/metric hook of any kind. Details, with addresses, below.

#### 0. Identity and linkage

| item | value | evidence |
|---|---|---|
| `BevelAIHealthCoachPatch.dylib` | sha256 `e5f14354d2b146f6110e19a66da82d39ae283bcb8b39ec5d7cec969e5379d3d1`, 8,932,064 bytes, **weak** `LC_LOAD_DYLIB` of the main binary only | `otool -L Superset` (`@rpath/BevelAIHealthCoachPatch.dylib ... weak`); extensions do not link it |
| `blatantsPatch.dylib` | sha256 `4fb1f1d688a795bd3fb63aec01cf238ed48834fb95733cdaa280ee0618401f5a`, 70,848 bytes, strong link of main binary, `SupersetWidgetExtension.appex` and `SupersetCaptureExtension.appex` | `otool -L` of the three executables |
| main binary signature | CodeDirectory only, no CMS blob, `TeamIdentifier=not set`, `cryptid 0` | `codesign -dvvv Superset`. Page hashes cover the patched file, so they cannot serve as a pristine reference |
| bundle | `CFBundleShortVersionString 3.1.7`, build 2728, `cyan.entitlements` in the bundle root (the IPA was re-packed by a sideload/injection tool) | `Info.plist`, `cyan.entitlements` |

#### 1. `BevelAIHealthCoachPatch.dylib`: what it is

The 8.9 MB `__text` is ~97% decoy: 47 exported C++ symbols (`SubscriptionVerifier_Validate`, `EntitlementGuard_Verify`, `PurchaseHistory_Sync`,
`GrantMatrix_Recompute`, `RemoteConfig_Fetch`, `FeatureFlag_Resolve`, `DRMChannel_Provision`, `PirateSignal_Scan`, ...) and 22 named ObjC classes (18 decoys: `LicenseBroker`,
`EntitlementResolver`, `TokenBroker`, `DRMPolicyEngine`, `PolicyEngine`, `SessionBroker`, `InvoiceReconciliation`, `WatermarkTracker`, `HardwareAttestation`,
`FeatureFlagStore`, `ABTestAllocator`, `CrashDispatcher`, `TelemetryClient`, `AuditTrail`, `RateLimiterBucket`, `UsageTracker`, `OCSPChecker`, `SignatureVerifier`; plus `VIPWindowGuard`, `PopupValidator`, `_DABootstrap`, `_FDBootstrap`) and 9 obfuscated-name UI classes (popup), plus the BBAES library (class `BBAES` and an NSString category). I ran **every one of the 624 decompiled
functions** (`H/runall.py`, output `H/allcalls.txt`, 60,514 lines) under the interpreter with each external call logged:

* none of the decoy functions writes to Bevel state. They hash/format junk with hard-coded fake secrets/hosts (`https://api.license-broker.net/v7/entitlement/verify`,
  `wss://realtime.enforcement-bus.io/subscribe`, `sk_live_51Hx...`, fake cert fingerprints, `hmac-rotation-v4-primary-key-...`; decrypted list in `H/allstr.txt` lines ~430-520) and drop the result.
* **No function in the dylib issues a network request.** The dylib imports `NSURL`/`NSMutableURLRequest` but never `NSURLSession`/`NSURLConnection`/CFNetwork/sockets-to-remote;
  `RemoteConfig_Fetch` (`0x3dd358`) builds an `NSMutableURLRequest` (`requestWithURL:`, `setHTTPMethod:`, `setValue:forHTTPHeaderField:`) and never sends it
  (`H/allcalls.txt` section `#### 003dd358`, no `dataTask`/`NSURLSession` selector anywhere: `grep -ciE "dataTask|NSURLSession|sendSynchronous" allcalls.txt` = 0).
  The only `socket/connect` code (`0x7493ac`, `0x749874`, `0x75cc50`) connects to **`127.0.0.1`** (Frida port probe) with `SO_SNDTIMEO` (`setsockopt(…,0xffff,0x1005…)`) and scans dyld image names and thread names.
  The one external effect is `UIApplication openURL:` of **`https://bit.ly/410kOxh`** (below).
* BBAES (`bb_TripleLayerAESDecryptedStringWithKey1:key2:key3:`, `decryptedDataFromString:IV:key:`) and `CCCryptorGCMOneshot*` have no reachable caller (callers: `FUN_0000ec0c` only from decoy chain `FUN_003299d4 -> FUN_00341534`;
  category methods `0x7cded8/0x7cee6c/0x7cfa3c` have no caller). The real strings are *not* BBAES-encrypted (see 2).

#### 2. String hiding: exact scheme (static decryption reproduced)

There is no key material. Each function begins with a once-only guard (`if (flag == 0) { loop… }`) that fills its string pool with `dst[i] = a[i] OP b[i]` (OP in `^`, `+`, `-`, written as mixed-boolean-arithmetic),
where `a` and `b` are two stored byte arrays; the result is a NUL-terminated C string used with `dlsym(RTLD_DEFAULT=-2, …)`, `NSClassFromString`, `objc_getClass`, `sel_registerName` or wrapped in a `CFString`
(the 208 `__cfstring` objects at `0x7ec998-0x7ee398` point into the same pool). Example, `FUN_0053b4b0` (`BevelAIHealthCoachPatch.dylib.c:88585`) loop 1: `dst[i] = (a[i] & ~b[i]) - (~a[i] & b[i])` (= `a[i]-b[i]`, a=`0x849640`, b=`0x849840`, dst=`0x849660`, 0x1a bytes) -> `class_getInstanceVariable`.
I reproduced the string-decrypt prologues of 206 functions in Python (`H/dec3.py`, regex over the decompile + evaluation of the MBA expression per byte) and, independently, by executing the code in the interpreter
(`H/run9.py` dumps all cfstrings after running every ObjC method). Both agree. Decrypted pool: `H/allstr.txt`.
`FUN_0053b4b0` pool (the only security-relevant one): `0x849660 "class_getInstanceVariable"`, `0x849689 "ivar_getOffset"`, `0x849760 "_subscriptionStatus"`, `0x8497a0 "swift_allocObject"`,
`0x8497e0 "NSClassFromString"`, `0x8496f0 "/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation"`, CFString `0x7ede78 -> 0x849820 "_TtC8Superset10StoreModel"`.

#### 3. Initializers and entry points (all resolved)

| entry | address | what it does (interpreter-confirmed) |
|---|---|---|
| `__mod_init_func[0]` | `0x4000` (`FUN_00004000`, `.c:1`) | (a) `ptrace(PT_DENY_ATTACH=31)` via raw `svc #0x80` (`x16=26`, repeated; `x16=0` indirect form), sysctl `P_TRACED` check; (b) `bl 0x53b4b0` at `0x4684` = **the hook installer** (section 4); (c) schedules timed blocks on the main queue (section 6) |
| `__mod_init_func[1]` | `0x422ed8` | `ptrace` deny-attach again, then copies 7 selector-name pointers from `__objc_selrefs` (`0x7f3420-0x7f3458`) into a global table `0x870cb0-0x870ce8`. No calls |
| `+[mW0yRdLVf0ngMwMF1qgChlmo load]` | `0x2424e0` (`.c:7928`) | `dlsym(RTLD_DEFAULT,"dispatch_once")` then `dispatch_once(0x8703c0, block 0x7ec148 -> 0x22b7f0)` = tamper check of the popup classes (section 6) |
| `+[_DABootstrap load]` | `0x39e5cc` | `dispatch_once(0x870940, block 0x7ec238 -> 0x39d7b4)`: `[VIPWindowGuard sharedInstance]`, `[PopupValidator canonicalEndpoint]` (decoys, return values dropped) |
| `+[_FDBootstrap load]` | `0x420adc` | sends one class message to each decoy class (`[LicenseBroker brokerForBundle:]`, `[EntitlementResolver resolveForUser:]`, `[TokenBroker mintSessionTokenForBundle:expiry:]`, `[PolicyEngine defaultEngine]`, `[SessionBroker brokerForDeviceID:]`, `[InvoiceReconciliation reconciliationForInvoice:]`, `[DRMPolicyEngine engineForChannel:]`, `[WatermarkTracker trackerForSession:]`, `[HardwareAttestation attestForDevice:]`, `[FeatureFlagStore defaultStore]`, `[CrashDispatcher shared]`, `[ABTestAllocator activeExperiments]`); results unused |

#### 4. The one real hook: `swift_allocObject` fishhook -> `Superset.StoreModel._subscriptionStatus`

`FUN_0053b4b0` (`.c:88585`; call at `0x4684`), after the pool decryption (cached by flags `0x871284/0x871278`):

```
dlopen(Foundation, RTLD_NOW|RTLD_GLOBAL)               // 9
NSClassFromString   = dlsym(RTLD_DEFAULT,"NSClassFromString")        -> g[0x871210]
class_getInstanceVariable = dlsym(...)                                -> g[0x871218]
ivar_getOffset      = dlsym(...)                                      -> g[0x871220]
cls = NSClassFromString(@"_TtC8Superset10StoreModel"); if (!cls) return
iv  = class_getInstanceVariable(cls, "_subscriptionStatus"); if (!iv) return
g[0x849620] = ivar_getOffset(iv)                       // offset of the Published<SubscriptionStatus> storage
g[0x8711a0] = cls
g[0x8711a8] = dlsym(RTLD_DEFAULT,"swift_allocObject")  // original
FUN_007d6490(&rebinding{name=0x8497a0 "swift_allocObject", replacement=0x53c998, replaced=0x8711a8}, 1)   // facebook fishhook rebind_symbols
```

The rebinding struct is the 3-word record at `0x7ec6a0` (bytes `a09784000000000098c953000000000a8118700...` = `{0x8497a0, 0x53c998, 0x8711a8}`). `FUN_007d6490` (`.c:127270`) is the stock fishhook
(`_dyld_register_func_for_add_image`, `_dyld_get_image_header`, `_dyld_get_image_vmaddr_slide`, `vm_protect` for `__DATA_CONST`, walks `__la_symbol_ptr`/`__got` through the indirect symbol table).

Replacement `0x53c998` (`FUN_0053c998`, `.c:88844`), verified by calling it in the interpreter with several metadata pointers:

```
void* hook(void* metadata, size_t size, size_t alignMask) {
    obj = orig_swift_allocObject(metadata, size, alignMask);
    if (metadata == g[0x8711a0] /*StoreModel class*/ && atomic_cas(g[0x8711b0]: 0 -> 1)) {   // ldaxr/stlxr at 0x53d654/0x53d668
        g[0x8711b8] = obj;                                                                // first StoreModel instance only
        dispatch_after(dispatch_time(0, 200ms), dispatch_get_global_queue(QOS_USER_INITIATED=0x19,0), block 0x7ec6b8 -> 0x53dcec);
    }
    return obj;      // every other allocation: pass-through, no side effects (tested: metadata 0, StoreModel type descriptor, unrelated pointers)
}
```

The 200 ms block `0x53dcec` runs the **enforcement step once**, then (flag `0x87128c`) arms a repeating `dispatch_source` timer on queue `"superset.clamp"` (QOS 0x11):
`dispatch_source_set_timer(src, start=now+100 ms, interval=1,000,000,000 ns, leeway=200,000,000 ns)`, handler = block `0x7ec6d8 -> 0x540390`
(interpreter log: `dispatch_source_set_timer 0, 0, 0x3b9aca00, 0xbebc200`). Enforcement step (identical code in `0x53dcec` and `0x540390`, traced and probed exhaustively over input bytes in `H/run5.py`):

```
if (g[0x8711b0] == 0 || g[0x87120c] != 0) return          // 0x87120c is never written anywhere in the dylib => always 0
obj = g[0x8711b8]; off = g[0x849620];
w   = *(uint64*)(obj + off);                              // Published<SubscriptionStatus> storage word
p   = w & 0x0000FFFFFFFFFFFF;                             // 0x5409f0
if (p < 0x100000001) return;                              // .value(inline status) or nil => untouched   (cmp x10,#0x100000001 @0x5409f8)
if (*(uint8*)(p + 0x20) == 1)                             // compare with const byte at 0x849630 (== 1)
    *(uint8*)(p + 0x21) = 1;                              // SubscriptionStatus.subscribed
```

Probing all 256 values of `p[0x20]` (both `p[0x21]` initial values 0 and 7) writes exactly `p[0x21]=1` iff `p[0x20]==1`, otherwise nothing; with a non-pointer word nothing is written.

**What `p` is** (proved by running the same Swift code on this Mac, `H/sw/t2.swift`): `Published<T>` is an enum {value(T), publisher(Publisher)}. Once any subscriber touched `$subscriptionStatus`, the
storage word holds a pointer to Combine's `Published.Publisher.Subject` object. In that object `+0x20` is the `ConduitList` tag (observed 0 = single subscriber, 1 = many (>=2),
2 = none/empty) and `+0x21` is `currentValue` (the stored 1-byte enum). So the patch means: **while the status publisher has >= 2 subscribers, rewrite its `currentValue` to `.subscribed` once per second,
silently (no `send`, so no notification).** Every later read of the property, and every new subscription (a `CurrentValue` publisher replays `currentValue` on subscribe), sees `.subscribed`.
Subscribers that were already attached still receive the real transitions StoreKit/the server cause (e.g. `.subscriptionExpired`), until the next tick overwrites the cache. The tag test is an empirical heuristic by the patch author
(macOS Combine layout used here; iOS 18 has the same source), so the clamp is inactive when fewer than two subscribers exist.

Main-binary side (all addresses in the main corpus):

* Type: `Superset.StoreModel` class descriptor `0x105248204` (field descriptor `0x105b78f10`, 13 fields). `_subscriptionStatus: Published<Superset.SubscriptionStatus>` field index 2.
  `SubscriptionStatus` (`0x1052481cc`, no-payload enum, 1 byte): `freeTrial=0, subscribed=1, subscriptionExpired=2, notConfigured=3, unknown=4`.
* `StoreModel` is a singleton: `FUN_101e9b7e8` (`101e9.c:6300`) = `swift_once(&DAT_1064e0df8, FUN_101e9b7e8)` (`10048.c:6599`) -> `_swift_allocObject()` (through the stub the fishhook rebinds) -> `FUN_101e9b9d8` init, which seeds `_loading=true` and `_subscriptionStatus=.notConfigured (3)` (`101e9.c:9881-9889`). So the allocation the hook waits for is exactly `StoreModel.shared`.
* Getter `subscriptionStatus.getter` = vtable slot 6 (`FUN_101e9b838`, `101e9.c:6815`): `Combine::Published::_get_subscript(&out)` (KeyPaths `DAT_104ff70b8/e0`) which returns `currentValue` in publisher mode.
  `$subscriptionStatus` publisher: `FUN_101e9cc50` (`101e9.c:8115`, vtable slot 56, 4 call sites `1008bcc94, 1019611b0, 1008d5b2c, 1024441f4`) maps it to the `isPro`-like Bool stream via `FUN_101eb1af4 -> FUN_101e9ce24`.
* Pro Bool: the `$subscriptionStatus` publisher (`FUN_101e9cc50`) is mapped through closure `FUN_101eb1af4 -> FUN_101e9ce24`: `isPro = ((status & 0xfe) == 0)` via `FUN_101e93180`, i.e. **`.freeTrial(0)` and `.subscribed(1)` count as Pro; `.subscriptionExpired(2)`, `.notConfigured(3)`, `.unknown(4)` do not**. The closure first consults Bevel's own `FeatureFlagService` (`FUN_102e42ec8`, `FUN_101b99830(1)` = flag index 1 `forceEnableStore`): an internal/TestFlight build with that flag off short-circuits to `isPro = true`. That bool is what `NotificationSchedulerRepository.handleSubscriptionStatusChange(isProSubscribed:)` (`0x101961408`, log strings at `0x105932680/0x105932750`) and the `isProSubscriber` view inputs below receive. The patch's value `1` is therefore exactly the "paying" state, not a new state.
* Consumers (types holding `StoreModel`, from reflection of all 14,057 Swift types, `H/swifttypes.json`): `BioAgeRestrictionService` (state `BioAgeRestrictionState.unpaid`), `CoachingEnabledService`, `CoachingUsageStatusService` (`CoachingUsageState.usage|ultra`),
  `ExtraCreditsStoreService`, `HealthRecordsPaywallCoordinator`, `EmbeddedCoachingV2FooterModifier`, `CycleDashboardCoachingCard`, `CycleTrackingDetailContents`, `TrendsAnalysisView/SegmentedView`, `JournalViewWrapper`, `DashboardHomeDatePager`,
  `SleepNeededSheetCard`, `UpgradeProCTAView`, `SubscriptionStatusCard`, `SettingsSubscriptionView`, `CameraCaptureService`, `ShareableDataService`, `LogFoodInChatPreferenceService`, `PhoneWCApplicationContextService`, `NotificationSchedulerRepository`, `SettingsVisibilityPickerViewModel`, `DashboardUniversalSheetController`,
  and Bool inputs `isProSubscriber` / `isSubscribed` on `DashboardHomeSummaryCard`, `DailyOverviewV2Card`, `CoachingDashboardHomeCard`, `InlineCoachingContentView`, `CoachingDashboardHomeViewModel`.

**Which features this unlocks (all Bevel's own code, nothing is added by the patch):** the Pro tier: `ProPaywallFeature` (`0x105248820`): contextualIntelligence, biologicalAge, healthRecords, optimizeRecovery, personalizedTrainingPlans,
easyNutritionTracking, improveSleepQuality, identifyStressTriggers, track390PlusBiomarkers, understandYourCycle, trackHabitsAndSymptoms, advancedFitnessMetrics, bevelIntelligence. The paywalled actions are enumerated by `FeatureSheetType` (`0x105248e68`):
trackNutrition, createCustomFoods, buildRecipes, createWorkoutTemplates, logActivities, viewHistoricalData, viewActivityData, intelligence, addHealthDocuments, startBioOnboarding, raised from `PaywallLocation` (`0x105205318`): home, onboarding, nutrition, fitness, strain, sleep, recovery,
journal, biology, stress, energy, settings, cycleTracking. Dashboard upsell cards (`HomeBannerCard.subscriptionUpsell/unlockBiologicalAge`, `BioAgePaywallCard`, `Coaching…BlockedButton`) disappear for the same reason.
**What it does not change:** product/tier state (`StoreModel._currentSubscription`, `SubscriptionType` proMonthly/proAnnual/proAnnualReferred/ultraMonthly, product ids such as `subscriptions.ultra_monthly` in `FUN_101e9ced4`), the server-side entitlement
(`ServerSubscriptionStatusV2 {unsubscribed,pro,ultra}`, `SyncAppTransactionRequest{expectedStatus, latestTransactionJWS}`), and therefore any server-metered feature (coach chat quotas are `CoachingUsageState`, fetched by `CoachingClient`; `UltraPaywallFeature.unlimitedChat/unlimitedContextualIntelligence`).
Whether the coach backend accepts a request from an account that is not Pro server-side is a server question and not decidable from the IPA.

**Does it alter any metric/score computation?** No code path of the dylib touches a calculator, a HealthKit/Google input, a baseline, a cache or a DTO:
(1) the only runtime mutation primitive in the whole dylib is the fishhook (`vm_protect` is dlsym'd exactly once, in `FUN_007d9ddc`, called from `FUN_007d3008` = fishhook's `rebind_symbols_for_image` (strcmp `__DATA`/`__DATA_CONST`/`__LINKEDIT`, `dladdr`), whose only caller is `FUN_007d6490 <- FUN_0053b4b0`; `method_setImplementation`, `method_exchangeImplementations`, `class_replaceMethod`, `class_addMethod`, `mprotect`, `vm_write` are never named in any decrypted string or dlsym call across all 624 functions);
(2) the replacement passes every allocation except the first `StoreModel` through unchanged;
(3) the single memory write into Bevel memory is one byte (`Subject+0x21`) of `StoreModel`'s `Published<SubscriptionStatus>` cache.
A secondary, indirect effect: Pro-only calculators/pipelines (e.g. Biological Age, which `BioAgeRestrictionState.unpaid` gates) now run for the patched install, so *which* scores exist differs from a free install; their arithmetic is Bevel's. Pristine-comparison status: there is no App Store 3.1.7 to diff (`LC_CODE_SIGNATURE` re-hashed, ad-hoc style), but the widget extension is a second, separately linked compile of the same calculators and carries only the `blatantsPatch` load command. Comparing function bodies (G14 table, `H/cmp/`) shows the main-binary call trees of all 18 score families (564 functions of 8+ words, depth<=6 from 81 anchor bodies) are identical to the widget copies modulo relocations/log-string literals for 521 functions with 0 arithmetic differences and 43 functions absent from the widget. So the calculators the hooks could conceivably influence are provably not byte-patched in the main binary; code outside those trees (e.g. the 43 absent ones, StoreModel/paywall code, UI) is not covered by this witness.

#### 5. Anti-tamper / protection layer (no effect on features)

* Deny-attach and debugger checks: raw `svc #0x80` ptrace (x16 = 26, and via syscall 0) in ~2,562 `svc` sites; `getpid/sysctl(KERN_PROC_PID)` `P_TRACED` check (`FUN_0021e918`, interpreter log `sysctl 0x6ffffcb0 0x4 …`); exit path `svc x16=1, x0=0x58`.
* Frida/jailbreak/hook probes (`H/allcalls.txt`): loopback connect to 127.0.0.1, dyld image-name and thread-name scans (`pthread_getname_np`, `task_threads`), paths `/Library/MobileSubstrate/MobileSubstrate.dylib`, `/Applications/Cydia.app`, `/Applications/Sileo.app`, `/usr/sbin/frida-server`, `/usr/sbin/sshd`, `/private/var/lib/apt/`, `/etc/apt/sources.list.d/`;
  integrity of its own `__TEXT,__text` via `getsectiondata` + SHA-256/HMAC (`expected_text_hash`, `expected_text_hmac`, `skip_hash_check` env/flag), `class_copyMethodList`/`class_getMethodImplementation` + `dladdr` checks that the popup classes' IMPs still live in this image.
* Block `0x7ec148 -> 0x22b7f0` (dispatch_once from `+load` and from several callers) verifies the popup controllers' `viewDidLoad`, `ibTHpBYiZcmU77oICNO47V7j`, `G9KlgL6HHX45Da9bp6ocSAsh`, `makeKeyAndVisible` IMPs with `dladdr`.
* Block `0x7ec168 -> 0x28c3e0` (15 s + `arc4random_uniform(45000)` ms after start) contains `kill(getpid(),9)`, `abort()`, `_exit(0x2a)` exits that are reached when its `dladdr(0x21fd90)` integrity test fails (my stubbed `dladdr` returns 0, so the interpreter reaches them; a real device run was not performed).

#### 6. The VIP nag popup (the only feature the patch itself adds)

Scheduled by `FUN_00004000` (delays measured in the interpreter: base + `arc4random_uniform(N)` ms): main queue blocks `0x7ec068 -> 0x4b10` at 1 s (anti-debug getpid/memset checks, then a 100 ms follow-up on a global queue (QOS 0x11); block `0x7ec088 -> 0x4b94` does `dispatch_async(main, 0x7ec5d0 -> 0x459af4)` which picks the foreground-active `UIWindowScene` via `connectedScenes`/`activationState`),
`0x7ec0a8 -> 0x4f0c` at 5 s + U(0..3000) ms, `0x7ec0c8 -> 0x5360` at 10 s + U(0..4000) ms (both read `NSUserDefaults standardUserDefaults` with a key derived from `bundleIdentifier` and a digest of `identifierForVendor` - cadence gate; the exact key/format I did not reproduce because the string-building loop needs a real `NSString`),
and `0x7ec168` at 15 s + U(0..45000) ms (tamper kill above). UI: window above the app (`UIWindow` + `setWindowScene:`, `makeKeyAndVisible`), classes `i8bCgi2KJxMjDjObaE8Xc4qH` (popup controller; `NSTimer` one-shot **15.0 s** auto-close, `exitHandler`), `MedtnBE6MGGZ9Xr8eOocgcer` (card view), `OTFSKrNarmIss7UII9LIrsLn`
(controller with `timerLabel`, `remainingSeconds`, repeating **1.0 s** `NSTimer` countdown, `redirectTimer`), watchdog `iwqzbnMnHMsrAMIG6yp7mTKY` (`start/tick/stop`, `target` window, `reshowBlock`, `graceTicks`; re-presents after dismissal). Text (decrypted cfstrings):
"EXCLUSIVE MEMBERSHIP", "Elevate Your Experience", "Join our VIP community and unlock premium features designed for power users.", "Become a VIP Member", "Maybe Later", "What's Included" with rows
(sparkles) "Unlimited Access / Every feature, unlocked forever", (eye.slash.fill) "No Advertisements / Clean, distraction-free experience", (person.2.fill) "Priority Support / Direct line to our team", (heart.fill) "Fund Development / Keep updates and new features coming", (arrow.up.circle.fill) "Priority Requests / Your requests get fulfilled first".
The CTA and the countdown end in `UIApplication openURL:` of **`https://bit.ly/410kOxh`** (emulated both `i8bCgi…::kmdn92ljbq7qpApNfZW52gDq` = `0x4fd4ec` and `OTFSK…::ibTHpBYiZcmU77oICNO47V7j` = `0x44bad4`; the string is produced by `stringWithUTF8String:` from the decrypted pool). That is the patcher's own advertisement; it sends nothing (a URL open, not a request body).
No device/health data is read except `bundleIdentifier` and `identifierForVendor` for the cadence key.

#### 7. `blatantsPatch.dylib` (70 KB, clear code, fully read: `blatantsPatch.dylib.c`)

Two `__init_offsets` entries: `0x4000` and `0x444c`.
* `0x4000`: generic-password keychain item `{kSecClass: kSecClassGenericPassword, kSecAttrAccount: "blatantsPatch", kSecAttrService: "", kSecReturnAttributes: true}`: `SecItemCopyMatching`, on `errSecItemNotFound (-25300)` `SecItemAdd`; reads `kSecAttrAccessGroup` from the result into globals `__accessGroupId` (the app's *actual* default keychain group under the re-signing team) and `__bundleId`;
  then `rebindSecFuncs` = fishhook (`FUN_00004f18`/`FUN_00004d34`/`FUN_00004fd4`, `vm_protect`) of `SecItemAdd`, `SecItemCopyMatching`, `SecItemUpdate`, `SecItemDelete` to wrappers (`FUN_00004a60/4ad8/4b50/4bc8`) that `mutableCopy` the query dictionary and force `kSecAttrAccessGroup = __accessGroupId`.
  Effect: all keychain access (Bevel's auth tokens in `BevelServerIntegration`/KeychainAccess) works under a foreign signing identity; originally-signed group `P5S89K5583.com.supersethealth.superset` (`cyan.entitlements`) is replaced by the sideload group.
* `0x444c` swizzles with `method_setImplementation`/`class_addMethod` (`FUN_00004570`): `-[CKEntitlements initWithEntitlementsDict:]` (removes `com.apple.developer.icloud-container-environment` and `com.apple.developer.icloud-services` from the dictionary), `-[CKContainer _setupWithContainerID:options:]` and `-[CKContainer _initWithContainerIdentifier:]` (return 0, i.e. CloudKit containers are disabled),
  `-[NSFileManager containerURLForSecurityApplicationGroupIdentifier:]` (real group container via `LSBundleProxy bundleProxyForCurrentProcess -> entitlements[com.apple.security.application-groups]/groupContainerURLs`, else `<Documents>/<groupId>`, created if missing),
  `-[NSUserDefaults _initWithSuiteName:container:]` (suite names with prefix `group` get the redirected container). The block at `0x42a8` (`getAppGroupPathIfExists`) is the LSBundleProxy lookup.
  Effect: sideload compatibility only (keychain, app groups, CloudKit off). The CloudKit-backed Core Data container `iCloud.com.supersethealth.coredata` therefore does not sync on this build. **No Bevel score/metric class is touched; no network.**

#### Evidence index (G13)
`BevelAIHealthCoachPatch.dylib.c`: 1 (`FUN_00004000`), 82/268/323 (`4b10/4f0c/5360`), 7922 (`0x22b7f0`), 7928 (`mW0y load`), 9057 (`0x27f35c`, FAILED), 42766 (`_DABootstrap load`), 66145 (`_FDBootstrap load`), 88136 (`0x53330c`), 88585 (`0x53b4b0`), 88844 (`0x53c998`), 89028 (`0x53dcec` FAILED; asm `patch-failed.asm:820975`), 127270 (fishhook).
Main: `101e9.c:6300,6815,8115,9790-9900`, `10048.c:6599`, field descriptors via `H/swiftidx.py`.

#### Corrections to earlier research
* "Hook effects uncharacterized; do not assume modifications only unlock subscriptions" (`bevel-metrics.md:1203`, `bevel-audit.json limitations`): now characterised: the only functional hook is the `StoreModel` clamp; the rest is anti-tamper/decoy/nag UI. Scores untouched by the dylibs.
* The string screen hits (`validateSubscriptionToken:`, `persistEntitlementSnapshot:`, `bridgeEntitlementToPolicyLayer`, `resolveEntitlementPayload:`, `EntitlementResolver`) are decoy names; none of them is hooked or calls into Bevel.


---

## G16: resources, opaque blobs, remote configuration and model consumers

### G16 — RESOLVED

Method: full bundle walk (`find` over `Superset.app`, 1,156 files), `assetutil --info` on all 21 `Assets.car`, entropy scan of every data section of the 113 MB executable (4 KB windows), type reflection of all 14,057 Swift types (`H/swiftidx.py` -> `H/swifttypes.json`), string/ADRP cross reference (`H/strref.py`), and a read of every decoded server DTO whose fields look numeric. Nothing below uses web documentation; every statement is IPA-bound.

| resource | what it is | can it change a metric? | evidence |
|---|---|---|---|
| `Assets.car` x21 (main 259 MB, `BevelBioAge` 47 MB, `BevelCoaching` 14 MB, ...) | images (4,159 + 925 + ...), colors (325 + 189), vectors, gradients, icon stacks; **zero** data-set (`Data`) assets in any catalog | No numeric content. Color assets only skin the UI (zone colors are code constants) | `assetutil --info` AssetType counts, `H/g16/*.json` |
| `*.riv` (5), `*.mp4`, `onboard-wave-bg.gif`, fonts (Archivo, Gilroy, Graphik, Font Awesome 7 Pro, JetBrains Mono, SwiftMath fonts + `mathFonts.bundle/*.plist` glyph metrics) | animation/video/typography | No | file listing |
| `PhoneNumberMetadata.json` (365 KB), `StoreKitTestCertificate.cer` (Xcode StoreKit test root, CN=StoreKit, 2020-2040), `GoogleService-Info.plist` (Firebase client ids; `IS_ANALYTICS_ENABLED=false`, no RemoteConfig framework linked), `Metadata.appintents/extract.actionsdata`, `cyan.entitlements`, `README.md`, `StrengthWorkoutKeyboard_README.md` | phone-number rules, StoreKit-test trust anchor, Firebase client config, App Intents manifest, entitlement file, two developer READMEs (data-loading architecture: 60-day pagination windows, 5-minute backend-sync threshold, 24 h HealthKit authorization preflight; keyboard value limits) | READMEs document orchestration only (when/what to load); no coefficient. `StoreKitTestCertificate.cer` is a trust root for locally signed StoreKit test transactions (paywall path, not metrics) | file contents |
| `*.lproj/Localizable.strings(dict)`, `BevelIntelligence_Prompts.strings`, `StrengthWorkoutInstructions.strings`, `BiomarkerInfoSections.strings` (binary plists) | UI copy in 14 languages; the prompts file is a list of ~100 suggested chat prompts ("Am I ready for a hard exercise...") with translations | No: user-facing text only. Explanatory copy documents thresholds (e.g. cycle: normal length 24-38 days, regular variability +/-4 d for ages 26-41 or +/-5 d otherwise, metrics from the 6 most recent cycles) and was used as a hypothesis source only | `plutil -p` |
| `Superset.momd` (68 Core Data model versions, latest `v67_20260723_AddStrengthWorkoutSessionSubsport`, ~58 entities) | schema only. Cache entities that persist computed numbers: `HealthMetricsCacheEntity`, `CumulativeMetricsCacheEntity`, `HealthAggregatedCacheEntity`, `WorkoutOverlayCacheEntity` (attributes `trimp`, `strainScore`, `cardioFocus`, `cardioStrainUnits`, `muscularStrainUnits`, `strainZones`, `heartRateRecovery(Data)`, `resolvedWorkoutEffort`, `distanceMetrics`, `hrDetails`, `maxHR`), `ActivityHistoryCacheEntity`, `EnergyDataPointEntity`, `CycleTrackingTemperatureBaselineEntity` | **Indirectly yes**: previously cached values survive an app update until the algorithm version stamp changes. Stamps present: `algorithmVersion` (HealthMetricsCache / CumulativeHealthMetricRecord / AggregatedDataState), `analysisVersion`, `dataVersion`, `MetricsCacheReadError{invalidSchema, mismatchedAlgorithm, cachedMissing}` (`0x1052314d4`). A fresh install has no stale cache | `plutil` of `Superset_v67...mom`, type index |
| Mach-O data sections | entropy scan of `__TEXT,__const` (3.4 MB), `__constg_swiftt`, `__cstring` (1.7 MB), `__DATA,__data` (2.4 MB), `__DATA_CONST,__const` (2.9 MB), `__text` (79 MB): exactly **one** 4 KB window above 7.2 bits/byte: `0x1051e9dc0-0x1051eadc0` (entropy 7.5-7.8). It sits among vendor lookup tables referenced from library code in shard `104bf` (`DAT_1051e9060..0x1051e9940`, `0x1051e90d8` 16-bit tables) | No Bevel model or encrypted coefficient table. No Core ML (`CoreML`, `Vision`, `NaturalLanguage`, `FoundationModels`, `SoundAnalysis` are not linked; no `MLModel`/`.mlmodelc` string) | `otool -L`, string search, entropy script |
| Frameworks | `RiveRuntime`, Sentry, Singular, Firebase Analytics/AppMeasurement stubs (16 KB each) and static Mixpanel/Firebase/GRDB code | Marketing/telemetry only; Singular fetches `https://app-analytics-services.com/config/app/%@` (SDK config) | strings |

### Remote configuration and model consumers (what can change numbers without an app update)

1. **Local feature flags** `Superset.FeatureFlag` (`0x10523e250`, 8 cases): `testFlight, forceEnableStore, disableStoreStatusSyncing, disableBetaMode, coachingLatexSupport, coachingWorkoutKitGenerations, fitnessChartsV3, activityDetailsV2`, typed by `FeatureFlagType` (`userDefaults / internalOnly / testFlight / released`) and read through `FeatureFlagService(isInternalUser, isTestFlightBuild)` (`0x10523e288`). They are UserDefaults/build-channel switches, not remote. The two `Store` flags concern StoreModel (`forceEnableStore`, `disableStoreStatusSyncing`); the others are UI/coach switches. None enters a calculator signature found by this audit (calculators take no flag parameter; checked in the 18 families' call trees).
2. **Server coach flags** `CoachingFeatureFlags {booleanFlags: [nutritionScoreV2, latexSupport, workoutKitGenerations, experimentalModel, experimentalFeatures], versionFlags: [{key: nutritionScore | cycleTracking | integrations | streamParts, semanticVersion}]}` (`0x1052c48ec`, protobuf `Coaching_CoachingFeatureFlags` `0x1052cbac8`), carried as the `feature_flags` field of 6 protobuf messages and cached under the UserDefaults key `cached_feature_flags_config`. They select **coach-side payload/format versions** (the coach backend reading context), not the on-device scores; `nutritionScore` version flag states which Nutrition Score the *coach* should assume. The on-device Nutrition Score calculator (`0x10008f1a4`) takes no such flag.
3. **Server inputs that feed calculators**: (a) food category apportionment: `api/nutrition/v1/score-categories/apportion` -> `FoodScoreApportionResponse{categories:[{category:String, percentage:Double, basis: calories|weight|binary}]}` and `FoodDataResponse/SearchFoodDataResponse.scoreCategories`, `CustomFoodResponse.caloricPercentages`: the FoodCategory split used by Food Quality (contributors need `FoodCategory` weights) is **server data**, so Food Quality's category input is not recoverable from the IPA; the contributor arithmetic is (agent G). (b) `api/nutrition/v1/macronutrient-goals/pull`, `api/user-data/v1/{activity-status,biology-profile,smoking-logs}/pull`, `api/journal/v1/user-journal-data/pull`, `api/fitness/v1/user-fitness-data/pull`: user-entered data sync. (c) Google/Oura/Garmin integration DTOs (agent A): raw samples; Oura `score/readiness`, Garmin `overallSleepScore` are vendor scores shown as such. (d) `api/coaching/v2/usage/status` quotas. (e) `api/training/activity-classifier/upload` uploads training data for a **server-side** activity classifier; no local classifier exists (no ML framework). (f) `api/users/v1/subscription/sync`, `app-transaction/sync` (entitlement).
4. No Firebase Remote Config consumer (`FirebaseRemoteConfigInterop` types exist only for Crashlytics rollouts), no A/B framework besides Mixpanel's built-in `FeatureFlagManager` (SDK code, `_evaluateBooleanFlag`) whose flag values are not held by any of the app's reflected types (no `Superset`/`Bevel*` field references them).
5. `bevelBannerVariant` (SwiftUI environment key) is a color theme, not a remote variant.

**Conclusion (G16):** no bundled table, model or opaque blob alters Bevel's score arithmetic. The metric-relevant external inputs are exactly: HealthKit / integration samples, user settings and profile, server-provided food category apportionments and goals, and persisted caches guarded by `algorithmVersion` stamps. NOT IN IPA (proven) for any on-device model; the server-side food-category model and activity classifier are boundary items (consumed as DTOs at `FoodScoreApportionResponse` `0x10520cefc` / `FoodScoreApportionEntry` `0x10520d2d0`).


---

## G14: provenance audit of annotations, labels and dispatch claims

### G14 — RESOLVED

What was audited (all against raw bytes / metadata, never against the earlier scratch annotations):

| claim family in earlier research | check performed | result |
|---|---|---|
| "Direct-BL index: 98,904 target keys, 2,142,419 call sites" (`bevel-audit.json direct_call_verification`) | re-scanned the 79 MB `__text` for `BL` (opcode `100101`) | **reproduced exactly**: 2,142,419 BL sites, 98,904 distinct targets (88,164 of them are `LC_FUNCTION_STARTS` entries; the rest are mid-function/outlined targets) |
| what the BL index leaves out ("tail `B`, indirect `BLR`, ObjC, async") | counted | BLR sites 407,620; BR sites 21,889; `B` tail branches that land on a function start 88,681; `LC_FUNCTION_STARTS` lists 355,662 functions. So roughly one call in six is indirect and about 4% of branch targets are tail calls: caller lists in `decomp-main` headers (`callers:`) are incomplete by construction; vtable/witness/async calls need the metadata route used by agents A-G |
| "rewritten export-trie root; 108,353 export names; 3,982 non-Swift labels got a `$s` prefix" | parsed the trie myself (`H/trie.py`): `dyld_info -exports` and a trie walk from root offset 0 see **61** entries; walking from the surviving original root at trie offset 3,157,882 yields **108,419** distinct (name,address) terminals (108,418 distinct names; audit said 108,353, a 66-entry difference that I cannot attribute: it is not the 61 visible entries + 5 duplicates test I ran, so treat the audit total as approximate). Names that do not start with `$s` in the original trie: 3,905 + 77 = **3,982**, exactly the audited number | confirmed. Consequence for provenance: exported Swift symbols exist only for public APIs of the linked Swift packages (e.g. `BevelBioAge...calculateBioAgeEstimate` at `0x103c41698`); **none of the internal `Superset`-module calculators (Recovery, Strain, Sleep, Stress, Energy Bank, Cardio Load, Food Quality, Glucose, Cycle) has a symbol**. Their names in the research come from log/`#function` strings, which I re-derive below |
| function names attached to addresses (e.g. `calculateRecoveryMetricsForDay` = `0x1015b0ba4`) | built a string-to-function map by scanning all ADRP+ADD pairs (`H/strref.py`, 3,155 name/path strings, 3,129 resolved) | every name-bearing address in `bevel-metrics.md` lines 60-1481 whose function carries a function-name string (21 distinct functions; 12 further lines are the BioAge-registry calculators, see caveat) was **independently confirmed**, e.g.: Recovery `0x1015b0ba4` (11,444 B, `calculateRecoveryMetricsForDay`), Strain `0x1015dc638` (`calculateDayStrainScore`), sleep metrics `0x1015c3938` (`getSleepMetrics`), `0x1015c09d0` (`calculateSleepMetricsForDay`/`calculateSleepHistory`), Food Glucose `0x100101c00` (`calculateGlucoseScore`), Nutrition `0x10008f1a4` (`calculateMetrics`), HRR `0x1017cd18c` (`findMaxHRRecoveryInWindow`), RHR baseline `0x1014ecff0` (`calculateBaselineRestingHR`), `0x10158af94` (`calcMissingAggregatesAndComputeBaselines`), HRV history `0x10166a59c/ab98/b678` (`getHRVHistory`), `0x1016a1f98` (`fetchAggregatedFallback`), `0x1016a1318` (`parallelCalculateHKCollectionHistories`), workout scoring `0x100f5a644` (`calculateScoresForWorkout`), seed helper `0x1015eecc0` (`constructInitialStrainWindow`), `0x1013a2050/2518` (`mapToHealthSamples/mapToDailyHealthSamples`). Full table: `H/g14_labels.txt`. Caveat: the BioAge `PhysioMetricType`/`LifestyleMetricType` calculators (`0x103c49af8`-`0x103c4bda4`, `0x103c47054-0x103c47644`) carry only the shared helper-name string `clampHR`, so their per-metric labels (sleepDuration, steps, vo2Max, alcohol...) rest on the enum order of the registry descriptors (`0x10529f8e8`, `0x10529f894`), not on a function-name string (agent F re-derived the arithmetic) |
| entry-point vs interior addresses | classified all 546 distinct `0x1xxxxxxxx` addresses in `bevel-metrics.md` against `functions.tsv` and the Swift metadata sections | 294 function entries, 58 interior points, 181 in data/metadata (type descriptors etc.), 5 data, 1 unmapped. Interior points (e.g. `0x1015b1400` = Recovery +2140, `0x100082400/520/824/d94` inside `0x100081efc`, `0x1015dc6b8` inside Strain) are **instruction ranges inside one large Ghidra function**, not separate functions; documenting them as "calculator at X" is only valid as "range starting at X in function Y". Mapping: `H/md_addr_class.json` |
| async continuation claims | read the bytes: (1) `0x101d78fbc` (async entry, `orr x29,x29,#1<<60`) task-allocs two buffers (`bl 0x104e5db68`), then `adrp x0,0x101d79000; add x0,x0,#0x54` = continuation `0x101d79054` and tail-calls `swift_task_switch` (`b 0x104e5dbf8`) at `0x101d79050`; (2) continuation `0x101543618` does `str x0,[x21,#0x9f0]` (point array in async frame +0x9f0), builds `0x101543698` at `0x101543678` (`adrp 0x101543000; add #0x698`) and `b 0x104e5dbf8`; (3) `0x1015432a0 mov w1,#0x1e` (argument 30); (4) `0x10158d318 bl 0x104e5161c` after `neg x1,x8` (Calendar add with negated value); (5) HRR: `0x1017cd56c-0x1017cd57c` loads `0x405e000000000000` (= 120.0 double) into `d0` and `bl 0x1017cdb20`; the string `findMaxHRRecoveryInWindow...` at `0x105927910` is referenced by `adrp 0x105927000; add #0x910` at `0x1017cd854`; (6) `0x1015eefe4 mov w0,#0xe` then `bl 0x1030cbe4c` (= -N days per agent E) | all six **confirmed**, including exact immediates |
| "annotation register tracking does not invalidate on every clobber" (so annotated constants may be wrong) | re-derived a sample of annotated constants from bytes: `0.8` coverage threshold -> double at `0x104ebe868` = 0.8 (passed in `d8` to mean helper `0x101990000` at `0x1019905f0-0x101990634`) | confirmed, **with a correction**: the helper `0x101990000(threshold, [Double])` keeps values that are finite and non-zero (IEEE exponent != 0x7ff and not +-0), returns `(0, nil)` when `kept/supplied < threshold` or `kept == 0`, else `(mean(kept), ok)`. The 0.8 is a caller-supplied threshold, not a constant inside the helper; "supplied" counts zeros and NaN/Inf as missing, i.e. coverage is among supplied elements (consistent with the audit text) |
| widget extension as an **independent second copy** of the calculators ("Extensions contain duplicate calculators ... independent audit remains open") | structural comparison of function bodies (`H/cmp/*.py`): LC_FUNCTION_STARTS functions of main (355,662), widget (93,353 in `__text`) and capture (50,913); canonical form masks only relocatable operands (ADRP/ADR/LDR-literal, ADD/LDR/STR page offsets after ADRP, branch targets, Swift string-length immediates). Roots = the 81 function bodies that contain the 18 families' anchors; call trees to depth 6 over direct BL (564 functions of 8+ words) | widget copy: **513 byte-identical modulo relocations (+8 identical after FP-sequence alignment), 0 differing, 43 absent** (those 43 are not present in the widget binary, mostly inlined/generic specialisations). capture copy: 205 identical, 1 aligned, 2 non-identical (generic specialisation: direct `bl` specialised in main vs `blr` through a witness in capture), 356 absent. The Recovery calculator `0x1015b0ba4` (2,861 words) equals widget `0x10027b528`; Strain `0x1015dc638` equals widget `0x1002a4018` (differences only in log-string literal construction). See G13: this is the strongest available evidence that the shipped main-binary calculators were not byte-patched, because the widget copy was linked separately and carries only the `blatantsPatch` load command |

### Corrections to earlier research
* `bevel-metrics.md:521` "Mean helper `0x101990000` ... at least 0.8": the 0.8 is passed by the caller (`0x1019901c4` at `0x1019905f0`, constant `0x104ebe868`), the helper has no embedded threshold; zeros are treated as missing together with NaN/Inf.
* "`recovery`/`strain` calculator addresses": several ranges cited as "calculator at X" are interior addresses (see entry-vs-interior row). Use the containing function plus offset as provenance.
* Export count: 108,419 terminals by my walk vs 108,353 in the audit (unexplained 66); the 3,982 non-Swift labels figure is exact.

### Not re-verified (explicit residue)
The numeric content of the 401 addresses/claims in `bevel-metrics.md` that no A-G finding cites was classified (entry/interior/data) but not all re-derived arithmetically; the ones that matter for the 18 families were re-derived by agents A-G or are listed with function-name provenance in `H/g14_labels.txt`. Interior-point constants (for example the Recovery HRV zero-SD `50` at `0x1015b1400`, temperature zero z-score at `0x1015b2bcc`) lie inside functions re-derived by agent C and match its walkthrough of `0x1015b0ba4`.


---

## G15: remaining registered calculators (classification, producers, algorithms recovered so far)

### G15 — BLOCKED (classification and producers resolved for every group; full arithmetic recovered only for the strength helpers and the widget/capture comparison)

What stops me: the remaining producers are very large async/generic Swift bodies (for example `0x100b35c98` 5.9 KB with 21 parameters, `0x100f5a644` 6.4 KB, `0x101657688` 18 KB) whose arithmetic is spread over outlined helpers, and I ran out of time before tracing each helper to its constants. Unblock: for each producer below, read the callee list (`H/callees.py`) and the FP-heavy helpers listed by `H/fpscan.py` (`H/fp_funcs.pkl`), the same way agents A-G handled their families. Nothing here is "not in IPA"; every producer below is local code.

Method for finding producers (reusable): function-name literals are referenced by ADRP+ADD from the function that logs them (`H/strref.py`, query with `H/q.py '<regex>'`); type/field catalogue from reflection (`H/swifttypes.json`); entry-vs-interior via `LC_FUNCTION_STARTS`.

| group (task wording) | type / registry anchors | producer address(es) | recovered |
|---|---|---|---|
| strength effective weight | `StrengthEquipment` enum (19 cases, `0x1052b3f54`), `StrengthWorkoutSetWeightConfiguration{labelWeight,effectiveWeight}` `0x10520aa80` | `0x103e45340(bodyWeight, set)` (callers `0x1015ae3f0`, `0x1015aeea8`, `0x1015ad748`, `0x100f21cdc`, `0x100f06d84`, `0x10090dfb4`, `0x1040508a4`, `0x1040519d4`, `0x104052004`, `0x1014e6ce8`, `0x1015dea44`) | **full**: equipment tag 2 `bodyweight`: if preset exercise is `pullUp, pullUpCloseGrip, pullUpWideGrip, chinUp, chestDip, tricepsDip, pullUpLSit, pullUpTypewriter, pullUpFrenchie, muscleUp` (ids 0xfc,0xfe,0x100,0x58,0x4d,0x17f,0x1b1,0x1b2,0x1d5,0x1d8 of the `StrengthWorkout` enum, `H/strength_cases.json`) then `bodyWeight + set.weightLbs` else `set.weightLbs`; tags 4 `cableDouble`, 6 `dumbbellDouble`, 9 `kettlebellDouble`: `2 * set.weightLbs`; tag 12 `machineAssisted`: `max(bodyWeight - set.weightLbs, 0)`; everything else: `set.weightLbs` |
| strength 1RM | `StrengthWeightPRType {best1RM, heaviestWeight, sessionVolume, setVolume, lowestAssistance}` `0x1052b4428` | `0x103e45580(weight, rpe, reps)` | **full**: `R = reps<2 ? 1 : min(reps,20)`; if `reps<=12 && rpe>=7` (rpe clamped to <=10, rpe<=1 treated as absent) then `1RM = 100*w / ((100 - 1.5*R) - 1.5*(10 - rpe))` (0 if non-finite) else Epley `1RM = w*(R/30 + 1)`. Reps 0/1 use R=1; reps>20 use R=20 in Epley and never the RPE formula; rpe>10 uses rpe=10 only when reps<=12 |
| strength RPE | `StrengthWorkoutAnalysis.doubleValues` | `0x103e45650` (set RPE), `0x103e457c4` (motion-derived) | already resolved by agent F (M08.03, `steLoss_v1`: `3 + 10*steLoss`, clamp 3..10, reps mismatch > 5 falls back to session effort or 5.0) |
| widget / capture calculators | widget `SupersetWidgetExtension` (26 MB), capture `SupersetCaptureExtension` (29 MB) | n/a (comparison) | **full**: the widget carries separately compiled copies of the 18 families' call trees: 513 byte-identical modulo relocations plus 8 identical after FP alignment (521 of 564), 0 differing, 43 absent; capture: 205 identical, 1 aligned, 2 non-identical (generic specialisation only), 356 absent (small subset embedded); details in the G14 table. Widget payload producers: `WidgetFileHealthMonitorItem{type,value,baselineAverage,baselineStdDev,status}` built by `transferHealthMonitor(refreshedAt:unitSettings:healthMetricHistory:)` `0x101e16a9c`; `transferHealthData` `0x101e14848`; `WidgetFilePayload`; nothing recomputes scores, they ship cached `RecalculatedMetrics` (`0x102158178` read, `0x10215a9b4` write) |
| cycle prediction | `CycleTrackingMetrics` `0x10521a334`, `CycleSummaryMetrics`, `DailyCycleInfo`, `CyclePhaseInfo`, `PeriodCycle`, `CycleTrackingPredictionDefaults{cycleLength,periodLength}`, `CycleTrackingStatus{paused(noFlowLoggedTooLong|contraception),active}`, `CycleTrackingLengthTag{normal,short,long}`, `CycleVariabilityTag{regular,irregular}`, `CyclePhase{period,follicular,ovulatory,luteal}` | primary metrics `calculateCycleTrackingPrimaryMetrics` `0x100b35c98`; phases `calculateCurrentPhases` `0x100b34784`; `calculatePhasesForOvulationDay` `0x100b34050`; `predictOvulationDay` `0x100b32c7c`/`0x100b33b1c`; `predictOvulationFromTemperature` `0x100b33620`; future snapshots `generateFutureMetricsSnapshots` `0x100b31ef8`; persist `calculateAndStoreCyclePredictions` `0x100b50c54`/`0x100b5190c`; period grouping helper `0x100b2ff4c` | partial: flow-day grouping rule recovered (`0x100b2ff4c`: flow days sorted by date; a gap of more than 3 days between consecutive flow days (`3 < dayDiff`, via `0x1030f8fb8` day-difference) starts a new period; period length and cycle length come from successive period starts). In-app copy (not yet matched to constants): metrics use the 6 most recent cycles; normal length 24-38 d (short < 24, long > 38); regular variability +/-4 d (age 26-41) or +/-5 d otherwise; predictions pause when no flow logged too long or hormonal contraception |
| journal regression | `JournalInsightResult {strong(slope), weak(slope), insufficientData(falses,trues), regressionError}` `0x105235260`, `InsightResultForKey`, `JournalInsightInputKey {preset, custom, stateOfMind}` | result consumers `0x10189fd08`, `0x1018a30d4`, `0x100908554`; automatic factors `calculateFactors` `0x1018511e4` (sub-calcs `0x10184a088`, `0x10184efc4`, `0x101850030`); reminders `0x10189e754`/`0x10189ee84` | classification only: no named regression helper exists (no `slope`/`regression` string), no regression helper was found by name; the arithmetic is not located (unverified whether it is inline Swift or an Accelerate call) |
| cardio focus / EPOC | `BevelWorkoutTypes.LoadMetrics{trimp:[MetricDataPoint], epoc:[MetricDataPoint], cardioFocusImpact, cardioLoadImpact}` `0x1052b4da8`, `CardioFocusMetric`, `CardioFocusImpact`, `CardioFocusSummaryItem`, `CardioFocusZone`; persisted in `WorkoutOverlayCacheEntity.cardioFocus` | workout scoring orchestration `calculateScoresForWorkout` `0x100f5a644` (+ continuations `0x100f59fd8`, `0x100f5bf1c`, `0x100f5c410`, `0x100f5d700`, `0x1017d07d8`), per-sport path `0x10175f370` (11.5 KB, `[WORKOUT SPORT]` log tag) and `0x10175e478`, legacy overlay `0x1017c3870`, HR segments `0x1017cbd18` | classification: EPOC is a per-workout time series of the load metrics (`epoc` field next to `trimp`), not a separate score family; TRIMP/strain units already resolved by agent E |
| pace / power / cadence / swim / running dynamics | `SportSummaryScores`, `WorkoutWindowScores`, `PaceMetrics`, `PowerMetrics`, `CadenceMetrics{cadence,unit}`, `SwimMetrics{strokeCountPer100Meters,poolLengthMeters,laps}`, `RunningDynamicsMetrics{strideLengthMeters,verticalOscillationCm,groundContactMs}`, `MetricStat`; raw inputs `WorkoutRunningDynamicsData`, `WorkoutCadenceAndSwimStrokeData`, `WorkoutPowerData`; persisted as `WorkoutScoreRecordData` (avg/min/max for speed, HR, cadence, power, swim stroke/100 m) | `0x10175f370`, `0x10175bd08` (9.1 KB), `0x10175add0`, `0x10175b480`; swim stroke fetch `0x10179fa8c` | classification only: summaries are avg/min/max (`MetricStat`) per metric per window; they are display statistics, they do not feed Strain/Recovery |
| vitals / health monitor / health trends | `HealthMonitorMeasurement{type,value,baselineAverage,baselineStdDev,status}` `0x1051fdf28`, `HealthMonitorRange{high,middle,low}`, `HealthMetricTrendPayload` `0x1051fff50`, `UnifiedTrendStatus` (`TrendStatusStandard{normal,low,higher,noData,noStatus}`, `BaselineOffsetValue{below,within,above}`), `UnifiedTrendAnalysisEntry{periodDays,percentChange,absoluteChange,direction}`, `BevelCharts.LookbackPeriod {7d,14d,30d,3m,6m,1y,YTD}`, `AggregationType{day,3d,6d,12d,week,month}` | `readHealthMonitorMetrics` `0x1000713e4`/`saveHealthMonitorMetrics` `0x1000710ac` (selection only), `getTrendStream` `0x100160ac0`-`0x100163adc`, `getNewTrendStream` `0x100478f8c`/`0x100f60cd4`, coach trend windows `createMultiWindowTrendAnalysis` `0x1008357c4`, cycle trend `processTrendData` `0x100bd58ac`, baseline mean helper `0x101990000` (see G14) | classification: the Health Monitor stores no thresholds of its own; its status is the trend service's baseline status computed from `baselineAverage/baselineStdDev` (baselines = agent C/A's `AggregateStatistics`). The exact z-band edges of `TrendStatusStandard` were not located |
| glucose variability / fasting glucose | `HealthMetric` tags 48 `glucoseAverage`, 49 `glucoseVariability`, 50 `morningFastingGlucose` (`0x10529f840`), `GlucoseLevelStatus{low,normal,elevated,high}`, `GlucoseDataRangeStatus{inRange,above,below}`, `GlucoseChartConfiguration{upper/lowerNormalThresholdMgDl}` | chart range builder `0x102050154(...,70.0,140.0,...)` called with `0x428c0000`/`0x430c0000` at `10205c848` and `101b2d7c0` (normal band 70-140 mg/dL); live day score `calculateGlucoseScore` second body `0x10201aff8` (3.6 KB); food glucose already agent G | constants 70/140 mg/dL confirmed as the display band; variability and fasting formulas not located |
| macro balance | `MacroBalanceStatus{balanced,highCarb,highProtein,highFat}` `0x1051ff2f8`, `MacroData`, `MacroBalanceHistory*` (weekly sums, `percentageOfCalories`), `MacroGoalType{custom,surplus,maintenance,deficit}`, `MacroGoalsEditFormViewModel{tolerance, FormError.caloriesTooLow/unableToRebalance}` | not isolated (nutrition calculator `0x10008f1a4` only builds locals of `MacroData`) | classification only; in-app text: Macro Balance = proportion of macronutrient calories |

### New discoveries
* Function-name literal map (`H/strref.pkl`) gives 3,129 name/path strings with their referencing functions; it names 150+ internal producers that have no symbols (list via `H/q.py`).
* StoreModel is a singleton created through `swift_once` (`DAT_1064e0df8`); `isPro` is `status in {freeTrial, subscribed}`; see G13.
* `Superset.FeatureFlag.forceEnableStore` participates in the `isPro` closure (internal/TestFlight bypass).

### Hand-offs
* To agent F/E owners: strength effective-weight/1RM above can be dropped into the PR logic notes.
* Any agent needing function names: use `H/strref.pkl` / `H/q.py`.
* Server boundary: food `scoreCategories`/`caloricPercentages` (G16) are inputs agent G treats as given.

### Tools and reproducibility
All under `/Users/adityajindal/bevel-re/work/H/`: `emu.py` (ARM64 subset interpreter), `run*.py` (patch hook tracing), `runall.py`/`allcalls.txt`/`allstr.txt` (all 624 patch functions), `dec3.py` (static string decryption), `swiftidx.py`/`swifttypes.json` (type index), `strref.py`/`q.py`/`xref.py`, `trie.py`, `cmp/` (extension comparison), `fpscan.py`, `fn.py`/`dg.py`/`dis.py`/`callees.py`/`acc.py`. No process is left running.
