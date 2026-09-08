# Miller iOS MVP pilot-readiness checklist

## Working prototype

- [x] Native SwiftUI iPhone/iPad project.
- [x] Versioned mobile search contract over canonical Miller resources.
- [x] Typed and Apple-native voice input use the same pipeline.
- [x] Deterministic Miller guidance and practical access notes.
- [x] Results, detail, call/web actions, selection, share, Messages/Mail, and AirPrint.
- [x] Five generic demo prompts spanning B.C., Alberta, and Saskatchewan.
- [x] Enum-only resource feedback routed to the existing review intake.
- [x] Aggregate-only local pilot metrics; no query text.

## Before TestFlight

- [ ] Open and build with a full, matching Xcode installation.
- [ ] Set the Apple Development Team and use an owner-controlled bundle ID.
- [ ] Add a reviewed 1024×1024 app icon and final Miller visual asset if desired.
- [ ] Run on a real iPhone and iPad; verify microphone denial, partial speech, phone links, browser links, Mail, Messages, share sheet, and AirPrint preview.
- [ ] Verify Release points to the deployed mobile API and run all five demo prompts.
- [ ] Confirm Voice/Speech privacy wording and TestFlight privacy answers.
- [ ] Review Alberta/Saskatchewan gaps with pilot users and limit pilot geography if necessary.
- [ ] Name a resource-correction owner and response target.

## Pilot protocol

Use 3–8 trusted frontline workers for 2–4 weeks without real client identifiers. Ask each person to complete representative resource-navigation tasks and share a pack through a safe test destination.

Measure:

- median time from generic request to useful results;
- median time to share a resource pack;
- searches and taps needed outside the app;
- no-result rate by province/category;
- resource correction rate;
- percentage of packs judged useful;
- weekly active pilot users.

Primary target: a useful resource pack in under 60 seconds. Stop or narrow the pilot if location errors, stale access details, privacy concerns, or misleading guidance are material.

## Deliberately deferred

Accounts, patient records, query history, EMR integration, billing, enterprise administration, diagnosis, clinical recommendations, custom email infrastructure, complex offline synchronization, and App Store submission.
