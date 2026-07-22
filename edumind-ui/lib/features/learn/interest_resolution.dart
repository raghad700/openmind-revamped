/// Resolves which of a middle-school student's personal interests applies to
/// a given lesson experience. Mirrors the 7 STUDENT_INTERESTS ids defined in
/// shared/src/constants.ts (Dart twin — kept in sync by hand, same doctrine
/// as shared/src/constants.ts's own header comment).
library;

/// The 7 stable interest ids collected at onboarding (both stages). Never
/// mapped to or combined with the 5 legacy learningContext lens ids.
const kStudentInterestIds = [
  'tech_robotics',
  'games_challenges',
  'drawing_design',
  'sports_movement',
  'reading_stories',
  'helping_people',
  'nature_environment',
];

/// Deterministically resolves ONE interest for [experienceId] out of the
/// student's 1-2 [interests]. Pure function of its inputs — no randomness, no
/// persisted state — so the same student sees the same interest for the same
/// experience across rebuild, refresh, app restart, and retry, and two
/// interests are never combined awkwardly inside a single experience.
///
/// With one interest, that's the answer. With two, a stable hash of
/// [experienceId] picks one of them, so different experiences naturally
/// rotate between the two without any session-level counter to keep in sync.
///
/// Returns null when [interests] is empty — callers should fall back to the
/// legacy learningContext lens (or the neutral base) in that case.
String? resolveInterestForExperience(List<String> interests, String experienceId) {
  if (interests.isEmpty) return null;
  if (interests.length == 1) return interests.first;
  return interests[_stableHash(experienceId) % interests.length];
}

/// The single personalization-key precedence rule (see ExperienceScreen._lens
/// for the one call site): the current interests system wins whenever the
/// student has set any; the legacy learningContext lens is used ONLY as a
/// fallback for profiles that never adopted the new interests picker. Pulled
/// out as a pure function so the precedence itself — not just the rotation —
/// is directly testable without standing up the widget tree.
String? resolvePersonalizationKey({
  required List<String> interests,
  required String? legacyLearningContext,
  required String experienceId,
}) {
  if (interests.isNotEmpty) {
    return resolveInterestForExperience(interests, experienceId);
  }
  return legacyLearningContext;
}

/// A small, stable (non-cryptographic) string hash. Deterministic across
/// Dart platforms — unlike Object.hashCode, AND unlike a naive FNV-1a: dart2js
/// compiles `int` to a JS double, and `hash * prime` for a 32-bit FNV
/// multiplier overflows JS's 2^53 safe-integer range mid-loop, silently
/// rounding to a DIFFERENT value than the same expression on the Dart VM
/// (what `flutter test` runs). That divergence was caught live in the
/// browser: the same two interests resolved differently for the same
/// experience id between a native `dart run` check and the compiled web app.
/// Kept safe on every platform by never letting an intermediate product
/// exceed a few million: small multiplier, modulo a mid-sized prime every
/// step, so `hash * 31 + unit` never runs anywhere near 2^53.
int _stableHash(String s) {
  var hash = 0;
  for (final unit in s.codeUnits) {
    hash = (hash * 37 + unit) % 1000003;
  }
  return hash;
}
