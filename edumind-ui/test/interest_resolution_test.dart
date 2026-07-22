import 'package:edumind/features/learn/interest_resolution.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('a single interest is always the answer, regardless of experience id', () {
    for (final expId in ['equations', 'triangle_garden', 'anything_else']) {
      expect(resolveInterestForExperience(['tech_robotics'], expId), 'tech_robotics');
    }
  });

  test('two interests resolve deterministically per experience id', () {
    final a = resolveInterestForExperience(['tech_robotics', 'nature_environment'], 'equations');
    final b = resolveInterestForExperience(['tech_robotics', 'nature_environment'], 'equations');
    expect(a, b, reason: 'same inputs must always resolve the same interest');
    expect(['tech_robotics', 'nature_environment'], contains(a));
  });

  test('resolution is stable across repeated calls — the pure-function equivalent of '
      'rebuild/refresh/app-restart/retry, since nothing here is session state', () {
    final interests = ['sports_movement', 'reading_stories'];
    final results = List.generate(20, (_) => resolveInterestForExperience(interests, 'triangle_garden'));
    expect(results.toSet().length, 1, reason: 'must not vary call to call for the same inputs');
  });

  test('different experiences may rotate to different interests — never forced to one always',
      () {
    final interests = ['sports_movement', 'reading_stories'];
    final resolved = {
      for (final expId in ['equations', 'triangle_garden', 'circle_area', 'ratio', 'speed'])
        expId: resolveInterestForExperience(interests, expId),
    };
    // Both interests actually show up somewhere — rotation is real, not a
    // constant function that happens to always pick the first one.
    expect(resolved.values.toSet().length, 2,
        reason: 'two interests never both used across a handful of experiences would mean no real rotation');
  });

  test('an experience never combines both interests — the result is always exactly one id', () {
    final interests = ['helping_people', 'nature_environment'];
    for (final expId in ['equations', 'triangle_garden']) {
      final resolved = resolveInterestForExperience(interests, expId);
      expect(interests, contains(resolved));
    }
  });

  test('no interests resolves to null — callers fall back to the legacy lens or neutral base', () {
    expect(resolveInterestForExperience([], 'equations'), isNull);
  });

  group('resolvePersonalizationKey (the precedence ExperienceScreen._lens uses)', () {
    test('a student with interests and no legacy learningContext gets the interest', () {
      final key = resolvePersonalizationKey(
        interests: ['tech_robotics'],
        legacyLearningContext: null,
        experienceId: 'equations',
      );
      expect(key, 'tech_robotics');
    });

    test('interests win even when a legacy learningContext is also present — '
        'never combined, never overridden by the legacy value', () {
      final key = resolvePersonalizationKey(
        interests: ['nature_environment'],
        legacyLearningContext: 'market',
        experienceId: 'equations',
      );
      expect(key, 'nature_environment');
    });

    test('a legacy profile (learningContext set, no interests) keeps working unchanged', () {
      final key = resolvePersonalizationKey(
        interests: [],
        legacyLearningContext: 'water_energy',
        experienceId: 'triangle_garden',
      );
      expect(key, 'water_energy', reason: 'back-compat: old profiles must still resolve their lens');
    });

    test('a student with neither interests nor a legacy lens gets the honest neutral base', () {
      final key = resolvePersonalizationKey(
        interests: [],
        legacyLearningContext: null,
        experienceId: 'equations',
      );
      expect(key, isNull);
    });
  });
}
