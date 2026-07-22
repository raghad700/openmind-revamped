import 'dart:convert';
import 'dart:io';

import 'package:edumind/features/learn/interest_resolution.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:flutter_test/flutter_test.dart';

/// Content lints — the durable half of the content-repair pass. These encode
/// the editorial rules so a regression cannot silently re-enter:
///  1. structural sanity (correctIndex in range, patterns aligned);
///  2. every referenced skill id is defined in the catalog's skills map;
///  3. a checkpoint only tests skills the path's steps actually evidence;
///  4. hints and wrongFeedback never contain the correct option verbatim
///     (legacy lens variants AND the current interest variants);
///  5. a step that carries narrative lens/interest variants and a choice
///     must flavor the choice too (no flavor drop mid-step);
///  6. lens/interest choice variants keep the option count (the correct
///     slot is positional);
///  7. interestVariants coverage is all-7-or-none — never a partial set a
///     student could randomly miss;
///  8. a shallow find-and-replace narrative variant (same sentence, one
///     noun swapped) is rejected via a word-overlap heuristic.
List<LearnCatalog> _loadCatalogs() {
  final dir = Directory('assets/learning');
  return dir
      .listSync()
      .whereType<File>()
      .where((f) => f.path.endsWith('.json'))
      .map((f) => LearnCatalog.fromMap(
          jsonDecode(f.readAsStringSync()) as Map<String, dynamic>))
      .toList();
}

Iterable<({LearnPath path, LearnExperience exp, LearnStep step})> _readySteps(
    LearnCatalog c) sync* {
  for (final p in c.paths) {
    for (final e in p.experiences.where((e) => e.ready)) {
      for (final s in e.steps) {
        yield (path: p, exp: e, step: s);
      }
    }
  }
}

