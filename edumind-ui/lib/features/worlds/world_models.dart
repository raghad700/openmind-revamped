/// Lesson-world models — a curated primary "world" is a bundled manifest of
/// short stages (Recognize → Understand → Apply → Challenge), each stage a
/// self-contained spec asset played in the existing shell player.
///
/// The unlock rule is the primary twin of the middle-school
/// `features/learn/journey_logic.dart` doctrine (sequential, first open,
/// next opens when the previous completes) — logic shared, presentation
/// deliberately playful and separate.
library;

import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

class WorldStage {
  WorldStage({
    required this.id,
    required this.level,
    required this.title,
    required this.emoji,
    required this.specFile,
  });

  final String id;
  final String level; // recognize | understand | apply | challenge
  final String title;
  final String emoji;
  final String specFile; // under assets/samples/

  static WorldStage fromMap(Map<String, dynamic> m) => WorldStage(
        id: m['id'] as String,
        level: m['level'] as String,
        title: m['title'] as String,
        emoji: (m['emoji'] as String?) ?? '⭐',
        specFile: m['specFile'] as String,
      );
}

class WorldDef {
  WorldDef({
    required this.id,
    required this.title,
    required this.subject,
    required this.grade,
    required this.emoji,
    required this.stages,
  });

  final String id;
  final String title;
  final String subject;
  final int grade;
  final String emoji;
  final List<WorldStage> stages;

  static WorldDef fromMap(Map<String, dynamic> m) => WorldDef(
        id: m['id'] as String,
        title: m['title'] as String,
        subject: (m['subject'] as String?) ?? '',
        grade: (m['grade'] as num?)?.toInt() ?? 0,
        emoji: (m['emoji'] as String?) ?? '🌍',
        stages: ((m['stages'] as List?) ?? const [])
            .map((s) => WorldStage.fromMap((s as Map).cast<String, dynamic>()))
            .toList(),
      );

  static Future<WorldDef> load(String asset) async {
    final raw = await rootBundle.loadString(asset);
    return fromMap(jsonDecode(raw) as Map<String, dynamic>);
  }
}

/// The bundled curated worlds (Grades 1–3 rollout). New world = new manifest
/// asset + stage spec assets — no code.
const kBundledWorlds = ['assets/worlds/lines_angles_g3.ar.json'];

enum StageNodeState { completed, current, locked }

/// Sequential unlock over the stage list: completed stages stay open, the
/// first uncompleted stage is the child's position, everything after waits.
List<StageNodeState> stageNodeStates(List<WorldStage> stages, Set<String> completed) {
  final states = <StageNodeState>[];
  var currentTaken = false;
  for (final s in stages) {
    if (completed.contains(s.id)) {
      states.add(StageNodeState.completed);
    } else if (!currentTaken) {
      states.add(StageNodeState.current);
      currentTaken = true;
    } else {
      states.add(StageNodeState.locked);
    }
  }
  return states;
}
