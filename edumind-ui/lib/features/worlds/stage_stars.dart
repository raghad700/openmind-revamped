/// Stage summary → stars, reusing the middle-school star bands
/// (`features/learn/lesson_scoring.dart`, pure and already tested): a clean
/// sweep of first-try records earns 3, a majority 2, and finishing always
/// earns the "you tried" star. An unscored discovery stage (no items) is
/// completed by reaching the end — that is the win, so it earns full stars.
library;

import '../learn/lesson_scoring.dart' show starsForCheck;

int starsForStageSummary(Map<String, dynamic>? summary) {
  final items = (summary?['items'] as List?) ?? const [];
  if (items.isEmpty) return 3;
  final correct =
      items.where((i) => ((i as Map)['correct'] as bool?) == true).length;
  return starsForCheck(correct: correct, total: items.length);
}