void main() {
  final catalogs = _loadCatalogs();

  test('catalogs load and hold at least one ready experience', () {
    expect(catalogs, isNotEmpty);
    expect(
      catalogs.expand((c) => c.paths).expand((p) => p.experiences).where((e) => e.ready),
      isNotEmpty,
    );
  });

  test('structural sanity: correct index in range, aligned pattern lists', () {
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final items = [
          if (r.step.choice != null) r.step.choice!,
          ...r.step.checkItems,
        ];
        for (final item in items) {
          expect(item.correctIndex, inInclusiveRange(0, item.options.length - 1),
              reason: '${r.exp.id}: correctIndex out of range');
          if (item.distractorPatterns.isNotEmpty) {
            expect(item.distractorPatterns.length, item.options.length,
                reason: '${r.exp.id}: distractorPatterns misaligned with options');
          }
        }
      }
    }
  });

  test('every referenced skill id is defined in the catalog skills map', () {
    for (final c in catalogs) {
      final defined = c.skills.keys.toSet();
      final referenced = <String>{};
      for (final p in c.paths) {
        for (final cp in p.checkpoints) {
          referenced.addAll(cp.skills);
        }
        for (final e in p.experiences) {
          for (final s in e.steps) {
            referenced.addAll(s.skills);
            for (final item in s.checkItems) {
              referenced.addAll(item.skills);
            }
          }
        }
      }
      final unknown = referenced.difference(defined);
      expect(unknown, isEmpty,
          reason: '${c.subject}: skills referenced but never defined: $unknown');
    }
  });

  test('a checkpoint only tests skills its path actually evidences', () {
    for (final c in catalogs) {
      for (final p in c.paths) {
        final taught = <String>{};
        for (final e in p.experiences) {
          for (final s in e.steps) {
            taught.addAll(s.skills);
            for (final item in s.checkItems) {
              taught.addAll(item.skills);
            }
          }
        }
        for (final cp in p.checkpoints) {
          final untaught = cp.skills.toSet().difference(taught);
          expect(untaught, isEmpty,
              reason:
                  '${p.id}/${cp.id}: checkpoint tests skills no step evidences: $untaught');
        }
      }
    }
  });

  test('hints and wrongFeedback never hand over the correct option verbatim', () {
    String norm(String s) => s.replaceAll(RegExp(r'\s+'), ' ').trim();
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final items = [
          if (r.step.choice != null) r.step.choice!,
          ...r.step.checkItems,
        ];
        for (final item in items) {
          final answer = norm(item.options[item.correctIndex]);
          // Very short answers ('7') appear legitimately inside guidance
          // ("subtract 5 from 12"); the verbatim rule is for full phrases.
          if (answer.length < 4) continue;
          final leaks = <String>[
            ...r.step.hints,
            item.wrongFeedback,
            for (final v in item.variants.values)
              if (v.wrongFeedback != null) v.wrongFeedback!,
            for (final v in item.interestVariants.values)
              if (v.wrongFeedback != null) v.wrongFeedback!,
          ];
          for (final text in leaks) {
            expect(norm(text).contains(answer), isFalse,
                reason:
                    '${r.exp.id} «${item.prompt}»: guidance contains the correct answer "$answer"');
          }
        }
      }
    }
  });

  test('a step with narrative lens variants flavors its choice too', () {
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final step = r.step;
        if (step.variants.isEmpty || step.choice == null) continue;
        for (final lens in step.variants.keys) {
          expect(step.choice!.variants.containsKey(lens), isTrue,
              reason:
                  '${r.exp.id} «${step.title}»: story is flavored for "$lens" but its choice is not — flavor drops mid-step');
        }
      }
    }
  });

  test('a step with interest variants flavors its choice too', () {
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final step = r.step;
        if (step.interestVariants.isEmpty || step.choice == null) continue;
        for (final interest in step.interestVariants.keys) {
          expect(step.choice!.interestVariants.containsKey(interest), isTrue,
              reason:
                  '${r.exp.id} «${step.title}»: story is flavored for "$interest" but its choice is not — flavor drops mid-step');
        }
      }
    }
  });

  test('choice variants keep the option count (correct slot is positional)', () {
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final items = [
          if (r.step.choice != null) r.step.choice!,
          ...r.step.checkItems,
        ];
        for (final item in items) {
          for (final entry in item.variants.entries) {
            final options = entry.value.options;
            if (options != null) {
              expect(options.length, item.options.length,
                  reason:
                      '${r.exp.id} «${item.prompt}» [${entry.key}]: variant option count differs');
            }
          }
          for (final entry in item.interestVariants.entries) {
            final options = entry.value.options;
            if (options != null) {
              expect(options.length, item.options.length,
                  reason:
                      '${r.exp.id} «${item.prompt}» [${entry.key}]: interest variant option count differs');
            }
          }
        }
      }
    }
  });

  test('interestVariants coverage is all 7 ids or entirely absent — never partial', () {
    final allInterests = kStudentInterestIds.toSet();
    void checkCoverage(Map<String, dynamic> variants, String where) {
      if (variants.isEmpty) return; // absent = honest neutral fallback, allowed
      expect(variants.keys.toSet(), allInterests,
          reason: '$where: interestVariants must cover all 7 STUDENT_INTERESTS ids or none at all — '
              'found ${variants.keys.toSet()}');
    }

    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        checkCoverage(r.step.interestVariants, '${r.exp.id} «${r.step.title}» (step)');
        final items = [
          if (r.step.choice != null) r.step.choice!,
          ...r.step.checkItems,
        ];
        for (final item in items) {
          checkCoverage(item.interestVariants, '${r.exp.id} «${item.prompt}» (choice)');
        }
      }
    }
  });

  test('shallow-variant heuristic: a narrative body must genuinely differ from the neutral base', () {
    // Word-overlap (Jaccard) on the situation-bearing fields — scene sets the
    // world, challenge/apply pose the concrete decision. explore/check and
    // titles/prompts are deliberately excluded: they legitimately follow a
    // short template (a single manipulative-label noun, or a parallel
    // "قرارك الأخير: كم ال‍X؟" title) even when the story is genuinely
    // reworked elsewhere in the same step — flagging those would punish good
    // content, not shallow content.
    const narrativeKinds = {LearnStepKind.scene, LearnStepKind.challenge, LearnStepKind.apply};
    // Calibrated against this pilot's own authored content (max observed
    // overlap ~0.56) with headroom before it starts rejecting genuine
    // variants; a same-sentence one-noun swap scores 0.7-0.9+ in practice.
    const maxOverlap = 0.65;

    Set<String> tokens(String s) =>
        RegExp(r'[\p{L}\p{N}]+', unicode: true).allMatches(s).map((m) => m.group(0)!).toSet();

    double jaccard(String a, String b) {
      final ta = tokens(a), tb = tokens(b);
      if (ta.isEmpty || tb.isEmpty) return 0;
      return ta.intersection(tb).length / ta.union(tb).length;
    }

    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        if (!narrativeKinds.contains(r.step.kind)) continue;
        final baseBody = r.step.body;
        for (final entry in r.step.interestVariants.entries) {
          final variantBody = entry.value.body;
          if (variantBody == null || baseBody.isEmpty) continue;
          final overlap = jaccard(baseBody, variantBody);
          expect(overlap, lessThan(maxOverlap),
              reason: '${r.exp.id} «${r.step.title}» [${entry.key}]: variant body is ${(overlap * 100).round()}% '
                  'word-identical to the neutral base — looks like a find-and-replace, not a reworked situation');
        }
      }
    }
  });
}
